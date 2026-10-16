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
// Blocks Instagram / TikTok web sections according to ScrollGuard config.
// NOTE: both sites change their markup often; selectors below are best-effort and may need updates.
const host = location.hostname.includes('instagram') ? 'instagram' : location.hostname.includes('tiktok') ? 'tiktok' : 'youtube';
// whole-app mode blocks the entire site during the lock window, except during a quick-lookup pass
function locked(a, now = new Date()) {
  if (a.blockAll) return 'all';
  const l = windowLocked(a, now);
  return l && a.whole && !(a.lookupUntil > now.getTime()) ? 'all' : l;
}
let shown = false;
function blockPage(back) {
  if (shown) return; shown = true;
  const go = () => {
    try { window.stop(); } catch {}
    document.documentElement.innerHTML = '<head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#0f1115;color:#fff;font:20px system-ui;text-align:center;padding:30vh 24px 0">🛡️ Blocked by ScrollGuard' + (back ? '<p><a style="color:#9d92ff;font-size:17px" href="' + back + '">Back to ScrollGuard</a></p>' : '') + '</body>';
  };
  setTimeout(go, 0);
}
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
function inWin(w, now) {
  const cur = now.getHours() * 60 + now.getMinutes(), s = toMin(w.start), e = toMin(w.end), dow = now.getDay();
  if (s === e) return false;
  if (e > s) return w.days.includes(dow) && cur >= s && cur < e;
  if (cur >= s) return w.days.includes(dow);
  if (cur < e) return w.days.includes((dow + 6) % 7);
  return false;
}
function windowLocked(a, now = new Date()) {
  if (a.blockAll) return 'all';
  if (a.mode === 'off') return false;
  if (a.unlockUntil && a.unlockUntil > now.getTime()) return false;
  if (a.mode === 'always') return true;
  const ws = a.windows || [{ start: a.start, end: a.end, days: a.days }]; // older configs had one window
  return ws.some(w => inWin(w, now));
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
const HOME = { instagram: '/direct/inbox/', tiktok: null, youtube: '/feed/subscriptions' };
const STYLE_ID = 'sg-style';
// A video a friend sent opens on a single-video page. Pin the viewer to that one video.
const SINGLE = {
  instagram: [/^\/(?:reel|reels)\/(?!audio)([^/]+)/, 'reelsTab'],
  tiktok: [/^\/@[^/]+\/video\/(\d+)/, 'forYou'],
  youtube: [/^\/shorts\/([^/?]+)/, 'shortsTab'],
};
let pinned = null; // { id, url, top }. id is a reel id, 'overlay' (a reel popped up inside a DM thread) or 'profile'
const PROFILE = {
  instagram: /^\/(?!(?:direct|explore|reels?|p|accounts|stories|tv|about|web)(?:\/|$))[A-Za-z0-9._]+\/?(?:(?:reels|tagged|saved)\/?)?$/,
  tiktok: /^\/@[^/]+\/?$/,
  youtube: /^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)(?:\/(?:featured|videos|shorts|streams|playlists|community))?\/?$/,
};
const frozen = new Map(); // element -> its original inline style, restored on release
const FREEZE = [['overflow-y', 'hidden'], ['scroll-snap-type', 'none'], ['touch-action', 'none']];
function freeze(e, props) {
  if (!frozen.has(e)) frozen.set(e, props.map(([k]) => [k, e.style.getPropertyValue(k), e.style.getPropertyPriority(k)]));
  for (const [k, v] of props) e.style.setProperty(k, v, 'important');
}
const DLG = '[role="dialog"]';
const isComments = e => { const d = e.closest?.(DLG); return !!d && !d.querySelector('video'); }; // a dialog without a video is comments or a menu
const visArea = v => { const r = v.getBoundingClientRect(); return Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) * Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)); };
function lockScrollers() {
  const vids = [...document.querySelectorAll('video')];
  // 1. freeze every scroll area around a video
  vids.forEach(v => { for (let e = v.parentElement; e && e !== document.documentElement; e = e.parentElement) if (e.scrollHeight > e.clientHeight + 40) freeze(e, FREEZE); });
  // 2. on a profile, freeze every big scroll area and hold the page at the top
  if (pinned.top) {
    for (const e of document.querySelectorAll('div,main,section')) if (e.clientHeight > innerHeight * 0.5 && e.scrollHeight > e.clientHeight + 40 && !isComments(e)) { freeze(e, FREEZE); e.scrollTop = 0; }
    scrollTo(0, 0);
  }
  // 3. in a reel viewer, hide every other reel so there is nothing to swipe to
  if (!pinned.top && vids.length > 1) {
    const cur = vids.reduce((a, b) => visArea(b) > visArea(a) ? b : a);
    for (const v of vids) {
      if (v === cur) continue;
      let e = v; while (e.parentElement && !e.parentElement.contains(cur)) e = e.parentElement;
      if (e !== document.body && e !== document.documentElement && !e.contains(cur)) freeze(e, [['display', 'none']]);
    }
  }
  for (const el of [document.documentElement, document.body]) if (el) freeze(el, [['overflow', 'hidden'], ['touch-action', 'none']]);
  // 4. no swipe gestures anywhere except in comments
  if (!document.getElementById('sg-ta')) {
    const s = document.createElement('style'); s.id = 'sg-ta';
    s.textContent = `html,body,*{touch-action:none!important}${DLG}:not(:has(video)),${DLG}:not(:has(video)) *,input,textarea{touch-action:pan-y!important}`;
    (document.head || document.documentElement).appendChild(s);
  }
}
function badge(on) {
  let b = document.getElementById('sg-lock');
  if (!on) { b?.remove(); return; }
  if (!b && document.body) {
    b = document.createElement('div'); b.id = 'sg-lock'; b.textContent = 'ScrollGuard: scrolling locked';
    b.style.cssText = 'position:fixed;top:6px;left:50%;transform:translateX(-50%);z-index:2147483647;background:rgba(18,42,107,.92);color:#fff;font:600 11px system-ui;padding:4px 10px;border-radius:99px;pointer-events:none';
    document.body.appendChild(b);
  }
}
function release() {
  if (!pinned) return;
  pinned = null;
  for (const [e, old] of frozen) for (const [k, v, pr] of old) v ? e.style.setProperty(k, v, pr) : e.style.removeProperty(k);
  frozen.clear();
  document.getElementById('sg-ta')?.remove(); badge(false);
}
// On Instagram a reel opened from a DM can play as a full-screen overlay while the address stays /direct/t/...
function bigVideo() {
  if (host !== 'instagram' || !location.pathname.startsWith('/direct')) return false;
  for (const v of document.querySelectorAll('video')) {
    const r = v.getBoundingClientRect();
    if (r.height > innerHeight * 0.6 && r.width > innerWidth * 0.5 && r.bottom > 0 && r.top < innerHeight) return true;
  }
  return false;
}
let lastT = null; // targets while locked, else null
setInterval(() => {
  if (lastT && lastT.reelsTab && !SINGLE[host][0].test(location.pathname)) {
    if (bigVideo()) { if (!pinned) pinned = { id: 'overlay', url: location.href }; }
    else if (pinned && pinned.id === 'overlay') release();
  }
  if (pinned) { lockScrollers(); badge(true); }
}, 300);
const stop = e => {
  if (!pinned) return;
  if (e.target.closest?.('textarea,input') || isComments(e.target)) return; // comments still scroll
  e.preventDefault(); e.stopPropagation();
};
addEventListener('wheel', stop, { passive: false, capture: true });
addEventListener('touchmove', stop, { passive: false, capture: true });
addEventListener('keydown', e => { if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'j', 'k', ' ', 'End', 'Home'].includes(e.key) && !e.target.closest?.('textarea,input')) stop(e); }, true);
// on a profile, hold everything at the top and don't let posts or reels open from it
addEventListener('scroll', e => { if (pinned?.top) { if (e.target && e.target !== document) e.target.scrollTop = 0; else if (scrollY) scrollTo(0, 0); } }, true);
addEventListener('click', e => {
  if (!pinned?.top) return;
  const a = e.target.closest?.('a[href]');
  if (a && /\/(?:p|reel|reels|tv)\/[^/]+|\/video\/\d+|\/shorts\/|\/watch\?/.test(a.getAttribute('href'))) { e.preventDefault(); e.stopPropagation(); }
}, true);
// stop the page's own router from moving to another reel (only effective when the script runs in the page)
for (const fn of ['pushState', 'replaceState']) {
  const orig = history[fn];
  history[fn] = function (s, t, u) {
    try { if (pinned && u != null) { const m = SINGLE[host][0].exec(new URL(u, location.href).pathname); if (m && m[1] !== pinned.id) return; } } catch {}
    return orig.apply(this, arguments);
  };
}
function pin(t, p) {
  const [re, key] = SINGLE[host], m = re.exec(p);
  if (!m && t.profileLock && PROFILE[host].test(p)) { if (!pinned || pinned.id !== 'profile') { release(); pinned = { id: 'profile', url: location.href, top: true }; } return false; }
  if (!m || !t[key]) { release(); return false; }
  if (pinned && (pinned.id === 'overlay' || pinned.id === 'profile')) release();
  if (!pinned) pinned = { id: m[1], url: location.href };
  else if (pinned.id !== m[1]) { location.replace(pinned.url); return true; } // scrolled to a different video: put it back
  return false;
}
function apply(a) {
  if (!a) return;
  const lk = locked(a);
  document.getElementById(STYLE_ID)?.remove();
  if (!lk) { lastT = null; release(); return; }
  const p = location.pathname;
  if (lk === 'all') return blockPage(a.back);
  const t = a.targets || {}; lastT = t; let css = '';
  const looking = a.lookupUntil && a.lookupUntil > Date.now();
  const dmsOnly = host === 'instagram' && t.dmsOnly && !looking;
  const dmOk = p.startsWith('/direct') || p.startsWith('/accounts') || /^\/(reel|p|tv)\/[^/]+/.test(p) || /^\/reels\/(?!audio)[^/]+/.test(p);
  if (dmsOnly && !dmOk) return (HOME[host] ? location.replace(HOME[host]) : blockPage(a.back));
  for (const [key, [sels, redirects]] of Object.entries(RULES[host])) {
    if (!t[key] || (looking && ['search', 'explore'].includes(key))) continue;
    css += sels.map(s => s + '{display:none!important}').join('');
    if (redirects.some(r => r.test(p))) return (HOME[host] ? location.replace(HOME[host]) : blockPage(a.back));
  }
  // Reels opened from a DM (/reel/<id>) stay viewable, but hide the "next video" controls.
  css += 'button[data-e2e="arrow-right"],button[data-e2e="arrow-left"],[data-e2e="video-switch"]{display:none!important}';
  if (pin(t, p)) return;
  const st = document.createElement('style'); st.id = STYLE_ID; st.textContent = css;
  (document.head || document.documentElement).appendChild(st);
}
const KEY = 'scrollguard.cfg';
const dec = s => JSON.parse(decodeURIComponent(escape(atob(s))));
function read() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }
// Launching from ScrollGuard appends #sg=<config>; store it, then tidy the URL.
const m = location.hash.match(/sg=([^&]+)/);
if (m) { try { localStorage.setItem(KEY, JSON.stringify(dec(decodeURIComponent(m[1])))); history.replaceState(null, '', location.pathname + location.search); localStorage.setItem('scrollguard.time', '0'); } catch {} }
apply(read());
setInterval(() => apply(read()), 30000);
let last = location.href; setInterval(() => { if (location.href !== last) { last = location.href; apply(read()); } }, 500);

// ---- exact time on this site, reported back to ScrollGuard via the Done button ----
const TKEY = 'scrollguard.time';
let acc = +localStorage.getItem(TKEY) || 0, since = document.hidden ? 0 : Date.now();
function tick() { if (since) { const n = Date.now(); acc += (n - since) / 60000; since = n; } try { localStorage.setItem(TKEY, acc); } catch {} }
document.addEventListener('visibilitychange', () => { if (document.hidden) { tick(); since = 0; } else since = Date.now(); });
setInterval(() => {
  if (!document.hidden) tick();
  const cfg = read(); if (!cfg || !cfg.back || !cfg.track || !document.body) return;
  let b = document.getElementById('sg-done');
  if (!b) {
    b = document.createElement('a'); b.id = 'sg-done';
    b.style.cssText = 'position:fixed;right:12px;bottom:90px;z-index:2147483647;background:#7c6cf0;color:#fff;font:600 14px system-ui;padding:9px 14px;border-radius:99px;text-decoration:none;box-shadow:0 2px 8px rgba(0,0,0,.4)';
    b.onclick = () => { tick(); b.href = cfg.back + '#log=' + host + ':' + acc.toFixed(1); setTimeout(() => { acc = 0; try { localStorage.setItem(TKEY, '0'); } catch {} }, 300); };
    document.body.appendChild(b);
  }
  b.textContent = '🛡️ Done · ' + Math.round(acc) + 'm'; b.href = cfg.back + '#log=' + host + ':' + acc.toFixed(1);
}, 2000);
