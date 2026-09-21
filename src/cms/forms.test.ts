import { describe, expect, it, vi } from "vitest";
import { createCmsClient } from "./client";
import { clientIpFrom, getForm, submitForm } from "./forms";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const definition = {
  key: "contact",
  name: "Contact",
  description: null,
  fields: [{ key: "name", label: "Name", type: "text" }],
};

type FetchCall = [string, RequestInit];

const callsOf = (fn: { mock: { calls: unknown[] } }) => fn.mock.calls as FetchCall[];

/** The JSON body a recorded call posted. */
const bodyOf = (fn: { mock: { calls: unknown[] } }) =>
  JSON.parse(callsOf(fn)[0]![1].body as string) as Record<string, unknown>;

function client(fetchImpl: typeof globalThis.fetch) {
  return createCmsClient({ baseUrl: "https://cms.test", key: "ttck_x", fetch: fetchImpl });
}

describe("getForm", () => {
  it("reads a definition", async () => {
    const fetchImpl = vi.fn(async () => json({ data: definition }));
    await expect(getForm(client(fetchImpl as never), "contact")).resolves.toEqual(definition);
  });

  it("refuses an empty key without asking the CMS", async () => {
    // `:::form` with no key hits /forms/, which redirects to the list endpoint
    // and answers with an array. That array is truthy and used to reach the
    // form component as a definition, where rendering it threw.
    const fetchImpl = vi.fn();
    await expect(getForm(client(fetchImpl as never), "  ")).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a response whose fields are not an array", async () => {
    const fetchImpl = vi.fn(async () => json({ data: [definition] }));
    await expect(getForm(client(fetchImpl as never), "contact")).resolves.toBeNull();
  });

  it("reads null for an unknown form", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 404 }));
    await expect(getForm(client(fetchImpl as never), "nope")).resolves.toBeNull();
  });

  it("carries the form's Turnstile site key through", async () => {
    const fetchImpl = vi.fn(async () =>
      json({ data: { ...definition, turnstile: { siteKey: "0x4AAA" } } }),
    );
    const form = await getForm(client(fetchImpl as never), "contact");
    expect(form?.turnstile?.siteKey).toBe("0x4AAA");
  });
});

describe("submitForm", () => {
  it("posts the data and reports the CMS's success message", async () => {
    const fetchImpl = vi.fn(async () => json({ data: { message: "Thanks, we will be in touch." } }));
    const result = await submitForm(client(fetchImpl as never), "contact", { name: "Anuj" });

    expect(result).toEqual({ ok: true, message: "Thanks, we will be in touch." });
    const [url, init] = callsOf(fetchImpl)[0]!;
    expect(url).toBe("https://cms.test/api/v1/content/forms/contact");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ data: { name: "Anuj" } });
  });

  it("forwards every anti-spam signal the CMS can use", async () => {
    // A site that drops one of these silently loses the protection: without
    // clientIp the CMS counts this container rather than the visitor, and rate
    // limits a whole site as one person.
    const fetchImpl = vi.fn(async () => json({ data: {} }));
    await submitForm(
      client(fetchImpl as never),
      "contact",
      { name: "Anuj" },
      "https://site.test/pricing",
      { turnstileToken: "tok", clientIp: "203.0.113.7", trap: "filled" },
    );

    expect(bodyOf(fetchImpl)).toEqual({
      data: { name: "Anuj" },
      sourceUrl: "https://site.test/pricing",
      turnstileToken: "tok",
      _hp: "filled",
      meta: { clientIp: "203.0.113.7" },
    });
  });

  it("omits the signals it was not given rather than sending empty ones", async () => {
    const fetchImpl = vi.fn(async () => json({ data: {} }));
    await submitForm(client(fetchImpl as never), "contact", { name: "A" }, undefined, {
      turnstileToken: "",
      clientIp: undefined,
    });

    const body = bodyOf(fetchImpl);
    expect(body).not.toHaveProperty("turnstileToken");
    expect(body).not.toHaveProperty("meta");
    expect(body).not.toHaveProperty("sourceUrl");
  });

  it("returns the per-field errors from a 422 so the form can mark them", async () => {
    const fetchImpl = vi.fn(async () => json({ fieldErrors: { email: "Not an email" } }, 422));
    const result = await submitForm(client(fetchImpl as never), "contact", {});

    expect(result.ok).toBe(false);
    expect(result.fieldErrors).toEqual({ email: "Not an email" });
    expect(result.error).toBe("Please check the fields marked.");
  });

  it("does not leak the CMS's own wording for any other rejection", async () => {
    const fetchImpl = vi.fn(async () => json({ error: { message: "workspace over quota" } }, 500));
    const result = await submitForm(client(fetchImpl as never), "contact", {});

    expect(result.ok).toBe(false);
    expect(result.error).toBe("That did not go through. Try again in a moment.");
  });

  it("never throws when the CMS is unreachable", async () => {
    // A form that cannot reach the CMS has to say so on the page, not render
    // an error boundary over the whole route.
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(submitForm(client(fetchImpl as never), "contact", {})).resolves.toEqual({
      ok: false,
      error: "We could not reach the server. Try again in a moment.",
    });
  });

  it("says so plainly when the site has no CMS key", async () => {
    const cms = createCmsClient({ baseUrl: "", key: "" });
    await expect(submitForm(cms, "contact", {})).resolves.toEqual({
      ok: false,
      error: "This form is not connected yet.",
    });
  });

  it("treats a 200 with an unreadable body as a success without a message", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 200 }));
    await expect(submitForm(client(fetchImpl as never), "contact", {})).resolves.toEqual({
      ok: true,
      message: undefined,
    });
  });
});

describe("clientIpFrom", () => {
  it("prefers the header the CDN sets", () => {
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.7",
      "x-forwarded-for": "1.2.3.4",
    });
    expect(clientIpFrom(headers)).toBe("203.0.113.7");
  });

  it("takes the last x-forwarded-for entry, not the first", () => {
    // The client writes the leftmost entry and can say anything; the platform
    // appends the address it actually observed.
    const headers = new Headers({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" });
    expect(clientIpFrom(headers)).toBe("203.0.113.7");
  });

  it("returns undefined when nothing identifies the visitor", () => {
    expect(clientIpFrom(new Headers())).toBeUndefined();
    expect(clientIpFrom(new Headers({ "x-forwarded-for": " " }))).toBeUndefined();
  });
});
