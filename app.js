'use strict';
// ScrollGuard. Local-first: everything is stored in this browser. No server.

// ---------- constants ----------
const KEY = 'scrollguard.v1';
const APPS = {
  instagram: { name: 'Instagram', open: 'https://www.instagram.com/direct/inbox/', full: 'https://www.instagram.com/' },
  tiktok: { name: 'TikTok', open: 'https://www.tiktok.com/', full: 'https://www.tiktok.com/' },
  youtube: { name: 'YouTube', open: 'https://m.youtube.com/feed/subscriptions', full: 'https://m.youtube.com/' },
};
const KEYS = Object.keys(APPS);
const ORDER = ['instagram', 'tiktok', 'youtube', 'other']; // fixed chart/legend order
const NAMES = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', other: 'Other' };
const ALLOW = { instagram: { phrase: 'open messages', btn: 'Open messages' }, youtube: { phrase: 'open your subscriptions', btn: 'Open subscriptions' } };
const profileUrl = { instagram: h => `https://www.instagram.com/${h}/`, tiktok: h => `https://www.tiktok.com/@${h}`, youtube: h => `https://m.youtube.com/@${h}` };
const IS_STANDALONE = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAYNAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const GREETS = ['Welcome', 'Hello', 'Greetings', 'Salutations', "What's up", 'Hey there', 'Hi', 'Howdy', 'Good day', 'Welcome back'];
const ACCENTS = [ // c = fills, lt/dt = text and icons on light/dark surfaces
  { c: '#1c3d99', lt: '#1c3d99', dt: '#7ea2ff', n: 'Navy' },
  { c: '#12a67c', lt: '#0e8a66', dt: '#2fd0a2', n: 'Emerald' },
  { c: '#d6303d', lt: '#c42631', dt: '#ff7580', n: 'Red' },
  { c: '#cc5500', lt: '#b34700', dt: '#ff9347', n: 'Burnt orange' },
];
const TARGETS = {
  instagram: [['reelsTab', 'Reels tab and scrolling'], ['reelsFeed', 'Reels inside the feed'], ['explore', 'Explore page'], ['stories', 'Stories bar'], ['search', 'Search'], ['feed', 'Home feed posts'], ['dmsOnly', 'Everything except messages']],
  tiktok: [['forYou', 'For You feed'], ['following', 'Following feed'], ['explore', 'Explore'], ['live', 'LIVE']],
  youtube: [['shortsTab', 'Shorts tab and scrolling'], ['shortsShelf', 'Shorts inside the feed'], ['homeFeed', 'Home recommendations'], ['related', 'Related videos']],
};
const defTargets = k => Object.fromEntries(TARGETS[k].map(([t]) => [t, (['reelsTab', 'reelsFeed', 'forYou', 'following', 'explore', 'shortsTab', 'shortsShelf'].includes(t) && !(k === 'instagram' && t === 'explore')) || (k === 'instagram' && t === 'dmsOnly')]));
const defApp = k => ({ on: true, whole: k === 'tiktok', mode: 'schedule', start: '09:00', end: '17:00', days: [0, 1, 2, 3, 4, 5, 6], blockAll: false, targets: defTargets(k) });
const def = () => ({
  first: dayKey(), tab: 'home', account: null,
  ui: { theme: 'auto', accent: '#1c3d99', v: 2 },
  settings: { track: true, threshold: 60, requireTasks: true, lookup: true, safariHandoff: false },
  apps: Object.fromEntries(KEYS.map(k => [k, defApp(k)])),
  learn: { on: false, topics: [], ytOn: false, ytKey: '', src: { wiki: true, hn: true } },
  tasks: [], override: {}, lookup: {}, usage: {}, pending: null,
  ms: { clientId: '', token: '', exp: 0 },
});
let S = load();
function load() {
  const d = def();
  try {
    const o = JSON.parse(localStorage.getItem(KEY)) || {};
    o.apps = o.apps || {};
    for (const k of KEYS) o.apps[k] = Object.assign(d.apps[k], o.apps[k], { targets: Object.assign(d.apps[k].targets, (o.apps[k] || {}).targets) });
    o.learn = Object.assign(d.learn, o.learn, { src: Object.assign(d.learn.src, (o.learn || {}).src) });
    o.settings = Object.assign(d.settings, o.settings);
    o.ui = Object.assign(d.ui, o.ui);
    const s = Object.assign(d, o);
    if (s.ui.v !== 2) { s.ui.accent = '#1c3d99'; s.ui.v = 2; } // navy is the new standard
    if (s.account) s.account = { name: s.account.name };      // name only
    s.tab = 'home';
    return s;
  } catch { return d; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }
function dayKey(d = new Date()) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const pick = a => a[Math.floor(Math.random() * a.length)];
const $ = s => document.querySelector(s);
const fmt = m => { m = Math.round(m); return m >= 60 ? Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '') : m + 'm'; };
const enc = o => btoa(unescape(encodeURIComponent(JSON.stringify(o))));
const fmtTime = t => { const [h, m] = t.split(':').map(Number); return ((h + 11) % 12 + 1) + (m ? ':' + String(m).padStart(2, '0') : '') + (h < 12 ? ' AM' : ' PM'); };

// ---------- session ----------
let sheet = null, histRange = 'week';
let greet; try { greet = sessionStorage.getItem('sg.greet'); } catch {}
if (!greet) { greet = pick(GREETS); try { sessionStorage.setItem('sg.greet', greet); } catch {} }

// ---------- restriction logic ----------
function status(app, now = new Date()) {
  const a = S.apps[app], ov = S.override[app];
  if (!a.on) return { active: false };
  if (a.blockAll) return { active: true, reason: 'blocked entirely', full: true };
  if (a.mode === 'off') return { active: false };
  let inWin = true, minsLeft = null;
  if (a.mode === 'schedule') {
    const cur = now.getHours() * 60 + now.getMinutes(), s = toMin(a.start), e = toMin(a.end), dow = now.getDay();
    if (e > s) { inWin = a.days.includes(dow) && cur >= s && cur < e; if (inWin) minsLeft = e - cur; }
    else if (cur >= s) { inWin = a.days.includes(dow); minsLeft = 1440 - cur + e; }
    else if (cur < e) { inWin = a.days.includes((dow + 6) % 7); minsLeft = e - cur; }
    else inWin = false;
  }
  if (!inWin) return { active: false };
  if (ov && ov > now.getTime()) return { active: false, overridden: true };
  return { active: true, whole: !!a.whole, reason: a.mode === 'always' ? 'Always on' : `${fmtTime(a.start)} to ${fmtTime(a.end)}`, minsLeft };
}
// What the user may still do while an app is restricted.
function allowed(k, st) {
  if (st.whole || !ALLOW[k]) return { phrase: 'look up profiles', btn: null };
  return ALLOW[k];
}
const allDone = () => S.tasks.length > 0 && S.tasks.every(t => t.done);
function unlock(app) {
  if (S.settings.requireTasks ? !allDone() : !confirm('Unlock early? Your tasks are not required.')) return;
  const st = status(app);
  const mins = st.minsLeft ?? 24 * 60 - (new Date().getHours() * 60 + new Date().getMinutes());
  S.override[app] = Date.now() + mins * 60000; save(); render();
}

// ---------- usage tracking ----------
function addUsage(app, min, day = dayKey()) {
  if (!S.settings.track || min <= 0) return;
  (S.usage[day] ||= {})[app] = Math.round(((S.usage[day][app] || 0) + min) * 10) / 10; save();
}
function launch(app, full, url) {
  S.pending = { app, start: Date.now() }; save();
  const cfg = enc(JSON.parse(exportConfig()).apps[app]); // the Safari userscript reads this hash
  const target = (url || (full ? APPS[app].full : APPS[app].open)) + '#sg=' + cfg;
  if (S.settings.safariHandoff) location.href = 'x-safari-' + target; else window.open(target, '_blank', 'noopener');
  render();
}
// 10-minute pass: profiles and search work while feeds stay locked
function lookup(app, handle) {
  let url;
  if (handle) {
    const h = handle.replace(/^@/, '').trim();
    if (!/^[A-Za-z0-9._-]{1,60}$/.test(h)) return alert('Enter a handle like name_here (letters, numbers, . _ -).');
    url = profileUrl[app](h);
  }
  S.lookup[app] = Date.now() + 10 * 60000; save();
  sheet = null; launch(app, true, url);
}
function endSession() {
  const p = S.pending; if (!p) return;
  addUsage(p.app, Math.min(180, Math.max(0, (Date.now() - p.start) / 60000)));
  S.pending = null; save(); render();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.pending && Date.now() - S.pending.start > 3000) endSession(); });

// ---------- stats ----------
const used = (day, app = 'instagram') => (S.usage[day] || {})[app] || 0;
const dayTotal = key => Object.values(S.usage[key] || {}).reduce((a, b) => a + b, 0);
function pastDays() {
  const out = [], d = new Date(); d.setDate(d.getDate() - 1);
  while (dayKey(d) >= S.first && out.length < 400) { out.push(dayKey(d)); d.setDate(d.getDate() - 1); }
  return out;
}
const sum = arr => arr.reduce((x, y) => x + y, 0);
const TIERS = [
  { id: 'locked', name: 'Locked In', icon: 'brain', bg: 'var(--accent)', rule: 'Under 1h a day for 14 days' },
  { id: 'light', name: 'Light Scroller', icon: 'ramp', bg: '#2f9e6b', rule: '3 days in a row under 3h' },
  { id: 'cutting', name: 'Cutting Back', icon: 'phone', bg: '#c2760a', rule: 'Under 5h a day, last 3 days' },
  { id: 'chud', name: 'Chud', icon: 'heartbreak', bg: 'var(--danger)', rule: '5h or more a day' },
];
// Badges look at completed days only (today is still in progress). Missing days count as zero.
function badge() {
  const t = pastDays().map(dayTotal);                      // newest first, since first use
  if (!t.length) return null;
  const l3 = t.slice(0, 3), a3 = sum(l3) / l3.length, n3 = l3.length;
  const a14 = t.length >= 14 ? sum(t.slice(0, 14)) / 14 : null;
  const next14 = t.length < 14 ? `${14 - t.length} more day${14 - t.length === 1 ? '' : 's'} of tracking to reach Locked In.` : `Get your 14 day average under 1h (now ${fmt(a14)}) to reach Locked In.`;
  if (a14 !== null && a14 < 60) return { id: 'locked', note: `Averaging ${fmt(a14)} a day over the last 14 days.` };
  if (t.length >= 3 && l3.every(m => m < 180)) return { id: 'light', note: `Under 3h each of the last 3 days. ${next14}` };
  if (a3 < 300) return { id: 'cutting', note: `Averaging ${fmt(a3)} a day over the last ${n3} day${n3 === 1 ? '' : 's'}. Three days in a row under 3h makes you a Light Scroller.` };
  return { id: 'chud', note: `Averaging ${fmt(a3)} a day over the last ${n3} day${n3 === 1 ? '' : 's'}. Get under 5h to move up.` };
}
function chartData(n) {
  const out = [], d = new Date();
  for (let i = 0; i < n; i++) {
    const key = dayKey(d), u = S.usage[key] || {};
    const r = { key, date: new Date(d), instagram: u.instagram || 0, tiktok: u.tiktok || 0, youtube: u.youtube || 0, other: 0 };
    for (const [k, v] of Object.entries(u)) if (!APPS[k]) r.other += v;
    r.total = r.instagram + r.tiktok + r.youtube + r.other;
    out.unshift(r); d.setDate(d.getDate() - 1);
  }
  return out;
}

// ---------- icons and art ----------
const I = {
  home: '<path d="M4 11.5 12 5l8 6.5"/><path d="M6 10.5V19h12v-8.5"/><path d="M10 19v-5h4v5"/>',
  sliders: '<path d="M5 7h8M17 7h2M5 17h2M11 17h8"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  book: '<path d="M5 5.5C7.5 4.5 10 4.7 12 6c2-1.3 4.5-1.5 7-.5V18c-2.5-1-5-.8-7 .5-2-1.3-4.5-1.5-7-.5z"/><path d="M12 6v12.5"/>',
  tasks: '<circle cx="12" cy="12" r="8"/><path d="m8.5 12.3 2.4 2.4 4.6-5"/>',
  chart: '<path d="M5 19V11M12 19V5M19 19v-6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  lock: '<rect x="6" y="11" width="12" height="9" rx="2.5"/><path d="M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
  shield: '<path d="M12 3.5 19 6v5.5c0 4.2-3 7.2-7 9-4-1.8-7-4.8-7-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  news: '<rect x="5" y="5" width="14" height="14" rx="2.5"/><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4"/>',
  film: '<rect x="4" y="6" width="16" height="12" rx="2.5"/><path d="m10.5 9.5 4 2.5-4 2.5z"/>',
};
const ico = (n, s = 22) => `<svg class="i" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;
const TT = 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z';
const LOGO = {
  instagram: '<rect width="48" height="48" rx="11" fill="url(#igg)"/><rect x="12.5" y="12.5" width="23" height="23" rx="7" fill="none" stroke="#fff" stroke-width="3"/><circle cx="24" cy="24" r="5.4" fill="none" stroke="#fff" stroke-width="3"/><circle cx="31.2" cy="16.8" r="1.8" fill="#fff"/>',
  tiktok: `<rect width="48" height="48" rx="11" fill="#010101"/><g transform="translate(10.2 10) scale(1.16)"><path d="${TT}" fill="#25f4ee" transform="translate(-.9 .9)"/><path d="${TT}" fill="#fe2c55" transform="translate(.9 -.9)"/><path d="${TT}" fill="#fff"/></g>`,
  youtube: '<rect width="48" height="48" rx="11" fill="#fff"/><rect x="8" y="13" width="32" height="22" rx="7" fill="#ff0000"/><path d="M20.5 18.8v10.4l9-5.2z" fill="#fff"/>',
};
const logo = (k, s = 44) => `<svg class="logo" width="${s}" height="${s}" viewBox="0 0 48 48" role="img" aria-label="${APPS[k].name}">${LOGO[k]}</svg>`;
const BIG = {
  brain: '<g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 31C6 20 15 11 27 12c5-5 15-4 19 2 8 0 13 7 11 14 3 6-1 13-8 13H24c-9 0-16-4-17-10z" fill="currentColor" fill-opacity=".16"/><path d="M38 41c1 8 10 11 17 6M31 41l3 15h7l-3-15"/><path d="M16 24c3-4 8-3 10 0M30 19c4-1 8 1 8 5M44 20c4 0 7 3 6 7M13 33c4 2 8 0 9-4M26 30c3 3 8 3 11 0M41 31c3 3 8 2 11-1M19 39c5 1 9-1 11-4M36 37c3 1 6 0 8-2"/></g>',
  ramp: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M9 8v47h47" stroke-width="3.4"/><path d="M15 49l10-11 8 7 11-16 6 5 5-11V49z" fill="currentColor" fill-opacity=".2" stroke="none"/><path d="M15 49l10-11 8 7 11-16 6 5 7-14" stroke-width="4"/><path d="M48 18h10v10" stroke-width="4"/></g>',
  phone: '<g fill="none" stroke="currentColor" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"><rect x="18" y="6" width="28" height="52" rx="7"/><path d="M27 12h10"/><circle cx="32" cy="50" r="2.4" fill="currentColor"/></g>',
  heartbreak: '<path d="M32 57C12 43 6 32 6 22a13.5 13.5 0 0 1 24-8.4L32 17l2-3.4A13.5 13.5 0 0 1 58 22c0 10-6 21-26 35z" fill="currentColor"/><path d="M32 17l-6.5 11 10 6.5-7.5 13" fill="none" stroke="var(--bb)" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>',
};
const bigIco = (n, s = 54) => `<svg width="${s}" height="${s}" viewBox="5 5 54 54" aria-hidden="true">${BIG[n]}</svg>`;

// ---------- config handed to the Safari blocker ----------
function exportConfig() {
  const apps = {};
  for (const k of KEYS) {
    const a = S.apps[k];
    apps[k] = { mode: a.on ? a.mode : 'off', start: a.start, end: a.end, days: a.days, blockAll: a.blockAll, whole: !!a.whole, targets: a.targets, unlockUntil: S.override[k] || 0, lookupUntil: S.lookup[k] || 0, track: S.settings.track, back: IS_STANDALONE ? '' : location.origin + location.pathname };
  }
  return JSON.stringify({ v: 1, apps });
}

// ---------- Microsoft To Do (Graph, OAuth PKCE) ----------
const redirect = () => location.origin + location.pathname;
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function msLogin() {
  if (!S.ms.clientId) return alert('Enter your Azure app Client ID first.');
  const ver = b64u(crypto.getRandomValues(new Uint8Array(32)));
  const chal = b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ver)));
  sessionStorage.setItem('sg.ver', ver); save();
  location.href = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?' + new URLSearchParams({
    client_id: S.ms.clientId, response_type: 'code', redirect_uri: redirect(), scope: 'Tasks.ReadWrite User.Read',
    code_challenge: chal, code_challenge_method: 'S256', response_mode: 'query' });
}
async function msFinish() {
  const code = new URLSearchParams(location.search).get('code'), ver = sessionStorage.getItem('sg.ver');
  if (!code || !ver) return;
  history.replaceState({}, '', redirect());
  try {
    const r = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', { method: 'POST',
      body: new URLSearchParams({ client_id: S.ms.clientId, grant_type: 'authorization_code', code, redirect_uri: redirect(), code_verifier: ver }) });
    const j = await r.json(); if (!j.access_token) throw new Error(j.error_description);
    S.ms.token = j.access_token; S.ms.exp = Date.now() + j.expires_in * 1000; save();
    await msSync();
  } catch (e) { alert('Microsoft sign-in failed: ' + e.message); }
}
const msOk = () => S.ms.token && S.ms.exp > Date.now();
async function graph(path, opt = {}) {
  const r = await fetch('https://graph.microsoft.com/v1.0' + path, { ...opt, headers: { Authorization: 'Bearer ' + S.ms.token, 'Content-Type': 'application/json' } });
  if (!r.ok) throw new Error('Graph ' + r.status); return r.status === 204 ? null : r.json();
}
async function msSync() {
  if (!msOk()) return alert('Your Microsoft session expired. Connect again.');
  try {
    const lists = (await graph('/me/todo/lists')).value;
    const dl = lists.find(l => l.wellknownListName === 'defaultList') || lists[0];
    const ts = (await graph(`/me/todo/lists/${dl.id}/tasks?$top=100`)).value;
    S.tasks = S.tasks.filter(t => !t.ms).concat(ts.map(t => ({ id: 'ms' + t.id, text: t.title, done: t.status === 'completed', ms: { list: dl.id, id: t.id } })));
    save(); render();
  } catch (e) { alert('Sync failed: ' + e.message); }
}
async function toggleTask(id) {
  const t = S.tasks.find(t => t.id === id); t.done = !t.done; save(); render();
  if (t.ms && msOk()) try { await graph(`/me/todo/lists/${t.ms.list}/tasks/${t.ms.id}`, { method: 'PATCH', body: JSON.stringify({ status: t.done ? 'completed' : 'notStarted' }) }); } catch {}
}

// ---------- shared view pieces ----------
const sw = (attrs, on) => `<input type="checkbox" class="sw" ${attrs} ${on ? 'checked' : ''}>`;
const head = (title, right) => `<header class="top"><h1>${title}</h1>${right ?? `<button class="icon-btn" data-a="tab" data-v="settings" aria-label="Settings">${ico('gear')}</button>`}</header>`;
const trow = (label, sub, ctl) => `<label class="row"><span class="lbl"><b>${label}</b>${sub ? `<span class="sub">${sub}</span>` : ''}</span>${ctl}</label>`;
const seg = (key, opts, cur) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button data-a="seg" data-k="${key}" data-v="${v}" class="${cur === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;

// ---------- welcome ----------
function vWelcome() {
  return `<form class="welcome" data-form="signup">
    <div class="mark"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--accent-t)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I.shield}</svg></div>
    <div><h1>Hello, welcome to ScrollGuard.</h1><p class="lead" style="margin-top:8px">What should we call you?</p></div>
    <div class="fields"><input class="field" id="w-name" placeholder="Name" autocomplete="given-name" autocapitalize="words" required></div>
    <div class="err" id="err"></div>
    <button class="btn primary block" type="submit">Continue</button>
    <p class="fine">Your name stays on this iPhone. Nothing is sent to a server.</p>
  </form>`;
}

// ---------- home ----------
function blurb(t) {
  const [a, b, c] = t;
  if (!a && !b && !c) return 'Nothing logged yet. Time appears here after you open an app from ScrollGuard.';
  let s = '';
  if (b > 0 && c > 0) {
    const p = Math.round(Math.abs(b - c) / c * 100);
    s = p < 8 ? 'Yesterday matched the day before.' : b < c ? `Yesterday was ${p}% lower than the day before. Keep it going.` : `Yesterday ran ${p}% higher than the day before. Today is a fresh start.`;
  } else if (b > 0) s = `Yesterday you logged ${fmt(b)}.`;
  const ig = used(dayKey()), g = S.settings.threshold;
  const tail = ig > g ? `You are over your ${fmt(g)} Instagram goal today.` : a ? `You are within your ${fmt(g)} Instagram goal today.` : '';
  return (s + ' ' + tail).trim();
}
function vHome() {
  const rows = KEYS.filter(k => S.apps[k].on).map(k => {
    const st = status(k);
    const sub = st.full ? 'Blocked' : st.active ? (st.whole ? 'Blocked right now' : 'Restricted') : st.overridden ? 'Unlocked for now' : 'No restrictions';
    return `<button class="approw" data-a="sheet" data-k="${k}">${logo(k)}<span class="lbl"><b>${APPS[k].name}</b><span class="sub">${sub}</span></span>${st.active ? `<span class="lock-ic" aria-label="Restricted">${ico('lock', 20)}</span>` : ''}<span class="chev">${ico('chev', 18)}</span></button>`;
  }).join('');
  const d = new Date(), tot = [];
  const labels = ['Today', 'Yesterday'];
  for (let i = 0; i < 3; i++) { tot.push(dayTotal(dayKey(d))); if (i > 1) labels.push(DAYNAMES[d.getDay()]); d.setDate(d.getDate() - 1); }
  const max = Math.max(...tot, 1);
  const pend = S.pending ? `<div class="banner"><span class="lbl"><b>Timing ${APPS[S.pending.app].name}</b><span class="sub">Stops when you return here.</span></span><button class="btn primary sm" data-a="end">I'm back</button></div>` : '';
  return `${head(`${esc(greet)}, ${esc(S.account.name)}`)}${pend}
  <div class="section-t">Apps</div>
  <div class="group">${rows || '<div class="pad sub">No apps are managed. Turn them on in Limits.</div>'}</div>
  ${S.settings.track ? `<div class="section-t">Last 3 days</div><div class="group"><div class="days3">${tot.map((m, i) => `<div class="d3"><div class="bar"><i style="height:${Math.max(4, Math.round(m / max * 56))}px"></i></div><div class="v">${fmt(m)}</div><div class="l">${labels[i]}</div></div>`).join('')}</div><p class="blurb">${blurb(tot)}</p></div>` : ''}`;
}

// ---------- app sheet (full page) ----------
function vSheet() {
  const k = sheet, A = APPS[k], st = status(k), al = allowed(k, st);
  const left = S.tasks.filter(t => !t.done).length, can = !S.settings.requireTasks || allDone();
  let lead, primary = '';
  if (st.full) lead = `${A.name} is blocked completely. Turn that off in Limits to open it.`;
  else if (!st.active) { lead = st.overridden ? 'It is unlocked for now.' : 'There are no restrictions right now.'; primary = `<button class="btn primary block" data-a="openapp" data-k="${k}" data-full="1">Open ${A.name}</button>`; }
  else { lead = `Right now you can only <b>${al.phrase}</b>.`; if (al.btn) primary = `<button class="btn primary block" data-a="openapp" data-k="${k}" data-full="0">${al.btn}</button>`; }
  const quick = st.active && !st.full && S.settings.lookup ? `<div class="section-t" style="margin:10px 4px 0">Quick access</div>
    <div class="group"><div class="pad fields"><input class="field" id="h-handle" placeholder="@handle" autocapitalize="none" autocorrect="off" spellcheck="false"></div>
    <div class="pad" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><button class="btn" data-a="go" data-k="${k}">Profile</button><button class="btn" data-a="search" data-k="${k}">Search 10 min</button></div></div>
    <p class="hint">Search opens the whole site for 10 minutes while feeds stay hidden.</p>` : '';
  const unl = st.active && !st.full ? `<div class="group"><div class="row"><span class="lbl"><b>Unlock ${A.name}</b><span class="sub">${S.settings.requireTasks ? (can ? 'All tasks are done.' : `Finish ${left} task${left === 1 ? '' : 's'} first.`) : 'Your tasks are not required.'}</span></span><button class="btn sm" data-a="unlock" data-k="${k}" ${can ? '' : 'disabled'}>Unlock</button></div></div>` : '';
  return `<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-in">
    <div><button class="icon-btn" data-a="close" aria-label="Close">${ico('close')}</button></div>
    <div class="mark">${logo(k, 84)}</div>
    <h1>You are attempting to open ${A.name}</h1><p class="lead">${lead}</p>
    ${primary}${quick}${unl}</div></div>`;
}

// ---------- limits ----------
function vLimits() {
  const one = k => {
    const a = S.apps[k];
    const head_ = `<div class="row"><span style="display:flex;align-items:center;gap:12px">${logo(k, 34)}<b style="font-size:17px;font-weight:600">${APPS[k].name}</b></span>${sw(`data-f="${k}.on"`, a.on)}</div>`;
    if (!a.on) return `<div class="group">${head_}</div>`;
    const sched = a.mode === 'schedule' ? `
      <div class="row"><span class="lbl"><b>Starts</b></span><input class="field" type="time" value="${a.start}" data-f="${k}.start"></div>
      <div class="row"><span class="lbl"><b>Ends</b></span><input class="field" type="time" value="${a.end}" data-f="${k}.end"></div>
      <div class="pad days">${DAYS.map((d, i) => `<button data-a="day" data-k="${k}.${i}" class="${a.days.includes(i) ? 'on' : ''}" aria-label="${DAYNAMES[i]}">${d}</button>`).join('')}</div>` : '';
    const rest = a.mode !== 'off' ? `
      ${trow('Block the whole app', 'Instead of hiding feeds.', sw(`data-f="${k}.whole"`, a.whole))}
      ${TARGETS[k].map(([t, l]) => trow(l, '', sw(`data-t="${k}.${t}"`, a.targets[t]))).join('')}` : '';
    return `<div class="group">${head_}
      <div class="pad">${seg(`${k}.mode`, [['off', 'Off'], ['schedule', 'Scheduled'], ['always', 'Always']], a.mode)}</div>${sched}${rest}
      ${trow(`Block ${APPS[k].name} completely`, 'Nothing opens until you turn this off.', sw(`data-f="${k}.blockAll"`, a.blockAll))}</div>`;
  };
  return `${head('Limits')}
  ${KEYS.map(one).join('')}
  <div class="section-t">Features</div>
  <div class="group">
    ${trow('Tasks unlock apps', 'Off lets you unlock early with a confirm.', sw('data-s="requireTasks"', S.settings.requireTasks))}
    ${trow('Quick access', 'Profile lookup and 10 minute search.', sw('data-s="lookup"', S.settings.lookup))}
    ${trow('Track screen time', '', sw('data-s="track"', S.settings.track))}
    ${trow('Hand off to Safari', 'For Home Screen web-app mode. Experimental.', sw('data-s="safariHandoff"', S.settings.safariHandoff))}
    <div class="row"><span class="lbl"><b>Daily Instagram goal</b><span class="sub">Minutes. Shown on your Home note.</span></span><input class="field" type="number" inputmode="numeric" style="width:84px;text-align:center" value="${S.settings.threshold}" data-s="threshold"></div>
  </div>
  <div class="section-t">Installed apps</div>
  <div class="group">
    <div class="pad sub">A web app can't block an installed app, but it can stop you at the door. In Shortcuts: Automation, New, App, choose the app, Is Opened, Open URL, paste the link, then turn off Ask Before Running.</div>
    ${KEYS.map(k => `<div class="row"><span style="display:flex;align-items:center;gap:12px">${logo(k, 30)}<b style="font-weight:500">${APPS[k].name}</b></span><button class="btn sm" data-a="copygate" data-k="${k}">Copy link</button></div>`).join('')}
  </div>
  <div class="section-t">Blocker</div>
  <div class="group"><div class="pad sub">Opening an app from ScrollGuard sends your limits to the Safari blocker. For the desktop extension, copy the config and paste it into its popup.</div>
  <div class="pad"><button class="btn block" data-a="exportcfg">Copy blocker config</button></div></div>`;
}

// ---------- tasks ----------
function vTasks() {
  const ms = S.ms, left = S.tasks.filter(t => !t.done).length;
  return `${head('Tasks')}
  <p class="hint" style="padding-top:0">Finish every task to unlock your restricted apps for the rest of the lock window.</p>
  <div class="group">
    <div class="pad" style="display:flex;gap:10px"><input class="field" id="newTask" placeholder="Add a task" enterkeyhint="done"><button class="btn primary" data-a="addtask">Add</button></div>
    ${S.tasks.map(t => `<div class="task ${t.done ? 'done' : ''}"><input type="checkbox" class="ck" ${t.done ? 'checked' : ''} data-toggle="${t.id}" aria-label="Done"><span class="t">${esc(t.text)}${t.ms ? '<span class="sub">Microsoft To Do</span>' : ''}</span><button class="x" data-a="deltask" data-v="${t.id}" aria-label="Delete">${ico('trash', 20)}</button></div>`).join('') || '<div class="pad sub">No tasks yet.</div>'}
    <div class="row"><span class="sub" style="margin:0">${S.tasks.length ? (left ? `${left} remaining` : 'All done') : ''}</span><button class="link" data-a="cleartasks">Clear completed</button></div>
  </div>
  <div class="section-t">Microsoft To Do</div>
  <div class="group"><div class="pad fields"><input class="field" placeholder="Azure app Client ID" value="${esc(ms.clientId)}" data-ms="clientId" autocapitalize="none" autocorrect="off" spellcheck="false">
    ${msOk() ? '<button class="btn primary" data-a="mssync">Sync now</button>' : '<button class="btn primary" data-a="mslogin">Connect</button>'}</div>
    <div class="pad sub">One-time setup: register a free app at entra.microsoft.com with a Single-page application redirect of <span style="overflow-wrap:anywhere">${esc(redirect())}</span> and the Tasks.ReadWrite permission. Paste its Client ID above.</div></div>
  <div class="section-t">Apple Reminders</div>
  <div class="group"><div class="pad sub">Apple has no web access to Reminders. Copy tasks from Reminders and paste them here, one per line.</div>
    <div class="pad fields"><textarea class="field" id="paste" placeholder="Buy milk&#10;Email professor"></textarea><button class="btn" data-a="import">Import</button></div></div>`;
}

// ---------- learn ----------
const L = { busy: false, ytCache: {}, n: 0 };
function vLearn() {
  const l = S.learn;
  if (!l.on) return `${head('Learn')}<div class="group">${trow('Educational Scroll', 'Pick topics you like and scroll through facts and news instead.', sw('data-l="on"', false))}</div>`;
  return `${head('Learn')}
  <div class="group">
    ${trow('Educational Scroll', '', sw('data-l="on"', true))}
    <div class="pad" style="display:flex;gap:10px"><input class="field" id="topic" placeholder="Add a topic" enterkeyhint="done"><button class="btn primary" data-a="addtopic">Add</button></div>
    <div><div class="pills" style="padding-top:12px">${l.topics.map((t, i) => `<button class="pill" data-a="rmtopic" data-v="${i}" aria-label="Remove ${esc(t)}">${esc(t)}${ico('close', 16)}</button>`).join('') || '<span class="sub">No topics yet. Try space, chess or Roman history.</span>'}</div>
    ${l.topics.length ? '<p class="hint" style="padding:0 16px 14px;margin:0">Tap a topic to remove it.</p>' : ''}</div>
  </div>
  <div class="section-t">Sources</div>
  <div class="group">
    ${trow('Wikipedia facts', '', sw('data-ls="wiki"', l.src.wiki))}
    ${trow('Tech and science news', 'From Hacker News.', sw('data-ls="hn"', l.src.hn))}
    ${trow('YouTube Shorts', 'Needs a free YouTube Data API key.', sw('data-l="ytOn"', l.ytOn))}
    ${l.ytOn ? `<div class="pad fields"><input class="field" placeholder="YouTube Data API key" value="${esc(l.ytKey)}" data-l="ytKey" autocapitalize="none" autocorrect="off" spellcheck="false"><span class="sub">Create a free key at console.cloud.google.com. Videos play in YouTube's own player.</span></div>` : ''}
  </div>
  <div id="feed" style="margin-top:18px"></div><div id="sentinel" class="center">${l.topics.length ? 'Loading' : 'Add a topic to begin.'}</div>`;
}
function initLearn() {
  if (!S.learn.on || !S.learn.topics.length) return;
  new IntersectionObserver(es => { if (es[0].isIntersecting) moreCards(); }, { rootMargin: '600px' }).observe($('#sentinel'));
}
async function wikiCard(topic) {
  const u = 'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrlimit=25&prop=extracts|pageimages|info&inprop=url&exintro=1&explaintext=1&exsentences=3&piprop=thumbnail&pithumbsize=700&gsrsearch=' + encodeURIComponent(topic);
  const pages = Object.values((await (await fetch(u)).json()).query?.pages || {}).filter(p => p.extract && p.extract.length > 80);
  const p = pick(pages); if (!p) return null;
  return `<div class="card"><div class="kicker">${ico('book', 16)}${esc(topic)}</div><h3>${esc(p.title)}</h3>${p.thumbnail ? `<img src="${esc(p.thumbnail.source)}" alt="">` : ''}<p>${esc(p.extract)}</p><a target="_blank" rel="noopener" href="${esc(p.fullurl)}">Read more</a></div>`;
}
async function hnCard(topic) {
  const r = await (await fetch('https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=20&query=' + encodeURIComponent(topic))).json();
  const h = pick((r.hits || []).filter(x => x.title)); if (!h) return null;
  const link = /^https?:/.test(h.url || '') ? h.url : 'https://news.ycombinator.com/item?id=' + encodeURIComponent(h.objectID);
  return `<div class="card"><div class="kicker">${ico('news', 16)}${esc(topic)}</div><h3>${esc(h.title)}</h3><p style="color:var(--mu);font-size:14px">${h.points || 0} points, ${h.num_comments || 0} comments</p><a target="_blank" rel="noopener" href="${esc(link)}">Read</a></div>`;
}
async function ytCard(topic) {
  const l = S.learn; if (!l.ytOn || !l.ytKey) return null;
  if (!L.ytCache[topic]?.length) {
    const r = await (await fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=short&maxResults=15&safeSearch=strict&key=' + encodeURIComponent(l.ytKey) + '&q=' + encodeURIComponent(topic + ' #shorts'))).json();
    L.ytCache[topic] = (r.items || []).map(i => i.id.videoId).sort(() => Math.random() - .5);
  }
  const id = L.ytCache[topic].pop(); if (!id) return null;
  return `<div class="card"><div class="kicker">${ico('film', 16)}${esc(topic)}</div><iframe loading="lazy" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}" allow="encrypted-media;picture-in-picture" allowfullscreen></iframe></div>`;
}
async function moreCards() {
  if (L.busy || S.tab !== 'learn') return; L.busy = true;
  try {
    for (let i = 0; i < 3; i++) {
      const topic = pick(S.learn.topics); L.n++;
      let h = null;
      try {
        if (L.n % 4 === 0) h = await ytCard(topic);
        const src = [S.learn.src.wiki && wikiCard, S.learn.src.hn && hnCard].filter(Boolean).sort(() => Math.random() - .5);
        for (let j = 0; !h && j < src.length; j++) h = await src[j](topic);
      } catch {}
      if (h && $('#feed')) $('#feed').insertAdjacentHTML('beforeend', h);
    }
    if (!$('#feed')?.children.length && $('#sentinel')) $('#sentinel').textContent = "Couldn't load content. Check your connection.";
  } finally { L.busy = false; }
}

// ---------- history ----------
function vChart(n) {
  const rows = chartData(n), max = Math.max(0, ...rows.map(r => r.total));
  if (!max) return '<div class="center">No screen time logged for this period yet.</div>';
  const totals = Object.fromEntries(ORDER.map(k => [k, rows.reduce((a, r) => a + r[k], 0)]));
  const legend = `<div class="legend">${ORDER.filter(k => totals[k] > 0 || k !== 'other').map(k => `<div><i style="background:var(--c-${k})"></i>${NAMES[k]}<span>${fmt(totals[k])}</span></div>`).join('')}</div>`;
  if (n === 1) {
    const r = rows[0];
    return `<div class="pad"><div class="sub" style="margin:0 0 4px">Total today</div><div style="font-size:34px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums">${fmt(r.total)}</div></div>` +
      ORDER.map(k => `<div class="hbar"><div class="h"><span>${NAMES[k]}</span><span>${fmt(r[k])}</span></div><div class="tr"><i style="width:${r[k] / max * 100}%;background:var(--c-${k})"></i></div></div>`).join('');
  }
  const W = 340, H = 196, pl = 36, pr = 6, pt = 10, pb = 24, w = W - pl - pr, h = H - pt - pb;
  let step = 15; for (const s of [15, 30, 60, 120, 180, 240, 360, 480]) { step = s; if (Math.ceil(max / s) <= 4) break; }
  const top = Math.max(step, Math.ceil(max / step) * step), y = v => pt + h - v / top * h;
  const lab = v => v === 0 ? '0' : v < 60 ? v + 'm' : (v / 60) + 'h';
  let g = ''; for (let v = 0; v <= top; v += step) g += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${lab(v)}</text>`;
  const slot = w / n, bw = Math.min(30, slot * .64); let bars = '';
  rows.forEach((r, i) => {
    let acc = 0; const x = pl + i * slot + (slot - bw) / 2;
    for (const k of ORDER) { const v = r[k]; if (!v) continue; const y0 = y(acc + v); bars += `<rect class="s-${k}" x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(y(acc) - y0, 0).toFixed(1)}" stroke="var(--card)" stroke-width="1.5"/>`; acc += v; }
    const showLab = n === 7 || i === n - 1 || i % 6 === 0;
    if (showLab) bars += `<text class="ax" x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${n === 7 ? DAYS[r.date.getDay()] : r.date.getDate()}</text>`;
  });
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Screen time per day for the last ${n} days, in minutes">${g}${bars}</svg></div>${legend}`;
}
function vHistory() {
  const n = { day: 1, week: 7, month: 30 }[histRange], b = badge(), tier = b && TIERS.find(t => t.id === b.id);
  return `${head('History')}
  <div class="group"><div class="pad">${seg('range', [['day', 'Day'], ['week', 'Week'], ['month', 'Month']], histRange).replace(/data-a="seg" data-k="range"/g, 'data-a="range"')}</div>${vChart(n)}</div>
  <div class="section-t">Rewards</div>
  <div class="group">${tier ? `<div class="hero"><div class="you">You are a</div><div class="name">${tier.name}</div>
    <div class="badge-art" style="background:${tier.bg};--bb:${tier.bg}">${bigIco(tier.icon, 64)}</div><p class="sub" style="margin:0;max-width:300px;text-align:center">${b.note}</p></div>` : `<div class="hero"><div class="you">No badge yet</div><p class="sub" style="margin:0;max-width:280px;text-align:center">Your first badge appears tomorrow, after one full day of tracking.</p></div>`}</div>
  <div class="group">${TIERS.map(t => `<div class="trow ${tier && t.id === tier.id ? 'on' : ''}"><span class="ti" style="background:${t.bg};--bb:${t.bg}">${bigIco(t.icon, 26)}</span><span class="lbl"><b>${t.name}</b><span class="sub">${t.rule}</span></span></div>`).join('')}</div>
  <div class="section-t">Add time manually</div>
  <div class="group"><div class="pad" style="display:grid;grid-template-columns:1fr 90px;gap:10px"><select class="field" id="manApp">${ORDER.map(k => `<option value="${k}">${NAMES[k]}</option>`).join('')}</select><input class="field" id="manMin" type="number" inputmode="numeric" placeholder="Min"></div>
  <div class="pad"><button class="btn block" data-a="manual">Add</button></div></div>`;
}

// ---------- settings ----------
function vSettings() {
  return `${head('Settings', `<button class="link" data-a="tab" data-v="home">Done</button>`)}
  <div class="section-t">Profile</div>
  <div class="group"><div class="pad fields"><input class="field" id="s-name" value="${esc(S.account.name)}" placeholder="Name" autocomplete="given-name">
    <div class="err" id="msg-profile"></div><button class="btn primary" data-a="saveprofile">Save name</button></div></div>
  <div class="section-t">Appearance</div>
  <div class="group"><div class="pad">${seg('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], S.ui.theme).replace(/data-a="seg" data-k="theme"/g, 'data-a="theme"')}</div>
    <div class="row"><span class="lbl"><b>Accent color</b></span><div class="swatches">${ACCENTS.map(x => `<button data-a="accent" data-v="${x.c}" class="${S.ui.accent === x.c ? 'on' : ''}" style="background:${x.c}" aria-label="${x.n}"></button>`).join('')}</div></div></div>
  <div class="section-t">Data</div>
  <div class="group"><div class="pad sub">Your name, limits and history live only in this browser on this phone. They are not backed up.</div><div class="pad"><button class="btn danger block" data-a="reset">Reset ScrollGuard</button></div></div>`;
}

// ---------- render ----------
const TABS = [['home', 'home', 'Home'], ['limits', 'sliders', 'Limits'], ['learn', 'book', 'Learn'], ['tasks', 'tasks', 'Tasks'], ['history', 'chart', 'History']];
const VIEWS = { home: vHome, limits: vLimits, learn: vLearn, tasks: vTasks, history: vHistory, settings: vSettings };
const isDark = () => S.ui.theme === 'dark' || (S.ui.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
function applyUI() {
  const r = document.documentElement, x = ACCENTS.find(z => z.c === S.ui.accent) || ACCENTS[0];
  S.ui.theme === 'auto' ? r.removeAttribute('data-theme') : r.setAttribute('data-theme', S.ui.theme);
  r.style.setProperty('--accent', x.c);
  r.style.setProperty('--accent-t', isDark() ? x.dt : x.lt);
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => render());
function render() {
  applyUI();
  const y = scrollY, nav = $('#nav');
  if (!S.account) { nav.hidden = true; $('#app').innerHTML = vWelcome(); return; }
  nav.hidden = false;
  nav.innerHTML = TABS.map(([k, i, l]) => `<button class="${S.tab === k ? 'on' : ''}" data-a="tab" data-v="${k}" aria-label="${l}">${ico(i, 24)}${l}</button>`).join('');
  $('#app').innerHTML = (VIEWS[S.tab] || vHome)() + (sheet ? vSheet() : '');
  document.body.classList.toggle('lock', !!sheet);
  if (S.tab === 'learn' && !sheet) initLearn();
  const h1 = $('.top h1'); // shrink the title until it fits on one line
  if (h1) for (let s = 28; s > 20 && h1.scrollWidth > h1.clientWidth; s--) h1.style.fontSize = s + 'px';
  scrollTo(0, y);
}
function showErr(id, msg) { const e = $('#' + id); if (e) e.textContent = msg; }

// ---------- gate + usage hand-back via the URL hash ----------
function readHash() {
  const g = location.hash.match(/gate=([a-z]+)/), l = location.hash.match(/log=([a-z]+):([\d.]+)/);
  if (!g && !l) return;
  history.replaceState(null, '', location.pathname + location.search);
  if (l) { if (APPS[l[1]]) addUsage(l[1], Math.min(+l[2], 240)); S.pending = null; save(); }
  if (g && APPS[g[1]]) { sheet = g[1]; S.tab = 'home'; }
}
const gateUrl = k => location.origin + location.pathname + '#gate=' + k;

// ---------- events ----------
const copy = (txt, btn) => { navigator.clipboard?.writeText(txt); if (btn) { const o = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => btn.textContent = o, 1400); } };
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  const { a, k, v } = el.dataset;
  switch (a) {
    case 'tab': S.tab = v; sheet = null; scrollTo(0, 0); break;
    case 'sheet': sheet = k; break;
    case 'close': sheet = null; break;
    case 'openapp': sheet = null; render(); return launch(k, el.dataset.full === '1');
    case 'go': { const h = $('#h-handle').value.trim(); return h ? lookup(k, h) : alert('Type a handle first.'); }
    case 'search': return lookup(k);
    case 'unlock': return unlock(k);
    case 'seg': { const [ak, f] = k.split('.'); S.apps[ak][f] = v; break; }
    case 'range': histRange = v; break;
    case 'theme': S.ui.theme = v; break;
    case 'accent': S.ui.accent = v; break;
    case 'day': { const [ak, i] = k.split('.'), d = S.apps[ak].days, n = +i; d.includes(n) ? d.splice(d.indexOf(n), 1) : d.push(n); break; }
    case 'end': return endSession();
    case 'manual': addUsage($('#manApp').value, +$('#manMin').value || 0); break;
    case 'addtask': { const t = $('#newTask').value.trim(); if (t) S.tasks.push({ id: 't' + Date.now(), text: t, done: false }); break; }
    case 'deltask': S.tasks = S.tasks.filter(x => x.id !== v); break;
    case 'cleartasks': S.tasks = S.tasks.filter(x => !x.done); break;
    case 'import': $('#paste').value.split('\n').map(s => s.replace(/^[\s\-\[\]xX*]+/, '').trim()).filter(Boolean).forEach((t, i) => S.tasks.push({ id: 't' + Date.now() + i, text: t, done: false })); break;
    case 'mslogin': return msLogin();
    case 'mssync': return msSync();
    case 'exportcfg': return copy(exportConfig(), el);
    case 'copygate': return copy(gateUrl(k), el);
    case 'addtopic': { const t = $('#topic').value.trim(); if (t && !S.learn.topics.includes(t)) S.learn.topics.push(t); break; }
    case 'rmtopic': S.learn.topics.splice(+v, 1); break;
    case 'reset': if (!confirm('Reset ScrollGuard? This erases your profile, limits and history on this phone.')) return; localStorage.removeItem(KEY); try { sessionStorage.clear(); } catch {} location.reload(); return;
    case 'saveprofile': {
      const name = $('#s-name').value.trim();
      if (!name) return showErr('msg-profile', 'Enter your name.');
      S.account.name = name; save(); render(); showErr('msg-profile', 'Saved.'); return;
    }
    default: return;
  }
  save(); render();
});
document.addEventListener('change', e => {
  const t = e.target, d = t.dataset, val = t.type === 'checkbox' ? t.checked : t.value;
  if (d.t) { const [k, f] = d.t.split('.'); S.apps[k].targets[f] = val; }
  else if (d.ls) S.learn.src[d.ls] = val;
  else if (d.l) S.learn[d.l] = t.type === 'checkbox' ? val : t.value.trim();
  else if (d.f) { const [k, f] = d.f.split('.'); S.apps[k][f] = val; }
  else if (d.s) S.settings[d.s] = t.type === 'checkbox' ? val : (+t.value || 60);
  else if (d.toggle) return toggleTask(d.toggle);
  else if (d.ms) S.ms[d.ms] = t.value.trim();
  else return;
  save(); render();
});
document.addEventListener('submit', e => {
  if (e.target.dataset.form !== 'signup') return; e.preventDefault();
  const name = $('#w-name').value.trim();
  if (!name) return showErr('err', 'Enter your name.');
  S.account = { name }; S.first = dayKey(); save(); render();
});

setInterval(() => { if (S.account && S.tab !== 'learn' && !document.hidden && !document.activeElement?.matches('input,textarea,select')) render(); }, 60000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
readHash();
if (S.pending && Date.now() - S.pending.start > 3000 && !document.hidden) { addUsage(S.pending.app, Math.min(180, (Date.now() - S.pending.start) / 60000)); S.pending = null; save(); }
addEventListener('hashchange', () => { readHash(); render(); });
render(); msFinish();
