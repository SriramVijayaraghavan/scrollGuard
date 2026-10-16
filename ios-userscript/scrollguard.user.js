// ==UserScript==
// @name         ScrollGuard Blocker
// @description  Hides Reels / Shorts / TikTok feeds per your ScrollGuard settings (config arrives via the launch link).
// @match        https://www.instagram.com/*
// @match        https://www.tiktok.com/*
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @run-at       document-start
// ==/UserScript==
// Blocks Instagram / TikTok web sections according to ScrollGuard config.
// NOTE: both sites change their markup often; selectors below are best-effort and may need updates.
const host = location.hostname.includes('instagram') ? 'instagram' : location.hostname.includes('tiktok') ? 'tiktok' : 'youtube';
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
function locked(a, now = new Date()) {
  if (a.blockAll) return 'all';
  if (a.mode === 'off') return false;
  if (a.unlockUntil && a.unlockUntil > now.getTime()) return false;
  if (a.mode === 'always') return true;
  const cur = now.getHours() * 60 + now.getMinutes(), s = toMin(a.start), e = toMin(a.end), dow = now.getDay();
  if (e > s) return a.days.includes(dow) && cur >= s && cur < e;
  if (cur >= s) return a.days.includes(dow);
  if (cur < e) return a.days.includes((dow + 6) % 7);
  return false;
}
// [target, css hide selectors, path regexes to redirect away from]
const RULES = {
  instagram: {
    reelsTab: [['a[href^="/reels"]'], [/^\/reels\/?$/]],
    reelsFeed: [['article:has(a[href*="/reel/"])', 'div:has(> a[href*="/reel/"][role="link"])'], []],
    explore: [['a[href="/explore/"]'], [/^\/explore/]],
    stories: [['div[role="menu"]:has(canvas)', 'section > div > div[role="menu"]'], []],
    search: [['a[href="#"]:has(svg[aria-label="Search"])'], [/^\/explore\/search/]],
    feed: [['main article'], [/^\/$/]],
  },
  youtube: {
    shortsTab: [['a[href^="/shorts"]', 'ytd-guide-entry-renderer:has(a[href^="/shorts"])', 'ytd-mini-guide-entry-renderer:has(a[href^="/shorts"])', 'ytm-pivot-bar-item-renderer:has(a[href^="/shorts"])', '#navigation-button-down', '#navigation-button-up'], [/^\/shorts\/?$/]],
    shortsShelf: [['ytd-reel-shelf-renderer', 'ytd-rich-shelf-renderer[is-shorts]', 'ytm-shorts-lockup-view-model', 'ytm-reel-shelf-renderer', 'grid-shelf-view-model:has(a[href^="/shorts"])'], []],
    homeFeed: [['ytd-browse[page-subtype="home"] ytd-rich-grid-renderer', 'ytm-browse:has(ytm-rich-grid-renderer) ytm-rich-grid-renderer'], [/^\/$/]],
    related: [['#related', 'ytd-watch-next-secondary-results-renderer', 'ytm-item-section-renderer[section-identifier="related-items"]'], []],
  },
  tiktok: {
    forYou: [['[data-e2e="recommend-list-item-container"]', 'a[href="/foryou"]'], [/^\/(foryou)?\/?$/]],
    following: [['a[href="/following"]'], [/^\/following/]],
    explore: [['a[href="/explore"]'], [/^\/explore/]],
    live: [['a[href="/live"]'], [/^\/live/]],
  },
};
const HOME = { instagram: '/direct/inbox/', tiktok: '/messages', youtube: '/feed/subscriptions' };
const STYLE_ID = 'sg-style';
function apply(a) {
  if (!a) return;
  const lk = locked(a);
  document.getElementById(STYLE_ID)?.remove();
  if (!lk) return;
  const p = location.pathname;
  if (lk === 'all') return location.replace('data:text/html,<body style="font:20px system-ui;text-align:center;padding:30vh 20px;background:%230f1115;color:white">🛡️ Blocked by ScrollGuard');
  const t = a.targets || {}; let css = '';
  const looking = a.lookupUntil && a.lookupUntil > Date.now();
  const dmsOnly = host === 'instagram' && t.dmsOnly && !looking;
  if (dmsOnly && !p.startsWith('/direct')) return location.replace(HOME[host]);
  for (const [key, [sels, redirects]] of Object.entries(RULES[host])) {
    if (!t[key] || (looking && ['search', 'explore'].includes(key))) continue;
    css += sels.map(s => s + '{display:none!important}').join('');
    if (redirects.some(r => r.test(p))) return location.replace(HOME[host]);
  }
  // Reels opened from a DM (/reel/<id>) stay viewable, but hide the "next video" controls.
  css += 'button[data-e2e="arrow-right"],button[data-e2e="arrow-left"],[data-e2e="video-switch"]{display:none!important}';
  const st = document.createElement('style'); st.id = STYLE_ID; st.textContent = css;
  (document.head || document.documentElement).appendChild(st);
}
const KEY = 'scrollguard.cfg';
const dec = s => JSON.parse(decodeURIComponent(escape(atob(s))));
function read() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }
// Launching from ScrollGuard appends #sg=<config>; store it, then tidy the URL.
const m = location.hash.match(/sg=([^&]+)/);
if (m) { try { localStorage.setItem(KEY, JSON.stringify(dec(decodeURIComponent(m[1])))); history.replaceState(null, '', location.pathname + location.search); } catch {} }
apply(read());
setInterval(() => apply(read()), 30000);
let last = location.href; setInterval(() => { if (location.href !== last) { last = location.href; apply(read()); } }, 500);
