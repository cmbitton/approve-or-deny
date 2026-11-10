// Site-wide settings. Override at build time with VITE_* environment variables.
// The daily docket's start date lives in public/daily.json (set with `npm run deck -- --epoch`).

export const CONFIG = {
  /** Canonical URL used in share text. Falls back to wherever the page is served from. */
  siteUrl: ((import.meta.env.VITE_SITE_URL as string | undefined) || location.origin).replace(/\/+$/, ''),
  analytics: {
    /** Single switch for all analytics events. Off until a provider is chosen. */
    enabled: import.meta.env.VITE_ANALYTICS === 'on',
  },
};
