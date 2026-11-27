/**
 * Opening a payment in the browser.
 *
 * Three gateways, three ways of being opened, one function. The server has
 * already created the order through the CMS and handed back everything the
 * browser is allowed to know: which gateway, its public key, and a single-use
 * token. None of that is secret, and none of it is enough to charge anyone
 * twice.
 *
 * What a site writes is the same three lines whichever gateway the payer
 * picked, which is the whole reason this is here rather than in each site.
 *
 * Deliberately dependency-free. Every gateway publishes a script that attaches
 * itself to `window`, and pulling three npm packages into four sites to call
 * three constructors would cost more than it saves.
 */

export type CheckoutProvider = "RAZORPAY" | "STRIPE" | "CASHFREE";

/** What `POST /api/v1/content/checkout` hands back, as the browser sees it. */
export type CheckoutOrder = {
  id: string;
  provider: CheckoutProvider;
  amount: number;
  currency: string;
  public_key: string;
  /** Razorpay order id, Cashfree session id, or Stripe's hosted page URL. */
  client_token: string | null;
  live: boolean;
};

export type CheckoutOptions = {
  order: CheckoutOrder;
  /** Shown on the gateway's own screen, so the payer knows who they are paying. */
  name: string;
  description?: string;
  /** Saves the payer retyping what the site already asked for. */
  prefill?: { name?: string; email?: string; phone?: string };
  /** Where Stripe and Cashfree send the payer back. Ignored by Razorpay. */
  returnUrl?: string;
  /** A logo for the gateways that show one. */
  image?: string;
  /** Brand colour on Razorpay's modal. */
  themeColor?: string;
};

export type CheckoutOutcome =
  /** The payer finished. Still unconfirmed: only the server may settle it. */
  | { result: "submitted"; orderId: string }
  /** They closed it, or went back. Nothing was charged. */
  | { result: "dismissed"; orderId: string }
  /** Sending them to a hosted page; this tab is about to go away. */
  | { result: "redirected"; orderId: string }
  | { result: "error"; orderId: string; error: string };

/* ── Loading a gateway's script ──────────────────────────────────────────── */

const loading = new Map<string, Promise<void>>();

/**
 * Add a script once, and let a second caller wait on the first.
 *
 * Opening a second checkout after a failed first attempt should not fetch the
 * SDK again, and two buttons pressed quickly should not race it in twice.
 */
function loadScript(src: string): Promise<void> {
  const existing = loading.get(src);
  if (existing) return existing;

  const pending = new Promise<void>((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Checkout can only be opened in a browser."));
      return;
    }

    const already = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (already) {
      // Present from a previous page in the same session, already executed.
      if (already.dataset.loaded === "true") resolve();
      else {
        already.addEventListener("load", () => resolve(), { once: true });
        already.addEventListener("error", () => reject(new Error(`Could not load ${src}`)), {
          once: true,
        });
      }
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true },
    );
    script.addEventListener("error", () => reject(new Error(`Could not load ${src}`)), {
      once: true,
    });
    document.head.appendChild(script);
  });

  // A failure is not cached: the next attempt should be allowed to try again.
  pending.catch(() => loading.delete(src));
  loading.set(src, pending);
  return pending;
}

/* ── The gateways ────────────────────────────────────────────────────────── */

type Razorpay = new (options: Record<string, unknown>) => { open(): void };
type Cashfree = (config: { mode: string }) => {
  checkout(options: Record<string, unknown>): Promise<{ error?: { message?: string } }>;
};

declare global {
  interface Window {
    Razorpay?: Razorpay;
    Cashfree?: Cashfree;
  }
}

async function openRazorpay(options: CheckoutOptions): Promise<CheckoutOutcome> {
  const { order } = options;
  if (!order.client_token) {
    return { result: "error", orderId: order.id, error: "This order has no checkout token." };
  }

  await loadScript("https://checkout.razorpay.com/v1/checkout.js");
  if (!window.Razorpay) {
    return { result: "error", orderId: order.id, error: "Razorpay did not load." };
  }

  /*
   * Resolved from the modal's own callbacks rather than from the promise
   * Razorpay returns, because it returns none: `open()` is fire and forget,
   * and the only way to know what happened is to be told.
   */
  return new Promise<CheckoutOutcome>((resolve) => {
    let settled = false;
    const once = (outcome: CheckoutOutcome) => {
      if (!settled) {
        settled = true;
        resolve(outcome);
      }
    };

    new window.Razorpay!({
      key: order.public_key,
      order_id: order.client_token,
      amount: order.amount,
      currency: order.currency,
      name: options.name,
      description: options.description,
      image: options.image,
      prefill: {
        name: options.prefill?.name,
        email: options.prefill?.email,
        contact: options.prefill?.phone,
      },
      theme: options.themeColor ? { color: options.themeColor } : undefined,
      // The payload is ignored on purpose. Razorpay telling the browser it
      // worked is not evidence; the server asks the gateway.
      handler: () => once({ result: "submitted", orderId: order.id }),
      modal: { ondismiss: () => once({ result: "dismissed", orderId: order.id }) },
    }).open();
  });
}

async function openCashfree(options: CheckoutOptions): Promise<CheckoutOutcome> {
  const { order } = options;
  if (!order.client_token) {
    return { result: "error", orderId: order.id, error: "This order has no checkout session." };
  }

  await loadScript("https://sdk.cashfree.com/js/v3/cashfree.js");
  if (!window.Cashfree) {
    return { result: "error", orderId: order.id, error: "Cashfree did not load." };
  }

  const cashfree = window.Cashfree({ mode: order.live ? "production" : "sandbox" });
  const result = await cashfree.checkout({
    paymentSessionId: order.client_token,
    redirectTarget: "_modal",
  });

  if (result?.error) {
    return {
      result: "error",
      orderId: order.id,
      error: result.error.message ?? "The payment could not be completed.",
    };
  }
  return { result: "submitted", orderId: order.id };
}

function openStripe(options: CheckoutOptions): CheckoutOutcome {
  const { order } = options;
  if (!order.client_token) {
    return { result: "error", orderId: order.id, error: "This order has no checkout page." };
  }

  /*
   * Stripe hosts the form, so this is a navigation rather than a modal. The
   * site gets the payer back at the return URL it asked for and confirms the
   * order there, exactly as it would after a modal closes.
   */
  window.location.assign(order.client_token);
  return { result: "redirected", orderId: order.id };
}

/**
 * Open the gateway this order was created on.
 *
 * Resolves when the payer has finished with it, one way or another. Nothing
 * here decides whether the money arrived: ask the server, which asks the
 * gateway. A browser reporting its own success is how a free order gets
 * marked paid.
 */
export async function openCheckout(options: CheckoutOptions): Promise<CheckoutOutcome> {
  try {
    switch (options.order.provider) {
      case "RAZORPAY":
        return await openRazorpay(options);
      case "CASHFREE":
        return await openCashfree(options);
      case "STRIPE":
        return openStripe(options);
      default:
        return {
          result: "error",
          orderId: options.order.id,
          error: `Cannot open ${options.order.provider}.`,
        };
    }
  } catch (cause) {
    return {
      result: "error",
      orderId: options.order.id,
      error: cause instanceof Error ? cause.message : "The checkout could not be opened.",
    };
  }
}

/* ── Confirming ──────────────────────────────────────────────────────────── */

export type ConfirmOptions = {
  /** Asks the site's own route, which asks the CMS, which asks the gateway. */
  statusUrl: string;
  /** How long to keep asking. A bank page can take a while to settle. */
  timeoutMs?: number;
  intervalMs?: number;
  signal?: AbortSignal;
  /**
   * Called when the status route answers something that is not a status.
   *
   * A donate page has nothing useful to show a payer here, but somebody has
   * to hear about a key that stopped working or an id that does not exist.
   * Without this the only symptom is every payment sitting pending.
   */
  onProblem?: (problem: { status: number; message: string }) => void;
};

/**
 * Whether asking again could plausibly give a different answer.
 *
 * A dropped connection, a rate limit, a gateway still thinking: all worth
 * another go. A 404 or a rejected key will say the same thing ninety seconds
 * later, so spending ninety seconds finding that out helps nobody.
 */
function worthRetrying(status: number): boolean {
  return status >= 500 || status === 408 || status === 425 || status === 429;
}

/**
 * Wait for the server to agree that the money arrived.
 *
 * Polling rather than trusting the modal, and polling the site's own server
 * rather than the gateway, because the payer's browser is the one participant
 * with a reason to lie and the only one that can be closed mid-payment.
 *
 * Gives up as "pending" rather than "failed" when the window runs out. A slow
 * bank is not a refusal, and telling somebody their donation failed when it is
 * about to land is the worse mistake.
 */
export async function confirmCheckout(
  options: ConfirmOptions,
): Promise<"PAID" | "FAILED" | "PENDING"> {
  const timeout = options.timeoutMs ?? 90_000;
  const interval = options.intervalMs ?? 2_000;
  const until = Date.now() + timeout;

  while (Date.now() < until) {
    if (options.signal?.aborted) return "PENDING";

    try {
      const response = await fetch(options.statusUrl, {
        cache: "no-store",
        signal: options.signal,
      });

      if (response.ok) {
        const body = (await response.json()) as { data?: { status?: string } };
        const status = body.data?.status;
        if (status === "PAID") return "PAID";
        if (status === "FAILED") return "FAILED";
      } else {
        /*
         * The delivery API answers `{ error: { status, message } }`, and the
         * message is the gateway's own words where there were any. Pass it on
         * rather than reducing the whole thing to a number.
         */
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        options.onProblem?.({
          status: response.status,
          message: body?.error?.message ?? `The status could not be read (${response.status}).`,
        });
        // Nothing will change by asking a fourth time.
        if (!worthRetrying(response.status)) return "PENDING";
      }
    } catch {
      // A dropped request mid-poll is not an answer; keep asking.
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  return "PENDING";
}
