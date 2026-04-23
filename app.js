/* ============================================================
   1-GROUP MARKETING DASHBOARD
   Client-side only; state persisted via JSONBin.io
============================================================ */

// --- CATEGORIES (Activation Plan) --------------------------------
const DEFAULT_CATEGORIES = [
  { id: 'creative',   name: 'Creative Direction & Strategy', color: '#8B5CF6', icon: '🎨' },
  { id: 'content',    name: 'Content Development',           color: '#EC4899', icon: '✍️' },
  { id: 'digital',    name: 'Digital Marketing & Ads',       color: '#3B82F6', icon: '📱' },
  { id: 'web',        name: 'Website & UX',                  color: '#10B981', icon: '💻' },
  { id: 'events',     name: 'Events & Experiential',         color: '#F59E0B', icon: '🎯' },
  { id: 'pr',         name: 'PR & Influencer',               color: '#EF4444', icon: '📢' },
  { id: 'community',  name: 'Community & Ambassadors',       color: '#14B8A6', icon: '👥' },
  { id: 'ops',        name: 'Production & Ops',              color: '#6B7280', icon: '⚙️' },
  { id: 'analytics',  name: 'Measurement & Analytics',       color: '#0EA5E9', icon: '📊' }
];

const PRIORITY_LABELS = { high: 'High', med: 'Medium', low: 'Low' };
const TASK_STATUSES = ['not_started','in_progress','done','blocked'];
const CAMPAIGN_STATUSES = ['planned','active','done','blocked'];

// --- STATE --------------------------------------------------------
const S = {
  // persisted
  team: [],
  categories: [],
  campaigns: [],
  tasks: [],
  requests: [],
  labels: [],          // {id,name,color}
  smartFilters: [],    // {id,name,query}
  // local UI
  view: 'today',
  activeCampaign: null,
  activeCategory: null,
  expandedTasks: new Set(),
  expandedCampaigns: new Set(),
  search: '',
  filter: { status: '', priority: '', label: '', who: '' },
  sidebarCollapsed: false,
  sidebarMobileOpen: false,
  dark: false,
  // sync
  currentUser: null,  // { email, name }
  binId: '',
  apiKey: '',
  syncing: false,
  lastSync: null,
  _syncTimer: null,
  _pollTimer: null,
  _revision: 0,
  // --- 12-point rebuild additions ---
  role: 'member',       // 'owner' | 'admin' | 'member' (resolved after bin load)
  admins: [],           // array of @1-group.sg email strings (sub-admins)
};

const LS = {
  KEYS: 'oneg.apiKey',
  BIN:  'oneg.binId',
  THEME:'oneg.theme',
  NAV:  'oneg.sidebarCollapsed',
  USER: 'oneg.user',
};

const ALLOWED_DOMAIN = '1-group.sg';

// --- AUTH TIERS ---------------------------------------------------
// Owner always has the same email + password. Sub-admins are stored
// in the shared bin and managed by the owner from Settings.
const OWNER_EMAIL = 'daryl.xie@1-group.sg';
const OWNER_PW_HASH = 'd66fd0ed243850fbe763e3464ecf2f780b1b073426c37af811a71372ef811110';

async function sha256Hex(str) {
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

function requireEdit() {
  if (S.role === 'owner' || S.role === 'admin') return true;
  toast('Read-only mode — contact the owner for edit access', 'error');
  return false;
}
function requireOwner() {
  if (S.role === 'owner') return true;
  toast('Owner permission required', 'error');
  return false;
}
function applyRoleToUI() {
  document.body.classList.toggle('readonly-user', S.role !== 'owner' && S.role !== 'admin');
}
function resolveRole() {
  if (!S.currentUser) { S.role = 'member'; return; }
  const e = (S.currentUser.email || '').toLowerCase();
  if (e === OWNER_EMAIL) S.role = 'owner';
  else if ((S.admins || []).map(x => (x||'').toLowerCase()).includes(e)) S.role = 'admin';
  else S.role = 'member';
  S.currentUser.role = S.role;
  localStorage.setItem(LS.USER, JSON.stringify(S.currentUser));
}
function emailFromName(name) {
  // Best-effort: 'Chef Jit Seng' -> 'chef.jit.seng@1-group.sg'
  if (!name) return '';
  const kebab = String(name).toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '');
  return kebab ? kebab + '@' + ALLOWED_DOMAIN : '';
}


// --- UTILITIES ----------------------------------------------------
const $ = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const escape = s => (s==null?'':String(s)).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function todayISO() { return new Date().toISOString().slice(0,10); }
function parseDate(iso) { return iso ? new Date(iso + 'T00:00:00') : null; }
function daysBetween(a, b) { return Math.round((b - a) / 86400000); }
function fmtDate(iso, opts={}) {
  if (!iso) return '';
  const d = parseDate(iso);
  const today = parseDate(todayISO());
  const diff = daysBetween(today, d);
  if (opts.relative !== false) {
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    if (diff > 1 && diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
    if (diff < 0 && diff > -7) return `${-diff}d ago`;
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}
function isOverdue(iso, status) {
  if (!iso || status === 'done') return false;
  return parseDate(iso) < parseDate(todayISO());
}
function isToday(iso) { return iso === todayISO(); }
function isUpcoming(iso, days = 7) {
  if (!iso) return false;
  const d = parseDate(iso); const t = parseDate(todayISO());
  const diff = daysBetween(t, d);
  return diff >= 0 && diff <= days;
}
function initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0,2).map(s=>s[0]||'').join('').toUpperCase();
}

// --- TOAST --------------------------------------------------------
function toast(msg, kind='info') {
  let bar = $('#toast-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'toast-bar';
    bar.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:200;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(bar);
  }
  const el = document.createElement('div');
  const color = kind==='error' ? 'var(--danger)' : kind==='success' ? 'var(--ok)' : 'var(--navy-700)';
  el.style.cssText = `background:${color};color:white;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:500;box-shadow:var(--shadow-md);animation:fadeIn .18s`;
  el.textContent = msg;
  bar.appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transition='opacity .3s'; setTimeout(()=>el.remove(),300); }, 2400);
}

// --- AUTH (email gate) --------------------------------------------
function deriveNameFromEmail(email) {
  const prefix = String(email).split('@')[0] || '';
  // split on . _ - + and digits, title-case each token
  const tokens = prefix.split(/[._\-+\d]+/).filter(Boolean);
  if (!tokens.length) return prefix || 'User';
  return tokens.map(t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()).join(' ');
}

function colorForEmail(email) {
  // deterministic hue from email
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 65% 52%)`;
}

async function doAuth() {
  const input = $('#auth-email');
  const pwInput = $('#auth-pw');
  const pwWrap = $('#auth-pw-wrap');
  const msg = $('#auth-msg');
  const btn = $('#auth-btn');
  const raw = (input.value || '').trim().toLowerCase();
  msg.textContent = '';

  if (!raw) { msg.textContent = 'Please enter your work email.'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    msg.textContent = 'That doesn’t look like a valid email.'; return;
  }
  const domain = raw.split('@')[1];
  if (domain !== ALLOWED_DOMAIN) {
    msg.textContent = `Access is restricted to @${ALLOWED_DOMAIN} addresses.`;
    return;
  }

  // Owner flow — password required
  if (raw === OWNER_EMAIL) {
    // If password field isn't visible yet, show it and stop — user clicks again
    if (!pwWrap.classList.contains('show')) {
      pwWrap.classList.add('show');
      setTimeout(() => pwInput.focus(), 40);
      msg.textContent = '';
      msg.style.color = 'var(--muted)';
      msg.textContent = 'Owner sign-in — enter your password.';
      return;
    }
    const pw = (pwInput.value || '');
    if (!pw) { msg.textContent = 'Password required.'; msg.style.color = 'var(--danger)'; return; }
    btn.disabled = true; btn.textContent = 'Verifying…';
    try {
      const hash = await sha256Hex(pw);
      if (hash !== OWNER_PW_HASH) {
        msg.textContent = 'Incorrect password.'; msg.style.color = 'var(--danger)';
        btn.disabled = false; btn.textContent = 'Continue'; return;
      }
    } catch (e) {
      msg.textContent = 'Could not verify password on this device.'; msg.style.color = 'var(--danger)';
      btn.disabled = false; btn.textContent = 'Continue'; return;
    }
  }

  const tentativeRole = raw === OWNER_EMAIL ? 'owner' : 'member';
  const user = {
    email: raw,
    name: raw === OWNER_EMAIL ? 'Daryl Xie' : deriveNameFromEmail(raw),
    color: colorForEmail(raw),
    role: tentativeRole,
  };
  S.currentUser = user;
  S.role = tentativeRole;
  localStorage.setItem(LS.USER, JSON.stringify(user));

  btn.disabled = true;
  showSetupScreen();
}

function showAuthGate() {
  $('#auth-screen').style.display = 'flex';
  $('#setup-screen').style.display = 'none';
  $('#app').classList.remove('active');
  const pwWrap = $('#auth-pw-wrap'); if (pwWrap) pwWrap.classList.remove('show');
  const pwInp = $('#auth-pw'); if (pwInp) pwInp.value = '';
  const msg = $('#auth-msg'); if (msg) { msg.textContent = ''; msg.style.color = 'var(--danger)'; }
  const img = document.getElementById('auth-logo-img');
  if (img && window.LOGO_NAVY) img.src = window.LOGO_NAVY;
  setTimeout(() => { const i = $('#auth-email'); if (i) i.focus(); }, 40);
}

function showSetupScreen() {
  $('#auth-screen').style.display = 'none';
  $('#setup-screen').style.display = 'flex';
  const who = $('#sc-whoami');
  if (who && S.currentUser) who.textContent = S.currentUser.email;
  const greet = $('#sc-greeting');
  if (greet && S.currentUser) {
    const first = S.currentUser.name.split(' ')[0];
    greet.textContent = `Hi ${first} — connect to your shared workspace to continue.`;
  }
  setTimeout(() => { const k = $('#sc-key'); if (k) k.focus(); }, 40);
}

function signOutAuth() {
  if (!confirm('Sign out of this workspace on this device?')) return;
  localStorage.removeItem(LS.USER);
  localStorage.removeItem(LS.KEYS);
  localStorage.removeItem(LS.BIN);
  location.reload();
}

function ensureCurrentUserInTeam() {
  if (!S.currentUser) return;
  const existing = S.team.find(m =>
    (m.email && m.email.toLowerCase() === S.currentUser.email) ||
    m.name === S.currentUser.name
  );
  if (existing) {
    // backfill email on existing record
    if (!existing.email) existing.email = S.currentUser.email;
    if (!existing.color) existing.color = S.currentUser.color;
    S.currentUser.id = existing.id;
  } else {
    const member = {
      id: uid(),
      name: S.currentUser.name,
      email: S.currentUser.email,
      role: 'Team Member',
      color: S.currentUser.color,
    };
    S.team.push(member);
    S.currentUser.id = member.id;
    scheduleSync();
  }
}

// --- SETUP / JSONBIN -------------------------------------------------
async function doSetup() {
  const key = $('#sc-key').value.trim();
  const msg = $('#sc-msg');
  const btn = $('#sc-btn');
  if (!key) { msg.textContent = 'Please enter your JSONBin master key.'; return; }

  btn.disabled = true;
  btn.textContent = 'Connecting…';
  msg.textContent = '';

  const urlBin = new URLSearchParams(location.search).get('bin') || localStorage.getItem(LS.BIN) || '';

  try {
    if (urlBin) {
      // load existing bin
      const r = await fetch(`https://api.jsonbin.io/v3/b/${urlBin}/latest`, {
        headers: { 'X-Master-Key': key }
      });
      if (!r.ok) throw new Error('Could not load shared bin. Check your key.');
      const j = await r.json();
      hydrateState(j.record || {});
      S.binId = urlBin;
    } else {
      // create new bin with initial payload
      const init = initialPayload();
      const r = await fetch('https://api.jsonbin.io/v3/b', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'X-Master-Key': key, 'X-Bin-Private':'true', 'X-Bin-Name':'1-group-marketing' },
        body: JSON.stringify(init)
      });
      if (!r.ok) throw new Error('Could not create workspace. Check your key.');
      const j = await r.json();
      S.binId = j.metadata.id;
      hydrateState(init);
    }
    S.apiKey = key;
    localStorage.setItem(LS.KEYS, key);
    localStorage.setItem(LS.BIN, S.binId);

    // update share URL param for easy sharing
    const u = new URL(location);
    u.searchParams.set('bin', S.binId);
    history.replaceState(null, '', u);

    startApp();
    if (!urlBin) showShareURL();
  } catch (e) {
    msg.textContent = e.message;
    btn.disabled = false;
    btn.textContent = 'Connect';
  }
}

function initialPayload() {
  return {
    team: [
      { id: uid(), name: 'Alex Chen', role: 'Marketing Lead', color: '#3B82F6' },
      { id: uid(), name: 'Jordan Lee', role: 'Content Strategist', color: '#8B5CF6' },
      { id: uid(), name: 'Sam Rivera', role: 'Designer', color: '#EC4899' }
    ],
    categories: DEFAULT_CATEGORIES.slice(),
    campaigns: [],
    tasks: [],
    requests: [],
    labels: [
      { id: uid(), name: 'Quick win', color: '#10B981' },
      { id: uid(), name: 'Blocker',   color: '#EF4444' },
      { id: uid(), name: 'Review',    color: '#F59E0B' },
    ],
    smartFilters: [],
    admins: [],
    _revision: 0,
  };
}

function hydrateState(record) {
  // --- TEAM: normalize strings → objects ---------------------------
  const rawTeam = record.team || [];
  const teamByName = {}; // name (lowercased) → id, for remapping task.who
  const team = [];
  const palette = ['#3B82F6','#8B5CF6','#EC4899','#10B981','#F59E0B','#EF4444','#14B8A6','#0EA5E9','#A855F7','#F97316'];
  let pi = 0;
  for (const m of rawTeam) {
    if (!m) continue;
    if (typeof m === 'string') {
      const id = 'tm-' + m.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || uid();
      const member = {
        id, name: m, email: emailFromName(m),
        role: '', color: palette[pi++ % palette.length]
      };
      team.push(member);
      teamByName[m.toLowerCase()] = id;
    } else if (typeof m === 'object') {
      if (!m.id) m.id = uid();
      if (!m.name && m.fullName) m.name = m.fullName;
      if (!m.name && m.displayName) m.name = m.displayName;
      if (!m.name) m.name = 'Unknown';
      if (!m.color) m.color = palette[pi++ % palette.length];
      if (!m.role) m.role = '';
      if (!m.email) m.email = emailFromName(m.name);
      team.push(m);
      teamByName[m.name.toLowerCase()] = m.id;
    }
  }
  S.team = team;

  // helper: map a "who" entry (name string OR id) to a team id
  const resolveWho = (w) => {
    if (!w) return null;
    if (typeof w !== 'string') return null;
    // already an id?
    if (team.find(m => m.id === w)) return w;
    // lookup by name
    const id = teamByName[w.toLowerCase()];
    if (id) return id;
    // create a stub member on the fly so we don't lose the data
    const newId = 'tm-' + w.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || uid();
    if (!team.find(m => m.id === newId)) {
      const member = { id: newId, name: w, role: '', color: palette[pi++ % palette.length] };
      team.push(member);
      teamByName[w.toLowerCase()] = newId;
    }
    return newId;
  };

  // --- CATEGORIES: label → name, add color/icon --------------------
  const rawCats = record.categories || [];
  if (rawCats.length) {
    const catPalette = ['#8B5CF6','#EC4899','#3B82F6','#10B981','#F59E0B','#EF4444','#14B8A6','#6B7280','#0EA5E9'];
    S.categories = rawCats.map((c, i) => ({
      id: c.id || uid(),
      name: c.name || c.label || c.title || 'Untitled',
      color: c.color || catPalette[i % catPalette.length],
      icon: c.icon || '📋',
    }));
  } else {
    S.categories = DEFAULT_CATEGORIES.slice();
  }

  // --- CAMPAIGNS + NESTED TASKS ------------------------------------
  const rawCampaigns = record.campaigns || [];
  const liftedTasks = [];
  const statusMap = {
    'not-started':'not_started', 'not_started':'not_started',
    'in-progress':'in_progress', 'in_progress':'in_progress',
    'done':'done', 'completed':'done', 'complete':'done',
    'blocked':'blocked', 'block':'blocked',
  };

  const normalizeTask = (t, campaignId) => {
    const task = { ...t };
    if (!task.id) task.id = uid();
    if (!task.name) task.name = task.title || task.task || task.text || 'Untitled task';
    if (campaignId && !task.campaignId) task.campaignId = campaignId;
    if (!task.campaignId && task.campaign) task.campaignId = task.campaign;
    if (!task.due) task.due = task.dueDate || task.deadline || '';
    // assignees from `who` (array of names) OR `assignee` / `owners`
    let who = [];
    if (Array.isArray(task.assignees) && task.assignees.length) who = task.assignees;
    else if (Array.isArray(task.who)) who = task.who;
    else if (Array.isArray(task.assignee)) who = task.assignee;
    else if (task.assignee) who = [task.assignee];
    else if (Array.isArray(task.owners)) who = task.owners;
    task.assignees = who.map(resolveWho).filter(Boolean);
    // status: hyphens → underscores
    const s = (task.status || '').toString();
    task.status = statusMap[s] || (task.completed === true || task.done === true ? 'done' : 'not_started');
    // category: `cats` array → first categoryId
    if (!task.categoryId) {
      if (Array.isArray(task.cats) && task.cats.length) task.categoryId = task.cats[0];
      else if (task.category) task.categoryId = task.category;
    }
    task.notes = task.notes || task.desc || task.description || task.details || '';
    task.priority = task.priority || '';
    task.subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
    task.labels = Array.isArray(task.labels) ? task.labels : [];
    task.comments = Array.isArray(task.comments) ? task.comments : [];
    // prune legacy-only fields we've absorbed
    delete task.who; delete task.cats; delete task.desc; delete task.description;
    delete task.details; delete task.completed; delete task.done;
    delete task.assignee; delete task.owners; delete task.title; delete task.task;
    delete task.text; delete task.dueDate; delete task.deadline; delete task.campaign;
    delete task.category; delete task.state; delete task.blk; delete task.taskStart;
    return task;
  };

  // lift nested campaign tasks into a flat list
  const campaigns = rawCampaigns.map(c => {
    const campaign = { ...c };
    if (!campaign.id) campaign.id = uid();
    if (!campaign.status) campaign.status = 'planned';
    if (!campaign.color) campaign.color = '#3B82F6';
    campaign.startDate = campaign.startDate || campaign.start || '';
    campaign.endDate = campaign.endDate || campaign.end || '';
    campaign.description = campaign.description || campaign.desc || '';
    const nested = Array.isArray(campaign.tasks) ? campaign.tasks : [];
    for (const t of nested) liftedTasks.push(normalizeTask(t, campaign.id));
    delete campaign.tasks;
    delete campaign.desc;
    delete campaign.start; delete campaign.end;
    return campaign;
  });
  S.campaigns = campaigns;

  // top-level legacy tasks (if any) merged with lifted ones
  const topTasks = (record.tasks || []).map(t => normalizeTask(t, t.campaignId || t.campaign || null));
  // dedupe by id (lifted + top-level shouldn't collide, but be safe)
  const seen = new Set();
  S.tasks = [...liftedTasks, ...topTasks].filter(t => {
    if (seen.has(t.id)) return false;
    seen.add(t.id); return true;
  });

  // Strip categoryId references that don't match any real category (legacy noise)
  const catIds = new Set(S.categories.map(c => c.id));
  for (const t of S.tasks) {
    if (t.categoryId && !catIds.has(t.categoryId)) t.categoryId = '';
  }

  // --- REQUESTS ----------------------------------------------------
  S.requests = (record.requests || []).map(r => {
    const req = { ...r };
    if (!req.id) req.id = uid();
    if (!req.name) req.name = req.title || 'Untitled request';
    req.notes = req.notes || req.details || req.description || '';
    req.campaignId = req.campaignId || req.cid || '';
    // assignees from `who`
    let who = [];
    if (Array.isArray(req.assignees) && req.assignees.length) who = req.assignees;
    else if (Array.isArray(req.who)) who = req.who;
    else if (req.who) who = [req.who];
    req.assignees = who.map(resolveWho).filter(Boolean);
    req.status = req.status || 'pending';
    req.requestedBy = req.requestedBy || req.by || '';
    return req;
  });

  S.labels = record.labels || [];
  S.smartFilters = record.smartFilters || [];
  S.admins = Array.isArray(record.admins) ? record.admins.slice() : [];
  S._revision = record._revision || 0;

  // Ensure links array exists on tasks + campaigns
  for (const t of S.tasks) if (!Array.isArray(t.links)) t.links = [];
  for (const c of S.campaigns) if (!Array.isArray(c.links)) c.links = [];

  // Resolve the signed-in user's role against the loaded admin list
  resolveRole();
  applyRoleToUI();
}

function serializeState() {
  return {
    team: S.team,
    categories: S.categories,
    campaigns: S.campaigns,
    tasks: S.tasks,
    requests: S.requests,
    labels: S.labels,
    smartFilters: S.smartFilters,
    admins: S.admins || [],
    _revision: (S._revision || 0) + 1,
  };
}

function scheduleSync() {
  if (!S.binId || !S.apiKey) return;
  updateSyncIndicator('pending');
  clearTimeout(S._syncTimer);
  S._syncTimer = setTimeout(doSync, 800);
}

async function doSync() {
  if (!S.binId || !S.apiKey) return;
  updateSyncIndicator('syncing');
  try {
    const payload = serializeState();
    const r = await fetch(`https://api.jsonbin.io/v3/b/${S.binId}`, {
      method: 'PUT',
      headers: { 'Content-Type':'application/json', 'X-Master-Key': S.apiKey },
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error('Sync failed');
    S._revision = payload._revision;
    S.lastSync = Date.now();
    updateSyncIndicator('on');
  } catch(e) {
    updateSyncIndicator('error');
    console.error(e);
  }
}

async function pollForChanges() {
  if (!S.binId || !S.apiKey || S.syncing) return;
  try {
    const r = await fetch(`https://api.jsonbin.io/v3/b/${S.binId}/latest`, {
      headers: { 'X-Master-Key': S.apiKey }
    });
    if (!r.ok) return;
    const j = await r.json();
    const rev = (j.record && j.record._revision) || 0;
    if (rev > (S._revision || 0)) {
      // someone else updated
      hydrateState(j.record);
      render();
      toast('Updated from teammate', 'info');
    }
  } catch(e) { /* ignore */ }
}

function manualRefresh() {
  toast('Refreshing…');
  pollForChanges();
}

function updateSyncIndicator(state) {
  const el = $('#tb-sync');
  const lbl = $('#tb-sync-label');
  if (!el) return;
  el.classList.add('on');
  if (state === 'syncing') { lbl.textContent = 'Saving…'; el.querySelector('.dot').style.background = 'var(--warn)'; }
  else if (state === 'error') { lbl.textContent = 'Error'; el.querySelector('.dot').style.background = 'var(--danger)'; }
  else if (state === 'pending') { lbl.textContent = 'Pending'; el.querySelector('.dot').style.background = 'var(--warn)'; }
  else { lbl.textContent = 'Live'; el.querySelector('.dot').style.background = 'var(--ok)'; }
}

function showShareURL() {
  const u = new URL(location);
  u.searchParams.set('bin', S.binId);
  const url = u.toString();
  navigator.clipboard?.writeText(url);
  toast('Share link copied to clipboard', 'success');
}

// --- THEME --------------------------------------------------------
function applyTheme() {
  document.documentElement.classList.toggle('dark', S.dark);
  const brand = $('#brand-logo');
  const navyLogo = window.LOGO_NAVY || 'assets/1group-logo.png';
  const whiteLogo = window.LOGO_WHITE || 'assets/1group-logo-white.png';
  if (brand) brand.src = S.dark ? whiteLogo : navyLogo;
  const setupImg = document.getElementById('setup-logo-img');
  if (setupImg) setupImg.src = navyLogo;
  localStorage.setItem(LS.THEME, S.dark ? 'dark' : 'light');
  const icon = $('#icon-sun');
  if (icon) {
    if (S.dark) {
      icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
    } else {
      icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
    }
  }
}
function toggleTheme() { S.dark = !S.dark; applyTheme(); }

function toggleSidebar() {
  if (window.innerWidth <= 900) {
    S.sidebarMobileOpen = !S.sidebarMobileOpen;
    $('#sidebar').classList.toggle('mobile-open', S.sidebarMobileOpen);
    $('#mobile-overlay').classList.toggle('on', S.sidebarMobileOpen);
  } else {
    S.sidebarCollapsed = !S.sidebarCollapsed;
    $('#sidebar').classList.toggle('collapsed', S.sidebarCollapsed);
    localStorage.setItem(LS.NAV, S.sidebarCollapsed ? '1' : '0');
  }
}
function closeMobileSidebar() {
  S.sidebarMobileOpen = false;
  $('#sidebar').classList.remove('mobile-open');
  $('#mobile-overlay').classList.remove('on');
}

// --- ROUTING ------------------------------------------------------
function go(view, ctx={}) {
  S.view = view;
  S.activeCampaign = ctx.campaign || null;
  S.activeCategory = ctx.category || null;
  closeMobileSidebar();
  render();
  window.scrollTo(0, 0);
}

// --- STARTUP ------------------------------------------------------
function startApp() {
  ensureCurrentUserInTeam();
  $('#auth-screen').style.display = 'none';
  $('#setup-screen').style.display = 'none';
  $('#app').classList.add('active');
  $('#quick-fab').classList.remove('hidden');

  // load saved prefs
  S.dark = localStorage.getItem(LS.THEME) === 'dark';
  S.sidebarCollapsed = localStorage.getItem(LS.NAV) === '1';
  if (window.innerWidth > 900 && S.sidebarCollapsed) {
    $('#sidebar').classList.add('collapsed');
  }
  applyTheme();
  applyRoleToUI();
  updateSyncIndicator('on');

  // start polling for remote updates
  clearInterval(S._pollTimer);
  S._pollTimer = setInterval(pollForChanges, 15000);

  render();
}

// ============================================================
//                         RENDER
// ============================================================
function render() {
  renderSidebar();
  renderContent();
  updateUserBadge();
}

function updateUserBadge() {
  const me = S.currentUser || S.team[0];
  if (me) {
    $('#user-avatar').textContent = initials(me.name);
    $('#user-name').textContent = me.name;
    if (me.color) $('#user-avatar').style.background = me.color;
  }
}

// --- SIDEBAR ----------
function myWorkCount() {
  if (!S.currentUser) return 0;
  let myId = S.currentUser.id;
  if (!myId) {
    const match = S.team.find(m =>
      (m.email && m.email.toLowerCase() === (S.currentUser.email||'').toLowerCase()) ||
      m.name === S.currentUser.name);
    if (match) myId = match.id;
  }
  if (!myId) return 0;
  return S.tasks.filter(t => t.status !== 'done' && (t.assignees||[]).includes(myId)).length;
}

function renderSidebar() {
  const c = $('#sb-scroll');
  const todayCount = S.tasks.filter(t => t.status !== 'done' && (isToday(t.due) || isOverdue(t.due, t.status))).length;
  const upcomingCount = S.tasks.filter(t => t.status !== 'done' && isUpcoming(t.due, 7)).length;
  const pendingReq = S.requests.filter(r => (r.status||'pending') === 'pending').length;
  const inboxCount = S.tasks.filter(t => t.status !== 'done' && !t.campaignId).length;

  const nav = (id, icon, label, count, accent) => {
    const active = S.view === id;
    const countHtml = count ? `<span class="sb-count ${accent?'attn':''}">${count}</span>` : '';
    return `<button class="sb-item ${active?'active':''}" onclick="go('${id}')">
      <span class="sb-icon">${icon}</span>
      <span class="sb-label">${label}</span>
      ${countHtml}
    </button>`;
  };

  let html = '';

  html += nav('today', svgIcon('sun'), 'Today', todayCount, todayCount > 0);
  html += nav('my-work', svgIcon('star'), 'My work', myWorkCount(), false);
  html += nav('upcoming', svgIcon('calendar'), 'Upcoming', upcomingCount);
  html += nav('inbox', svgIcon('inbox'), 'Inbox', inboxCount);
  html += nav('calendar', svgIcon('cal-month'), 'Calendar', 0);
  html += nav('requests', svgIcon('inbox-down'), 'Requests', pendingReq, pendingReq > 0);
  html += nav('dashboard', svgIcon('grid'), 'Dashboard', 0);

  // CAMPAIGNS section
  html += `<div class="sb-section-title">
    <span style="flex:1">Campaigns</span>
    <button class="sb-label" style="background:transparent;border:none;color:var(--muted);cursor:pointer;font-size:14px;padding:0 4px;line-height:1" onclick="openNewCampaign(event)" title="New campaign">+</button>
  </div>`;
  html += nav('campaigns', svgIcon('layers'), 'All campaigns', S.campaigns.length);

  for (const camp of S.campaigns.slice(0, 10)) {
    const active = S.view === 'campaign' && S.activeCampaign === camp.id;
    html += `<button class="sb-item ${active?'active':''}" onclick="go('campaign',{campaign:'${camp.id}'})">
      <span class="sb-icon" style="color:${camp.color||'var(--navy-500)'}"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5"/></svg></span>
      <span class="sb-label">${escape(camp.name)}</span>
    </button>`;
  }

  // SMART LISTS
  html += `<div class="sb-section-title">
    <span style="flex:1">Smart lists</span>
    <button class="sb-label" style="background:transparent;border:none;color:var(--muted);cursor:pointer;font-size:14px;padding:0 4px;line-height:1" onclick="openNewSmartFilter(event)" title="New smart list">+</button>
  </div>`;
  html += nav('priority-high', svgIcon('flag'), 'High priority', S.tasks.filter(t=>t.priority==='high'&&t.status!=='done').length);
  html += nav('all-tasks', svgIcon('list'), 'All tasks', S.tasks.filter(t=>t.status!=='done').length);
  html += nav('completed', svgIcon('check'), 'Completed', 0);

  for (const f of S.smartFilters) {
    const active = S.view === 'smart' && S.activeCategory === f.id;
    html += `<button class="sb-item ${active?'active':''}" onclick="go('smart',{category:'${f.id}'})">
      <span class="sb-icon">${svgIcon('star')}</span>
      <span class="sb-label">${escape(f.name)}</span>
    </button>`;
  }

  c.innerHTML = html;
}

function svgIcon(name) {
  const icons = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
    'cal-month': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><rect x="7" y="13" width="3" height="3"/></svg>',
    'inbox-down': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  };
  return icons[name] || '';
}

// --- MAIN CONTENT ROUTER ----------
function renderContent() {
  const c = $('#content');
  c.classList.remove('narrow');
  const v = S.view;
  $('#tb-title').textContent = viewTitle();

  if (v === 'today') c.innerHTML = renderToday();
  else if (v === 'my-work') c.innerHTML = renderMyWork();
  else if (v === 'upcoming') c.innerHTML = renderUpcoming();
  else if (v === 'inbox') c.innerHTML = renderInbox();
  else if (v === 'calendar') c.innerHTML = renderCalendar();
  else if (v === 'requests') c.innerHTML = renderRequests();
  else if (v === 'dashboard') c.innerHTML = renderDashboard();
  else if (v === 'campaigns') c.innerHTML = renderCampaigns();
  else if (v === 'campaign') c.innerHTML = renderCampaignDetail();
  else if (v === 'priority-high') c.innerHTML = renderFilteredList('High priority', t => t.priority==='high' && t.status!=='done');
  else if (v === 'all-tasks') c.innerHTML = renderFilteredList('All tasks', t => t.status!=='done');
  else if (v === 'completed') c.innerHTML = renderFilteredList('Completed', t => t.status==='done');
  else if (v === 'smart') c.innerHTML = renderSmart();
  else c.innerHTML = '<div class="empty">View not found</div>';

  // re-attach dynamic listeners
  attachInlineEdits();
}

function viewTitle() {
  const map = {
    today: 'Today', 'my-work': 'My work', upcoming: 'Upcoming', inbox: 'Inbox', calendar: 'Calendar',
    requests: 'Requests', dashboard: 'Dashboard', campaigns: 'Campaigns',
    'priority-high': 'High priority', 'all-tasks': 'All tasks', 'completed': 'Completed'
  };
  if (S.view === 'campaign') {
    const c = S.campaigns.find(x=>x.id===S.activeCampaign);
    return c ? c.name : 'Campaign';
  }
  if (S.view === 'smart') {
    const f = S.smartFilters.find(x=>x.id===S.activeCategory);
    return f ? f.name : 'Smart list';
  }
  return map[S.view] || 'Dashboard';
}

// ============================================================
//                    TASK ROW COMPONENT
// ============================================================
function taskRowHTML(t, opts={}) {
  const exp = S.expandedTasks.has(t.id);
  const camp = S.campaigns.find(c => c.id === t.campaignId);
  const cat = S.categories.find(c => c.id === t.categoryId);
  const doneClass = t.status === 'done' ? 'done' : '';
  const dueClass = isOverdue(t.due, t.status) ? 'overdue' : (isToday(t.due) ? 'today' : '');
  const dueLabel = t.due ? fmtDate(t.due) : '';

  const prioIcon = t.priority ? `<span class="prio ${t.priority}" title="${PRIORITY_LABELS[t.priority]} priority">
    <svg viewBox="0 0 24 24"><path d="M4 21V3l10 5-5 4 5 4-10 5z"/></svg>
  </span>` : '';

  const whoChips = (t.assignees||[]).slice(0,2).map(id => {
    const m = S.team.find(x => x.id === id);
    return m ? `<span class="chip people" title="${escape(m.name)}">${initials(m.name)}</span>` : '';
  }).join('');
  const moreWho = (t.assignees||[]).length > 2 ? `<span class="chip people">+${(t.assignees||[]).length-2}</span>` : '';

  const labelChips = (t.labels||[]).slice(0,3).map(lid => {
    const l = S.labels.find(x => x.id === lid); if (!l) return '';
    return `<span class="label-tag" style="background:${l.color}22;color:${l.color}">${escape(l.name)}</span>`;
  }).join('');

  const subTotal = (t.subtasks||[]).length;
  const subDone = (t.subtasks||[]).filter(s=>s.done).length;
  const subChip = subTotal ? `<span class="chip" title="Sub-tasks">${subDone}/${subTotal}</span>` : '';

  const campChip = !opts.hideCampaign && camp ? `<span class="chip cat" style="background:${camp.color}22;color:${camp.color}">${escape(camp.name)}</span>` : '';
  const descPreview = t.notes ? `<div class="task-desc-preview">${escape(t.notes)}</div>` : '';

  return `
    <div class="task ${exp?'expanded':''}" data-tid="${t.id}">
      <button class="task-chk ${doneClass}" onclick="event.stopPropagation();toggleTask('${t.id}')" aria-label="Mark done">
        ${t.status==='done'?'<svg viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>':''}
      </button>
      <div class="task-main" onclick="toggleExpand('${t.id}')">
        <div class="task-title ${doneClass}">
          ${prioIcon}<span>${escape(t.name)}</span>
        </div>
        ${descPreview}
        <div class="task-meta">
          ${whoChips}${moreWho}${campChip}${labelChips}${subChip}${(t.links&&t.links.length)?`<span class="chip" title="${t.links.length} link(s)">🔗 ${t.links.length}</span>`:""}
        </div>
      </div>
      ${dueLabel?`<div class="task-due ${dueClass}">${dueLabel}</div>`:''}
    </div>
    ${exp ? taskExpandedHTML(t) : ''}
  `;
}

function taskExpandedHTML(t) {
  const whoOptions = S.team.map(m => {
    const sel = (t.assignees||[]).includes(m.id);
    return `<span class="who-chip ${sel?'sel':''}" onclick="toggleAssignee('${t.id}','${m.id}')">${escape(m.name)}</span>`;
  }).join('');

  const labelOptions = S.labels.map(l => {
    const sel = (t.labels||[]).includes(l.id);
    return `<span class="who-chip ${sel?'sel':''}" onclick="toggleLabel('${t.id}','${l.id}')" style="${sel?`background:${l.color};border-color:${l.color}`:''}">${escape(l.name)}</span>`;
  }).join('');

  const campOptions = `<option value="">— None —</option>` + S.campaigns.map(c =>
    `<option value="${c.id}" ${t.campaignId===c.id?'selected':''}>${escape(c.name)}</option>`
  ).join('');

  const catOptions = `<option value="">— None —</option>` + S.categories.map(c =>
    `<option value="${c.id}" ${t.categoryId===c.id?'selected':''}>${c.icon||''} ${escape(c.name)}</option>`
  ).join('');

  const subtaskRows = (t.subtasks||[]).map(s => `
    <div class="subtask ${s.done?'done':''}" data-sid="${s.id}">
      <span class="subtask-chk ${s.done?'done':''}" onclick="toggleSubtask('${t.id}','${s.id}')">
        ${s.done?'<svg viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>':''}
      </span>
      <input class="subtask-text" value="${escape(s.name)}" onchange="renameSubtask('${t.id}','${s.id}',this.value)">
      <button class="subtask-del" onclick="deleteSubtask('${t.id}','${s.id}')">×</button>
    </div>
  `).join('');

  const comments = (t.comments||[]).map(c => `
    <div class="comment">
      <div class="hdr"><b>${escape(c.author||'Someone')}</b><span>${escape(c.at||'')}</span></div>
      <div class="body">${escape(c.text)}</div>
    </div>
  `).join('');

  return `
    <div class="task-exp">
      <div class="exp-label">Task name</div>
      <input class="field" value="${escape(t.name)}" style="font-weight:600;font-size:14px;margin-bottom:14px"
        onchange="if(this.value.trim())updateTaskField('${t.id}','name',this.value.trim())">
      <div class="exp-grid">
        <div>
          <div class="exp-label">Status</div>
          <select class="field" onchange="updateTaskField('${t.id}','status',this.value)">
            ${TASK_STATUSES.map(s => `<option value="${s}" ${t.status===s?'selected':''}>${s.replace('_',' ')}</option>`).join('')}
          </select>
        </div>
        <div>
          <div class="exp-label">Priority</div>
          <select class="field" onchange="updateTaskField('${t.id}','priority',this.value)">
            <option value="">None</option>
            <option value="high" ${t.priority==='high'?'selected':''}>High</option>
            <option value="med" ${t.priority==='med'?'selected':''}>Medium</option>
            <option value="low" ${t.priority==='low'?'selected':''}>Low</option>
          </select>
        </div>
        <div>
          <div class="exp-label">Due date</div>
          <input type="date" class="field" value="${t.due||''}" onchange="updateTaskField('${t.id}','due',this.value)">
        </div>
        <div>
          <div class="exp-label">Campaign</div>
          <select class="field" onchange="updateTaskField('${t.id}','campaignId',this.value)">${campOptions}</select>
        </div>
        <div>
          <div class="exp-label">Category</div>
          <select class="field" onchange="updateTaskField('${t.id}','categoryId',this.value)">${catOptions}</select>
        </div>
      </div>

      <div class="exp-label" style="margin-top:4px">Assign</div>
      <div style="margin-bottom:10px">${whoOptions || '<span class="muted" style="font-size:12px">No team members yet. Add from Settings.</span>'}</div>

      <div class="exp-label">Labels</div>
      <div style="margin-bottom:10px">${labelOptions || '<span class="muted" style="font-size:12px">No labels yet.</span>'}</div>

      <div class="exp-label">Notes</div>
      <textarea class="field" placeholder="Add notes, context, markdown, links…" rows="3"
        oninput="updateTaskField('${t.id}','notes',this.value,true)">${escape(t.notes||'')}</textarea>

      ${taskLinksHTML(t)}
      <div class="exp-label" style="margin-top:14px">Sub-tasks</div>
      <div class="subtasks">
        ${subtaskRows}
        <div class="subtask-add" onclick="addSubtask('${t.id}')">
          <span class="subtask-chk"></span>
          <span>Add sub-task…</span>
        </div>
      </div>

      ${comments ? `<div class="exp-label" style="margin-top:14px">Comments</div>${comments}` : ''}
      <div style="display:flex;gap:8px;margin-top:14px;align-items:center">
        <input class="field rw-ok" id="cmt-${t.id}" placeholder="Add a comment…" style="flex:1" onkeydown="if(event.key==='Enter')addComment('${t.id}',this.value),this.value=''">
        <button class="btn danger sm" onclick="deleteTask('${t.id}')">Delete</button>
      </div>
    </div>
  `;
}

// ============================================================
//                    VIEW RENDERERS
// ============================================================
function renderToday() {
  const me = (S.currentUser && S.currentUser.name) || S.team[0]?.name || 'there';
  const today = new Date();
  const dateStr = today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const overdue = S.tasks.filter(t => t.status !== 'done' && isOverdue(t.due, t.status));
  const dueToday = S.tasks.filter(t => t.status !== 'done' && isToday(t.due));
  const completedToday = S.tasks.filter(t => t.status === 'done' && t.completedAt?.slice(0,10) === todayISO());

  return `
    <div class="hero">
      <div class="greeting">Hello, ${escape(me.split(' ')[0])}</div>
      <div class="date">${dateStr}</div>
      <div class="stats">
        <div class="stat"><div class="v">${dueToday.length}</div><div class="l">Due today</div></div>
        <div class="stat"><div class="v">${overdue.length}</div><div class="l">Overdue</div></div>
        <div class="stat"><div class="v">${completedToday.length}</div><div class="l">Completed</div></div>
      </div>
    </div>

    ${overdue.length ? `
      <div class="sh"><span style="color:var(--danger)">⚠ Overdue</span><span class="line"></span></div>
      <div class="card" style="padding:0">${overdue.map(t=>taskRowHTML(t)).join('')}</div>
    ` : ''}

    <div class="sh"><span>Due today</span><span class="line"></span><button class="btn xs ghost" onclick="openQuickAdd()">+ Add</button></div>
    <div class="card" style="padding:0">
      ${dueToday.length ? dueToday.map(t=>taskRowHTML(t)).join('') : '<div class="empty"><div class="empty-icon">☀️</div>Nothing due today. Enjoy!</div>'}
    </div>

    ${completedToday.length ? `
      <div class="sh"><span>Completed</span><span class="line"></span></div>
      <div class="card" style="padding:0">${completedToday.map(t=>taskRowHTML(t)).join('')}</div>
    ` : ''}
  `;
}

function renderUpcoming() {
  const days = 7;
  const today = parseDate(todayISO());
  const groups = {};
  for (let i = 0; i <= days; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const iso = d.toISOString().slice(0,10);
    groups[iso] = [];
  }
  for (const t of S.tasks) {
    if (t.status === 'done' || !t.due) continue;
    if (groups[t.due]) groups[t.due].push(t);
  }
  let html = `
    <div class="pg-header">
      <div>
        <h1 class="display">Upcoming</h1>
        <div class="pg-sub">Tasks across the next 7 days</div>
      </div>
      <div class="pg-actions"><button class="btn primary" onclick="openQuickAdd()">+ New task</button></div>
    </div>
  `;
  let any = false;
  for (const [iso, list] of Object.entries(groups)) {
    const d = parseDate(iso);
    const label = fmtDate(iso) + ' · ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    if (list.length) {
      any = true;
      html += `<div class="sh"><span>${label}</span><span class="line"></span><span class="muted" style="font-size:11px">${list.length} task${list.length===1?'':'s'}</span></div>`;
      html += `<div class="card" style="padding:0">${list.map(t=>taskRowHTML(t)).join('')}</div>`;
    }
  }
  if (!any) html += `<div class="empty"><div class="empty-icon">📅</div>No upcoming tasks scheduled.</div>`;
  return html;
}

function renderInbox() {
  const tasks = S.tasks.filter(t => !t.campaignId && t.status !== 'done');
  return `
    <div class="pg-header">
      <div>
        <h1 class="display">Inbox</h1>
        <div class="pg-sub">Unassigned tasks not yet tied to a campaign</div>
      </div>
      <div class="pg-actions"><button class="btn primary" onclick="openQuickAdd()">+ New task</button></div>
    </div>
    <div class="card" style="padding:0">
      ${tasks.length ? tasks.map(t=>taskRowHTML(t)).join('') : `<div class="empty"><div class="empty-icon">📥</div>Inbox zero. Lovely.</div>`}
    </div>
  `;
}

function renderFilteredList(title, predicate) {
  const tasks = S.tasks.filter(predicate);
  const q = S.search.toLowerCase();
  const filtered = q ? tasks.filter(t => t.name.toLowerCase().includes(q) || (t.notes||'').toLowerCase().includes(q)) : tasks;
  return `
    <div class="pg-header">
      <div><h1 class="display">${escape(title)}</h1><div class="pg-sub">${filtered.length} task${filtered.length===1?'':'s'}</div></div>
      <div class="pg-actions"><button class="btn primary" onclick="openQuickAdd()">+ New task</button></div>
    </div>
    <div class="card" style="padding:0">
      ${filtered.length ? filtered.map(t=>taskRowHTML(t)).join('') : '<div class="empty">Nothing here.</div>'}
    </div>
  `;
}

function renderRequests() {
  const reqs = S.requests.slice().sort((a,b) => (a.status==='pending'?-1:1) - (b.status==='pending'?-1:1));
  const pending = reqs.filter(r => (r.status||'pending') === 'pending');
  return `
    <div class="pg-header">
      <div>
        <h1 class="display">Requests</h1>
        <div class="pg-sub">Work others are requesting from the marketing team</div>
      </div>
      <div class="pg-actions rw-ok"><button class="btn primary rw-ok" onclick="openNewRequest()">+ New request</button></div>
    </div>

    <div class="metrics" style="margin-bottom:1.5rem">
      <div class="met ${pending.length?'attn':''}"><div class="ml">Pending</div><div class="mv">${pending.length}</div></div>
      <div class="met"><div class="ml">Accepted</div><div class="mv">${reqs.filter(r=>r.status==='accepted').length}</div></div>
      <div class="met"><div class="ml">Rejected</div><div class="mv">${reqs.filter(r=>r.status==='rejected').length}</div></div>
      <div class="met"><div class="ml">This month</div><div class="mv">${reqs.filter(r=>(r.createdAt||'').slice(0,7)===todayISO().slice(0,7)).length}</div></div>
    </div>

    <div class="sh"><span>All requests</span><span class="line"></span></div>
    ${reqs.length ? reqs.map(r => requestCardHTML(r)).join('') : '<div class="empty"><div class="empty-icon">📨</div>No requests yet.</div>'}
  `;
}

function requestCardHTML(r) {
  const status = r.status || 'pending';
  return `
    <div class="req-card ${status}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px">
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:600;margin-bottom:2px" class="display">${escape(r.title)}</div>
          <div style="font-size:12px;color:var(--muted)">From ${escape(r.from||'—')} · ${escape(r.createdAt||'')}</div>
        </div>
        <span class="badge ${status}">${status}</span>
      </div>
      ${r.description?`<div style="font-size:13px;color:var(--ink-2);margin:8px 0">${escape(r.description)}</div>`:''}
      ${status==='rejected' && r.declineReason ? `
        <div style="margin:10px 0;padding:10px 12px;background:var(--danger-bg);border-left:3px solid var(--danger);border-radius:var(--r-sm);font-size:12px">
          <div style="font-weight:700;color:var(--danger);margin-bottom:3px;letter-spacing:0.02em">DECLINED${r.declinedBy?' · '+escape(r.declinedBy):''}${r.declinedAt?' · '+escape(r.declinedAt):''}</div>
          <div style="color:var(--ink-2);line-height:1.45">${escape(r.declineReason)}</div>
        </div>
      ` : ''}
      <div class="row" style="margin-top:10px;font-size:12px;color:var(--muted)">
        ${r.due?`<span>📅 ${fmtDate(r.due)}</span>`:''}
        ${r.priority?`<span class="chip" style="text-transform:capitalize">${r.priority} priority</span>`:''}
      </div>
      ${status==='pending' ? `
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn primary sm" onclick="acceptRequest('${r.id}')">Accept & create task</button>
          <button class="btn danger sm" onclick="rejectRequest('${r.id}')">Reject</button>
          <button class="btn ghost sm" onclick="deleteRequest('${r.id}')">Delete</button>
        </div>
      ` : `
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn ghost sm" onclick="deleteRequest('${r.id}')">Remove</button>
        </div>
      `}
    </div>
  `;
}

function renderDashboard() {
  const active = S.campaigns.filter(c => c.status === 'active').length;
  const planned = S.campaigns.filter(c => c.status === 'planned').length;
  const openTasks = S.tasks.filter(t => t.status !== 'done').length;
  const overdue = S.tasks.filter(t => isOverdue(t.due, t.status)).length;
  const pendingReq = S.requests.filter(r => (r.status||'pending') === 'pending').length;

  return `
    <div class="pg-header">
      <div>
        <h1 class="display">Dashboard</h1>
        <div class="pg-sub">Marketing roadmap at a glance</div>
      </div>
      <div class="pg-actions">
        <button class="btn" onclick="openNewCampaign()">+ New campaign</button>
        <button class="btn primary" onclick="openQuickAdd()">+ Quick task</button>
      </div>
    </div>

    <div class="metrics">
      <div class="met"><div class="ml">Active campaigns</div><div class="mv">${active}</div></div>
      <div class="met"><div class="ml">Planned</div><div class="mv">${planned}</div></div>
      <div class="met"><div class="ml">Open tasks</div><div class="mv">${openTasks}</div></div>
      <div class="met ${overdue?'attn':''}"><div class="ml">Overdue</div><div class="mv">${overdue}</div></div>
      <div class="met ${pendingReq?'attn':''}"><div class="ml">Pending requests</div><div class="mv">${pendingReq}</div></div>
    </div>

    <div class="sh"><span>Campaign roadmap</span><span class="line"></span></div>
    ${renderGantt()}

    <div class="sh"><span>Active campaigns</span><span class="line"></span></div>
    ${S.campaigns.filter(c=>c.status==='active').map(c=>campaignCardHTML(c,false)).join('') || '<div class="empty">No active campaigns yet.</div>'}
  `;
}

function renderGantt() {
  if (!S.campaigns.length) return '<div class="card"><div class="empty"><div class="empty-icon">📊</div>Create your first campaign to see the roadmap.</div></div>';

  // year: current year
  const year = new Date().getFullYear();
  const quarters = ['Q1','Q2','Q3','Q4'];
  const legend = CAMPAIGN_STATUSES.map(s => {
    const colors = { active:'var(--ok)', planned:'var(--navy-500)', done:'var(--muted)', blocked:'var(--danger)' };
    return `<span><span class="sw" style="background:${colors[s]}"></span>${s}</span>`;
  }).join('');

  let rows = '';
  for (const c of S.campaigns) {
    const start = c.startDate ? parseDate(c.startDate) : new Date(year,0,1);
    const end = c.endDate ? parseDate(c.endDate) : new Date(year,11,31);
    const yearStart = new Date(year,0,1);
    const yearEnd = new Date(year,11,31);
    const total = yearEnd - yearStart;
    const left = Math.max(0, (start - yearStart) / total * 100);
    const width = Math.max(2, Math.min(100-left, (end - start) / total * 100));
    const colors = { active:'var(--ok)', planned:'var(--navy-500)', done:'var(--muted)', blocked:'var(--danger)' };
    rows += `
      <div class="gantt-row">
        <div class="gantt-label" title="${escape(c.name)}" onclick="go('campaign',{campaign:'${c.id}'})" style="cursor:pointer">${escape(c.name)}</div>
        <div class="gantt-bar" onclick="go('campaign',{campaign:'${c.id}'})" style="cursor:pointer">
          <div style="left:${left}%;width:${width}%;background:${colors[c.status]||'var(--navy-500)'}" title="${c.startDate||'—'} → ${c.endDate||'—'}"></div>
        </div>
      </div>
    `;
  }
  return `
    <div class="gantt-wrap">
      <div class="gantt-legend">${legend}</div>
      <div class="gantt-months">
        <div></div>${quarters.map(q=>`<div style="text-align:center">${q} ${year}</div>`).join('')}
      </div>
      ${rows}
    </div>
  `;
}

function renderCampaigns() {
  const q = S.search.toLowerCase();
  let list = S.campaigns;
  if (q) list = list.filter(c => c.name.toLowerCase().includes(q) || (c.description||'').toLowerCase().includes(q));
  const statusFilter = S.filter.status;
  if (statusFilter) list = list.filter(c => c.status === statusFilter);

  return `
    <div class="pg-header">
      <div>
        <h1 class="display">Campaigns</h1>
        <div class="pg-sub">${list.length} campaign${list.length===1?'':'s'}</div>
      </div>
      <div class="pg-actions">
        <button class="btn primary" onclick="openNewCampaign()">+ New campaign</button>
      </div>
    </div>

    <div class="filters">
      <select onchange="S.filter.status=this.value;render()">
        <option value="">All statuses</option>
        ${CAMPAIGN_STATUSES.map(s => `<option value="${s}" ${statusFilter===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </div>

    ${list.length ? list.map(c => campaignCardHTML(c, true)).join('') : '<div class="empty"><div class="empty-icon">🚀</div>No campaigns yet.</div>'}
  `;
}

function campaignCardHTML(camp, allowExpand=true) {
  const tasks = S.tasks.filter(t => t.campaignId === camp.id);
  const done = tasks.filter(t => t.status === 'done').length;
  const pct = tasks.length ? Math.round(done/tasks.length * 100) : 0;
  const expanded = S.expandedCampaigns.has(camp.id);
  const img = camp.image ? `<img class="camp-img" src="${escape(camp.image)}" alt="">` :
    `<div class="camp-img" style="background:linear-gradient(135deg, ${camp.color}, ${camp.color}88);display:flex;align-items:center;justify-content:center;font-size:32px;color:white">${escape(camp.name[0]||'C')}</div>`;

  return `
    <div class="camp" style="--accent:${camp.color}">
      <div class="camp-accent"></div>
      <div class="camp-body">
        ${img}
        <div class="camp-content">
          <div class="camp-title">
            <span onclick="go('campaign',{campaign:'${camp.id}'})" style="cursor:pointer">${escape(camp.name)}</span>
            <span class="badge ${camp.status}">${camp.status}</span>
          </div>
          <div class="camp-sub">${camp.startDate||'—'} → ${camp.endDate||'—'}</div>
          ${camp.description?`<div class="camp-desc">${escape(camp.description)}</div>`:''}
          <div class="camp-progress"><div class="camp-progress-fill" style="width:${pct}%"></div></div>
          ${(camp.links&&camp.links.length) ? `<div class="row" style="margin-top:8px;gap:6px">
            ${camp.links.slice(0,3).map(l => `<a href="${escape(l.url)}" target="_blank" rel="noopener" class="chip" style="text-decoration:none">🔗 ${escape(l.label || l.url)}</a>`).join('')}
            ${camp.links.length > 3 ? `<span class="chip">+${camp.links.length-3}</span>` : ''}
          </div>` : ''}
          <div class="camp-footer">
            <span>${done}/${tasks.length} tasks · ${pct}%</span>
            <div class="row">
              <button class="btn xs ghost" onclick="go('campaign',{campaign:'${camp.id}'})">Open →</button>
              ${allowExpand ? `<span class="camp-toggle" onclick="toggleCampExpand('${camp.id}')">${expanded?'Hide':'Show'} tasks ${expanded?'▲':'▼'}</span>` : ''}
            </div>
          </div>
        </div>
      </div>
      ${expanded && allowExpand ? `<div class="camp-tasks-wrap">${tasks.length?tasks.map(t=>taskRowHTML(t,{hideCampaign:true})).join(''):'<div class="empty" style="padding:1.5rem">No tasks yet.</div>'}</div>` : ''}
    </div>
  `;
}

function renderCampaignDetail() {
  const camp = S.campaigns.find(c => c.id === S.activeCampaign);
  if (!camp) return '<div class="empty">Campaign not found.</div>';
  const tasks = S.tasks.filter(t => t.campaignId === camp.id);
  const done = tasks.filter(t => t.status==='done').length;
  const pct = tasks.length ? Math.round(done/tasks.length * 100) : 0;

  // Group tasks by category
  const byCat = {};
  for (const t of tasks) {
    const k = t.categoryId || '_none';
    (byCat[k] = byCat[k] || []).push(t);
  }

  let catHTML = '';
  for (const cat of S.categories) {
    const list = byCat[cat.id] || [];
    if (!list.length) continue;
    catHTML += `
      <div class="sh" style="margin-top:1.5rem"><span style="color:${cat.color}">${cat.icon||''} ${escape(cat.name)}</span><span class="line"></span><span class="muted" style="font-size:11px">${list.length}</span></div>
      <div class="card" style="padding:0">${list.map(t=>taskRowHTML(t,{hideCampaign:true})).join('')}</div>
    `;
  }
  if (byCat._none && byCat._none.length) {
    catHTML += `
      <div class="sh" style="margin-top:1.5rem"><span>Uncategorized</span><span class="line"></span></div>
      <div class="card" style="padding:0">${byCat._none.map(t=>taskRowHTML(t,{hideCampaign:true})).join('')}</div>
    `;
  }

  return `
    <div class="pg-header">
      <div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
          <span class="badge ${camp.status}">${camp.status}</span>
          <span class="muted" style="font-size:12px">${camp.startDate||'—'} → ${camp.endDate||'—'}</span>
        </div>
        <h1 class="display" style="color:${camp.color}">${escape(camp.name)}</h1>
        ${camp.description?`<div class="pg-sub" style="max-width:640px;margin-top:8px;font-size:14px">${escape(camp.description)}</div>`:''}
      </div>
      <div class="pg-actions">
        <button class="btn" onclick="editCampaign('${camp.id}')">Edit</button>
        <button class="btn primary" onclick="openQuickAdd('${camp.id}')">+ Task</button>
      </div>
    </div>

    <div class="metrics">
      <div class="met"><div class="ml">Total tasks</div><div class="mv">${tasks.length}</div></div>
      <div class="met"><div class="ml">Complete</div><div class="mv">${done}</div></div>
      <div class="met"><div class="ml">Progress</div><div class="mv">${pct}%</div></div>
      <div class="met ${tasks.filter(t=>isOverdue(t.due,t.status)).length?'attn':''}"><div class="ml">Overdue</div><div class="mv">${tasks.filter(t=>isOverdue(t.due,t.status)).length}</div></div>
    </div>

    ${tasks.length ? catHTML : '<div class="empty"><div class="empty-icon">📝</div>No tasks yet. Use quick-add to create one.</div>'}
  `;
}

function renderCalendar() {
  const now = new Date();
  const year = S._calYear ?? now.getFullYear();
  const month = S._calMonth ?? now.getMonth();
  const first = new Date(year, month, 1);
  const firstDay = first.getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const weeks = [];
  let cells = [];
  // previous month fillers
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const todayIso = todayISO();

  let grid = '';
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => grid += `<div class="cal-head">${d}</div>`);
  for (const d of cells) {
    if (d === null) { grid += `<div class="cal-cell muted"></div>`; continue; }
    const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayTasks = S.tasks.filter(t => t.due === iso);
    const items = dayTasks.slice(0,4).map(t => {
      const c = S.campaigns.find(x=>x.id===t.campaignId);
      const bg = c ? c.color : (t.status==='done'?'var(--muted)':'var(--navy-500)');
      return `<div class="cal-item ${t.status==='done'?'done':''} ${isOverdue(t.due,t.status)?'overdue':''}" style="background:${bg}" onclick="toggleExpand('${t.id}');go('upcoming')">${escape(t.name)}</div>`;
    }).join('');
    const more = dayTasks.length > 4 ? `<div class="cal-item" style="background:var(--surface-2);color:var(--ink)">+${dayTasks.length-4} more</div>` : '';
    const isToday = iso === todayIso;
    grid += `<div class="cal-cell ${isToday?'today':''}">
      <div class="d">${d}</div>${items}${more}
    </div>`;
  }

  return `
    <div class="pg-header">
      <div>
        <h1 class="display">Calendar</h1>
        <div class="pg-sub">${monthLabel}</div>
      </div>
      <div class="pg-actions">
        <button class="btn sm" onclick="calNav(-1)">‹ Prev</button>
        <button class="btn sm" onclick="calNav(0)">Today</button>
        <button class="btn sm" onclick="calNav(1)">Next ›</button>
      </div>
    </div>
    <div class="cal-grid">${grid}</div>
  `;
}

function calNav(dir) {
  const now = new Date();
  let y = S._calYear ?? now.getFullYear();
  let m = S._calMonth ?? now.getMonth();
  if (dir === 0) { S._calYear = now.getFullYear(); S._calMonth = now.getMonth(); }
  else { m += dir; if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; } S._calYear = y; S._calMonth = m; }
  render();
}

function renderSmart() {
  const f = S.smartFilters.find(x => x.id === S.activeCategory);
  if (!f) return '<div class="empty">Smart list not found.</div>';
  const q = (f.query||'').toLowerCase();
  const list = S.tasks.filter(t => t.status !== 'done' && (t.name.toLowerCase().includes(q) || (t.notes||'').toLowerCase().includes(q)));
  return `
    <div class="pg-header">
      <div><h1 class="display">${escape(f.name)}</h1><div class="pg-sub">Matches "${escape(f.query)}" · ${list.length} task${list.length===1?'':'s'}</div></div>
      <div class="pg-actions"><button class="btn danger sm" onclick="deleteSmartFilter('${f.id}')">Delete list</button></div>
    </div>
    <div class="card" style="padding:0">${list.length ? list.map(t=>taskRowHTML(t)).join('') : '<div class="empty">No matches.</div>'}</div>
  `;
}

// ============================================================
//                    MUTATIONS
// ============================================================
function toggleTask(id) {
  if (!requireEdit()) return;
  const t = S.tasks.find(x=>x.id===id); if (!t) return;
  const wasDone = t.status === 'done';
  t.status = wasDone ? 'not_started' : 'done';
  t.completedAt = !wasDone ? new Date().toISOString() : null;
  if (!wasDone) {
    try { $('#tick-sound').play().catch(()=>{}); } catch(e){}
  }
  scheduleSync();
  render();
}

function toggleExpand(id) {
  if (S.expandedTasks.has(id)) S.expandedTasks.delete(id);
  else S.expandedTasks.add(id);
  render();
}

function toggleCampExpand(id) {
  if (S.expandedCampaigns.has(id)) S.expandedCampaigns.delete(id);
  else S.expandedCampaigns.add(id);
  render();
}

function updateTaskField(id, field, value, skipRender=false) {
  if (!requireEdit()) return;
  const t = S.tasks.find(x=>x.id===id); if (!t) return;
  t[field] = value;
  scheduleSync();
  if (!skipRender) render();
}

function toggleAssignee(tid, uid) {
  if (!requireEdit()) return;
  const t = S.tasks.find(x=>x.id===tid); if (!t) return;
  t.assignees = t.assignees || [];
  const i = t.assignees.indexOf(uid);
  if (i>-1) t.assignees.splice(i,1); else t.assignees.push(uid);
  scheduleSync(); render();
}

function toggleLabel(tid, lid) {
  if (!requireEdit()) return;
  const t = S.tasks.find(x=>x.id===tid); if (!t) return;
  t.labels = t.labels || [];
  const i = t.labels.indexOf(lid);
  if (i>-1) t.labels.splice(i,1); else t.labels.push(lid);
  scheduleSync(); render();
}

function addSubtask(tid) {
  if (!requireEdit()) return;
  const t = S.tasks.find(x=>x.id===tid); if (!t) return;
  t.subtasks = t.subtasks || [];
  t.subtasks.push({ id: uid(), name: 'New sub-task', done: false });
  scheduleSync(); render();
}
function toggleSubtask(tid, sid) {
  if (!requireEdit()) return;
  const t = S.tasks.find(x=>x.id===tid); if (!t) return;
  const s = (t.subtasks||[]).find(x=>x.id===sid); if (!s) return;
  s.done = !s.done;
  scheduleSync(); render();
}
function renameSubtask(tid, sid, name) {
  if (!requireEdit()) return;
  const t = S.tasks.find(x=>x.id===tid); if (!t) return;
  const s = (t.subtasks||[]).find(x=>x.id===sid); if (!s) return;
  s.name = name;
  scheduleSync();
}
function deleteSubtask(tid, sid) {
  if (!requireEdit()) return;
  const t = S.tasks.find(x=>x.id===tid); if (!t) return;
  t.subtasks = (t.subtasks||[]).filter(x=>x.id!==sid);
  scheduleSync(); render();
}

function addComment(tid, text) {
  if (!text.trim()) return;
  const t = S.tasks.find(x=>x.id===tid); if (!t) return;
  t.comments = t.comments || [];
  t.comments.push({ id: uid(), author: (S.currentUser && S.currentUser.name) || S.team[0]?.name || 'Someone', text, at: new Date().toLocaleDateString() });
  scheduleSync(); render();
}

function deleteTask(tid) {
  if (!requireEdit()) return;
  if (!confirm('Delete this task?')) return;
  S.tasks = S.tasks.filter(t => t.id !== tid);
  S.expandedTasks.delete(tid);
  scheduleSync(); render();
}

function attachInlineEdits() {
  // Placeholder — inline editing for task titles could be added here
}

// ---- Quick add ----
function openQuickAdd(campId) {
  if (!requireEdit()) return;
  $('#qa-modal').classList.add('open');
  $('#qa-name').value = '';
  $('#qa-due').value = '';
  $('#qa-prio').value = '';
  const campSel = $('#qa-camp');
  campSel.innerHTML = `<option value="">No campaign</option>` + S.campaigns.map(c =>
    `<option value="${c.id}" ${campId===c.id?'selected':''}>${escape(c.name)}</option>`
  ).join('');
  const whoSel = $('#qa-who');
  whoSel.innerHTML = `<option value="">Unassigned</option>` + S.team.map(m =>
    `<option value="${m.id}">${escape(m.name)}</option>`
  ).join('');
  setTimeout(() => $('#qa-name').focus(), 50);
}
function closeQuickAdd() { $('#qa-modal').classList.remove('open'); }
function saveQuickAdd() {
  if (!requireEdit()) return;
  const name = $('#qa-name').value.trim();
  if (!name) { toast('Task name required', 'error'); return; }
  S.tasks.push({
    id: uid(),
    name,
    campaignId: $('#qa-camp').value || '',
    due: $('#qa-due').value || '',
    priority: $('#qa-prio').value || '',
    assignees: $('#qa-who').value ? [$('#qa-who').value] : [],
    status: 'not_started',
    notes: '',
    labels: [],
    subtasks: [],
    comments: [],
    createdAt: new Date().toISOString(),
  });
  scheduleSync(); render(); closeQuickAdd();
  toast('Task created', 'success');
}

// ---- Campaigns ----
function openNewCampaign(e) {
  if (!requireEdit()) return;
  if (e) e.stopPropagation();
  const modal = makeModal('New campaign', `
    <div class="exp-label">Name</div>
    <input id="nc-name" class="field" placeholder="Summer activation, brand launch…" style="margin-bottom:10px">
    <div class="exp-grid">
      <div><div class="exp-label">Start</div><input id="nc-start" type="date" class="field"></div>
      <div><div class="exp-label">End</div><input id="nc-end" type="date" class="field"></div>
      <div><div class="exp-label">Color</div><input id="nc-color" type="color" class="field" value="#3B82F6" style="height:38px;padding:2px"></div>
      <div><div class="exp-label">Status</div><select id="nc-status" class="field">${CAMPAIGN_STATUSES.map(s=>`<option>${s}</option>`).join('')}</select></div>
    </div>
    <div class="exp-label">Description / brief</div>
    <textarea id="nc-desc" class="field" rows="3" placeholder="Campaign objectives, audience, key messaging…"></textarea>
  `, () => {
    const name = $('#nc-name').value.trim();
    if (!name) { toast('Name required','error'); return false; }
    S.campaigns.push({
      id: uid(),
      name,
      startDate: $('#nc-start').value,
      endDate: $('#nc-end').value,
      color: $('#nc-color').value,
      status: $('#nc-status').value,
      description: $('#nc-desc').value,
      createdAt: new Date().toISOString()
    });
    scheduleSync(); render();
    toast('Campaign created','success');
  });
  setTimeout(()=>$('#nc-name').focus(), 50);
}

function editCampaign(id) {
  if (!requireEdit()) return;
  const c = S.campaigns.find(x=>x.id===id); if (!c) return;
  makeModal('Edit campaign', `
    <div class="exp-label">Name</div>
    <input id="ec-name" class="field" value="${escape(c.name)}" style="margin-bottom:10px">
    <div class="exp-grid">
      <div><div class="exp-label">Start</div><input id="ec-start" type="date" class="field" value="${c.startDate||''}"></div>
      <div><div class="exp-label">End</div><input id="ec-end" type="date" class="field" value="${c.endDate||''}"></div>
      <div><div class="exp-label">Color</div><input id="ec-color" type="color" class="field" value="${c.color||'#3B82F6'}" style="height:38px;padding:2px"></div>
      <div><div class="exp-label">Status</div><select id="ec-status" class="field">${CAMPAIGN_STATUSES.map(s=>`<option ${c.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
    </div>
    <div class="exp-label">Description</div>
    <textarea id="ec-desc" class="field" rows="3">${escape(c.description||'')}</textarea>

    <div class="exp-label" style="margin-top:14px">Links</div>
    ${campLinksHTML(c)}
    <div class="link-form">
      <input class="field" placeholder="Label" id="cllbl-${c.id}">
      <input class="field" placeholder="https://…" id="clurl-${c.id}">
      <button class="btn sm" onclick="addCampLink('${c.id}')">Add</button>
    </div>
    <hr>
    <button class="btn danger sm" onclick="deleteCampaign('${c.id}')">Delete campaign</button>
  `, () => {
    c.name = $('#ec-name').value.trim() || c.name;
    c.startDate = $('#ec-start').value;
    c.endDate = $('#ec-end').value;
    c.color = $('#ec-color').value;
    c.status = $('#ec-status').value;
    c.description = $('#ec-desc').value;
    scheduleSync(); render();
  });
}

function deleteCampaign(id) {
  if (!requireEdit()) return;
  if (!confirm('Delete this campaign and all its tasks?')) return;
  S.campaigns = S.campaigns.filter(c => c.id !== id);
  S.tasks = S.tasks.filter(t => t.campaignId !== id);
  closeAnyModal();
  if (S.activeCampaign === id) S.view = 'campaigns';
  scheduleSync(); render();
}

// ---- Requests ----
function openNewRequest() {
  makeModal('New request', `
    <div class="exp-label">Title</div>
    <input id="nr-title" class="field rw-ok" placeholder="What do you need from marketing?" style="margin-bottom:10px">
    <div class="exp-grid">
      <div><div class="exp-label">From</div><input id="nr-from" class="field rw-ok" placeholder="Your name or team"></div>
      <div><div class="exp-label">Due</div><input id="nr-due" type="date" class="field rw-ok"></div>
      <div><div class="exp-label">Priority</div><select id="nr-prio" class="field rw-ok"><option value="">None</option><option>high</option><option>med</option><option>low</option></select></div>
    </div>
    <div class="exp-label">Details</div>
    <textarea id="nr-desc" class="field rw-ok" rows="3"></textarea>
  `, () => {
    const title = $('#nr-title').value.trim();
    if (!title) { toast('Title required','error'); return false; }
    S.requests.push({
      id: uid(), title,
      from: ($('#nr-from').value || (S.currentUser && S.currentUser.name) || ''),
      due: $('#nr-due').value,
      priority: $('#nr-prio').value, description: $('#nr-desc').value,
      status: 'pending',
      createdAt: new Date().toLocaleDateString(),
      submittedByEmail: (S.currentUser && S.currentUser.email) || ''
    });
    scheduleSync(); render();
    toast('Request submitted','success');
  }, { rwOk: true, saveLabel: 'Submit request' });

  // Pre-fill "From" with the signed-in user's name so members don't
  // have to type it every time. They can still edit it.
  setTimeout(() => {
    const fromInput = $('#nr-from');
    if (fromInput && S.currentUser && !fromInput.value) {
      fromInput.value = S.currentUser.name || '';
    }
    const titleInput = $('#nr-title');
    if (titleInput) titleInput.focus();
  }, 40);
}

function acceptRequest(id) {
  if (!requireEdit()) return;
  const r = S.requests.find(x=>x.id===id); if (!r) return;
  r.status = 'accepted';
  S.tasks.push({
    id: uid(),
    name: r.title,
    notes: r.description || '',
    due: r.due || '',
    priority: r.priority || '',
    status: 'not_started',
    assignees: [], labels: [], subtasks: [], comments: [],
    createdAt: new Date().toISOString(),
    fromRequest: r.id
  });
  scheduleSync(); render();
  toast('Task created','success');
}
function rejectRequest(id) {
  if (!requireEdit()) return;
  const r = S.requests.find(x=>x.id===id); if (!r) return;
  makeModal('Decline request', `
    <div style="font-size:13px;color:var(--muted);margin-bottom:12px">Declining <strong style="color:var(--ink)">${escape(r.title)}</strong>. Add a reason so the requester knows why.</div>
    <div class="exp-label">Reason for declining</div>
    <textarea id="rj-reason" class="field" rows="3" placeholder="e.g. Out of scope for this quarter — please resubmit for Q3."></textarea>
    <div style="font-size:11px;color:var(--muted);margin-top:6px">Optional, but strongly recommended. The reason will be shown on the request card.</div>
  `, () => {
    r.status = 'rejected';
    r.declineReason = (($('#rj-reason')||{}).value || '').trim();
    r.declinedAt = new Date().toLocaleDateString();
    r.declinedBy = (S.currentUser && S.currentUser.name) || '';
    scheduleSync(); render();
    toast('Request declined','info');
  });
  setTimeout(() => { const el = $('#rj-reason'); if (el) el.focus(); }, 50);
}
function deleteRequest(id) {
  if (!requireEdit()) return;
  S.requests = S.requests.filter(r => r.id !== id);
  scheduleSync(); render();
}

// ---- Smart filter ----
function openNewSmartFilter(e) {
  if (!requireEdit()) return;
  if (e) e.stopPropagation();
  makeModal('New smart list', `
    <div class="exp-label">Name</div>
    <input id="sf-name" class="field" placeholder="My stuff, Launch week…" style="margin-bottom:10px">
    <div class="exp-label">Match text</div>
    <input id="sf-query" class="field" placeholder="Search term to match task name or notes">
  `, () => {
    const name = $('#sf-name').value.trim();
    const q = $('#sf-query').value.trim();
    if (!name || !q) { toast('Fill both','error'); return false; }
    S.smartFilters.push({ id: uid(), name, query: q });
    scheduleSync(); render();
  });
}
function deleteSmartFilter(id) {
  if (!requireEdit()) return;
  if (!confirm('Delete this smart list?')) return;
  S.smartFilters = S.smartFilters.filter(f => f.id !== id);
  S.view = 'today';
  scheduleSync(); render();
}

// ---- Modal ----
function makeModal(title, bodyHTML, onSave, opts) {
  opts = opts || {};
  closeAnyModal();
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop open' + (opts.rwOk ? ' rw-ok' : '');
  bd.id = '_modal';
  bd.innerHTML = `
    <div class="modal${opts.rwOk ? ' rw-ok' : ''}" onclick="event.stopPropagation()">
      <h2 class="display">${escape(title)}</h2>
      <div>${bodyHTML}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button class="btn" onclick="closeAnyModal()">Cancel</button>
        <button class="btn primary${opts.rwOk ? ' rw-ok' : ''}" id="_modalSave">${escape(opts.saveLabel || 'Save')}</button>
      </div>
    </div>
  `;
  bd.addEventListener('click', e => { if (e.target === bd) closeAnyModal(); });
  document.body.appendChild(bd);
  $('#_modalSave').addEventListener('click', () => {
    const r = onSave && onSave();
    if (r !== false) closeAnyModal();
  });
}
function closeAnyModal() {
  const m = $('#_modal'); if (m) m.remove();
}

// ---- Settings panel ----
function openSettings() {
  $('#settings-bd').classList.add('open');
  $('#settings').classList.add('open');
  renderSettings();
}
function closeSettings() {
  $('#settings-bd').classList.remove('open');
  $('#settings').classList.remove('open');
}

function renderSettings() {
  const body = $('#settings-body');
  const isOwner = S.role === 'owner';
  const canEdit = isOwner || S.role === 'admin';
  body.innerHTML = `
    <div class="sh"><span>Your role</span><span class="line"></span></div>
    <div class="drag-item" style="cursor:default">
      <div class="sb-avatar" style="width:28px;height:28px;font-size:11px;background:${(S.currentUser&&S.currentUser.color)||'var(--navy-500)'}">${initials((S.currentUser&&S.currentUser.name)||'?')}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13px">${escape((S.currentUser&&S.currentUser.name)||'—')}
          <span class="role-badge ${S.role||'member'}">${S.role||'member'}</span>
        </div>
        <div style="font-size:11px;color:var(--muted);font-family:'JetBrains Mono',monospace">${escape((S.currentUser&&S.currentUser.email)||'')}</div>
      </div>
    </div>

    <div class="sh" style="margin-top:1.5rem"><span>Team</span><span class="line"></span>${canEdit?'<button class="btn xs" onclick="addMember()">+ Add</button>':''}</div>
    <div id="team-list">
      ${S.team.map(m => `
        <div class="drag-item" data-id="${m.id}">
          <span class="drag-handle">⠿</span>
          <div class="sb-avatar" style="width:24px;height:24px;font-size:10px;background:${m.color||'var(--navy-500)'}">${initials(m.name)}</div>
          <div style="flex:1;min-width:0">
            <input class="field" value="${escape(m.name)}" style="border:none;background:transparent;padding:2px;font-size:13px;font-weight:600" onchange="updateMemberField('${m.id}','name',this.value)">
            <input class="field" value="${escape(m.email||'')}" style="border:none;background:transparent;padding:2px;font-size:11px;color:var(--muted);font-family:'JetBrains Mono',monospace" placeholder="email@${ALLOWED_DOMAIN}" onchange="updateMemberField('${m.id}','email',this.value)">
            <input class="field" value="${escape(m.role||'')}" style="border:none;background:transparent;padding:2px;font-size:11px;color:var(--muted)" placeholder="Role" onchange="updateMemberField('${m.id}','role',this.value)">
          </div>
          <button class="btn xs danger" onclick="removeMember('${m.id}')">×</button>
        </div>
      `).join('')}
    </div>

    ${isOwner ? `
      <div class="sh" style="margin-top:1.5rem"><span>Admins</span><span class="line"></span><button class="btn xs" onclick="addAdmin()">+ Add</button></div>
      <div>
        ${(S.admins||[]).map(e => `
          <div class="drag-item" style="cursor:default">
            <span class="drag-handle" style="opacity:0">⠿</span>
            <span style="flex:1;font-family:'JetBrains Mono',monospace;font-size:12px">${escape(e)}</span>
            <button class="btn xs danger" onclick="removeAdmin('${escape(e)}')">×</button>
          </div>
        `).join('') || '<div class="note-muted">No sub-admins yet. Add a teammate’s @1-group.sg email to grant edit access.</div>'}
      </div>
      <div class="note-muted">Owner and admins can edit. Other @1-group.sg members have read-only access.</div>
    ` : ''}

    <div class="sh" style="margin-top:1.5rem"><span>Labels</span><span class="line"></span>${canEdit?'<button class="btn xs" onclick="addLabel()">+ Add</button>':''}</div>
    <div id="labels-list">
      ${S.labels.map(l => `
        <div class="drag-item" data-id="${l.id}">
          <span class="drag-handle">⠿</span>
          <input type="color" value="${l.color}" style="width:24px;height:24px;border:none;background:transparent;padding:0" onchange="updateLabelField('${l.id}','color',this.value)">
          <input class="field" value="${escape(l.name)}" style="flex:1;border:none;background:transparent;padding:2px;font-size:13px" onchange="updateLabelField('${l.id}','name',this.value)">
          <button class="btn xs danger" onclick="removeLabel('${l.id}')">×</button>
        </div>
      `).join('')}
    </div>

    <div class="sh" style="margin-top:1.5rem"><span>Categories</span><span class="line"></span>${canEdit?'<button class="btn xs" onclick="addCategory()">+ Add</button>':''}</div>
    <div id="categories-list">
      ${S.categories.map(c => `
        <div class="drag-item" data-id="${c.id}">
          <span class="drag-handle">⠿</span>
          <input type="color" value="${c.color}" style="width:24px;height:24px;border:none;background:transparent;padding:0" onchange="updateCategoryField('${c.id}','color',this.value)">
          <input class="field" value="${escape(c.name)}" style="flex:1;border:none;background:transparent;padding:2px;font-size:13px" onchange="updateCategoryField('${c.id}','name',this.value)">
          <button class="btn xs danger" onclick="removeCategory('${c.id}')">×</button>
        </div>
      `).join('')}
    </div>

    <div class="sh" style="margin-top:1.5rem"><span>Workspace</span><span class="line"></span></div>
    <div class="drag-item" style="cursor:default">
      <span style="flex:1">Share link</span>
      <button class="btn xs" onclick="showShareURL()">Copy</button>
    </div>
    <div class="drag-item" style="cursor:default">
      <span style="flex:1">Sign out</span>
      <button class="btn xs danger" onclick="signOut()">Forget key</button>
    </div>
  `;

  // Wire up drag-sort (only if user can edit)
  if (canEdit) {
    enableDragSort('#team-list', S.team, () => { scheduleSync(); renderSettings(); render(); });
    enableDragSort('#labels-list', S.labels, () => { scheduleSync(); renderSettings(); render(); });
    enableDragSort('#categories-list', S.categories, () => { scheduleSync(); renderSettings(); render(); });
  }
}

function updateMemberField(id, field, value) {
  if (!requireEdit()) return;
  const m = S.team.find(x => x.id === id); if (!m) return;
  m[field] = value;
  scheduleSync(); render();
}
function updateLabelField(id, field, value) {
  if (!requireEdit()) return;
  const l = S.labels.find(x => x.id === id); if (!l) return;
  l[field] = value;
  scheduleSync(); render();
}
function updateCategoryField(id, field, value) {
  if (!requireEdit()) return;
  const c = S.categories.find(x => x.id === id); if (!c) return;
  c[field] = value;
  scheduleSync(); render();
}

function addMember() {
  if (!requireEdit()) return;
  const name = prompt('Team member name?'); if (!name) return;
  S.team.push({ id: uid(), name, role: '', color: '#'+Math.floor(Math.random()*16777215).toString(16).padStart(6,'0') });
  scheduleSync(); renderSettings(); render();
}
function removeMember(id) {
  if (!requireEdit()) return;
  if (!confirm('Remove this member?')) return;
  S.team = S.team.filter(m => m.id !== id);
  scheduleSync(); renderSettings(); render();
}
function addLabel() {
  if (!requireEdit()) return;
  const name = prompt('Label name?'); if (!name) return;
  S.labels.push({ id: uid(), name, color: '#'+Math.floor(Math.random()*16777215).toString(16).padStart(6,'0') });
  scheduleSync(); renderSettings(); render();
}
function removeLabel(id) {
  if (!requireEdit()) return;
  S.labels = S.labels.filter(l => l.id !== id);
  for (const t of S.tasks) t.labels = (t.labels||[]).filter(x=>x!==id);
  scheduleSync(); renderSettings(); render();
}
function addCategory() {
  if (!requireEdit()) return;
  const name = prompt('Category name?'); if (!name) return;
  S.categories.push({ id: uid(), name, color: '#'+Math.floor(Math.random()*16777215).toString(16).padStart(6,'0'), icon: '' });
  scheduleSync(); renderSettings(); render();
}
function removeCategory(id) {
  if (!requireEdit()) return;
  if (!confirm('Remove category?')) return;
  S.categories = S.categories.filter(c => c.id !== id);
  scheduleSync(); renderSettings(); render();
}

function signOut() {
  if (!confirm('Forget this workspace on this device?')) return;
  localStorage.removeItem(LS.KEYS);
  localStorage.removeItem(LS.BIN);
  localStorage.removeItem(LS.USER);
  location.reload();
}

// ============================================================
//                    MY WORK VIEW
// ============================================================
function renderMyWork() {
  const me = S.currentUser;
  if (!me) return '<div class="empty">Sign in to see your work.</div>';

  // Resolve my team id (may need backfill if not set)
  let myId = me.id;
  if (!myId) {
    const match = S.team.find(m =>
      (m.email && m.email.toLowerCase() === (me.email||'').toLowerCase()) ||
      m.name === me.name);
    if (match) { myId = match.id; me.id = match.id; }
  }

  const my = S.tasks.filter(t => myId && (t.assignees||[]).includes(myId));
  const open = my.filter(t => t.status !== 'done');
  const overdue = open.filter(t => isOverdue(t.due, t.status));
  const dueToday = open.filter(t => isToday(t.due));
  const upcoming = open.filter(t => !isOverdue(t.due, t.status) && !isToday(t.due) && t.due);
  const noDate = open.filter(t => !t.due);
  const doneRecent = my.filter(t => t.status === 'done').slice(-12).reverse();

  const section = (label, list, extra='') =>
    list.length ? `
      <div class="sh"><span>${label}</span><span class="line"></span><span class="muted" style="font-size:11px">${list.length}</span></div>
      <div class="card" style="padding:0">${list.map(t=>taskRowHTML(t)).join('')}</div>
    ` : '';

  const body = open.length || doneRecent.length ? (
    section('⚠ Overdue', overdue) +
    section('Due today', dueToday) +
    section('Upcoming', upcoming) +
    section('No due date', noDate) +
    (doneRecent.length ? `
      <div class="sh" style="margin-top:1.5rem"><span>Recently completed</span><span class="line"></span></div>
      <div class="card" style="padding:0">${doneRecent.map(t=>taskRowHTML(t)).join('')}</div>
    ` : '')
  ) : `<div class="empty mywork-empty"><div class="empty-icon">✨</div>Nothing assigned to you right now.</div>`;

  return `
    <div class="pg-header">
      <div>
        <h1 class="display">My work</h1>
        <div class="pg-sub">Tasks assigned to ${escape(me.name)} · ${open.length} open</div>
      </div>
      ${S.role === 'owner' || S.role === 'admin' ? '<div class="pg-actions"><button class="btn primary" onclick="openQuickAdd()">+ New task</button></div>' : ''}
    </div>

    <div class="metrics">
      <div class="met ${overdue.length?'attn':''}"><div class="ml">Overdue</div><div class="mv">${overdue.length}</div></div>
      <div class="met"><div class="ml">Due today</div><div class="mv">${dueToday.length}</div></div>
      <div class="met"><div class="ml">Open</div><div class="mv">${open.length}</div></div>
      <div class="met"><div class="ml">Completed</div><div class="mv">${my.filter(t=>t.status==='done').length}</div></div>
    </div>

    ${body}
  `;
}

// ============================================================
//                    LINKS (tasks + campaigns)
// ============================================================
function taskLinksHTML(t) {
  const rows = (t.links||[]).map((l, i) => `
    <div class="link-row">
      <svg class="link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
      <a href="${escape(l.url)}" target="_blank" rel="noopener">${escape(l.label || l.url)}</a>
      <button class="btn xs danger" onclick="removeTaskLink('${t.id}',${i})" title="Remove">×</button>
    </div>
  `).join('');
  return `
    <div class="exp-label" style="margin-top:14px">Links</div>
    <div id="tlinks-${t.id}">${rows || '<div class="muted" style="font-size:12px">No links yet.</div>'}</div>
    <div class="link-form">
      <input class="field" placeholder="Label" id="tlbl-${t.id}">
      <input class="field" placeholder="https://…" id="turl-${t.id}">
      <button class="btn sm" onclick="addTaskLink('${t.id}')">Add</button>
    </div>
  `;
}
function addTaskLink(tid) {
  if (!requireEdit()) return;
  const t = S.tasks.find(x=>x.id===tid); if (!t) return;
  const url = ($('#turl-'+tid) || {}).value; const label = ($('#tlbl-'+tid) || {}).value;
  if (!url || !url.trim()) { toast('URL required','error'); return; }
  let u = url.trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  t.links = t.links || [];
  t.links.push({ label: (label||'').trim() || u, url: u });
  scheduleSync(); render();
}
function removeTaskLink(tid, idx) {
  if (!requireEdit()) return;
  const t = S.tasks.find(x=>x.id===tid); if (!t) return;
  (t.links||[]).splice(idx, 1);
  scheduleSync(); render();
}
function addCampLink(cid) {
  if (!requireEdit()) return;
  const c = S.campaigns.find(x=>x.id===cid); if (!c) return;
  const url = ($('#clurl-'+cid) || {}).value; const label = ($('#cllbl-'+cid) || {}).value;
  if (!url || !url.trim()) { toast('URL required','error'); return; }
  let u = url.trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  c.links = c.links || [];
  c.links.push({ label: (label||'').trim() || u, url: u });
  scheduleSync(); render();
  // refresh modal if open
  const host = $('#clinks-'+cid); if (host) host.outerHTML = campLinksHTML(c);
}
function removeCampLink(cid, idx) {
  if (!requireEdit()) return;
  const c = S.campaigns.find(x=>x.id===cid); if (!c) return;
  (c.links||[]).splice(idx, 1);
  scheduleSync(); render();
  const host = $('#clinks-'+cid); if (host) host.outerHTML = campLinksHTML(c);
}
function campLinksHTML(c) {
  const rows = (c.links||[]).map((l, i) => `
    <div class="link-row">
      <svg class="link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
      <a href="${escape(l.url)}" target="_blank" rel="noopener">${escape(l.label || l.url)}</a>
      <button class="btn xs danger" onclick="removeCampLink('${c.id}',${i})" title="Remove">×</button>
    </div>
  `).join('');
  return `<div id="clinks-${c.id}">${rows || '<div class="muted" style="font-size:12px">No links yet.</div>'}</div>`;
}

// ============================================================
//                    ADMINS (owner only)
// ============================================================
function addAdmin() {
  if (!requireOwner()) return;
  const raw = prompt('Admin email (@' + ALLOWED_DOMAIN + '):');
  if (!raw) return;
  const e = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { toast('Invalid email','error'); return; }
  if (e.split('@')[1] !== ALLOWED_DOMAIN) { toast('Must be @' + ALLOWED_DOMAIN,'error'); return; }
  if (e === OWNER_EMAIL) { toast('Owner is already privileged','info'); return; }
  S.admins = S.admins || [];
  if (S.admins.map(x => (x||'').toLowerCase()).includes(e)) { toast('Already an admin','info'); return; }
  S.admins.push(e);
  scheduleSync(); renderSettings(); toast('Admin added','success');
}
function removeAdmin(email) {
  if (!requireOwner()) return;
  if (!confirm('Remove ' + email + ' as admin?')) return;
  S.admins = (S.admins || []).filter(x => (x||'').toLowerCase() !== (email||'').toLowerCase());
  scheduleSync(); renderSettings();
}

// ============================================================
//                    DRAG-SORT HELPER
// ============================================================
function enableDragSort(containerSel, arr, onDone) {
  const container = document.querySelector(containerSel);
  if (!container) return;
  const items = Array.from(container.querySelectorAll(':scope > [data-id]'));
  let dragging = null;
  items.forEach(el => {
    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', (e) => {
      dragging = el;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', el.dataset.id); } catch(_){}
    });
    el.addEventListener('dragend', () => {
      if (dragging) dragging.classList.remove('dragging');
      items.forEach(x => x.classList.remove('drag-over-top','drag-over-bottom'));
      // rebuild order
      const order = Array.from(container.querySelectorAll(':scope > [data-id]')).map(x => x.dataset.id);
      const byId = new Map(arr.map(x => [x.id, x]));
      arr.length = 0;
      for (const id of order) { const obj = byId.get(id); if (obj) arr.push(obj); }
      dragging = null;
      if (onDone) onDone();
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragging || dragging === el) return;
      const rect = el.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      el.classList.toggle('drag-over-top', e.clientY < mid);
      el.classList.toggle('drag-over-bottom', e.clientY >= mid);
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over-top','drag-over-bottom');
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!dragging || dragging === el) return;
      const rect = el.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (e.clientY < mid) container.insertBefore(dragging, el);
      else container.insertBefore(dragging, el.nextSibling);
    });
  });
}

// ============================================================
//                    BOOTSTRAP
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
  // Set logos from inline base64
  const setupImg = document.getElementById('setup-logo-img');
  if (setupImg && window.LOGO_NAVY) setupImg.src = window.LOGO_NAVY;
  const authImg = document.getElementById('auth-logo-img');
  if (authImg && window.LOGO_NAVY) authImg.src = window.LOGO_NAVY;

  // apply theme early (works on gate screens too)
  const savedTheme = localStorage.getItem(LS.THEME);
  if (savedTheme === 'dark') { S.dark = true; document.documentElement.classList.add('dark'); }

  // Restore current user (auth gate)
  const savedUserRaw = localStorage.getItem(LS.USER);
  let savedUser = null;
  if (savedUserRaw) {
    try { savedUser = JSON.parse(savedUserRaw); } catch(e) {}
  }
  if (savedUser && savedUser.email && savedUser.email.endsWith('@' + ALLOWED_DOMAIN)) {
    S.currentUser = savedUser;
    // Tentative role from saved state — final role resolves after bin load
    S.role = savedUser.role || (savedUser.email.toLowerCase() === OWNER_EMAIL ? 'owner' : 'member');
  } else {
    // no valid user → show gate, stop here
    showAuthGate();
    // still wire Enter handler on auth input
    $('#auth-email').addEventListener('keydown', e => { if (e.key === 'Enter') doAuth(); });
    $('#auth-pw').addEventListener('keydown', e => { if (e.key === 'Enter') doAuth(); });
    $('#sc-key').addEventListener('keydown', e => { if (e.key === 'Enter') doSetup(); });
    return;
  }

  // ---- user is authed; continue to workspace setup / auto-login ----
  // auto-login if key + bin saved
  const savedKey = localStorage.getItem(LS.KEYS);
  const urlBin = new URLSearchParams(location.search).get('bin');
  const savedBin = localStorage.getItem(LS.BIN);
  const bin = urlBin || savedBin;

  showSetupScreen();

  if (savedKey && bin) {
    $('#sc-key').value = savedKey;
    $('#sc-btn').textContent = 'Reconnecting…';
    $('#sc-btn').disabled = true;
    (async () => {
      try {
        const r = await fetch(`https://api.jsonbin.io/v3/b/${bin}/latest`, {
          headers: { 'X-Master-Key': savedKey }
        });
        if (!r.ok) throw new Error('auth');
        const j = await r.json();
        hydrateState(j.record || {});
        S.binId = bin; S.apiKey = savedKey;
        const u = new URL(location); u.searchParams.set('bin', bin); history.replaceState(null,'',u);
        startApp();
      } catch(e) {
        $('#sc-btn').textContent = 'Connect';
        $('#sc-btn').disabled = false;
      }
    })();
  }

  // handle Enter in setup + auth
  $('#sc-key').addEventListener('keydown', e => { if (e.key === 'Enter') doSetup(); });
  $('#auth-email').addEventListener('keydown', e => { if (e.key === 'Enter') doAuth(); });
  $('#auth-pw').addEventListener('keydown', e => { if (e.key === 'Enter') doAuth(); });

  // QA modal Enter
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeAnyModal(); closeQuickAdd(); closeSettings(); }
    if (e.key === 'n' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) {
      openQuickAdd();
    }
  });
});

// expose for inline handlers
Object.assign(window, {
  doSetup, doAuth, signOutAuth, toggleSidebar, toggleTheme, manualRefresh, showShareURL,
  go, toggleTask, toggleExpand, toggleCampExpand, updateTaskField,
  toggleAssignee, toggleLabel, addSubtask, toggleSubtask, renameSubtask, deleteSubtask,
  addComment, deleteTask,
  openQuickAdd, closeQuickAdd, saveQuickAdd,
  openNewCampaign, editCampaign, deleteCampaign,
  openNewRequest, acceptRequest, rejectRequest, deleteRequest,
  openNewSmartFilter, deleteSmartFilter,
  openSettings, closeSettings, closeMobileSidebar,
  addMember, removeMember, addLabel, removeLabel, addCategory, removeCategory, signOut,
  calNav, closeAnyModal,
  // 12-point additions
  addAdmin, removeAdmin,
  addTaskLink, removeTaskLink, addCampLink, removeCampLink,
  updateMemberField, updateLabelField, updateCategoryField,
  renderMyWork, myWorkCount,
});
