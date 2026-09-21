/**
 * CMS-defined forms, and sending one back as a lead.
 *
 * The definition comes from the CMS so a form's fields can change without a
 * deploy, and the submission goes back through the same authenticated key, so
 * all of this is server-only. A site renders the fields; it does not decide
 * what they are.
 *
 * The three pieces of anti-spam signal the CMS can use are all forwarded here,
 * because a site that forgets one silently loses the protection: the honeypot
 * value, the solved Turnstile token, and the visitor's address. That last one
 * matters most - every site relays submissions from its own server, so without
 * being told, the CMS counts the container rather than the person and rate
 * limits a whole site as one visitor.
 */
import type { CmsClient } from "./client";

export type CmsFormField = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  help?: string;
  /** Accepted file types, when `type` is `file`. */
  accept?: string;
};

export type CmsForm = {
  key: string;
  name: string;
  description: string | null;
  fields: CmsFormField[];
  submitLabel?: string;
  successMessage?: string;
  /** Present when the workspace has Turnstile switched on. Public by nature. */
  turnstile?: { siteKey: string };
};

export type SubmitResult = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  error?: string;
};

export type SubmitExtras = {
  /** The solved Turnstile token from the browser, when the form asked for one. */
  turnstileToken?: string;
  /** The visitor's address, which only this server knows. */
  clientIp?: string;
  /** The honeypot's value. A filled one is the CMS's to judge, not the site's. */
  trap?: string;
};

/** What the visitor is told when the CMS cannot be reached at all. */
const UNREACHABLE = "We could not reach the server. Try again in a moment.";
const REJECTED = "That did not go through. Try again in a moment.";
const INVALID = "Please check the fields marked.";

export async function getForm(cms: CmsClient, key: string): Promise<CmsForm | null> {
  /*
   * A fence written as `:::form` with no key asks for /forms/, which redirects
   * to the list endpoint and answers with an array. That is truthy, so without
   * this the array reached the form component as a definition and rendering it
   * threw. A form is only a form when it carries fields.
   */
  if (!key.trim()) return null;

  const body = await cms.request<{ data: CmsForm }>(`/forms/${encodeURIComponent(key)}`, 60);
  const form = body?.data;
  return form && Array.isArray(form.fields) ? form : null;
}

/**
 * Send a filled form back to the CMS, where it becomes a lead.
 *
 * A 422 comes back with the fields to highlight; anything else is reported as
 * one message rather than leaking the CMS's own wording to a visitor. Never
 * throws: a form that cannot reach the CMS has to say so on the page, not
 * render an error boundary over the whole route.
 */
export async function submitForm(
  cms: CmsClient,
  key: string,
  data: Record<string, unknown>,
  sourceUrl?: string,
  extra: SubmitExtras = {},
): Promise<SubmitResult> {
  if (!cms.configured) return { ok: false, error: "This form is not connected yet." };

  try {
    const response = await cms.fetch(
      `${cms.baseUrl}/api/v1/content/forms/${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${cms.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          data,
          ...(sourceUrl ? { sourceUrl } : {}),
          ...(extra.turnstileToken ? { turnstileToken: extra.turnstileToken } : {}),
          ...(extra.trap ? { _hp: extra.trap } : {}),
          ...(extra.clientIp ? { meta: { clientIp: extra.clientIp } } : {}),
        }),
        cache: "no-store",
      },
    );

    const body = (await response.json().catch(() => ({}))) as {
      data?: { message?: string };
      fieldErrors?: Record<string, string>;
    };

    if (response.status === 422) {
      return { ok: false, fieldErrors: body.fieldErrors, error: INVALID };
    }
    if (!response.ok) return { ok: false, error: REJECTED };

    return { ok: true, message: body.data?.message };
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
}

/**
 * The visitor's address, from the headers a platform sets in front of us.
 *
 * Deliberately not the leftmost `x-forwarded-for` entry, which the client
 * writes and can say anything: the platform appends its own, so the last entry
 * is the one it observed.
 */
export function clientIpFrom(headers: Headers): string | undefined {
  const direct = headers.get("cf-connecting-ip") ?? headers.get("x-real-ip");
  if (direct?.trim()) return direct.trim();

  const forwarded = headers.get("x-forwarded-for");
  if (!forwarded) return undefined;
  const parts = forwarded.split(",").map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1];
}
