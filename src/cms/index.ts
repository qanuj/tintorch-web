/**
 * The TinTorch CMS delivery client.
 *
 * `cms` is the one a site wants: built from TINTORCH_CMS_URL and
 * TINTORCH_CMS_KEY, which every site on this CMS already sets under those
 * names. `createCmsClient` is for tests and for the rare site that talks to
 * two workspaces.
 */
import { createCmsClient } from "./client";

export * from "./types";
export * from "./items";
export {
  CMS_TAG,
  CmsError,
  MAX_PAGES,
  createCmsClient,
  normaliseBaseUrl,
  tagsFor,
  type CmsClient,
  type CmsClientOptions,
} from "./client";
export {
  clientIpFrom,
  getForm,
  submitForm,
  type CmsForm,
  type CmsFormField,
  type SubmitExtras,
  type SubmitResult,
} from "./forms";

/** The client this site's environment describes. */
export const cms = createCmsClient({
  baseUrl: process.env.TINTORCH_CMS_URL ?? "",
  key: process.env.TINTORCH_CMS_KEY ?? "",
});

export const cmsConfigured = cms.configured;
