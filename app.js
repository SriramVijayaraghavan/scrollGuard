'use strict';
// ---------- state ----------
const KEY = 'scrollguard.v1';
const APPS = {
  instagram: { name: 'Instagram', icon: '📸', open: 'https://www.instagram.com/direct/inbox/', full: 'https://www.instagram.com/' },
  tiktok: { name: 'TikTok', icon: '🎵', open: 'https://www.tiktok.com/', full: 'https://www.tiktok.com/' },
  youtube: { name: 'YouTube', icon: '▶️', open: 'https://m.youtube.com/feed/subscriptions', full: 'https://m.youtube.com/' },
};
const profileUrl = { instagram: h => `https://www.instagram.com/${h}/`, tiktok: h => `https://www.tiktok.com/@${h}`, youtube: h => `https://m.youtube.com/@${h}` };
const IS_STANDALONE = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const TARGETS = {
  instagram: [['reelsTab', 'Reels tab / scrolling'], ['reelsFeed', 'Reels inside the feed'], ['explore', 'Explore page'], ['stories', 'Stories bar'], ['search', 'Search'], ['feed', 'Home feed posts'], ['dmsOnly', 'DMs only (block everything but messages)']],
  tiktok: [['forYou', 'For You feed'], ['following', 'Following feed'], ['explore', 'Explore / Discover'], ['live', 'LIVE']],
  youtube: [['shortsTab', 'Shorts tab / scrolling'], ['shortsShelf', 'Shorts inside the feed'], ['homeFeed', 'Home recommendations'], ['related', 'Related videos']],
};
const defTargets = k => Object.fromEntries(TARGETS[k].map(([t]) => [t, (['reelsTab', 'reelsFeed', 'forYou', 'following', 'explore', 'shortsTab', 'shortsShelf'].includes(t) && !(k === 'instagram' && t === 'explore')) || (k === 'instagram' && t === 'dmsOnly')]));
const defApp = k => ({ on: true, whole: k === 'tiktok', mode: 'schedule', start: '09:00', end: '17:00', days: [0, 1, 2, 3, 4, 5, 6], blockAll: false, targets: defTargets(k) });
const def = () => ({
  first: dayKey(), tab: 'home',
  settings: { track: true, threshold: 60, requireTasks: true, lookup: true, safariHandoff: false },
  apps: Object.fromEntries(Object.keys(APPS).map(k => [k, defApp(k)])),
  learn: { on: false, topics: [], ytOn: false, ytKey: '', src: { wiki: true, hn: true } },
  tasks: [], override: {}, lookup: {}, usage: {}, pending: null,
  profile: { name: '', id: Math.random().toString(36).slice(2, 8) },
  ms: { clientId: '', token: '', exp: 0 },
});
let S = load();
function load() {
  const d = def();
  try {
    const o = JSON.parse(localStorage.getItem(KEY)) || {};
    for (const k of Object.keys(APPS)) o.apps = o.apps || {}, o.apps[k] = Object.assign(d.apps[k], o.apps[k], { targets: Object.assign(d.apps[k].targets, (o.apps[k] || {}).targets) });
    o.learn = Object.assign(d.learn, o.learn, { src: Object.assign(d.learn.src, (o.learn || {}).src) });
    o.settings = Object.assign(d.settings, o.settings);
    return Object.assign(d, o);
  } catch { return d; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }
function dayKey(d = new Date()) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

// ---------- restriction logic ----------
// Returns {active, reason, minsLeft} for one app right now.
function status(app, now = new Date()) {
  const a = S.apps[app];
  const ov = S.override[app];
  if (!a.on) return { active: false };
  if (a.blockAll) return { active: true, reason: 'blocked entirely', full: true };
  if (a.mode === 'off') return { active: false };
  let inWin = true, minsLeft = null;
  if (a.mode === 'schedule') {
    const cur = now.getHours() * 60 + now.getMinutes(), s = toMin(a.start), e = toMin(a.end);
    const overnight = e <= s;
    const dow = now.getDay();
    // overnight windows that started yesterday belong to yesterday's day-of-week
    if (!overnight) { inWin = a.days.includes(dow) && cur >= s && cur < e; if (inWin) minsLeft = e - cur; }
    else if (cur >= s) { inWin = a.days.includes(dow); minsLeft = 1440 - cur + e; }
    else if (cur < e) { inWin = a.days.includes((dow + 6) % 7); minsLeft = e - cur; }
    else inWin = false;
  }
  if (!inWin) return { active: false };
  if (ov && ov > now.getTime()) return { active: false, overridden: true };
  return { active: true, whole: !!a.whole, reason: a.mode === 'always' ? 'always on' : `${a.start}–${a.end}`, minsLeft };
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
  // the Safari userscript reads this hash to pick up current limits + unlock state
  const cfg = enc(JSON.parse(exportConfig()).apps[app]);
  const target = (url || (full ? APPS[app].full : APPS[app].open)) + '#sg=' + cfg;
  // x-safari-https:// asks iOS to open the link in real Safari instead of the in-app browser
  if (S.settings.safariHandoff) location.href = 'x-safari-' + target; else window.open(target, '_blank', 'noopener');
  render();
}
// 10-minute pass: lets search + profiles work while feeds stay locked (e.g. grabbing a handle at a party)
function lookup(app, handle) {
  let url;
  if (handle) {
    const h = handle.replace(/^@/, '').trim();
    if (!/^[A-Za-z0-9._-]{1,60}$/.test(h)) return alert('Enter a handle like name_here (letters, numbers, . _ -).');
    url = profileUrl[app](h);
  }
  S.lookup[app] = Date.now() + 10 * 60000; save();
  launch(app, true, url);
}
function endSession() {
  const p = S.pending; if (!p) return;
  addUsage(p.app, Math.min(180, Math.max(0, (Date.now() - p.start) / 60000))); // ignore anything past 3h (forgot to come back)
  S.pending = null; save(); render();
}
// when user returns to this tab, the session they opened is over
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.pending && Date.now() - S.pending.start > 3000) endSession(); });

// ---------- stats / pet / badges ----------
const used = (day, app = 'instagram') => (S.usage[day] || {})[app] || 0;
function pastDays() { // completed days since first use, newest first
  const out = [], d = new Date(); d.setDate(d.getDate() - 1);
  while (dayKey(d) >= S.first && out.length < 400) { out.push(dayKey(d)); d.setDate(d.getDate() - 1); }
  return out;
}
function streak() {
  let n = 0;
  if (used(dayKey()) > S.settings.threshold) return 0; // today already over → broken
  for (const k of pastDays()) { if (used(k) <= S.settings.threshold) n++; else break; }
  return n;
}
const BADGES = [
  ['🌱', 'Light scroller', '≤60 min Instagram in a full day', p => p.best <= 60],
  ['🧘', 'Mindful', '≤30 min in a full day', p => p.best <= 30],
  ['🪨', 'Monk', '≤15 min in a full day', p => p.best <= 15],
  ['🔥', '3-day streak', '3 days under your threshold', p => p.longest >= 3],
  ['⚡', '7-day streak', '7 days under your threshold', p => p.longest >= 7],
  ['🐉', '30-day streak', '30 days under your threshold', p => p.longest >= 30],
];
function badgeProgress() {
  const days = pastDays().reverse(); let best = Infinity, run = 0, longest = 0;
  for (const k of days) { const u = used(k); best = Math.min(best, u); if (u <= S.settings.threshold) { run++; longest = Math.max(longest, run); } else run = 0; }
  return { best, longest };
}
const earned = () => { const p = badgeProgress(); return BADGES.filter(b => b[3](p)); };
const PET = [[0, '🐥', 'Chick'], [7, '🦊', 'Fox'], [14, '🦁', 'Lion'], [30, '🐉', 'Dragon']];
const petFor = n => PET.filter(p => n >= p[0]).pop();
const weekAvg = () => { let t = 0; const d = new Date(); for (let i = 0; i < 7; i++) { t += used(dayKey(d)); d.setDate(d.getDate() - 1); } return Math.round(t / 7); };
const fmt = m => m >= 60 ? Math.floor(m / 60) + 'h ' + Math.round(m % 60) + 'm' : Math.round(m) + 'm';

const enc = o => btoa(unescape(encodeURIComponent(JSON.stringify(o))));

// ---------- Microsoft To Do (Graph, OAuth PKCE) ----------
const redirect = () => location.origin + location.pathname;
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function msLogin() {
  if (!S.ms.clientId) return alert('Enter your Azure app Client ID first (see setup note).');
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
  if (!msOk()) return alert('Session expired – sign in again.');
  try {
    const lists = (await graph('/me/todo/lists')).value;
    const def = lists.find(l => l.wellknownListName === 'defaultList') || lists[0];
    const ts = (await graph(`/me/todo/lists/${def.id}/tasks?$top=100`)).value;
    S.tasks = S.tasks.filter(t => !t.ms).concat(ts.map(t => ({ id: 'ms' + t.id, text: t.title, done: t.status === 'completed', ms: { list: def.id, id: t.id } })));
    save(); render();
  } catch (e) { alert('Sync failed: ' + e.message); }
}
async function toggleTask(id) {
  const t = S.tasks.find(t => t.id === id); t.done = !t.done; save(); render();
  if (t.ms && msOk()) try { await graph(`/me/todo/lists/${t.ms.list}/tasks/${t.ms.id}`, { method: 'PATCH', body: JSON.stringify({ status: t.done ? 'completed' : 'notStarted' }) }); } catch {}
}

// ---------- views ----------
const $ = s => document.querySelector(s);
const TABS = [['home', '🏠', 'Home'], ['block', '🛡️', 'Limits'], ['learn', '🧠', 'Learn'], ['tasks', '✅', 'Tasks'], ['social', '🏆', 'Rewards']];
function render() {
  $('#nav').innerHTML = TABS.map(([k, i, l]) => `<button class="${S.tab === k ? 'on' : ''}" data-tab="${k}">${i}<br>${l}</button>`).join('');
  $('#app').innerHTML = gate ? vGate() : { home: vHome, block: vBlock, learn: vLearn, tasks: vTasks, social: vSocial }[S.tab]();
  if (S.tab === 'learn' && !gate) initLearn();
}
// ---------- gate (opened by an iOS Shortcuts automation when a native app launches) ----------
let gate = null;
function readGate() {
  const m = location.hash.match(/gate=([a-z]+)/); if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  if (APPS[m[1]]) gate = m[1];
}
const gateUrl = k => location.origin + location.pathname + '#gate=' + k;
function vGate() {
  const k = gate, A = APPS[k], st = status(k), left = S.tasks.filter(t => !t.done);
  if (!st.active) return `<h1>${A.icon} ${A.name}</h1><div class="card" style="text-align:center"><div class="big">✅</div><p>${st.overridden ? 'Unlocked for now.' : 'Not locked right now.'}</p>
    <div class="row" style="justify-content:center"><button class="p" data-gateopen="${k}">Open ${A.name}</button><button data-gateclose>Not now</button></div></div>`;
  const can = !S.settings.requireTasks || allDone();
  return `<h1>${A.icon} ${A.name}</h1><div class="card" style="text-align:center"><div class="big">🔒</div><p><b>${A.name} is locked</b><br><span class="mu">${st.full ? 'Blocked entirely.' : esc(st.reason || '')}</span></p>
    ${S.settings.requireTasks && left.length ? `<div class="mu" style="text-align:left">Finish first:</div>${left.map(t => `<div class="task"><input type="checkbox" data-toggle="${t.id}"><span>${esc(t.text)}</span></div>`).join('')}` : ''}
    <div class="row" style="justify-content:center">${st.full ? '' : `<button data-unlock="${k}" ${can ? '' : 'disabled'}>${S.settings.requireTasks ? (can ? 'Tasks done – unlock' : 'Finish tasks to unlock') : 'Unlock early'}</button>`}<button class="p" data-gateclose>Stay focused</button></div></div>`;
}
function vHome() {
  const cards = Object.keys(APPS).filter(k => S.apps[k].on).map(k => {
    const st = status(k), a = APPS[k];
    const tag = st.active ? `<span class="tag on">${st.full ? 'Blocked' : st.whole ? 'App blocked' : 'Feed locked'}</span>` : `<span class="tag free">${st.overridden ? 'Unlocked' : 'Free'}</span>`;
    const canUnlock = st.active && !st.full;
    const ul = S.settings.requireTasks ? (allDone() ? 'All tasks done – unlock' : 'Finish tasks to unlock') : 'Unlock early';
    return `<div class="card"><div class="row"><b>${a.icon} ${a.name}</b>${tag}</div>
      <div class="mu">${st.active ? (st.full ? 'Blocked until you turn it off in Limits.' : st.whole ? `Whole app blocked (${st.reason}). Finish your tasks to unlock.` : `Locked (${st.reason}). Opening goes to messages${k === 'youtube' ? '/subscriptions' : ''} only.`) : 'No restriction right now.'}</div>
      <div class="row"><button class="p" ${st.full || st.whole ? 'disabled' : ''} data-launch="${k}">Open ${st.whole ? a.name : st.active ? (k === 'youtube' ? 'subscriptions' : 'messages') : a.name}</button>
      ${canUnlock ? `<button data-unlock="${k}" ${S.settings.requireTasks && !allDone() ? 'disabled' : ''}>${ul}</button>` : ''}</div>
      ${canUnlock && S.settings.lookup ? `<div class="row"><input id="h-${k}" placeholder="🔎 @handle to look up" style="flex:1;min-width:140px"><button data-go="${k}">Profile</button><button data-lookup="${k}">Search 10 min</button></div>` : ''}</div>`;
  }).join('') || '<div class="card mu">No services enabled. Turn them on in Limits.</div>';
  const p = S.pending ? `<div class="card"><div class="row"><span>⏱ ${APPS[S.pending.app].name} session running…</span><button class="p" data-end>I'm back</button></div><div class="mu">Time is added automatically when you return to this tab.</div></div>` : '';
  const warn = IS_STANDALONE && !S.settings.safariHandoff ? `<div class="card"><b>⚠️ Blocking won't work from this icon</b><div class="mu">Home Screen web-app mode opens Instagram in a built-in browser where Safari extensions don't run, and it keeps separate logins. Fix: turn on \"Hand off to Safari\" in Limits (experimental), or re-add this icon from Safari with \"Open as Web App\" OFF.</div></div>` : '';
  return `<h1>ScrollGuard</h1>${warn}${p}${cards}${vStats()}`;
}
const resolveApp = v => { const k = v.trim().toLowerCase(); return APPS[k] ? k : (v.trim() || 'Other'); };
const label = n => APPS[n] ? APPS[n].icon + ' ' + APPS[n].name : '📱 ' + n;
function vStats() {
  if (!S.settings.track) return '';
  const tot = {}, today = {}, perDay = [], d = new Date();
  for (let i = 0; i < 7; i++) {
    let sum = 0;
    for (const [n, m] of Object.entries(S.usage[dayKey(d)] || {})) { tot[n] = (tot[n] || 0) + m; sum += m; if (!i) today[n] = m; }
    perDay.push([DAYS[d.getDay()], sum]); d.setDate(d.getDate() - 1);
  }
  const names = Object.keys(tot).sort((a, b) => tot[b] - tot[a]), max = Math.max(1, ...perDay.map(p => p[1]));
  const all = names.reduce((t, n) => t + (today[n] || 0), 0);
  return `<div class="card"><h2>Screen time</h2><div class="big">${fmt(all)}</div><div class="mu">today · ${fmt(Object.values(tot).reduce((a, b) => a + b, 0))} this week</div>
  <div class="row" style="align-items:flex-end;height:70px;gap:6px">${perDay.reverse().map(([l, m]) => `<div style="flex:1;text-align:center"><div style="height:${Math.round(m / max * 50)}px;min-height:2px;background:var(--ac);border-radius:4px"></div><small class="mu">${l}</small></div>`).join('')}</div>
  ${names.map(n => `<div class="row"><span>${esc(label(n))}</span><span class="mu">${fmt(today[n] || 0)} today · ${fmt(tot[n])} week</span></div>`).join('') || '<div class="mu">Nothing logged yet.</div>'}
  <div class="row"><input id="manApp" list="apps" placeholder="App (e.g. YouTube, Snapchat)" style="flex:1;min-width:120px"><datalist id="apps">${[...Object.keys(APPS), ...names.filter(n => !APPS[n])].map(n => `<option value="${esc(n)}">`).join('')}</datalist><input id="manMin" type="number" placeholder="min" style="width:80px"><button data-manual>Add</button></div>
  <div class="note">iOS doesn't let web apps read Screen Time. This counts sessions started from ScrollGuard plus what you enter by hand. Tip: once a week, copy your numbers from Settings → Screen Time.</div></div>`;
}
function vBlock() {
  const one = k => {
    const a = S.apps[k], A = APPS[k];
    const sw = `<div class="row"><b>${A.icon} ${A.name}</b><input type="checkbox" ${a.on ? 'checked' : ''} data-f="${k}.on"></div>`;
    if (!a.on) return `<div class="card">${sw}<div class="mu">Not managed by ScrollGuard.</div></div>`;
    return `<div class="card">${sw}
    <div class="row"><span>Lock</span><select data-f="${k}.mode"><option value="off" ${a.mode === 'off' ? 'selected' : ''}>Off</option><option value="schedule" ${a.mode === 'schedule' ? 'selected' : ''}>During set times</option><option value="always" ${a.mode === 'always' ? 'selected' : ''}>Always</option></select></div>
    ${a.mode === 'schedule' ? `<div class="row"><span>From</span><input type="time" value="${a.start}" data-f="${k}.start"><span>to</span><input type="time" value="${a.end}" data-f="${k}.end"></div>
    <div class="row days">${DAYS.map((d, i) => `<button class="${a.days.includes(i) ? 'on' : ''}" data-day="${k}.${i}">${d}</button>`).join('')}</div>
    <div class="mu">Overnight works too (e.g. 22:00 → 07:00).</div>` : ''}
    ${a.mode !== 'off' ? `<div class="mu" style="margin-top:8px">What to block while locked:</div>${TARGETS[k].map(([t, l]) => `<label class="row"><span>${l}</span><input type="checkbox" ${a.targets[t] ? 'checked' : ''} data-t="${k}.${t}"></label>`).join('')}` : ''}
    ${a.mode !== 'off' ? `<label class="row"><span>Block the whole app while locked<br><small class="mu">Instead of hiding feeds. Quick lookup still works.</small></span><input type="checkbox" ${a.whole ? 'checked' : ''} data-f="${k}.whole"></label>` : ''}
    <div class="row"><span>Block ${A.name} completely</span><input type="checkbox" ${a.blockAll ? 'checked' : ''} data-f="${k}.blockAll"></div></div>`;
  };
  return `<h1>Limits</h1>${Object.keys(APPS).map(one).join('')}
  <div class="card"><h2>Features</h2>
  <label class="row"><span>Tasks required to unlock early<br><small class="mu">Off = you can unlock any time (with a confirm)</small></span><input type="checkbox" ${S.settings.requireTasks ? 'checked' : ''} data-s="requireTasks"></label>
  <label class="row"><span>Quick lookup (profile / search for 10 min)</span><input type="checkbox" ${S.settings.lookup ? 'checked' : ''} data-s="lookup"></label>
  <label class="row"><span>Hand off to Safari<br><small class="mu">For Home Screen web-app mode. Experimental.</small></span><input type="checkbox" ${S.settings.safariHandoff ? 'checked' : ''} data-s="safariHandoff"></label>
  <label class="row"><span>Track time spent scrolling</span><input type="checkbox" ${S.settings.track ? 'checked' : ''} data-s="track"></label>
  <div class="row"><span>Daily Instagram goal (min)</span><input type="number" style="width:90px" value="${S.settings.threshold}" data-s="threshold"></div></div>
  <div class="card"><h2>App gate (for the real Instagram / TikTok / YouTube apps)</h2><div class="mu">A web app can't block an installed app, but it can stop you at the door. Copy a link, then in the Shortcuts app: Automation → New → App → pick the app → Is Opened → Open URL → paste the link → turn off "Ask Before Running". Opening the app then pops ScrollGuard's lock screen first.</div>
  ${Object.keys(APPS).map(k => `<div class="row"><span>${APPS[k].icon} ${APPS[k].name}</span><button data-copygate="${k}">Copy link</button></div>`).join('')}</div>
  <div class="card"><h2>Blocker sync</h2><div class="mu">Launching from ScrollGuard sends your current limits to the Safari userscript automatically. For the desktop extension, copy the config and paste it into its popup.</div>
  <div class="row"><button data-export>Copy blocker config</button></div></div>`;
}
function vTasks() {
  const ms = S.ms;
  return `<h1>Tasks</h1><div class="card"><div class="mu">Finish every task to unlock your restricted apps for the rest of the current window.</div>
  <div class="row"><input id="newTask" placeholder="Add a task…" style="flex:1"><button class="p" data-addtask>Add</button></div>
  ${S.tasks.map(t => `<div class="task ${t.done ? 'done' : ''}"><input type="checkbox" ${t.done ? 'checked' : ''} data-toggle="${t.id}"><span>${esc(t.text)}${t.ms ? ' <small class="mu">· MS To Do</small>' : ''}</span><button class="d" data-deltask="${t.id}">✕</button></div>`).join('') || '<div class="mu">No tasks yet.</div>'}
  <div class="row"><span class="tag ${allDone() ? 'free' : ''}">${allDone() ? 'All done 🎉' : S.tasks.filter(t => !t.done).length + ' remaining'}</span><button data-clear>Clear completed</button></div></div>
  <div class="card"><h2>Microsoft To Do</h2>
  <input placeholder="Azure app Client ID" value="${esc(ms.clientId)}" data-ms="clientId">
  <div class="row">${msOk() ? '<button class="p" data-mssync>Sync now</button><span class="tag free">Connected</span>' : '<button class="p" data-mslogin>Connect</button>'}</div>
  <div class="note">One-time setup: register a free app at entra.microsoft.com → App registrations → "Single-page application" redirect URI <code>${esc(redirect())}</code>, permission Tasks.ReadWrite, then paste its Client ID.</div></div>
  <div class="card"><h2>Apple Reminders</h2><div class="mu">Apple has no web API for Reminders. In Reminders, select tasks → copy → paste here (one per line):</div>
  <textarea id="paste" placeholder="Buy milk&#10;Email professor"></textarea><div class="row"><button data-import>Import</button></div></div>`;
}
function vSocial() {
  const s = streak(), pet = petFor(s), next = PET.find(p => p[0] > s);
  const bs = earned().map(b => b[1]);
  return `<h1>Rewards</h1>
  <div class="card"><div class="pet">${pet[1]}</div><div style="text-align:center"><b>${pet[2]}</b> · ${s}-day streak</div>
  <div class="mu" style="text-align:center">Streak = days at or under ${S.settings.threshold} min on Instagram.${next ? ` ${next[0] - s} more day(s) to evolve.` : ' Max level!'}</div>
  ${next ? `<div class="bar" style="margin-top:8px"><i style="width:${Math.min(100, (s - pet[0]) / (next[0] - pet[0]) * 100)}%"></i></div>` : ''}</div>
  <div class="card"><h2>Badges</h2>${BADGES.map(b => `<span class="badge ${bs.includes(b[1]) ? '' : 'off'}" title="${b[2]}">${b[0]} ${b[1]}</span>`).join('')}</div>`;
}

// ---------- extension config ----------
function exportConfig() {
  const apps = {};
  for (const k of Object.keys(APPS)) { const a = S.apps[k]; apps[k] = { mode: a.on ? a.mode : 'off', start: a.start, end: a.end, days: a.days, blockAll: a.blockAll, whole: !!a.whole, targets: a.targets, unlockUntil: S.override[k] || 0, lookupUntil: S.lookup[k] || 0, track: S.settings.track, back: IS_STANDALONE ? '' : location.origin + location.pathname }; }
  return JSON.stringify({ v: 1, apps });
}

// ---------- educational scroll ----------
// Facts come from Wikipedia's free public API (no key). Optional YouTube Shorts embeds use the
// official YouTube Data API with the user's own free key and the official embed player.
const L = { busy: false, ytCache: {}, n: 0 };
function vLearn() {
  const l = S.learn;
  if (!l.on) return `<h1>Learn</h1><div class="card"><div class="mu">Swap mindless scrolling for something useful: pick topics and scroll through facts.</div><div class="row"><span>Enable Educational Scroll</span><input type="checkbox" data-l="on"></div></div>`;
  return `<h1>Learn</h1><div class="card"><div class="row"><span>Educational Scroll</span><input type="checkbox" checked data-l="on"></div>
  <div class="row"><input id="topic" placeholder="Add a topic (space, chess, Roman history…)" style="flex:1"><button class="p" data-addtopic>Add</button></div>
  <div>${l.topics.map((t, i) => `<span class="badge">${esc(t)} <a href="#" data-rmtopic="${i}" onclick="return false" style="color:var(--bad)">✕</a></span>`).join('') || '<span class="mu">No topics yet.</span>'}</div>
  <div class="mu" style="margin-top:8px">Sources</div>
  <label class="row"><span>📚 Wikipedia facts</span><input type="checkbox" ${l.src.wiki ? 'checked' : ''} data-ls="wiki"></label>
  <label class="row"><span>📰 Tech &amp; science news (Hacker News)</span><input type="checkbox" ${l.src.hn ? 'checked' : ''} data-ls="hn"></label>
  <details class="mu" style="margin-top:8px"><summary>Short video clips (optional)</summary>
  <div class="row"><span>Mix in YouTube Shorts</span><input type="checkbox" ${l.ytOn ? 'checked' : ''} data-l="ytOn"></div>
  <input placeholder="Your free YouTube Data API key" value="${esc(l.ytKey)}" data-l="ytKey">
  <div class="note">Get a key free at console.cloud.google.com (enable YouTube Data API v3; ~100 searches/day free). Videos play in YouTube's official embedded player.</div></details></div>
  <div id="feed">${l.topics.length ? '' : ''}</div><div id="sentinel" class="mu" style="text-align:center;padding:20px">${l.topics.length ? 'Loading…' : 'Add a topic to begin.'}</div>`;
}
function initLearn() {
  if (!S.learn.on || !S.learn.topics.length) return;
  const io = new IntersectionObserver(es => { if (es[0].isIntersecting) moreCards(); }, { rootMargin: '600px' });
  io.observe($('#sentinel'));
}
const pick = a => a[Math.floor(Math.random() * a.length)];
async function wikiCard(topic) {
  const u = 'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrlimit=25&prop=extracts|pageimages|info&inprop=url&exintro=1&explaintext=1&exsentences=3&piprop=thumbnail&pithumbsize=700&gsrsearch=' + encodeURIComponent(topic);
  const pages = Object.values((await (await fetch(u)).json()).query?.pages || {}).filter(p => p.extract && p.extract.length > 80);
  const p = pick(pages); if (!p) return null;
  return `<div class="card"><div class="mu">🧠 ${esc(topic)}</div><h3 style="margin:6px 0">${esc(p.title)}</h3>${p.thumbnail ? `<img src="${esc(p.thumbnail.source)}" alt="" style="width:100%;border-radius:10px;max-height:260px;object-fit:cover">` : ''}<p>${esc(p.extract)}</p><a class="mu" target="_blank" rel="noopener" href="${esc(p.fullurl)}">Read more ↗</a></div>`;
}
async function hnCard(topic) {
  const r = await (await fetch('https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=20&query=' + encodeURIComponent(topic))).json();
  const h = pick((r.hits || []).filter(x => x.title)); if (!h) return null;
  const link = /^https?:/.test(h.url || '') ? h.url : 'https://news.ycombinator.com/item?id=' + encodeURIComponent(h.objectID);
  return `<div class="card"><div class="mu">📰 ${esc(topic)} · Hacker News</div><h3 style="margin:6px 0">${esc(h.title)}</h3><div class="mu">▲ ${h.points || 0} · 💬 ${h.num_comments || 0}</div><a class="mu" target="_blank" rel="noopener" href="${esc(link)}">Read ↗</a></div>`;
}
async function ytCard(topic) {
  const S_ = S.learn; if (!S_.ytOn || !S_.ytKey) return null;
  if (!L.ytCache[topic]?.length) {
    const r = await (await fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=short&maxResults=15&safeSearch=strict&key=' + encodeURIComponent(S_.ytKey) + '&q=' + encodeURIComponent(topic + ' #shorts'))).json();
    L.ytCache[topic] = (r.items || []).map(i => i.id.videoId).sort(() => Math.random() - .5);
  }
  const id = L.ytCache[topic].pop(); if (!id) return null;
  return `<div class="card"><div class="mu">🎬 ${esc(topic)}</div><iframe style="width:100%;aspect-ratio:9/16;max-height:70vh;border:0;border-radius:10px" loading="lazy" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}" allow="encrypted-media;picture-in-picture" allowfullscreen></iframe></div>`;
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
    if (!$('#feed')?.children.length) $('#sentinel').textContent = "Couldn't load facts – check your connection.";
  } finally { L.busy = false; }
}

// ---------- events ----------
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (d.tab) S.tab = d.tab;
  else if (d.launch) { const st = status(d.launch); return launch(d.launch, !st.active); }
  else if (d.unlock) return unlock(d.unlock);
  else if ('gateclose' in d) gate = null;
  else if (d.gateopen) { gate = null; render(); return launch(d.gateopen, true); }
  else if (d.copygate) { navigator.clipboard?.writeText(gateUrl(d.copygate)); t.textContent = 'Copied ✓'; return; }
  else if ('end' in d) return endSession();
  else if ('manual' in d) { addUsage(resolveApp($('#manApp').value), +$('#manMin').value || 0); }
  else if (d.go) { const v = $('#h-' + d.go).value.trim(); return v ? lookup(d.go, v) : alert('Type a handle first.'); }
  else if (d.lookup) return lookup(d.lookup);
  else if (d.day) { const [k, i] = d.day.split('.'), a = S.apps[k].days, n = +i; a.includes(n) ? a.splice(a.indexOf(n), 1) : a.push(n); }
  else if ('addtask' in d) { const v = $('#newTask').value.trim(); if (v) S.tasks.push({ id: 't' + Date.now(), text: v, done: false }); }
  else if (d.deltask) S.tasks = S.tasks.filter(x => x.id !== d.deltask);
  else if ('clear' in d) S.tasks = S.tasks.filter(x => !x.done);
  else if ('mslogin' in d) return msLogin();
  else if ('mssync' in d) return msSync();
  else if ('import' in d) { $('#paste').value.split('\n').map(s => s.replace(/^[\s•\-\[\]xX○◯]+/, '').trim()).filter(Boolean).forEach((v, i) => S.tasks.push({ id: 't' + Date.now() + i, text: v, done: false })); }
  else if ('export' in d) { navigator.clipboard?.writeText(exportConfig()); t.textContent = 'Copied ✓'; return; }
  else if (d.rmtopic) S.learn.topics.splice(+d.rmtopic, 1);
  else if ('addtopic' in d) { const v = $('#topic').value.trim(); if (v && !S.learn.topics.includes(v)) S.learn.topics.push(v); }
  else return;
  save(); render();
});
document.addEventListener('change', e => {
  const t = e.target, d = t.dataset;
  if (d.t) { const [k, f] = d.t.split('.'); S.apps[k].targets[f] = t.checked; }
  else if (d.ls) S.learn.src[d.ls] = t.checked;
  else if (d.l) S.learn[d.l] = t.type === 'checkbox' ? t.checked : t.value.trim();
  else if (d.f) { const [k, f] = d.f.split('.'); S.apps[k][f] = t.type === 'checkbox' ? t.checked : t.value; }
  else if (d.s) S.settings[d.s] = t.type === 'checkbox' ? t.checked : +t.value || 60;
  else if (d.toggle) return toggleTask(d.toggle);
  else if (d.ms) S.ms[d.ms] = t.value.trim();
  else return;
  save(); render();
});

// refresh lock status as time passes
setInterval(() => { if (S.tab !== 'learn' && !document.hidden && !document.activeElement?.matches('input,textarea,select')) render(); }, 60000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
function readLog() {
  const m = location.hash.match(/log=([a-z]+):([\d.]+)/); if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  if (APPS[m[1]]) addUsage(m[1], Math.min(+m[2], 240));
  S.pending = null; save();
}
readLog(); readGate();
if (S.pending && Date.now() - S.pending.start > 3000 && !document.hidden) endSession();
addEventListener('hashchange', () => { readLog(); readGate(); render(); });
render(); msFinish();
