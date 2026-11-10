/**
 * Where the game is published. The one place to change when moving to a custom domain:
 * share links, link previews (Open Graph / Twitter tags) and the per-plate pages all read it.
 * No trailing slash.
 */
export const SITE_URL = 'https://cmbitton.github.io/approve-or-deny';

/** SITE_URL without the protocol, for printing on screen ("cmbitton.github.io/approve-or-deny"). */
export const SHORT_URL = SITE_URL.replace(/^https?:\/\//, '');
