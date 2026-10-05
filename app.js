/* =========================================================
   Cobro Horas — lógica de la aplicación
   Datos guardados en localStorage (solo en este dispositivo)
   ========================================================= */
'use strict';

const STORAGE_KEY = 'cobrohoras.v1';

const CURRENCIES = {
  CLP: { symbol: '$', dec: 0 },
  USD: { symbol: 'US$', dec: 2 },
  EUR: { symbol: '€', dec: 2 },
  ARS: { symbol: '$', dec: 2 },
  MXN: { symbol: '$', dec: 2 },
  COP: { symbol: '$', dec: 0 },
  PEN: { symbol: 'S/', dec: 2 },
  UYU: { symbol: '$', dec: 2 },
};

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const defaultState = () => ({
  settings: {
    theme: 'auto',
    tarifa: 25000,
    moneda: 'CLP',
    retencionOn: false,
    retencionPct: 15.25,
    nextBoleta: 1,
    emisor: { nombre: '', rut: '', giro: '', direccion: '', email: '', telefono: '', pago: '' },
  },
  clients: [],
  entries: [],
  active: null, // { clientId, start: ISO string }
});

const AUTH_USERS_KEY = 'cobrohoras.auth.users';
const AUTH_SESSION_KEY = 'cobrohoras.auth.session';

// Cifrado SHA-256 para contraseñas usando Web Crypto API
async function hashPassword(password) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(password + '::cobro_salt'));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getStoredUsers() {
  try {
    const raw = localStorage.getItem(AUTH_USERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStoredUsers(users) {
  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(users));
}

let currentUser = getSessionUser();

function getSessionUser() {
  return localStorage.getItem(AUTH_SESSION_KEY) || sessionStorage.getItem(AUTH_SESSION_KEY) || null;
}

function setSessionUser(identifier, remember = true) {
  currentUser = identifier;
  if (remember) {
    localStorage.setItem(AUTH_SESSION_KEY, identifier);
    sessionStorage.removeItem(AUTH_SESSION_KEY);
  } else {
    sessionStorage.setItem(AUTH_SESSION_KEY, identifier);
    localStorage.removeItem(AUTH_SESSION_KEY);
  }
}

function clearSession() {
  currentUser = null;
  localStorage.removeItem(AUTH_SESSION_KEY);
  sessionStorage.removeItem(AUTH_SESSION_KEY);
}

function getUserStorageKey() {
  return currentUser ? `${STORAGE_KEY}.${currentUser.toLowerCase().replace(/[^a-z0-9]/g, '_')}` : STORAGE_KEY;
}

let state = loadState();

function loadState() {
  try {
    const key = getUserStorageKey();
    const raw = localStorage.getItem(key);
    if (!raw) return defaultState();
    return normalizeState(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

function normalizeState(s) {
  const d = defaultState();
  return {
    ...d,
    ...s,
    clients: Array.isArray(s.clients) ? s.clients : [],
    entries: Array.isArray(s.entries) ? s.entries : [],
    settings: { ...d.settings, ...(s.settings || {}), emisor: { ...d.settings.emisor, ...(s.settings?.emisor || {}) } },
  };
}

function save() {
  localStorage.setItem(getUserStorageKey(), JSON.stringify(state));
}

/* ---------------- Utilidades ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const pad = (n) => String(n).padStart(2, '0');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

/** Duración en minutos; si el término es menor al inicio se asume que cruzó la medianoche. */
function durMin(inicio, fin) {
  let d = toMin(fin) - toMin(inicio);
  if (d <= 0) d += 1440;
  return d;
}
const fmtDur = (min) => `${Math.floor(min / 60)}:${pad(Math.round(min % 60))}`;
const fmtDate = (s) => { const d = parseISO(s); return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`; };
const dayLabel = (s) => { const d = parseISO(s); return `${cap(DAYS[d.getDay()])} ${d.getDate()} de ${MONTHS[d.getMonth()]}`; };

const cur = () => CURRENCIES[state.settings.moneda] || CURRENCIES.CLP;
const roundMoney = (v) => { const f = 10 ** cur().dec; return Math.round(v * f) / f; };

function money(v) {
  const { dec, symbol } = cur();
  try {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency', currency: state.settings.moneda, minimumFractionDigits: dec, maximumFractionDigits: dec,
    }).format(v);
  } catch {
    return symbol + Number(v).toFixed(dec);
  }
}
const plainMoney = (v) => money(v).replace(/[\u00a0\u202f]/g, ' ');
const num = (v, dec = 2) => new Intl.NumberFormat('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);

const entryMin = (e) => durMin(e.inicio, e.fin);
const entryAmount = (e) => roundMoney((entryMin(e) / 60) * Number(e.tarifa || 0));
const sortEntries = (a, b) => b.fecha.localeCompare(a.fecha) || b.inicio.localeCompare(a.inicio);

const clientById = (id) => state.clients.find((c) => c.id === id);
const clientName = (id) => clientById(id)?.nombre || 'Sin cliente';
const rateFor = (clientId) => {
  const c = clientById(clientId);
  const r = c && c.tarifa !== '' && c.tarifa != null ? Number(c.tarifa) : NaN;
  return Number.isFinite(r) && r > 0 ? r : Number(state.settings.tarifa) || 0;
};
const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const safeFile = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

const CHEVRON = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

let toastTimer;
function toast(msg, type = '') {
  const t = $('#toast');
  t.textContent = msg;
  clearTimeout(toastTimer);
  // Popover = capa superior: el aviso queda visible incluso sobre diálogos modales.
  if (t.showPopover) {
    try { if (t.matches(':popover-open')) t.hidePopover(); t.showPopover(); } catch { /* sin soporte */ }
  }
  t.className = 'toast ' + type;
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { if (!t.classList.contains('show') && t.hidePopover) try { t.hidePopover(); } catch { /* */ } }, 400);
  }, 3200);
}

function confirmBox(title, msg, okLabel = 'Aceptar', destructive = false) {
  return new Promise((resolve) => {
    const dlg = $('#confirmDialog');
    $('#confirmTitle').textContent = title;
    $('#confirmMsg').textContent = msg;
    const ok = $('#confirmOk');
    ok.textContent = okLabel;
    ok.classList.toggle('destructive', destructive);
    const done = (v) => { dlg.close(); ok.onclick = null; $('#confirmCancel').onclick = null; resolve(v); };
    ok.onclick = () => done(true);
    $('#confirmCancel').onclick = () => done(false);
    dlg.oncancel = () => resolve(false);
    dlg.showModal();
  });
}

function clientOptions(selected, { all = false, allowNew = false } = {}) {
  let html = all ? `<option value="all">Todos los clientes</option>` : '';
  if (!all && !state.clients.length) html += `<option value="">— Sin clientes —</option>`;
  html += [...state.clients]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map((c) => `<option value="${esc(c.id)}"${c.id === selected ? ' selected' : ''}>${esc(c.nombre)}</option>`)
    .join('');
  if (allowNew) html += `<option value="__new">＋ Nuevo cliente…</option>`;
  return html;
}

/* ---------------- Tema ---------------- */
function applyTheme() {
  const t = state.settings.theme || 'auto';
  document.documentElement.dataset.theme = t;
  $$('#themeSeg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeOpt === t)));
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $$('meta[name="theme-color"]').forEach((m) => {
    m.setAttribute('content', dark ? '#000000' : '#F2F2F7');
    m.removeAttribute('media');
  });
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

/* ---------------- Navegación ---------------- */
function showTab(name) {
  $$('.view').forEach((v) => (v.hidden = v.dataset.view !== name));
  $$('.tab').forEach((t) => (t.dataset.tab === name ? t.setAttribute('aria-current', 'page') : t.removeAttribute('aria-current')));
  localStorage.setItem(STORAGE_KEY + '.tab', name);
  window.scrollTo({ top: 0 });
  render();
}

/* ---------------- REGISTRO ---------------- */
let viewMonth = new Date();
viewMonth.setDate(1);
let timerInterval = null;

function renderTimer() {
  const card = $('#timerCard');
  clearInterval(timerInterval);

  if (!state.active) {
    card.innerHTML = `
      <div class="timer-top"><span class="label">Nuevo servicio</span></div>
      <select class="timer-select" id="timerClient" aria-label="Cliente">${clientOptions(localStorage.getItem(STORAGE_KEY + '.lastClient'), { allowNew: true })}</select>
      <button class="btn btn-green" id="btnStart">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
        Iniciar servicio ahora
      </button>`;
    $('#timerClient').addEventListener('change', (e) => {
      if (e.target.value === '__new') openClient(null, (c) => { localStorage.setItem(STORAGE_KEY + '.lastClient', c.id); renderTimer(); }, () => renderTimer());
    });
    $('#btnStart').addEventListener('click', startTimer);
    return;
  }

  const start = new Date(state.active.start);
  card.innerHTML = `
    <div class="timer-top">
      <span class="label">${esc(clientName(state.active.clientId))}</span>
      <span class="live-dot">En curso</span>
    </div>
    <div class="timer-digits" id="timerDigits">00:00:00</div>
    <div class="timer-sub">Inicio ${dayLabel(isoDate(start)).toLowerCase()} · ${hhmm(start)} · <span id="timerMoney"></span></div>
    <div class="timer-row">
      <button class="btn btn-tinted" id="btnDiscard" aria-label="Descartar servicio en curso">Descartar</button>
      <button class="btn btn-red" id="btnStop">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>
        Terminar servicio
      </button>
    </div>`;
  const tick = () => {
    const s = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
    $('#timerDigits').textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
    $('#timerMoney').textContent = money(roundMoney((s / 3600) * rateFor(state.active.clientId)));
  };
  tick();
  timerInterval = setInterval(tick, 1000);
  $('#btnStop').addEventListener('click', stopTimer);
  $('#btnDiscard').addEventListener('click', async () => {
    if (await confirmBox('¿Descartar servicio?', 'El tiempo en curso no se guardará.', 'Descartar', true)) {
      state.active = null; save(); renderTimer();
    }
  });
}

function startTimer() {
  const clientId = $('#timerClient').value;
  if (!clientId || clientId === '__new') {
    toast('Primero agrega o selecciona un cliente', 'warn');
    if (!state.clients.length) openClient(null, () => renderTimer());
    return;
  }
  localStorage.setItem(STORAGE_KEY + '.lastClient', clientId);
  const now = new Date();
  now.setSeconds(0, 0);
  state.active = { clientId, start: now.toISOString() };
  save();
  renderTimer();
  toast(`Servicio iniciado a las ${hhmm(now)}`);
}

async function stopTimer() {
  const start = new Date(state.active.start);
  const end = new Date();
  const mins = Math.round((end - start) / 60000);
  if (mins < 1) {
    toast('El servicio dura menos de 1 minuto', 'warn');
    return;
  }
  if (mins >= 1440) {
    toast('Duró más de 24 h: revisa las horas del registro', 'warn');
  }
  const entry = {
    id: uid(),
    clientId: state.active.clientId,
    fecha: isoDate(start),
    inicio: hhmm(start),
    fin: hhmm(end),
    tarifa: rateFor(state.active.clientId),
    descripcion: '',
  };
  if (entry.inicio === entry.fin) { const e2 = new Date(start.getTime() + 60000 * Math.max(1, mins)); entry.fin = hhmm(e2); }
  state.entries.push(entry);
  state.active = null;
  save();
  viewMonth = parseISO(entry.fecha); viewMonth.setDate(1);
  render();
  toast(`Registrado: ${fmtDur(entryMin(entry))} h · ${money(entryAmount(entry))}`);
}

function renderRegistro() {
  renderTimer();
  const y = viewMonth.getFullYear();
  const m = viewMonth.getMonth();
  $('#monthLabel').textContent = `${cap(MONTHS[m])} ${y}`;
  const prefix = `${y}-${pad(m + 1)}`;
  const list = state.entries.filter((e) => e.fecha.startsWith(prefix)).sort(sortEntries);

  const totalMin = list.reduce((a, e) => a + entryMin(e), 0);
  const totalAmt = list.reduce((a, e) => a + entryAmount(e), 0);
  $('#mHours').textContent = `${fmtDur(totalMin)} h`;
  $('#mTotal').textContent = money(totalAmt);

  const box = $('#entryList');
  if (!list.length) {
    box.innerHTML = `<div class="empty"><strong>Sin registros este mes</strong>Inicia un servicio con el cronómetro o toca ＋ para registrar horas manualmente.</div>`;
    return;
  }
  const groups = {};
  list.forEach((e) => (groups[e.fecha] ||= []).push(e));
  box.innerHTML = Object.entries(groups).map(([fecha, items]) => {
    const dMin = items.reduce((a, e) => a + entryMin(e), 0);
    return `
      <p class="group-title day-title"><span>${dayLabel(fecha)}</span><b>${fmtDur(dMin)} h</b></p>
      <div class="group">
        ${items.map((e) => `
          <button class="row" data-entry="${esc(e.id)}">
            <div class="row-main">
              <span class="row-title">${esc(clientName(e.clientId))}</span>
              <span class="row-sub">${e.inicio} – ${e.fin}${e.descripcion ? ' · ' + esc(e.descripcion) : ''}</span>
            </div>
            <div class="row-end">
              <span class="row-value">${money(entryAmount(e))}</span>
              <span class="row-sub">${fmtDur(entryMin(e))} h</span>
            </div>
            ${CHEVRON}
          </button>`).join('')}
      </div>`;
  }).join('');
}

/* ---- Diálogo de registro ---- */
let editingEntryId = null;

function openEntry(id = null) {
  editingEntryId = id;
  const f = $('#entryForm');
  const e = id ? state.entries.find((x) => x.id === id) : null;
  $('#entryTitle').textContent = e ? 'Editar registro' : 'Nuevo registro';
  $('#btnDeleteEntry').hidden = !e;
  $('#entryError').textContent = '';

  const lastClient = localStorage.getItem(STORAGE_KEY + '.lastClient');
  const clientId = e?.clientId || (clientById(lastClient) ? lastClient : state.clients[0]?.id) || '';
  f.clientId.innerHTML = clientOptions(clientId, { allowNew: true });
  f.clientId.dataset.prev = clientId;

  const now = new Date();
  const today = isoDate(now);
  const inMonth = today.startsWith(`${viewMonth.getFullYear()}-${pad(viewMonth.getMonth() + 1)}`);
  f.fecha.value = e?.fecha || (inMonth ? today : isoDate(viewMonth));
  f.inicio.value = e?.inicio || '09:00';
  f.fin.value = e?.fin || '13:00';
  f.tarifa.value = e ? e.tarifa : rateFor(clientId);
  f.descripcion.value = e?.descripcion || '';
  updateEntryCalc();
  $('#entryDialog').showModal();
}

function updateEntryCalc() {
  const f = $('#entryForm');
  const box = $('#entryCalc');
  if (!f.inicio.value || !f.fin.value || f.inicio.value === f.fin.value) { box.innerHTML = ''; return; }
  const min = durMin(f.inicio.value, f.fin.value);
  const amt = roundMoney((min / 60) * Number(f.tarifa.value || 0));
  const cross = toMin(f.fin.value) < toMin(f.inicio.value);
  box.innerHTML = `
    <div class="stat"><span class="stat-label">Duración${cross ? ' (cruza medianoche)' : ''}</span><span class="stat-value">${fmtDur(min)} h</span></div>
    <div class="stat"><span class="stat-label">Valor</span><span class="stat-value accent">${money(amt)}</span></div>`;
}

function saveEntry(ev) {
  ev.preventDefault();
  const f = $('#entryForm');
  const err = $('#entryError');
  const data = {
    clientId: f.clientId.value,
    fecha: f.fecha.value,
    inicio: f.inicio.value,
    fin: f.fin.value,
    tarifa: Number(f.tarifa.value),
    descripcion: f.descripcion.value.trim(),
  };
  if (!data.clientId || data.clientId === '__new') return (err.textContent = 'Selecciona un cliente.');
  if (!data.fecha) return (err.textContent = 'Indica la fecha.');
  if (!data.inicio || !data.fin) return (err.textContent = 'Indica hora de inicio y término.');
  if (data.inicio === data.fin) return (err.textContent = 'La hora de término debe ser distinta a la de inicio.');
  if (!(data.tarifa >= 0) || f.tarifa.value === '') return (err.textContent = 'Indica un valor por hora válido.');

  if (editingEntryId) {
    Object.assign(state.entries.find((x) => x.id === editingEntryId), data);
  } else {
    state.entries.push({ id: uid(), ...data });
  }
  localStorage.setItem(STORAGE_KEY + '.lastClient', data.clientId);
  save();
  $('#entryDialog').close();
  viewMonth = parseISO(data.fecha); viewMonth.setDate(1);
  render();
  toast(editingEntryId ? 'Registro actualizado' : 'Registro guardado');
}

/* ---------------- CLIENTES ---------------- */
function renderClientes() {
  const box = $('#clientList');
  if (!state.clients.length) {
    box.innerHTML = `<div class="empty"><strong>Aún no tienes clientes</strong>Agrega a quienes prestas servicios para registrar sus horas.<br><button class="btn" id="emptyAddClient">Agregar cliente</button></div>`;
    $('#emptyAddClient').addEventListener('click', () => openClient());
    return;
  }
  const now = new Date();
  const prefix = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  box.innerHTML = `<div class="group">${[...state.clients]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map((c) => {
      const mine = state.entries.filter((e) => e.clientId === c.id && e.fecha.startsWith(prefix));
      const min = mine.reduce((a, e) => a + entryMin(e), 0);
      const amt = mine.reduce((a, e) => a + entryAmount(e), 0);
      return `
        <button class="row" data-client="${esc(c.id)}">
          <span class="avatar" aria-hidden="true">${esc(initials(c.nombre))}</span>
          <div class="row-main">
            <span class="row-title">${esc(c.nombre)}</span>
            <span class="row-sub">${money(rateFor(c.id))}/h${c.tarifa ? '' : ' (general)'}${c.email ? ' · ' + esc(c.email) : ''}</span>
          </div>
          <div class="row-end">
            <span class="row-value">${money(amt)}</span>
            <span class="row-sub">${fmtDur(min)} h este mes</span>
          </div>
          ${CHEVRON}
        </button>`;
    }).join('')}</div>`;
}

let editingClientId = null;
let clientCallbacks = {};

function openClient(id = null, onSave = null, onCancel = null) {
  editingClientId = id;
  clientCallbacks = { onSave, onCancel, saved: false };
  const c = id ? clientById(id) : null;
  const f = $('#clientForm');
  f.reset();
  $('#clientTitle').textContent = c ? 'Editar cliente' : 'Nuevo cliente';
  $('#btnDeleteClient').hidden = !c;
  $('#clientError').textContent = '';
  if (c) ['nombre', 'rut', 'email', 'telefono', 'direccion', 'tarifa'].forEach((k) => (f[k].value = c[k] ?? ''));
  f.tarifa.placeholder = `General: ${money(state.settings.tarifa)}`;
  $('#clientDialog').showModal();
  setTimeout(() => f.nombre.focus(), 50);
}

function saveClient(ev) {
  ev.preventDefault();
  const f = $('#clientForm');
  const data = {
    nombre: f.nombre.value.trim(),
    rut: f.rut.value.trim(),
    email: f.email.value.trim(),
    telefono: f.telefono.value.trim(),
    direccion: f.direccion.value.trim(),
    tarifa: f.tarifa.value === '' ? '' : Number(f.tarifa.value),
  };
  if (!data.nombre) return ($('#clientError').textContent = 'El nombre es obligatorio.');
  let client;
  if (editingClientId) {
    client = Object.assign(clientById(editingClientId), data);
  } else {
    client = { id: uid(), ...data };
    state.clients.push(client);
  }
  save();
  clientCallbacks.saved = true;
  $('#clientDialog').close();
  clientCallbacks.onSave?.(client);
  render();
  toast(editingClientId ? 'Cliente actualizado' : 'Cliente agregado');
}

/* ---------------- REPORTES ---------------- */
const rpt = { preset: 'month', desde: '', hasta: '', clientId: 'all' };

function setPreset(p) {
  rpt.preset = p;
  const now = new Date();
  if (p === 'month') {
    rpt.desde = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
    rpt.hasta = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  } else if (p === 'prev') {
    rpt.desde = isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    rpt.hasta = isoDate(new Date(now.getFullYear(), now.getMonth(), 0));
  }
  renderReportes();
}

function reportData() {
  let { desde, hasta } = rpt;
  if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];
  const list = state.entries
    .filter((e) => (!desde || e.fecha >= desde) && (!hasta || e.fecha <= hasta) && (rpt.clientId === 'all' || e.clientId === rpt.clientId))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.inicio.localeCompare(b.inicio));
  const totalMin = list.reduce((a, e) => a + entryMin(e), 0);
  const totalAmt = list.reduce((a, e) => a + entryAmount(e), 0);
  return { list, desde, hasta, clientId: rpt.clientId, totalMin, totalAmt };
}

function renderReportes() {
  if (!rpt.desde) setPresetSilently('month');
  $$('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.preset === rpt.preset)));
  $('#rDesde').value = rpt.desde;
  $('#rHasta').value = rpt.hasta;
  if (rpt.clientId !== 'all' && !clientById(rpt.clientId)) rpt.clientId = 'all';
  $('#rCliente').innerHTML = clientOptions(rpt.clientId, { all: true });
  $('#rCliente').value = rpt.clientId;

  const { list, totalMin, totalAmt } = reportData();
  $('#rHours').textContent = `${fmtDur(totalMin)} h`;
  $('#rCount').textContent = list.length;
  $('#rTotal').textContent = money(totalAmt);

  const box = $('#reportList');
  if (!list.length) {
    box.innerHTML = `<div class="empty"><strong>Sin registros</strong>No hay horas registradas en este período.</div>`;
    return;
  }
  box.innerHTML = `<div class="group">${list.map((e) => `
    <button class="row" data-entry="${esc(e.id)}">
      <div class="row-main">
        <span class="row-title">${fmtDate(e.fecha)} · ${esc(clientName(e.clientId))}</span>
        <span class="row-sub">${e.inicio} – ${e.fin} · ${money(Number(e.tarifa))}/h${e.descripcion ? ' · ' + esc(e.descripcion) : ''}</span>
      </div>
      <div class="row-end">
        <span class="row-value">${money(entryAmount(e))}</span>
        <span class="row-sub">${fmtDur(entryMin(e))} h</span>
      </div>
      ${CHEVRON}
    </button>`).join('')}</div>`;
}

function setPresetSilently(p) {
  const now = new Date();
  rpt.preset = p;
  rpt.desde = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
  rpt.hasta = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
}

/* ---------------- EXCEL ---------------- */
async function exportExcel() {
  if (!window.ExcelJS) return toast('No se pudo cargar el generador de Excel', 'warn');
  const { list, desde, hasta, clientId, totalMin, totalAmt } = reportData();
  if (!list.length) return toast('No hay registros en el período', 'warn');

  const { dec, symbol } = cur();
  const moneyFmt = `"${symbol}"#,##0${dec ? '.' + '0'.repeat(dec) : ''}`;
  const em = state.settings.emisor;
  const clientLabel = clientId === 'all' ? 'Todos los clientes' : clientName(clientId);

  const wb = new ExcelJS.Workbook();
  wb.creator = em.nombre || 'Cobro Horas';
  wb.created = new Date();

  const ws = wb.addWorksheet('Detalle', {
    views: [{ state: 'frozen', ySplit: 5 }],
    pageSetup: { paperSize: 1, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [
    { key: 'fecha', width: 12 }, { key: 'dia', width: 11 }, { key: 'cliente', width: 26 },
    { key: 'inicio', width: 9 }, { key: 'fin', width: 9 }, { key: 'hhmm', width: 11 },
    { key: 'hdec', width: 11 }, { key: 'tarifa', width: 14 }, { key: 'monto', width: 16 }, { key: 'detalle', width: 42 },
  ];

  const BLUE = 'FF0071E3';
  const border = { style: 'thin', color: { argb: 'FFD1D1D6' } };
  const allBorders = { top: border, left: border, bottom: border, right: border };

  ws.mergeCells('A1:J1');
  ws.getCell('A1').value = `Detalle de horas${em.nombre ? ' — ' + em.nombre : ''}`;
  ws.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF1D1D1F' } };
  ws.getRow(1).height = 24;
  ws.mergeCells('A2:J2');
  ws.getCell('A2').value = `Período: ${fmtDate(desde)} al ${fmtDate(hasta)}`;
  ws.mergeCells('A3:J3');
  ws.getCell('A3').value = `Cliente: ${clientLabel}`;
  ['A2', 'A3'].forEach((c) => (ws.getCell(c).font = { size: 11, color: { argb: 'FF3A3A3C' } }));

  const head = ws.getRow(5);
  head.values = ['Fecha', 'Día', 'Cliente', 'Inicio', 'Término', 'Horas (h:mm)', 'Horas (dec.)', 'Valor hora', 'Monto', 'Detalle'];
  head.height = 22;
  head.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = allBorders;
  });

  const first = 6;
  list.forEach((e, i) => {
    const r = first + i;
    const min = entryMin(e);
    const [Y, Mo, D] = e.fecha.split('-').map(Number);
    const row = ws.getRow(r);
    row.values = [
      new Date(Date.UTC(Y, Mo - 1, D)),
      cap(DAYS[parseISO(e.fecha).getDay()]),
      clientName(e.clientId),
      e.inicio,
      e.fin,
      min / 1440,
      { formula: `F${r}*24`, result: min / 60 },
      Number(e.tarifa),
      { formula: `ROUND(F${r}*24*H${r},${dec})`, result: entryAmount(e) },
      e.descripcion || '',
    ];
    row.getCell(1).numFmt = 'dd-mm-yyyy';
    row.getCell(6).numFmt = '[h]:mm';
    row.getCell(7).numFmt = '0.00';
    row.getCell(8).numFmt = moneyFmt;
    row.getCell(9).numFmt = moneyFmt;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = allBorders;
      if (i % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F7' } };
      if ([1, 2, 4, 5, 6].includes(col)) cell.alignment = { horizontal: 'center' };
    });
  });

  const last = first + list.length - 1;
  let r = last + 1;
  const tot = ws.getRow(r);
  tot.getCell(1).value = 'TOTAL';
  ws.mergeCells(`A${r}:E${r}`);
  tot.getCell(6).value = { formula: `SUM(F${first}:F${last})`, result: totalMin / 1440 };
  tot.getCell(7).value = { formula: `SUM(G${first}:G${last})`, result: totalMin / 60 };
  tot.getCell(9).value = { formula: `SUM(I${first}:I${last})`, result: totalAmt };
  tot.getCell(6).numFmt = '[h]:mm';
  tot.getCell(7).numFmt = '0.00';
  tot.getCell(9).numFmt = moneyFmt;
  tot.height = 22;
  for (let c = 1; c <= 10; c++) {
    const cell = tot.getCell(c);
    cell.font = { bold: true, size: 12 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5F0FC' } };
    cell.border = { ...allBorders, top: { style: 'medium', color: { argb: BLUE } } };
    if (c === 6 || c === 7) cell.alignment = { horizontal: 'center' };
  }
  tot.getCell(1).alignment = { horizontal: 'right' };

  if (state.settings.retencionOn) {
    const pct = Number(state.settings.retencionPct) || 0;
    const ret = roundMoney((totalAmt * pct) / 100);
    const totRow = r;
    r += 1;
    ws.getCell(`H${r}`).value = `Retención ${num(pct, 2)}%`;
    ws.getCell(`I${r}`).value = { formula: `ROUND(I${totRow}*${pct}/100,${dec})`, result: ret };
    r += 1;
    ws.getCell(`H${r}`).value = 'Líquido';
    ws.getCell(`I${r}`).value = { formula: `I${totRow}-I${r - 1}`, result: totalAmt - ret };
    [r - 1, r].forEach((x) => {
      ws.getCell(`I${x}`).numFmt = moneyFmt;
      ws.getCell(`H${x}`).font = { bold: true };
      ws.getCell(`I${x}`).font = { bold: true };
      ws.getCell(`H${x}`).alignment = { horizontal: 'right' };
    });
  }

  ws.autoFilter = { from: 'A5', to: `J${last}` };

  // ---- Hoja resumen por cliente ----
  const rs = wb.addWorksheet('Resumen');
  rs.columns = [{ width: 30 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 18 }];
  rs.mergeCells('A1:E1');
  rs.getCell('A1').value = 'Resumen por cliente';
  rs.getCell('A1').font = { size: 16, bold: true };
  rs.mergeCells('A2:E2');
  rs.getCell('A2').value = `Período: ${fmtDate(desde)} al ${fmtDate(hasta)}`;
  const rh = rs.getRow(4);
  rh.values = ['Cliente', 'Registros', 'Horas (h:mm)', 'Horas (dec.)', 'Monto'];
  rh.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    cell.alignment = { horizontal: 'center' };
    cell.border = allBorders;
  });
  const byClient = {};
  list.forEach((e) => {
    const k = e.clientId;
    byClient[k] ||= { n: 0, min: 0, amt: 0 };
    byClient[k].n++; byClient[k].min += entryMin(e); byClient[k].amt += entryAmount(e);
  });
  let rr = 5;
  Object.entries(byClient).sort((a, b) => clientName(a[0]).localeCompare(clientName(b[0]), 'es')).forEach(([k, v]) => {
    const row = rs.getRow(rr);
    row.values = [clientName(k), v.n, v.min / 1440, v.min / 60, v.amt];
    row.getCell(3).numFmt = '[h]:mm'; row.getCell(4).numFmt = '0.00'; row.getCell(5).numFmt = moneyFmt;
    row.eachCell({ includeEmpty: true }, (c, col) => { c.border = allBorders; if (col > 1 && col < 5) c.alignment = { horizontal: 'center' }; });
    rr++;
  });
  const rt = rs.getRow(rr);
  rt.values = ['TOTAL',
    { formula: `SUM(B5:B${rr - 1})`, result: list.length },
    { formula: `SUM(C5:C${rr - 1})`, result: totalMin / 1440 },
    { formula: `SUM(D5:D${rr - 1})`, result: totalMin / 60 },
    { formula: `SUM(E5:E${rr - 1})`, result: totalAmt }];
  rt.getCell(3).numFmt = '[h]:mm'; rt.getCell(4).numFmt = '0.00'; rt.getCell(5).numFmt = moneyFmt;
  rt.eachCell((c, col) => {
    c.font = { bold: true }; c.border = { ...allBorders, top: { style: 'medium', color: { argb: BLUE } } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5F0FC' } };
    if (col > 1 && col < 5) c.alignment = { horizontal: 'center' };
  });

  const buf = await wb.xlsx.writeBuffer();
  const name = `Horas_${safeFile(clientLabel)}_${desde}_a_${hasta}.xlsx`;
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
  toast('Excel descargado');
}

/* ---------------- BOLETA PDF ---------------- */
let currentPdf = null; // { blob, file, name, client, total }

function openBoleta() {
  const data = reportData();
  if (rpt.clientId === 'all') {
    const ids = [...new Set(data.list.map((e) => e.clientId))];
    if (ids.length === 1) {
      rpt.clientId = ids[0];
      renderReportes();
    } else {
      toast('Selecciona un cliente para emitir la boleta', 'warn');
      $('#rCliente').focus();
      return;
    }
  }
  const d = reportData();
  if (!d.list.length) return toast('No hay registros en el período', 'warn');
  if (!state.settings.emisor.nombre) toast('Tip: completa tus datos en Ajustes para la boleta');

  const f = $('#boletaForm');
  f.numero.value = state.settings.nextBoleta || 1;
  f.fechaEmision.value = isoDate(new Date());
  f.concepto.value = f.concepto.value || 'Servicios profesionales por horas';
  f.retOn.checked = !!state.settings.retencionOn;
  $('#boletaSummary').innerHTML = `
    <div class="stat"><span class="stat-label">${esc(clientName(d.clientId))}</span><span class="stat-value">${fmtDur(d.totalMin)} h</span></div>
    <div class="stat"><span class="stat-label">${fmtDate(d.desde)} al ${fmtDate(d.hasta)}</span><span class="stat-value accent">${money(d.totalAmt)}</span></div>`;
  $('#boletaActions').hidden = true;
  $('#btnGenBoleta').textContent = 'Generar boleta PDF';
  currentPdf = null;
  $('#boletaDialog').showModal();
}

function generateBoleta(ev) {
  ev.preventDefault();
  if (!window.jspdf) return toast('No se pudo cargar el generador de PDF', 'warn');
  const f = $('#boletaForm');
  const numero = parseInt(f.numero.value, 10);
  if (!(numero > 0)) return toast('Indica un número de boleta válido', 'warn');
  const d = reportData();
  const client = clientById(d.clientId);
  const opts = {
    numero,
    fechaEmision: f.fechaEmision.value || isoDate(new Date()),
    concepto: f.concepto.value.trim() || 'Servicios profesionales por horas',
    retOn: f.retOn.checked,
    retPct: Number(state.settings.retencionPct) || 0,
    client, ...d,
  };
  const doc = buildBoletaPDF(opts);
  const name = `Boleta_${String(numero).padStart(6, '0')}_${safeFile(client?.nombre || 'cliente')}.pdf`;
  const blob = doc.output('blob');
  const ret = opts.retOn ? roundMoney((d.totalAmt * opts.retPct) / 100) : 0;
  currentPdf = { blob, name, client, total: d.totalAmt - ret, numero, desde: d.desde, hasta: d.hasta, file: new File([blob], name, { type: 'application/pdf' }) };

  if (numero >= (state.settings.nextBoleta || 1)) {
    state.settings.nextBoleta = numero + 1;
    save();
  }
  $('#boletaFileName').textContent = name;
  $('#boletaActions').hidden = false;
  $('#btnGenBoleta').textContent = 'Volver a generar';
  $('#actShare').hidden = !(navigator.canShare && navigator.canShare({ files: [currentPdf.file] }));
  toast('Boleta generada');
}

function buildBoletaPDF(o) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  const ACCENT = [0, 113, 227];
  const INK = [29, 29, 31];
  const GRAY = [88, 88, 92];
  const SOFT = [242, 242, 247];
  const em = state.settings.emisor;
  const c = o.client || {};

  // ---- Encabezado: emisor ----
  const leftW = W - M * 2 - 210;
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  const nameLines = doc.splitTextToSize(em.nombre || 'Prestador de servicios', leftW);
  doc.text(nameLines, M, M + 12);
  let y = M + 12 + nameLines.length * 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...GRAY);
  [em.giro, em.rut && `RUT: ${em.rut}`, em.direccion, em.email, em.telefono].filter(Boolean).forEach((l) => {
    const lines = doc.splitTextToSize(String(l), leftW);
    doc.text(lines, M, y);
    y += 13 * lines.length;
  });

  // ---- Recuadro N° de boleta ----
  const bw = 200, bh = 82, bx = W - M - bw, by = M - 4;
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(1.5);
  doc.roundedRect(bx, by, bw, bh, 8, 8);
  doc.setTextColor(...ACCENT);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('BOLETA DE SERVICIOS', bx + bw / 2, by + 23, { align: 'center' });
  doc.setFontSize(17);
  doc.text(`N° ${String(o.numero).padStart(6, '0')}`, bx + bw / 2, by + 47, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  doc.text(`Fecha de emisión: ${fmtDate(o.fechaEmision)}`, bx + bw / 2, by + 68, { align: 'center' });

  y = Math.max(y, by + bh) + 20;

  // ---- Recuadro cliente / período ----
  const colW = (W - M * 2 - 36) / 2;
  const cliLines = [c.rut && `RUT: ${c.rut}`, c.direccion, c.email, c.telefono].filter(Boolean)
    .flatMap((l) => doc.splitTextToSize(String(l), colW));
  doc.setFontSize(12);
  const cliName = doc.splitTextToSize(c.nombre || '—', colW);
  doc.setFontSize(10);
  const conceptLines = doc.splitTextToSize(o.concepto, colW);
  const boxH = Math.max(30 + cliName.length * 15 + cliLines.length * 13, 74 + conceptLines.length * 13) + 12;
  doc.setFillColor(...SOFT);
  doc.roundedRect(M, y, W - M * 2, boxH, 8, 8, 'F');

  const lx = M + 14, rx = M + 14 + colW + 8;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...GRAY);
  doc.text('SEÑOR(ES)', lx, y + 18);
  doc.text('PERÍODO', rx, y + 18);
  doc.text('CONCEPTO', rx, y + 52);
  doc.setTextColor(...INK); doc.setFontSize(12);
  doc.text(cliName, lx, y + 34);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...GRAY);
  doc.text(cliLines, lx, y + 34 + cliName.length * 15);
  doc.setTextColor(...INK); doc.setFontSize(10.5);
  doc.text(`${fmtDate(o.desde)} al ${fmtDate(o.hasta)}`, rx, y + 34);
  doc.setFontSize(10);
  doc.text(conceptLines, rx, y + 67);

  y += boxH + 18;

  // ---- Tabla de detalle ----
  const body = o.list.map((e) => [
    fmtDate(e.fecha), e.inicio, e.fin, e.descripcion || '', fmtDur(entryMin(e)),
    plainMoney(Number(e.tarifa)), plainMoney(entryAmount(e)),
  ]);
  doc.autoTable({
    startY: y,
    margin: { left: M, right: M, bottom: 56, top: M },
    head: [['Fecha', 'Inicio', 'Término', 'Detalle', 'Horas', 'Valor hora', 'Monto']],
    body,
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, textColor: INK, cellPadding: { top: 6, bottom: 6, left: 6, right: 6 }, lineColor: [225, 225, 230], lineWidth: { bottom: 0.5 } },
    headStyles: { fillColor: ACCENT, textColor: 255, fontStyle: 'bold', lineWidth: 0 },
    alternateRowStyles: { fillColor: [249, 249, 251] },
    columnStyles: {
      0: { cellWidth: 64 }, 1: { cellWidth: 42, halign: 'center' }, 2: { cellWidth: 50, halign: 'center' },
      3: { cellWidth: 'auto' }, 4: { cellWidth: 44, halign: 'right' }, 5: { cellWidth: 72, halign: 'right' }, 6: { cellWidth: 80, halign: 'right' },
    },
    didParseCell: (d) => {
      if (d.section === 'head') {
        if ([1, 2].includes(d.column.index)) d.cell.styles.halign = 'center';
        if ([4, 5, 6].includes(d.column.index)) d.cell.styles.halign = 'right';
      }
    },
  });

  // ---- Totales ----
  y = doc.lastAutoTable.finalY + 18;
  const ret = o.retOn ? roundMoney((o.totalAmt * o.retPct) / 100) : 0;
  const totalsH = o.retOn ? 124 : 92;
  const payLines = em.pago ? doc.splitTextToSize(em.pago, W - M * 2 - 270) : [];
  if (y + Math.max(totalsH, 24 + payLines.length * 12) > H - 60) { doc.addPage(); y = M; }

  const tw = 250, tx = W - M - tw;
  const line = (label, value, yy, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(10); doc.setTextColor(...INK);
    doc.text(label, tx + 12, yy);
    doc.text(value, tx + tw - 12, yy, { align: 'right' });
  };
  let ty = y + 14;
  line('Total horas', `${fmtDur(o.totalMin)} h  (${num(o.totalMin / 60, 2)} h)`, ty); ty += 18;
  line(o.retOn ? 'Total honorarios' : 'Subtotal', plainMoney(o.totalAmt), ty); ty += 18;
  if (o.retOn) { line(`Retención (${num(o.retPct, 2)}%)`, `- ${plainMoney(ret)}`, ty); ty += 18; }
  doc.setDrawColor(225, 225, 230); doc.setLineWidth(0.5); doc.line(tx, ty - 8, tx + tw, ty - 8);
  doc.setFillColor(...ACCENT);
  doc.roundedRect(tx, ty, tw, 34, 6, 6, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(o.retOn ? 'LÍQUIDO A PAGAR' : 'TOTAL A PAGAR', tx + 12, ty + 22);
  doc.setFontSize(14);
  doc.text(plainMoney(o.totalAmt - ret), tx + tw - 12, ty + 22, { align: 'right' });

  // ---- Datos de pago ----
  if (payLines.length) {
    doc.setTextColor(...GRAY); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.text('DATOS DE PAGO', M, y + 14);
    doc.setTextColor(...INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    doc.text(payLines, M, y + 30);
  }

  // ---- Pie de página ----
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(225, 225, 230); doc.setLineWidth(0.5);
    doc.line(M, H - 38, W - M, H - 38);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY);
    doc.text(`${em.nombre || ''}${em.email ? ' · ' + em.email : ''}`, M, H - 24);
    doc.text(`Boleta N° ${String(o.numero).padStart(6, '0')} · Página ${i} de ${pages}`, W - M, H - 24, { align: 'right' });
  }
  return doc;
}

function pdfMessage() {
  const p = currentPdf;
  const who = state.settings.emisor.nombre ? `\n\nSaludos,\n${state.settings.emisor.nombre}` : '';
  return `Hola${p.client?.nombre ? ' ' + p.client.nombre : ''}, adjunto la boleta N° ${String(p.numero).padStart(6, '0')} por los servicios del ${fmtDate(p.desde)} al ${fmtDate(p.hasta)}. Total a pagar: ${plainMoney(p.total)}.${who}`;
}

async function shareBoleta() {
  if (!currentPdf) return;
  try {
    await navigator.share({ files: [currentPdf.file], title: currentPdf.name, text: pdfMessage() });
  } catch (err) {
    if (err?.name !== 'AbortError') toast('No se pudo compartir. Descarga el PDF.', 'warn');
  }
}

function whatsappBoleta() {
  if (!currentPdf) return;
  // En celulares con "Compartir" disponible, se adjunta el PDF directamente.
  if (navigator.canShare?.({ files: [currentPdf.file] }) && matchMedia('(pointer: coarse)').matches) return shareBoleta();
  downloadBlob(currentPdf.blob, currentPdf.name);
  const phone = (currentPdf.client?.telefono || '').replace(/\D/g, '');
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(pdfMessage())}`;
  window.open(url, '_blank', 'noopener');
  toast('PDF descargado: adjúntalo en el chat de WhatsApp');
}

function emailBoleta() {
  if (!currentPdf) return;
  if (navigator.canShare?.({ files: [currentPdf.file] }) && matchMedia('(pointer: coarse)').matches) return shareBoleta();
  downloadBlob(currentPdf.blob, currentPdf.name);
  const to = currentPdf.client?.email || '';
  const subject = `Boleta N° ${String(currentPdf.numero).padStart(6, '0')} - ${state.settings.emisor.nombre || 'Servicios'}`;
  location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(pdfMessage())}`;
  toast('PDF descargado: adjúntalo en el correo');
}

/* ---------------- AJUSTES ---------------- */
function renderAjustes() {
  const s = state.settings;
  $('#sTarifa').value = s.tarifa;
  $('#sMoneda').value = s.moneda;
  $('#sRetOn').checked = !!s.retencionOn;
  $('#sRetPct').value = s.retencionPct;
  $('#sNext').value = s.nextBoleta;
  $$('[data-emisor]').forEach((el) => (el.value = s.emisor[el.dataset.emisor] || ''));

  // Información de cuenta activa
  if ($('#accountUser')) {
    $('#accountUser').textContent = currentUser ? currentUser : 'Invitado / Local';
    $('#accountStatus').textContent = currentUser ? 'Sesión iniciada' : 'Sin cuenta activa';
  }
  applyTheme();
}

function bindSettings() {
  $$('[data-setting]').forEach((el) => {
    el.addEventListener('change', () => {
      const k = el.dataset.setting;
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (el.type === 'number') v = Number(v) || 0;
      if (k === 'nextBoleta') v = Math.max(1, Math.round(v));
      state.settings[k] = v;
      save();
      toast('Ajuste guardado');
    });
  });
  $$('[data-emisor]').forEach((el) => {
    el.addEventListener('input', () => { state.settings.emisor[el.dataset.emisor] = el.value; save(); });
  });
  $$('#themeSeg button').forEach((b) => b.addEventListener('click', () => {
    state.settings.theme = b.dataset.themeOpt; save(); applyTheme();
  }));

  $('#btnLogout')?.addEventListener('click', async () => {
    if (await confirmBox('¿Cerrar sesión?', 'Podrás volver a ingresar en cualquier momento con tus credenciales.', 'Cerrar sesión', false)) {
      clearSession();
      checkAuthAndInit();
      toast('Sesión cerrada');
    }
  });

  $('#btnExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `respaldo_cobro_horas_${isoDate(new Date())}.json`);
    toast('Respaldo descargado');
  });
  $('#btnImport').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.entries) || !Array.isArray(data.clients)) throw new Error('formato');
      if (!(await confirmBox('¿Importar respaldo?', `Se reemplazarán los datos actuales por ${data.entries.length} registros y ${data.clients.length} clientes.`, 'Importar', true))) return;
      delete data.exportedAt;
      state = normalizeState(data);
      save();
      render();
      toast('Respaldo importado');
    } catch {
      toast('El archivo no es un respaldo válido', 'warn');
    }
  });
  $('#btnReset').addEventListener('click', async () => {
    if (!(await confirmBox('¿Borrar todo?', 'Se eliminarán clientes, registros y ajustes de este usuario. Esta acción no se puede deshacer.', 'Borrar', true))) return;
    state = defaultState();
    save();
    render();
    toast('Datos borrados');
  });
}

/* ---------------- Render general ---------------- */
function render() {
  const current = $$('.view').find((v) => !v.hidden)?.dataset.view || 'registro';
  if (current === 'registro') renderRegistro();
  if (current === 'clientes') renderClientes();
  if (current === 'reportes') renderReportes();
  if (current === 'ajustes') renderAjustes();
}

/* ---------------- Eventos ---------------- */
function bind() {
  $$('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

  $('#prevMonth').addEventListener('click', () => { viewMonth.setMonth(viewMonth.getMonth() - 1); renderRegistro(); });
  $('#nextMonth').addEventListener('click', () => { viewMonth.setMonth(viewMonth.getMonth() + 1); renderRegistro(); });
  $('#btnAddEntry').addEventListener('click', () => openEntry());
  $('#btnAddClient').addEventListener('click', () => openClient());

  // Abrir registros / clientes desde las listas
  document.addEventListener('click', (e) => {
    const en = e.target.closest('[data-entry]');
    if (en) return openEntry(en.dataset.entry);
    const cl = e.target.closest('[data-client]');
    if (cl) return openClient(cl.dataset.client);
  });

  // Cerrar diálogos
  $$('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

  // Diálogo de registro
  const ef = $('#entryForm');
  ef.addEventListener('submit', saveEntry);
  ['inicio', 'fin', 'tarifa'].forEach((n) => ef[n].addEventListener('input', updateEntryCalc));
  ef.clientId.addEventListener('change', () => {
    if (ef.clientId.value === '__new') {
      openClient(null, (c) => {
        ef.clientId.innerHTML = clientOptions(c.id, { allowNew: true });
        ef.clientId.dataset.prev = c.id;
        ef.tarifa.value = rateFor(c.id);
        updateEntryCalc();
      }, () => { ef.clientId.value = ef.clientId.dataset.prev || ''; });
      return;
    }
    ef.clientId.dataset.prev = ef.clientId.value;
    if (!editingEntryId) { ef.tarifa.value = rateFor(ef.clientId.value); updateEntryCalc(); }
  });
  $('#btnDeleteEntry').addEventListener('click', async () => {
    if (!(await confirmBox('¿Eliminar registro?', 'Esta acción no se puede deshacer.', 'Eliminar', true))) return;
    state.entries = state.entries.filter((x) => x.id !== editingEntryId);
    save();
    $('#entryDialog').close();
    render();
    toast('Registro eliminado');
  });

  // Diálogo de cliente
  $('#clientForm').addEventListener('submit', saveClient);
  $('#clientDialog').addEventListener('close', () => {
    if (!clientCallbacks.saved) clientCallbacks.onCancel?.();
    clientCallbacks = {};
  });
  $('#btnDeleteClient').addEventListener('click', async () => {
    const used = state.entries.filter((e) => e.clientId === editingClientId).length;
    const msg = used ? `Este cliente tiene ${used} registro(s) que también se eliminarán.` : 'Esta acción no se puede deshacer.';
    if (!(await confirmBox('¿Eliminar cliente?', msg, 'Eliminar', true))) return;
    state.clients = state.clients.filter((c) => c.id !== editingClientId);
    state.entries = state.entries.filter((e) => e.clientId !== editingClientId);
    if (state.active?.clientId === editingClientId) state.active = null;
    save();
    clientCallbacks.saved = true;
    $('#clientDialog').close();
    render();
    toast('Cliente eliminado');
  });

  // Reportes
  $$('.chip').forEach((c) => c.addEventListener('click', () => {
    if (c.dataset.preset === 'custom') { rpt.preset = 'custom'; renderReportes(); $('#rDesde').focus(); return; }
    setPreset(c.dataset.preset);
  }));
  $('#rDesde').addEventListener('change', (e) => { rpt.desde = e.target.value; rpt.preset = 'custom'; renderReportes(); });
  $('#rHasta').addEventListener('change', (e) => { rpt.hasta = e.target.value; rpt.preset = 'custom'; renderReportes(); });
  $('#rCliente').addEventListener('change', (e) => { rpt.clientId = e.target.value; renderReportes(); });
  $('#btnExcel').addEventListener('click', () => exportExcel().catch((err) => { console.error(err); toast('Error al generar el Excel', 'warn'); }));
  $('#btnBoleta').addEventListener('click', openBoleta);

  // Boleta
  $('#boletaForm').addEventListener('submit', (e) => { try { generateBoleta(e); } catch (err) { console.error(err); toast('Error al generar el PDF', 'warn'); } });
  $('#actShare').addEventListener('click', shareBoleta);
  $('#actDownload').addEventListener('click', () => { downloadBlob(currentPdf.blob, currentPdf.name); toast('PDF descargado'); });
  $('#actWhatsapp').addEventListener('click', whatsappBoleta);
  $('#actEmail').addEventListener('click', emailBoleta);
  $('#actView').addEventListener('click', () => {
    const url = URL.createObjectURL(currentPdf.blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });

  bindSettings();
}

/* ---------------- Autenticación y Flujo de Pantalla de Acceso ---------------- */
let authMode = 'login'; // 'login' | 'register'

function setupAuthUI() {
  const loginScreen = $('#loginScreen');
  const mainApp = $('#mainApp');
  const tabbar = $('.tabbar');
  const tabLogin = $('#tabLogin');
  const tabRegister = $('#tabRegister');
  const confirmRow = $('#authConfirmRow');
  const authForm = $('#authForm');
  const authError = $('#authError');
  const btnAuth = $('#btnAuthSubmit');
  const authNote = $('#authNote');

  function setMode(mode) {
    authMode = mode;
    authError.textContent = '';
    if (mode === 'login') {
      tabLogin.classList.add('active');
      tabLogin.setAttribute('aria-selected', 'true');
      tabRegister.classList.remove('active');
      tabRegister.setAttribute('aria-selected', 'false');
      confirmRow.hidden = true;
      btnAuth.textContent = 'Ingresar';
      authNote.textContent = 'Ingresa con tu correo o número de teléfono registrado';
    } else {
      tabRegister.classList.add('active');
      tabRegister.setAttribute('aria-selected', 'true');
      tabLogin.classList.remove('active');
      tabLogin.setAttribute('aria-selected', 'false');
      confirmRow.hidden = false;
      btnAuth.textContent = 'Crear cuenta e ingresar';
      authNote.textContent = 'Tu cuenta quedará guardada de forma segura para sincronizar en tus dispositivos';
    }
  }

  tabLogin.onclick = () => setMode('login');
  tabRegister.onclick = () => setMode('register');

  authForm.onsubmit = async (e) => {
    e.preventDefault();
    authError.textContent = '';
    const identifier = $('#authIdentifier').value.trim();
    const password = $('#authPassword').value;
    const confirmPassword = $('#authConfirmPassword').value;
    const remember = $('#authRemember').checked;

    if (!identifier) {
      authError.textContent = 'Por favor ingresa un correo o número de teléfono.';
      $('#authIdentifier').focus();
      return;
    }

    if (!password || password.length < 6) {
      authError.textContent = 'La contraseña debe tener al menos 6 caracteres.';
      $('#authPassword').focus();
      return;
    }

    const users = getStoredUsers();
    const cleanId = identifier.toLowerCase();

    if (authMode === 'register') {
      if (password !== confirmPassword) {
        authError.textContent = 'Las contraseñas no coinciden.';
        $('#authConfirmPassword').focus();
        return;
      }

      if (users[cleanId]) {
        authError.textContent = 'Ya existe una cuenta con este identificador. Por favor inicia sesión.';
        return;
      }

      const hash = await hashPassword(password);
      users[cleanId] = {
        identifier,
        hash,
        createdAt: new Date().toISOString()
      };
      saveStoredUsers(users);
      setSessionUser(identifier, remember);
      state = loadState();
      toast('¡Cuenta creada con éxito!');
      loginScreen.hidden = true;
      mainApp.hidden = false;
      tabbar.hidden = false;
      render();
    } else {
      // Modo Iniciar Sesión
      const user = users[cleanId];
      if (!user) {
        // Si no existe ninguna cuenta en el dispositivo, permitir crearla automáticamente o avisar
        const hash = await hashPassword(password);
        users[cleanId] = {
          identifier,
          hash,
          createdAt: new Date().toISOString()
        };
        saveStoredUsers(users);
        setSessionUser(identifier, remember);
        state = loadState();
        toast('¡Bienvenido!');
        loginScreen.hidden = true;
        mainApp.hidden = false;
        tabbar.hidden = false;
        render();
        return;
      }

      const inputHash = await hashPassword(password);
      if (inputHash !== user.hash) {
        authError.textContent = 'Contraseña incorrecta. Por favor intenta de nuevo.';
        $('#authPassword').focus();
        return;
      }

      setSessionUser(user.identifier, remember);
      state = loadState();
      toast(`Hola, ${user.identifier}`);
      loginScreen.hidden = true;
      mainApp.hidden = false;
      tabbar.hidden = false;
      render();
    }
  };
}

function checkAuthAndInit() {
  const loginScreen = $('#loginScreen');
  const mainApp = $('#mainApp');
  const tabbar = $('.tabbar');

  currentUser = getSessionUser();
  if (!currentUser) {
    loginScreen.hidden = false;
    mainApp.hidden = true;
    tabbar.hidden = true;
    $('#authPassword').value = '';
    $('#authConfirmPassword').value = '';
  } else {
    loginScreen.hidden = true;
    mainApp.hidden = false;
    tabbar.hidden = false;
    state = loadState();
    render();
  }
}

/* ---------------- Inicio ---------------- */
applyTheme();
bind();
setupAuthUI();
checkAuthAndInit();
showTab(localStorage.getItem(STORAGE_KEY + '.tab') || 'registro');

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
