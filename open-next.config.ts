import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * OpenNext (Cloudflare) configuration.
 *
 * Every page here is rendered per request (no ISR / `revalidate`), so the default "dummy" caches are correct and no R2/KV
 * is required. If you later add ISR or `unstable_cache`, enable an incremental cache:
 * https://opennext.js.org/cloudflare/caching
 */
const config = defineCloudflareConfig({});

export default {
  ...config,
  // OpenNext runs the project's "build" script to compile Next.js. "build" is `opennextjs-cloudflare build`, so without this
  // override it would call itself forever. This is the real Next.js compile step.
  buildCommand: 'next build',
};
