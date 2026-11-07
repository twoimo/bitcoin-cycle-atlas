import { defineConfig } from 'cf/config';

const domain = process.env.ATLAS_CUSTOM_DOMAIN?.trim();
if (domain && !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain)) {
  throw new Error('ATLAS_CUSTOM_DOMAIN must be a hostname without a scheme, path or port');
}

// An assets-only Worker: no paid storage, database, container or runtime binding.
// Set the custom domain only after it is active in the deployment account.
export default defineConfig({
  worker: {
    name: 'bitcoin-cycle-atlas',
    compatibilityDate: '2026-11-07',
    workersDev: true,
    assets: {
      htmlHandling: 'auto-trailing-slash',
      notFoundHandling: '404-page',
    },
    ...(domain ? { domains: [domain] } : {}),
  },
});
