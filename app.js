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
  binId: '',
  apiKey: '',
  syncing: false,
  lastSync: null,
  _syncTimer: null,
  _pollTimer: null,
  _revision: 0,
};

const LS = {
  KEYS: 'oneg.apiKey',
  BIN:  'oneg.binId',
  THEME:'oneg.theme',
  NAV:  'oneg.sidebarCollapsed',
};

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
    _revision: 0,
  };
}

function hydrateState(record) {
  S.team = record.team || [];
  S.categories = record.categories || DEFAULT_CATEGORIES.slice();
  S.campaigns = record.campaigns || [];
  S.tasks = record.tasks || [];
  S.requests = record.requests || [];
  S.labels = record.labels || [];
  S.smartFilters = record.smartFilters || [];
  S._revision = record._revision || 0;

  // Legacy-shape migration: old tool may have used different field names
  for (const t of S.tasks) {
    if (!t.id) t.id = uid();
    if (!t.name && t.title) t.name = t.title;
    if (!t.name && t.task) t.name = t.task;
    if (!t.name && t.text) t.name = t.text;
    if (!t.name) t.name = 'Untitled task';
    if (!t.campaignId && t.campaign) t.campaignId = t.campaign;
    if (!t.categoryId && t.category) t.categoryId = t.category;
    if (!t.due && t.dueDate) t.due = t.dueDate;
    if (!t.due && t.deadline) t.due = t.deadline;
    if (!t.assignees) {
      if (Array.isArray(t.assignee)) t.assignees = t.assignee;
      else if (t.assignee) t.assignees = [t.assignee];
      else if (Array.isArray(t.owners)) t.assignees = t.owners;
      else if (Array.isArray(t.who)) t.assignees = t.who;
      else t.assignees = [];
    }
    if (!t.status) {
      if (t.completed === true || t.done === true) t.status = 'done';
      else if (t.state) t.status = t.state;
      else t.status = 'not_started';
    }
    if (!t.subtasks) t.subtasks = [];
    if (!t.notes) t.notes = t.description || t.details || '';
    if (!t.labels) t.labels = [];
    if (!t.priority) t.priority = '';
    if (!t.comments) t.comments = [];
  }
  for (const c of S.campaigns) {
    if (!c.status) c.status = 'planned';
    if (!c.color) c.color = '#3B82F6';
    if (!c.startDate && c.start) c.startDate = c.start;
    if (!c.endDate && c.end) c.endDate = c.end;
  }
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
  const me = S.team[0];
  if (me) {
    $('#user-avatar').textContent = initials(me.name);
    $('#user-name').textContent = me.name;
  }
}

// --- SIDEBAR ----------
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
    today: 'Today', upcoming: 'Upcoming', inbox: 'Inbox', calendar: 'Calendar',
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
          ${whoChips}${moreWho}${campChip}${labelChips}${subChip}
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
        <input class="field" id="cmt-${t.id}" placeholder="Add a comment…" style="flex:1" onkeydown="if(event.key==='Enter')addComment('${t.id}',this.value),this.value=''">
        <button class="btn danger sm" onclick="deleteTask('${t.id}')">Delete</button>
      </div>
    </div>
  `;
}

// ============================================================
//                    VIEW RENDERERS
// ============================================================
function renderToday() {
  const me = S.team[0]?.name || 'there';
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
      <div class="pg-actions"><button class="btn primary" onclick="openNewRequest()">+ New request</button></div>
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
  const t = S.tasks.find(x=>x.id===id); if (!t) return;
  t[field] = value;
  scheduleSync();
  if (!skipRender) render();
}

function toggleAssignee(tid, uid) {
  const t = S.tasks.find(x=>x.id===tid); if (!t) return;
  t.assignees = t.assignees || [];
  const i = t.assignees.indexOf(uid);
  if (i>-1) t.assignees.splice(i,1); else t.assignees.push(uid);
  scheduleSync(); render();
}

function toggleLabel(tid, lid) {
  const t = S.tasks.find(x=>x.id===tid); if (!t) return;
  t.labels = t.labels || [];
  const i = t.labels.indexOf(lid);
  if (i>-1) t.labels.splice(i,1); else t.labels.push(lid);
  scheduleSync(); render();
}

function addSubtask(tid) {
  const t = S.tasks.find(x=>x.id===tid); if (!t) return;
  t.subtasks = t.subtasks || [];
  t.subtasks.push({ id: uid(), name: 'New sub-task', done: false });
  scheduleSync(); render();
}
function toggleSubtask(tid, sid) {
  const t = S.tasks.find(x=>x.id===tid); if (!t) return;
  const s = (t.subtasks||[]).find(x=>x.id===sid); if (!s) return;
  s.done = !s.done;
  scheduleSync(); render();
}
function renameSubtask(tid, sid, name) {
  const t = S.tasks.find(x=>x.id===tid); if (!t) return;
  const s = (t.subtasks||[]).find(x=>x.id===sid); if (!s) return;
  s.name = name;
  scheduleSync();
}
function deleteSubtask(tid, sid) {
  const t = S.tasks.find(x=>x.id===tid); if (!t) return;
  t.subtasks = (t.subtasks||[]).filter(x=>x.id!==sid);
  scheduleSync(); render();
}

function addComment(tid, text) {
  if (!text.trim()) return;
  const t = S.tasks.find(x=>x.id===tid); if (!t) return;
  t.comments = t.comments || [];
  t.comments.push({ id: uid(), author: S.team[0]?.name || 'Someone', text, at: new Date().toLocaleDateString() });
  scheduleSync(); render();
}

function deleteTask(tid) {
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
    <input id="nr-title" class="field" placeholder="What do you need from marketing?" style="margin-bottom:10px">
    <div class="exp-grid">
      <div><div class="exp-label">From</div><input id="nr-from" class="field" placeholder="Your name or team"></div>
      <div><div class="exp-label">Due</div><input id="nr-due" type="date" class="field"></div>
      <div><div class="exp-label">Priority</div><select id="nr-prio" class="field"><option value="">None</option><option>high</option><option>med</option><option>low</option></select></div>
    </div>
    <div class="exp-label">Details</div>
    <textarea id="nr-desc" class="field" rows="3"></textarea>
  `, () => {
    const title = $('#nr-title').value.trim();
    if (!title) { toast('Title required','error'); return false; }
    S.requests.push({
      id: uid(), title,
      from: $('#nr-from').value, due: $('#nr-due').value,
      priority: $('#nr-prio').value, description: $('#nr-desc').value,
      status: 'pending',
      createdAt: new Date().toLocaleDateString()
    });
    scheduleSync(); render();
    toast('Request submitted','success');
  });
}

function acceptRequest(id) {
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
  const r = S.requests.find(x=>x.id===id); if (!r) return;
  r.status = 'rejected';
  scheduleSync(); render();
}
function deleteRequest(id) {
  S.requests = S.requests.filter(r => r.id !== id);
  scheduleSync(); render();
}

// ---- Smart filter ----
function openNewSmartFilter(e) {
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
  if (!confirm('Delete this smart list?')) return;
  S.smartFilters = S.smartFilters.filter(f => f.id !== id);
  S.view = 'today';
  scheduleSync(); render();
}

// ---- Modal ----
function makeModal(title, bodyHTML, onSave) {
  closeAnyModal();
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop open';
  bd.id = '_modal';
  bd.innerHTML = `
    <div class="modal" onclick="event.stopPropagation()">
      <h2 class="display">${escape(title)}</h2>
      <div>${bodyHTML}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button class="btn" onclick="closeAnyModal()">Cancel</button>
        <button class="btn primary" id="_modalSave">Save</button>
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
  body.innerHTML = `
    <div class="sh"><span>Team</span><span class="line"></span><button class="btn xs" onclick="addMember()">+ Add</button></div>
    <div id="team-list">
      ${S.team.map(m => `
        <div class="drag-item" data-id="${m.id}">
          <span class="drag-handle">⠿</span>
          <div class="sb-avatar" style="width:24px;height:24px;font-size:10px;background:${m.color||'var(--navy-500)'}">${initials(m.name)}</div>
          <div style="flex:1">
            <input class="field" value="${escape(m.name)}" style="border:none;background:transparent;padding:2px;font-size:13px;font-weight:600" onchange="S.team.find(x=>x.id==='${m.id}').name=this.value;scheduleSync();render()">
            <input class="field" value="${escape(m.role||'')}" style="border:none;background:transparent;padding:2px;font-size:11px;color:var(--muted)" onchange="S.team.find(x=>x.id==='${m.id}').role=this.value;scheduleSync()">
          </div>
          <button class="btn xs danger" onclick="removeMember('${m.id}')">×</button>
        </div>
      `).join('')}
    </div>

    <div class="sh" style="margin-top:1.5rem"><span>Labels</span><span class="line"></span><button class="btn xs" onclick="addLabel()">+ Add</button></div>
    <div>
      ${S.labels.map(l => `
        <div class="drag-item">
          <input type="color" value="${l.color}" style="width:24px;height:24px;border:none;background:transparent;padding:0" onchange="S.labels.find(x=>x.id==='${l.id}').color=this.value;scheduleSync();render()">
          <input class="field" value="${escape(l.name)}" style="flex:1;border:none;background:transparent;padding:2px;font-size:13px" onchange="S.labels.find(x=>x.id==='${l.id}').name=this.value;scheduleSync();render()">
          <button class="btn xs danger" onclick="removeLabel('${l.id}')">×</button>
        </div>
      `).join('')}
    </div>

    <div class="sh" style="margin-top:1.5rem"><span>Categories</span><span class="line"></span><button class="btn xs" onclick="addCategory()">+ Add</button></div>
    <div>
      ${S.categories.map(c => `
        <div class="drag-item">
          <input type="color" value="${c.color}" style="width:24px;height:24px;border:none;background:transparent;padding:0" onchange="S.categories.find(x=>x.id==='${c.id}').color=this.value;scheduleSync();render()">
          <input class="field" value="${escape(c.name)}" style="flex:1;border:none;background:transparent;padding:2px;font-size:13px" onchange="S.categories.find(x=>x.id==='${c.id}').name=this.value;scheduleSync();render()">
          <button class="btn xs danger" onclick="removeCategory('${c.id}')">×</button>
        </div>
      `).join('')}
    </div>

    <div class="sh" style="margin-top:1.5rem"><span>Workspace</span><span class="line"></span></div>
    <div class="drag-item">
      <span style="flex:1">Share link</span>
      <button class="btn xs" onclick="showShareURL()">Copy</button>
    </div>
    <div class="drag-item">
      <span style="flex:1">Sign out</span>
      <button class="btn xs danger" onclick="signOut()">Forget key</button>
    </div>
  `;
}

function addMember() {
  const name = prompt('Team member name?'); if (!name) return;
  S.team.push({ id: uid(), name, role: '', color: '#'+Math.floor(Math.random()*16777215).toString(16).padStart(6,'0') });
  scheduleSync(); renderSettings(); render();
}
function removeMember(id) {
  if (!confirm('Remove this member?')) return;
  S.team = S.team.filter(m => m.id !== id);
  scheduleSync(); renderSettings(); render();
}
function addLabel() {
  const name = prompt('Label name?'); if (!name) return;
  S.labels.push({ id: uid(), name, color: '#'+Math.floor(Math.random()*16777215).toString(16).padStart(6,'0') });
  scheduleSync(); renderSettings(); render();
}
function removeLabel(id) {
  S.labels = S.labels.filter(l => l.id !== id);
  for (const t of S.tasks) t.labels = (t.labels||[]).filter(x=>x!==id);
  scheduleSync(); renderSettings(); render();
}
function addCategory() {
  const name = prompt('Category name?'); if (!name) return;
  S.categories.push({ id: uid(), name, color: '#'+Math.floor(Math.random()*16777215).toString(16).padStart(6,'0'), icon: '' });
  scheduleSync(); renderSettings(); render();
}
function removeCategory(id) {
  if (!confirm('Remove category?')) return;
  S.categories = S.categories.filter(c => c.id !== id);
  scheduleSync(); renderSettings(); render();
}

function signOut() {
  if (!confirm('Forget this workspace on this device?')) return;
  localStorage.removeItem(LS.KEYS);
  localStorage.removeItem(LS.BIN);
  location.reload();
}

// ============================================================
//                    BOOTSTRAP
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
  // Set setup logo from inline base64
  const setupImg = document.getElementById('setup-logo-img');
  if (setupImg && window.LOGO_NAVY) setupImg.src = window.LOGO_NAVY;

  // auto-login if key + bin saved
  const savedKey = localStorage.getItem(LS.KEYS);
  const urlBin = new URLSearchParams(location.search).get('bin');
  const savedBin = localStorage.getItem(LS.BIN);
  const bin = urlBin || savedBin;

  // pre-fill + apply theme to setup screen
  const savedTheme = localStorage.getItem(LS.THEME);
  if (savedTheme === 'dark') { S.dark = true; document.documentElement.classList.add('dark'); }

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

  // handle Enter in setup
  $('#sc-key').addEventListener('keydown', e => { if (e.key === 'Enter') doSetup(); });

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
  doSetup, toggleSidebar, toggleTheme, manualRefresh, showShareURL,
  go, toggleTask, toggleExpand, toggleCampExpand, updateTaskField,
  toggleAssignee, toggleLabel, addSubtask, toggleSubtask, renameSubtask, deleteSubtask,
  addComment, deleteTask,
  openQuickAdd, closeQuickAdd, saveQuickAdd,
  openNewCampaign, editCampaign, deleteCampaign,
  openNewRequest, acceptRequest, rejectRequest, deleteRequest,
  openNewSmartFilter, deleteSmartFilter,
  openSettings, closeSettings, closeMobileSidebar,
  addMember, removeMember, addLabel, removeLabel, addCategory, removeCategory, signOut,
  calNav, closeAnyModal
});
