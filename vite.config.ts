import { readFileSync } from 'node:fs';
import { parse } from 'smol-toml';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

interface NetlifyConfig {
  headers?: { for: string; values: Record<string, string> }[];
}

/*
 * `vite preview` sends the same headers as Netlify, so the end-to-end tests
 * run under the Content Security Policy of the live site.
 */
function siteHeaders(): Record<string, string> {
  const config = parse(read('./netlify.toml')) as NetlifyConfig;
  return config.headers?.find((rule) => rule.for === '/*')?.values ?? {};
}

/*
 * The Argonne licence asks that compiled copies of the WBGT model carry its
 * notice, so the NOTICE file is published with the site.
 */
const notice: Plugin = {
  name: 'terik-notice',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'NOTICE.txt', source: read('./NOTICE') });
  },
};

export default defineConfig({
  plugins: [react(), notice],
  worker: { format: 'es' },
  preview: { headers: siteHeaders() },
  build: {
    target: 'es2022',
    sourcemap: true,
    // three.js and React Three Fiber make one large chunk. It only loads when
    // a 3D view is shown, so the limit is raised rather than splitting it.
    chunkSizeWarningLimit: 1000,
    // The licences of every bundled library, published next to the site.
    license: { fileName: 'third-party-licenses.txt' },
  },
});
