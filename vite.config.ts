import { defineConfig, loadEnv, type Plugin } from 'vite';

/** Fills %SITE_URL% in index.html. Social cards need absolute URLs, so warn when it's unset. */
function siteUrl(url: string): Plugin {
  return {
    name: 'site-url',
    transformIndexHtml: (html) =>
      (url ? html : html.replace(/^\s*<link rel="canonical"[^>]*>\n/m, '')).replaceAll('%SITE_URL%', url),
    buildStart() {
      if (!url) {
        this.warn('VITE_SITE_URL is not set: link previews will use relative URLs, which most social sites ignore.');
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [siteUrl((env.VITE_SITE_URL ?? '').replace(/\/+$/, ''))],
    // Relative paths, so the same build works at a domain root (Cloudflare) or in a
    // subfolder (GitHub Pages serves this repo at /approve-or-deny/).
    base: './',
    build: { target: 'es2022' },
  };
});
