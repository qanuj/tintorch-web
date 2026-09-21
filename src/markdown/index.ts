/**
 * Markdown from the CMS, made safe to render.
 *
 * Dependency-free on purpose: the sites render with `marked`, `react-markdown`
 * or their own walker, and this package should not pick for them. What is
 * shared is the part they were each getting wrong - what an author is allowed
 * to write, and what the renderer is allowed to emit.
 */
export { escapeRawHtml } from "./escape";
export {
  escapeText,
  expandFaqBlocks,
  splitFaqBlocks,
  type ExpandFaqOptions,
  type SplitFaqResult,
} from "./faq";
export {
  SANITIZE_ALLOWLIST,
  externalLinkAttributes,
  type SanitizeAllowlist,
} from "./sanitize";
