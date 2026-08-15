/** See usage.mjs - measurement and reporting of a site's ISR cache weight. */
export function measureDir(dir: string): Promise<{ bytes: number; pages: number }>;
export function reportUsage(options?: {
  cmsUrl?: string;
  key?: string;
  dir?: string;
  source?: string;
}): Promise<{ ok: boolean; bytes?: number; pages?: number; reason?: string }>;
