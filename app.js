/* Prekilo · PWA de energía prepago (Edesur)
   Backend Deno: Base44 function prekiloApi
   Local: IndexedDB para funcionar sin internet */
'use strict';

const API = 'https://ca-68f01a11.base44.app/functions/prekiloApi';
const DB_NAME = 'prekilo';
const DB_STORE = 'kv';
const REFRESH_MS = 60_000;

const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 2.6 15a1.7 1.7 0 0 0-1.6-1H1a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 2.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 7 4.6h.09A1.7 1.7 0 0 0 8.1 3V2.9a2 2 0 1 1 4 0V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="none"><path d="M13.4 2 4 13.4h6.1L9.8 22 20 10.2h-6.3L13.4 2Z" fill="currentColor"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.8"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V4a1 1 0 0 1 1-1h8a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6Z"/><circle cx="7.5" cy="7.5" r="1.4" fill="currentColor" stroke="none"/></svg>'
};
function paintIcons(root = document) {
  root.querySelectorAll('[data-ico]').forEach((el) => {
    const svg = ICONS[el.dataset.ico];
    if (svg) { el.innerHTML = svg; }
  });
}

/* ---------------- IndexedDB ---------------- */
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(DB_STORE)) r.result.createObjectStore(DB_STORE); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function kvSet(k, v) {
  try {
    const db = await idb();
    await new Promise((res, rej) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(v, k);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  } catch (e) { /* sin storage */ }
}
async function kvGet(k) {
  try {
    const db = await idb();
    return await new Promise((res, rej) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const rq = tx.objectStore(DB_STORE).get(k);
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    });
  } catch (e) { return null; }
}
async function kvClear() {
  try {
    const db = await idb();
    await new Promise((res, rej) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).clear();
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  } catch (e) {}
}

/* ---------------- API ---------------- */
async function api(action, extra = {}) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...extra })
  });
  const j = await r.json();
  if (j && j.ok === false && j.error) throw new Error(j.error);
  return j;
}

/* ---------------- Estado ---------------- */
let STATE = null;        // último estado del servidor
let EXPIRA = null;       // instante estimado de agotamiento
let OFFLINE = false;

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const n1 = (v, d = 1) => (v === null || v === undefined || Number.isNaN(Number(v)) ? '—' : Number(v).toFixed(d));
const fFecha = (s) => {
  if (!s) return '—';
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  const M = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d} ${M[m - 1]} ${y}`;
};
const fHora = (iso) => (iso ? String(iso).slice(11, 16) : '—');
const fNum = (v) => Number(v || 0).toLocaleString('es-DO', { maximumFractionDigits: 2 });

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('on'), 2600);
}

function setConn(mode, txt) {
  OFFLINE = mode === 'off';
  ['#conn-top', '#conn-rail'].forEach((sel) => {
    const el = $(sel);
    if (!el) return;
    el.classList.toggle('on', mode === 'on');
    el.classList.toggle('off', mode === 'off');
    const t = el.querySelector('.conn-txt');
    if (t) t.textContent = txt;
  });
}

/* ---------------- Render ---------------- */
function render(st) {
  if (!st) return;
  STATE = st;

  const saldo = Number(st.saldo_kwh ?? 0);
  const prom = Number(st.promedio_diario ?? 3.26);
  const umbral = Number(st.umbral ?? 6);
  const habitual = Number(st.recarga_habitual ?? 16);

  // Hero
  const hero = $('#hero');
  hero.classList.toggle('is-warn', !!st.alerta && !st.critico);
  hero.classList.toggle('is-bad', !!st.critico);
  $('#saldo').textContent = n1(saldo, 2);
  const pill = $('#estado-pill');
  pill.className = 'pill' + (st.critico ? ' bad' : st.alerta ? ' warn' : '');
  pill.textContent = st.critico ? 'Crítico' : st.alerta ? 'Saldo bajo' : 'Energía estable';
  $('#hero-ahora').textContent = 'act. ' + fHora(st.ahora || st.ultima_sync);
  $('#hero-sub').textContent = st.alerta
    ? `por debajo de tu umbral de ${n1(umbral, 1)} kWh`
    : 'disponibles ahora';

  const pct = Math.max(0, Math.min(100, (saldo / (habitual || 16)) * 100));
  $('#bar-fill').style.width = pct.toFixed(2) + '%';
  $('#bar').setAttribute('aria-valuenow', pct.toFixed(1));
  const markPct = Math.max(1, Math.min(99, (umbral / (habitual || 16)) * 100));
  $('#bar-mark').style.left = markPct + '%';
  $('#bar-left').textContent = Math.round(pct) + '% restante';
  $('#bar-right').textContent = `de ${n1(habitual, 0)} kWh recargados`;

  $('#dias').textContent = n1(st.dias_restantes, 1);
  $('#horas').textContent = n1(st.horas_restantes, 0) + ' h';

  // Aviso
  const al = $('#alerta');
  if (st.alerta) {
    al.hidden = false;
    al.classList.toggle('crit', !!st.critico);
    $('#alerta-t').textContent = st.critico ? 'Se te acaba la luz' : 'Saldo bajo el umbral';
    $('#alerta-p').textContent = `Quedan ${n1(saldo, 2)} kWh · unas ${Math.round(st.horas_restantes)} h. Recarga ${n1(habitual, 0)} kWh para volver a estar tranquilo.`;
  } else {
    al.hidden = true;
  }

  // Hoy
  const hoy = st.hoy || {};
  $('#hoy-fecha').textContent = fFecha(hoy.fecha);
  const hoyVal = hoy.medido !== null && hoy.medido !== undefined ? hoy.medido : hoy.estimado;
  $('#hoy-kwh').textContent = n1(hoyVal, 2);
  $('#hoy-nota').textContent = hoy.medido !== null && hoy.medido !== undefined
    ? 'Lectura del medidor confirmada.'
    : 'Estimado con tu promedio (el medidor cierra el día a las 12 a. m.).';

  // Cuenta regresiva
  EXPIRA = Date.now() + Math.max(0, Number(st.horas_restantes || 0)) * 3600_000;
  tickCountdown();
  $('#agota-nota').textContent = `Con ${n1(prom, 2)} kWh/día de promedio real.`;

  // Sparkline 7 días
  const ult7 = (st.consumos || []).slice(0, 7).reverse();
  const max7 = Math.max(1, ...ult7.map((x) => x.kwh));
  const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  $('#spark7').innerHTML = ult7.map((x) => {
    const d = new Date(x.fecha + 'T12:00:00');
    const fin = d.getDay() === 0 || d.getDay() === 6;
    const h = Math.max(6, (x.kwh / max7) * 76);
    return `<div class="b" title="${fFecha(x.fecha)}: ${n1(x.kwh, 2)} kWh">
      <div class="bar-v${fin ? ' fin' : ''}" style="height:${h}px"></div>
      <span class="lbl">${dias[d.getDay()]}</span></div>`;
  }).join('') || '<p class="muted tiny">Sin datos todavía.</p>';
  const tot7 = ult7.reduce((s, x) => s + Number(x.kwh || 0), 0);
  $('#spark-tot').textContent = `${n1(tot7, 1)} kWh en total`;

  // Chart 30 días
  const c30 = (st.consumos || []).slice(0, 30).reverse();
  const max30 = Math.max(1, ...c30.map((x) => x.kwh));
  $('#chart30').innerHTML = c30.map((x) => {
    const d = new Date(x.fecha + 'T12:00:00');
    const fin = d.getDay() === 0 || d.getDay() === 6;
    const h = Math.max(3, (x.kwh / max30) * 100);
    const cls = x.kwh === max30 ? ' max' : fin ? ' fin' : '';
    return `<div class="cb${cls}" style="height:${h}%" title="${fFecha(x.fecha)}: ${n1(x.kwh, 2)} kWh"></div>`;
  }).join('') || '<p class="muted tiny">Sin datos todavía. Sincroniza para descargar el histórico del medidor.</p>';

  // KPIs promedio
  const pr = st.promedios || {};
  $('#kpi-avg').textContent = n1(pr.promedioGeneral ?? prom, 2);
  $('#kpi-entre').textContent = n1(pr.promedioDiasSemana ?? prom, 2);
  $('#kpi-fin').textContent = n1(pr.promedioFinSemana ?? prom, 2);

  // Lista consumo
  const lc = $('#lista-consumo');
  lc.innerHTML = (st.consumos || []).slice(0, 14).map((x) => {
    const d = new Date(x.fecha + 'T12:00:00');
    const nombre = d.toLocaleDateString('es-DO', { weekday: 'long' });
    return `<li><span class="lft"><strong style="text-transform:capitalize">${nombre}</strong><small>${fFecha(x.fecha)}</small></span>
      <span class="kwh-v">${n1(x.kwh, 2)} kWh</span></li>`;
  }).join('');
  const med = st.medidor;
  $('#med-linea').textContent = med ? `Lectura ${fNum(med.energiaActiva)} · ${fFecha(med.fecha)}` : '—';

  // Recargas
  const recs = st.recargas || [];
  const lr = $('#lista-recargas');
  lr.innerHTML = recs.length
    ? recs.map((r) => `<li><span class="lft"><strong>+${n1(r.kwh, 1)} kWh</strong><small>${fFecha(r.fecha)} · ${fHora(r.fecha)}</small></span>
        <span class="kwh-v muted">${r.monto_rd ? 'RD$ ' + fNum(r.monto_rd) : ''}</span></li>`).join('')
    : '<li class="empty">Aún no hay recargas registradas.</li>';
  $('#rec-tot').textContent = recs.length ? `+${n1(recs.reduce((s, r) => s + Number(r.kwh || 0), 0), 1)} kWh` : '—';

  // Servicios: tarifa y cliente
  const esc = st.escala || [];
  $('#lista-tarifa').innerHTML = esc.length
    ? esc.map((e) => `<li><span class="lft"><strong>${e.escala} kWh</strong><small>escala de precio</small></span>
        <span class="kwh-v">RD$ ${n1(e.precio, 2)}</span></li>`).join('')
    : '<li class="empty">Sincroniza para ver la escala de precios.</li>';
  const cli = st.cliente || {};
  $('#contrato-tarifa').textContent = cli.tarifa || '—';
  $('#tarifa-tipo').textContent = cli.tarifa || 'BTS1';
  const kv = [
    ['Cliente', cli.nombreCliente],
    ['NIC', cli.nic],
    ['NIS', cli.nis],
    ['Medidor', cli.numeroMedidor],
    ['Marca', cli.marcaMedidor],
    ['Dirección', cli.direccion],
    ['Circuito', cli.circuitoDistribucion],
    ['Centro de transformación', cli.centroTransformacion]
  ].filter(([, v]) => v);
  $('#kv-cliente').innerHTML = kv.length
    ? kv.map(([k, v]) => `<li><span>${k}</span><span>${v}</span></li>`).join('')
    : '<li><span class="muted">Sincroniza para ver los datos del contrato.</span></li>';

  // Ajustes
  $('#inp-umbral').value = umbral;
  $('#inp-hab').value = habitual;
  $('#ancla-linea').textContent = st.ancla ? `Ancla: ${n1(st.ancla.kwh, 2)} kWh · ${fFecha(st.ancla.fecha)} ${fHora(st.ancla.ts)}` : '—';
  $('#ult-sync').textContent = st.ultima_sync ? 'Sync ' + fFecha(st.ultima_sync) + ' ' + fHora(st.ultima_sync) : '—';
  $('#sync-line').textContent = st.ultima_sync
    ? `Actualizado ${fFechaCorta(st.ultima_sync)} · ${fHora(st.ultima_sync)}`
    : 'Sin sincronizar';
}

function fFechaCorta(iso) {
  if (!iso) return '—';
  const d = new Date(iso.length <= 19 ? iso + 'Z' : iso);
  if (isNaN(d)) return '—';
  const wd = d.toLocaleDateString('es-DO', { weekday: 'short' }).replace('.', '');
  const dia = d.getDate();
  return wd.charAt(0).toUpperCase() + wd.slice(1) + ', ' + dia;
}

function tickCountdown() {
  if (!EXPIRA) return;
  const ms = EXPIRA - Date.now();
  const el = $('#agota-cd');
  const lab = $('#agota-lab');
  const et = $('#agota-et');
  if (!el) return;
  if (ms <= 0) {
    el.textContent = '0 h';
    lab.textContent = 'sin energía';
    et.textContent = '—';
    return;
  }
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  el.textContent = d > 0 ? `${d} d ${h} h` : `${h} h ${String(m).padStart(2, '0')} m`;
  el.style.color = totalMin < 360 ? 'var(--red)' : '';
  lab.textContent = 'cuenta regresiva';
  const f = new Date(EXPIRA);
  et.textContent = f.toLocaleDateString('es-DO', { day: 'numeric', month: 'short' }) + ' · ' + f.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
}
setInterval(tickCountdown, 1000);

/* Decaimiento local cuando no hay red */
function decay(st) {
  if (!st) return st;
  const ahoraIso = new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 19);
  const desde = st.ahora || ahoraIso;
  const horas = Math.max(0, (new Date(ahoraIso + 'Z') - new Date(desde + 'Z')) / 3600_000);
  const gastado = (Number(st.promedio_diario) || 3.26) * (horas / 24);
  const saldo = Math.max(0, Number(st.saldo_kwh || 0) - gastado);
  const prom = Number(st.promedio_diario) || 3.26;
  const dias = saldo / prom;
  return {
    ...st,
    saldo_kwh: Math.round(saldo * 100) / 100,
    dias_restantes: Math.round(dias * 100) / 100,
    horas_restantes: Math.round(dias * 24),
    porcentaje: Math.max(0, Math.min(100, (saldo / (Number(st.recarga_habitual) || 16)) * 100)),
    alerta: saldo < Number(st.umbral || 6),
    critico: saldo < Number(st.umbral || 6) / 2,
    ahora: ahoraIso
  };
}

/* ---------------- Flujo ---------------- */
async function cargar(accion = 'state', silencioso = false) {
  const btn = $('#btn-refresh');
  if (!silencioso) btn.classList.add('spin');
  try {
    const st = await api(accion);
    if (st && st.ok) {
      render(st);
      await kvSet('state', st);
      setConn('on', 'En línea');
      if (st.sync_error) toast('Edesur no respondió: ' + st.sync_error);
    } else {
      throw new Error((st && st.error) || 'respuesta inválida');
    }
  } catch (e) {
    const cached = await kvGet('state');
    if (cached) {
      render(decay(cached));
      setConn('off', 'Sin conexión');
      if (!silencioso) toast('Sin red: mostrando datos guardados');
    } else {
      setConn('off', 'Sin conexión');
      if (!silencioso) toast('No pude conectar con el servidor');
    }
  } finally {
    btn.classList.remove('spin');
  }
}

async function sincronizar() {
  const btn = $('#btn-refresh');
  btn.classList.add('spin');
  try {
    const st = await api('sync');
    render(st);
    await kvSet('state', st);
    setConn('on', 'En línea');
    toast(st.synced === false ? 'Edesur no respondió ahora' : `Sincronizado · ${n1(st.saldo_kwh, 2)} kWh`);
    if (STATE && STATE.alerta && 'Notification' in window && Notification.permission === 'granted') {
      // el aviso real lo dispara el backend a las 2 p.m.
    }
  } catch (e) {
    toast('No se pudo sincronizar: ' + (e.message || 'error'));
    setConn('off', 'Sin conexión');
  } finally {
    btn.classList.remove('spin');
  }
}

/* ---------------- Push ---------------- */
function b64ToU8(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const s = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
function pushUI() {
  const el = $('#push-estado');
  const btn = $('#btn-push');
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    el.textContent = 'Este navegador no soporta notificaciones push.';
    btn.disabled = true;
    btn.textContent = 'No disponible';
    return;
  }
  if (Notification.permission === 'granted') {
    el.textContent = 'Activadas en este equipo.';
    btn.textContent = 'Probar';
  } else if (Notification.permission === 'denied') {
    el.textContent = 'Bloqueadas por el navegador. Actívalas en los ajustes del sitio.';
    btn.textContent = 'Bloqueadas';
    btn.disabled = true;
  } else {
    el.textContent = 'Sin activar.';
    btn.textContent = 'Activar';
  }
}
async function activarPush() {
  try {
    if (Notification.permission === 'granted' && await yaSuscrito()) {
      const r = await api('pushTest');
      toast(r.enviados ? 'Notificación enviada' : 'No hay equipos suscritos');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('No diste permiso de notificaciones'); pushUI(); return; }
    const { vapid_public } = await api('vapid');
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64ToU8(vapid_public)
    });
    await api('subscribe', { subscription: sub.toJSON(), agente: navigator.userAgent.slice(0, 150) });
    toast('Notificaciones activadas');
    pushUI();
  } catch (e) {
    toast('No se pudo activar: ' + (e.message || 'error'));
  }
}
async function yaSuscrito() {
  try {
    const reg = await navigator.serviceWorker.ready;
    return !!(await reg.pushManager.getSubscription());
  } catch { return false; }
}


/* ---------------- Instalación (PWA) ---------------- */
let INSTALL_EVT = null;
const esStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  INSTALL_EVT = e;
  mostrarInstall();
});
function mostrarInstall() {
  if (esStandalone()) return;
  const el = $('#install');
  if (!el) return;
  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!INSTALL_EVT && !esIOS) return;
  el.hidden = false;
  if (esIOS) {
    $('#install-p').textContent = 'En iPhone: Compartir → Añadir a pantalla de inicio.';
    $('#btn-install').textContent = 'Cómo';
  }
}

/* ---------------- Navegación ---------------- */
function go(view) {
  $$('.view').forEach((v) => v.classList.toggle('is-active', v.id === 'view-' + view));
  $$('.tab').forEach((b) => b.classList.toggle('is-active', b.dataset.view === view));
  $$('.rail-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.view === view));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
}

/* ---------------- Eventos ---------------- */
function wire() {
  $$('[data-view]').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
  $('#btn-refresh').addEventListener('click', sincronizar);
  $('#btn-sync2').addEventListener('click', sincronizar);

  const bRec = $('#btn-recarga');
  if (bRec) bRec.addEventListener('click', () => {
    go('recargas');
    $('#inp-kwh').value = STATE ? STATE.recarga_habitual : 16;
  });

  const bAnc = $('#btn-ancla');
  if (bAnc) bAnc.addEventListener('click', () => {
    go('ajustes');
    $('#inp-ancla').value = STATE ? STATE.saldo_kwh : '';
  });

  $('#btn-add-recarga').addEventListener('click', async () => {
    const kwh = Number($('#inp-kwh').value);
    if (!kwh || kwh <= 0) { toast('Pon una cantidad de kWh válida'); return; }
    try {
      const st = await api('recarga', { kwh });
      render(st); await kvSet('state', st);
      toast(`Recarga de ${kwh} kWh registrada`);
    } catch (e) { toast('No se pudo registrar: ' + (e.message || '')); }
  });

  $$('.tag[data-kwh]').forEach((b) => b.addEventListener('click', () => { $('#inp-kwh').value = b.dataset.kwh; }));

  $('#btn-set-ancla').addEventListener('click', async () => {
    const kwh = Number($('#inp-ancla').value);
    if (Number.isNaN(kwh) || kwh < 0) { toast('Pon un saldo válido'); return; }
    try {
      const st = await api('reanclar', { kwh });
      render(st); await kvSet('state', st);
      toast('Saldo calibrado con el medidor');
    } catch (e) { toast('No se pudo calibrar: ' + (e.message || '')); }
  });

  $('#btn-guardar').addEventListener('click', async () => {
    const umbral = Number($('#inp-umbral').value);
    const habitual = Number($('#inp-hab').value);
    if (!umbral || !habitual) { toast('Revisa los valores'); return; }
    try {
      const st = await api('config', { umbral, recarga_habitual: habitual });
      render(st); await kvSet('state', st);
      toast('Ajustes guardados');
    } catch (e) { toast('No se pudo guardar: ' + (e.message || '')); }
  });

  $('#btn-push').addEventListener('click', activarPush);

  const bi = $('#btn-install');
  if (bi) {
    bi.addEventListener('click', async () => {
      if (INSTALL_EVT) {
        INSTALL_EVT.prompt();
        const r = await INSTALL_EVT.userChoice;
        if (r.outcome === 'accepted') { $('#install').hidden = true; toast('Prekilo instalada'); }
        INSTALL_EVT = null;
      } else {
        toast('Compartir → Añadir a pantalla de inicio');
      }
    });
  }


  $('#btn-limpiar').addEventListener('click', async () => {
    await kvClear();
    toast('Datos locales borrados');
    STATE = null;
    cargar('state');
  });

  window.addEventListener('online', () => { setConn('on', 'En línea'); cargar('state', true); });
  window.addEventListener('offline', () => setConn('off', 'Sin conexión'));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && STATE) tickCountdown();
  });
}

/* ---------------- Arranque ---------------- */
(async function init() {
  paintIcons();
  wire();
  const inicial = (location.hash || '#inicio').slice(1);
  go(['inicio', 'consumo', 'recargas', 'servicios', 'ajustes'].includes(inicial) ? inicial : 'inicio');

  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('sw.js', { scope: './' }); } catch (e) {}
  }

  const cached = await kvGet('state');
  if (cached) { render(cached); setConn(navigator.onLine ? 'on' : 'off', navigator.onLine ? 'En línea' : 'Sin conexión'); }

  await cargar('state', true);
  pushUI();
  mostrarInstall();
  setInterval(() => { if (navigator.onLine) cargar('state', true); }, REFRESH_MS);
})();
