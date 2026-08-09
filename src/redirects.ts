/**
 * Path redirects: matching them, and deciding whether one is safe to store.
 *
 * The same code runs in three places - the CMS form previewing a rule, the CMS
 * validating it on save, and the site applying it to a request. The alternative
 * is the CMS describing a rule and each site implementing it, which is several
 * behaviours that drift, and the drift only shows up as a redirect loop in
 * production.
 */

export type RedirectRule = {
  source: string;
  destination: string;
  isRegex: boolean;
  permanent: boolean;
};

/** A path with its query and hash removed, and exactly one leading slash. */
export function normalizePath(path: string): string {
  const withoutQuery = path.split(/[?#]/)[0] ?? "";
  const trimmed = withoutQuery.replace(/\/+$/, "") || "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/**
 * Regular expressions that can be made to hang.
 *
 * These rules are written by whoever can edit the workspace and are then run
 * against every request, so a pattern like `(a+)+$` is not a typo somebody
 * notices - it is the site becoming unavailable. JavaScript has no way to time
 * out a match, so the only defence is refusing the shapes that backtrack: a
 * quantifier applied to a group that is itself quantified.
 *
 * It rejects some patterns that would have been fine. That is the right way
 * round for something that runs on every request.
 */
const NESTED_QUANTIFIER = /\([^)]*[+*][^)]*\)\s*[+*{]/;

/** How long a source may be. Long enough for real rules, short enough to bound. */
const MAX_SOURCE = 200;

export type RuleProblem = { field: "source" | "destination"; message: string };

/** What is wrong with a rule, or nothing. Runs before a rule is ever stored. */
export function checkRule(rule: {
  source: string;
  destination: string;
  isRegex: boolean;
}): RuleProblem | null {
  const source = rule.source.trim();
  const destination = rule.destination.trim();

  if (!source) return { field: "source", message: "Give it a path to match." };
  if (!destination) return { field: "destination", message: "Give it somewhere to go." };
  if (source.length > MAX_SOURCE) {
    return { field: "source", message: `Keep it under ${MAX_SOURCE} characters.` };
  }

  if (!rule.isRegex) {
    if (!source.startsWith("/")) {
      return { field: "source", message: "A path starts with a slash - /careers, not careers." };
    }
    if (normalizePath(source) === normalizePath(destination)) {
      return { field: "destination", message: "That points at itself." };
    }
    return null;
  }

  if (NESTED_QUANTIFIER.test(source)) {
    return {
      field: "source",
      message:
        "That pattern can be made to hang - a repeated group inside another repeat. Rewrite it without the nesting.",
    };
  }

  try {
    new RegExp(anchored(source));
  } catch {
    return { field: "source", message: "That is not a valid regular expression." };
  }

  return null;
}

/** Both ends pinned, so `/jobs` cannot match `/old/jobs/archive` by accident. */
function anchored(source: string): string {
  const body = source.replace(/^\^/, "").replace(/\$$/, "");
  return `^${body}$`;
}

export type RedirectMatch = { destination: string; permanent: boolean };

/**
 * The first rule that answers for this path, applied.
 *
 * Order is the author's: rules are matched in the order given, so a specific
 * literal placed above a broad pattern wins. Literal sources are compared on
 * the normalized path, which makes /careers, /careers/ and /careers?ref=x all
 * the same request - the distinction only ever produced rules that half worked.
 */
export function matchRedirect(path: string, rules: RedirectRule[]): RedirectMatch | null {
  const wanted = normalizePath(path);

  for (const rule of rules) {
    if (!rule.isRegex) {
      if (normalizePath(rule.source) !== wanted) continue;
      return { destination: rule.destination, permanent: rule.permanent };
    }

    let pattern: RegExp;
    try {
      pattern = new RegExp(anchored(rule.source));
    } catch {
      // A rule stored before the check existed, or one that survived an import.
      continue;
    }

    const found = wanted.match(pattern);
    if (!found) continue;

    /*
     * $1..$9 from the captures. Substituted in one pass rather than by chained
     * replaces: a captured value containing "$2" must not then be treated as a
     * placeholder itself.
     */
    const destination = rule.destination.replace(/\$([1-9])/g, (whole, index: string) => {
      const captured = found[Number(index)];
      return captured === undefined ? whole : captured;
    });

    return { destination, permanent: rule.permanent };
  }

  return null;
}


/** What the delivery API returns from /api/v1/content/redirects. */
type RedirectsResponse = { data?: RedirectRule[] };

/**
 * A workspace's redirects, fetched from the CMS.
 *
 * Cached for a few minutes rather than per request: this runs in front of every
 * request that reaches the site, and a fetch on each one turns the CMS into a
 * hard dependency of every page load. A redirect appearing a few minutes after
 * it is written is the right trade.
 *
 * An unreachable CMS returns nothing rather than throwing. A failed fetch here
 * should cost the visitor a redirect, not the page.
 */
export async function fetchRedirects(options: {
  cmsUrl: string;
  key: string;
  revalidate?: number;
}): Promise<RedirectRule[]> {
  const { cmsUrl, key, revalidate = 300 } = options;

  try {
    const response = await fetch(`${cmsUrl.replace(/\/+$/, "")}/api/v1/content/redirects`, {
      headers: { authorization: `Bearer ${key}` },
      next: { revalidate, tags: ["redirects"] },
    });
    if (!response.ok) return [];
    const body = (await response.json()) as RedirectsResponse;
    return Array.isArray(body.data) ? body.data : [];
  } catch {
    return [];
  }
}
