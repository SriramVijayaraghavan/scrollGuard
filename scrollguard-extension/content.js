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
// A video a friend sent opens on a single-video page. Pin the viewer to that one video.
const SINGLE = {
  instagram: [/^\/(?:reel|reels)\/(?!audio)([^/]+)/, 'reelsTab'],
  tiktok: [/^\/@[^/]+\/video\/(\d+)/, 'forYou'],
  youtube: [/^\/shorts\/([^/?]+)/, 'shortsTab'],
};
let pinned = null;
// Freeze the page's own scroll areas around the video, so swiping can't reach the next one.
function lockScrollers() {
  document.querySelectorAll('video').forEach(v => {
    for (let e = v.parentElement; e && e !== document.documentElement; e = e.parentElement) {
      if (e.scrollHeight > e.clientHeight + 40) for (const [k, val] of [['overflow-y', 'hidden'], ['scroll-snap-type', 'none'], ['touch-action', 'none']]) e.style.setProperty(k, val, 'important');
    }
  });
  for (const el of [document.documentElement, document.body]) if (el) { el.style.setProperty('overflow', 'hidden', 'important'); el.style.setProperty('touch-action', 'none', 'important'); }
}
function release() {
  if (!pinned) return;
  pinned = null;
  for (const el of [document.documentElement, document.body]) if (el) { el.style.removeProperty('overflow'); el.style.removeProperty('touch-action'); }
}
setInterval(() => { if (pinned) lockScrollers(); }, 400);
const stop = e => {
  if (!pinned || e.target.closest?.('[role="dialog"],textarea,input')) return; // comments still scroll
  e.preventDefault(); e.stopPropagation();
};
addEventListener('wheel', stop, { passive: false, capture: true });
addEventListener('touchmove', stop, { passive: false, capture: true });
addEventListener('keydown', e => { if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'j', 'k'].includes(e.key)) stop(e); }, true);
function pin(t, p) {
  const [re, key] = SINGLE[host], m = re.exec(p);
  if (!m || !t[key]) { release(); return false; }
  if (!pinned) pinned = { id: m[1], url: location.href };
  else if (pinned.id !== m[1]) { location.replace(pinned.url); return true; } // scrolled to a different video: put it back
  return false;
}
function apply(cfg) {
  const a = cfg?.apps?.[host]; if (!a) return;
  const lk = locked(a);
  document.getElementById(STYLE_ID)?.remove();
  if (!lk) { release(); return; }
  const p = location.pathname;
  if (lk === 'all') return location.replace('data:text/html,<body style="font:20px system-ui;text-align:center;padding:30vh 20px;background:%230f1115;color:white">🛡️ Blocked by ScrollGuard');
  const t = a.targets || {}; let css = '';
  const looking = a.lookupUntil && a.lookupUntil > Date.now();
  const dmsOnly = host === 'instagram' && t.dmsOnly && !looking;
  const dmOk = p.startsWith('/direct') || p.startsWith('/accounts') || /^\/(reel|p|tv)\/[^/]+/.test(p) || /^\/reels\/(?!audio)[^/]+/.test(p);
  if (dmsOnly && !dmOk) return location.replace(HOME[host]);
  for (const [key, [sels, redirects]] of Object.entries(RULES[host])) {
    if (!t[key] || (looking && ['search', 'explore'].includes(key))) continue;
    css += sels.map(s => s + '{display:none!important}').join('');
    if (redirects.some(r => r.test(p))) return location.replace(HOME[host]);
  }
  // Reels opened from a DM (/reel/<id>) stay viewable, but hide the "next video" controls.
  css += 'button[data-e2e="arrow-right"],button[data-e2e="arrow-left"],[data-e2e="video-switch"]{display:none!important}';
  if (pin(t, p)) return;
  const st = document.createElement('style'); st.id = STYLE_ID; st.textContent = css;
  (document.head || document.documentElement).appendChild(st);
}
chrome.storage.local.get('cfg', r => { apply(r.cfg); setInterval(() => chrome.storage.local.get('cfg', r2 => apply(r2.cfg)), 30000); });
chrome.storage.onChanged.addListener(() => chrome.storage.local.get('cfg', r => apply(r.cfg)));
// SPA navigation: re-run when the URL changes without a page load.
let last = location.href; setInterval(() => { if (location.href !== last) { last = location.href; chrome.storage.local.get('cfg', r => apply(r.cfg)); } }, 500);
