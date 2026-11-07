import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// The application is already built and verified in dist. The Cloudflare plugin's
// public-directory build copies these bytes without rebundling product modules.
export default defineConfig({
  plugins: [cloudflare({ types: { generate: false }, remoteBindings: false, inspectorPort: false })],
  publicDir: fileURLToPath(new URL('./build/cloudflare-assets', import.meta.url)),
  build: { emptyOutDir: true },
});
