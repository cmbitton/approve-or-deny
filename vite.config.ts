import { defineConfig, type Plugin } from 'vite';
import { SHORT_URL, SITE_URL } from './src/site.ts';

/** Fills %SITE_URL% (link previews need absolute URLs) and %SHORT_URL% in index.html. */
function siteUrl(url: string, short: string): Plugin {
  return {
    name: 'site-url',
    transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', url).replaceAll('%SHORT_URL%', short),
  };
}

export default defineConfig(() => {
  return {
    plugins: [siteUrl(SITE_URL, SHORT_URL)],
    // Relative paths, so the same build works at a domain root (Cloudflare) or in a
    // subfolder (GitHub Pages serves this repo at /approve-or-deny/).
    base: './',
    build: { target: 'es2022' },
  };
});
