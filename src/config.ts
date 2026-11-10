// Site-wide settings. The site's address lives in src/site.ts.
// The daily docket's start date lives in public/daily.json (set with `npm run deck -- --epoch`).
import { SHORT_URL, SITE_URL } from './site.ts';

export const CONFIG = {
  /** Canonical URL used in share text and shared-plate links. */
  siteUrl: SITE_URL,
  shortUrl: SHORT_URL,
  analytics: {
    /** Single switch for all analytics events. Off until a provider is chosen. */
    enabled: import.meta.env.VITE_ANALYTICS === 'on',
  },
};
