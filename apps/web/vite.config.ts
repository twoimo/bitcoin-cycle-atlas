import { skeletonMarkup } from '../../dist/loading-surfaces.js';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins:[{name:'atlas-first-paint-loading',transformIndexHtml(html){return html.replace('<div id="root"></div>',`<div id="root">${skeletonMarkup('chart','화면 로딩')}</div>`);}}],
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/market-lab/',
  server: { host: '127.0.0.1', port: 4320, strictPort: true, proxy: { '/api': 'http://127.0.0.1:4319', '/data': 'http://127.0.0.1:4319' } },
  build: { outDir: fileURLToPath(new URL('../../build/web', import.meta.url)), emptyOutDir: true },
});
