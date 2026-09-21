/**
 * What the CMS returns.
 *
 * These are the shapes of the delivery API, not of any one site's content
 * model. A site's own types (a Treatment, a Service, a Doctor) are built by
 * mapping a `CmsItem` in that site's repo, because only the site knows which
 * field it calls the body and what it means.
 */

export type CmsFaq = {
  question: string;
  answer: string;
  /** The heading the question was written under, when the author grouped them. */
  group?: string;
};

export type CmsSeo = {
  metaTitle?: string;
  metaDescription?: string;
  canonicalUrl?: string;
  ogImage?: string;
  keywords?: string[];
  noindex?: boolean;
};

export type CmsAuthor = {
  id: string;
  name: string;
  slug?: string;
};

export type CmsRef = {
  id: string;
  name: string;
  slug: string;
};

export type CmsItem = {
  id: string;
  slug: string;
  title: string;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  fields: Record<string, unknown>;
  seo: CmsSeo;
  /** Set by the CMS when an editor pinned a canonical for this item. */
  canonical?: string;
  /*
   * Everyone credited on the item. The slug is what turns a byline into a link
   * to that person's page; listings only carry this when `fields` names it.
   */
  authors?: CmsAuthor[];
  faqs?: CmsFaq[];
  locations?: CmsRef[];
};

export type CmsMeta = {
  total: number;
  page: number;
  pageCount: number;
  hasMore: boolean;
};

export type ListOptions = {
  page?: number;
  limit?: number;
  search?: string;
  /** Narrow the response to these keys - a listing rarely needs whole bodies. */
  fields?: string;
  revalidate?: number;
};

export type ListResult = {
  items: CmsItem[];
  meta: CmsMeta | null;
};
