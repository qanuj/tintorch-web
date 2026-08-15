// Report what this site's prerendered cache weighs to the CMS.
//
// The CMS shows each site's cache against a 1 GB budget, but it cannot see
// this machine's disk - only the site can. So the site reports: after a build
// (postbuild script), and optionally whenever the CMS pings /api/revalidate.
//
// Plain .mjs on purpose. The rest of this package ships TypeScript that Next
// transpiles into the app; a postbuild step runs under plain node, which
// cannot import that. This file has no imports from the package for the same
// reason.

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

/** Bytes and .html page count under a directory, walked without following links. */
export async function measureDir(dir) {
  let bytes = 0;
  let pages = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return { bytes, pages }; // No cache directory yet is a real answer: zero.
  }

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await measureDir(path);
      bytes += nested.bytes;
      pages += nested.pages;
    } else if (entry.isFile()) {
      try {
        bytes += (await stat(path)).size;
        if (entry.name.endsWith(".html")) pages += 1;
      } catch {
        // A file deleted mid-walk (a revalidation) is not worth failing over.
      }
    }
  }
  return { bytes, pages };
}

/**
 * Measure the ISR cache and POST it to the CMS. Never throws: a failed report
 * must not fail the build or the request that triggered it.
 */
export async function reportUsage({
  cmsUrl = process.env.TINTORCH_CMS_URL,
  key = process.env.TINTORCH_CMS_KEY,
  dir = ".next/server/app",
  source = "build",
} = {}) {
  if (!cmsUrl || !key) return { ok: false, reason: "unconfigured" };

  const { bytes, pages } = await measureDir(dir);
  try {
    const response = await fetch(
      `${cmsUrl.replace(/\/+$/, "")}/api/v1/content/usage`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ bytes, pages, source }),
      },
    );
    return { ok: response.ok, bytes, pages };
  } catch {
    return { ok: false, bytes, pages, reason: "unreachable" };
  }
}

// `node node_modules/@tintorch/web/usage.mjs` - the postbuild spelling.
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await reportUsage({ source: process.argv[2] || "build" });
  console.log(`[usage] ${result.ok ? "reported" : "skipped"}`, result);
}
