import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmCheckout, openCheckout, type CheckoutOrder } from "./checkout";

const order = (over: Partial<CheckoutOrder> = {}): CheckoutOrder => ({
  id: "order_1",
  provider: "RAZORPAY",
  amount: 51_00,
  currency: "INR",
  public_key: "rzp_test_x",
  client_token: "order_gateway_1",
  live: false,
  ...over,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("openCheckout", () => {
  it("refuses an order with no token rather than opening an empty gateway", async () => {
    for (const provider of ["RAZORPAY", "STRIPE", "CASHFREE"] as const) {
      const outcome = await openCheckout({
        order: order({ provider, client_token: null }),
        name: "Punya",
      });
      expect(outcome.result).toBe("error");
    }
  });

  it("reports an unknown provider rather than throwing", async () => {
    const outcome = await openCheckout({
      // A provider the server knows and this does not: an older site against
      // a newer CMS should say so, not crash the page.
      order: order({ provider: "PAYPAL" as never }),
      name: "Punya",
    });
    expect(outcome).toMatchObject({ result: "error", orderId: "order_1" });
  });

  it("sends the payer to Stripe's hosted page", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });

    const outcome = await openCheckout({
      order: order({ provider: "STRIPE", client_token: "https://checkout.stripe.com/c/pay/abc" }),
      name: "Punya",
    });

    expect(outcome).toEqual({ result: "redirected", orderId: "order_1" });
    expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/abc");
  });

  it("reports a gateway script that will not load", async () => {
    // jsdom is absent here, so `document` is undefined and the loader fails -
    // which is the same shape as a blocked CDN, and must be a message rather
    // than an unhandled rejection on someone's donate page.
    const outcome = await openCheckout({ order: order(), name: "Punya" });
    expect(outcome.result).toBe("error");
    expect(outcome).toHaveProperty("error");
  });
});

describe("confirmCheckout", () => {
  const statusUrl = "/api/checkout/order_1";

  it("resolves PAID when the server says so", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: { status: "PAID" } }), { status: 200 })),
    );

    await expect(confirmCheckout({ statusUrl, intervalMs: 1 })).resolves.toBe("PAID");
  });

  it("resolves FAILED when the gateway refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: { status: "FAILED" } }), { status: 200 })),
    );

    await expect(confirmCheckout({ statusUrl, intervalMs: 1 })).resolves.toBe("FAILED");
  });

  it("keeps asking while the answer is still CREATED", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        const status = calls < 3 ? "CREATED" : "PAID";
        return new Response(JSON.stringify({ data: { status } }), { status: 200 });
      }),
    );

    await expect(confirmCheckout({ statusUrl, intervalMs: 1 })).resolves.toBe("PAID");
    expect(calls).toBe(3);
  });

  it("keeps asking through a dropped request", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw new Error("network");
        return new Response(JSON.stringify({ data: { status: "PAID" } }), { status: 200 });
      }),
    );

    await expect(confirmCheckout({ statusUrl, intervalMs: 1 })).resolves.toBe("PAID");
  });

  it("gives up as PENDING rather than FAILED", async () => {
    /*
     * The distinction that matters: a slow bank is not a refusal, and telling
     * somebody their donation failed while it is still settling is the worse
     * of the two mistakes.
     */
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: { status: "CREATED" } }), { status: 200 })),
    );

    await expect(confirmCheckout({ statusUrl, timeoutMs: 20, intervalMs: 5 })).resolves.toBe(
      "PENDING",
    );
  });

  it("stops when the caller aborts", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal("fetch", vi.fn());

    await expect(
      confirmCheckout({ statusUrl, intervalMs: 1, signal: controller.signal }),
    ).resolves.toBe("PENDING");
  });

  it("stops asking once the answer cannot change, and says why", async () => {
    /*
     * A 404 means the id is wrong, not that a bank is slow. Polling it for
     * ninety seconds turns a typo into a payment that looks pending.
     */
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { status: 404, message: "No such order." } }), {
          status: 404,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const problems: { status: number; message: string }[] = [];

    await expect(
      confirmCheckout({ statusUrl, intervalMs: 1, onProblem: (p) => problems.push(p) }),
    ).resolves.toBe("PENDING");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(problems).toEqual([{ status: 404, message: "No such order." }]);
  });

  it("keeps asking through a rate limit", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        return calls === 1
          ? new Response("", { status: 429 })
          : new Response(JSON.stringify({ data: { status: "PAID" } }), { status: 200 });
      }),
    );

    await expect(confirmCheckout({ statusUrl, intervalMs: 1 })).resolves.toBe("PAID");
    expect(calls).toBe(2);
  });

  it("treats a non-OK response as no answer yet", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        return calls === 1
          ? new Response("", { status: 502 })
          : new Response(JSON.stringify({ data: { status: "PAID" } }), { status: 200 });
      }),
    );

    await expect(confirmCheckout({ statusUrl, intervalMs: 1 })).resolves.toBe("PAID");
  });
});
