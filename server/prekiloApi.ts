import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

/**
 * SuperKilo API — backend Deno sobre Base44.
 * SaaS: registro con WhatsApp + contrato (NIC). Un contrato por cuenta.
 *
 * Acciones: registrar | estado | sync | daily | recarga | reanclar | config | subscribe
 * Todas menos registrar exigen token de la cuenta.
 */

const VAPID_PUBLIC = 'BIqtPx_TyqDS0xMo25-mb0p40Yd6Fuy9R0kN8Iw5xte_v1Ff6LVeLLFlBlEepBVCY8v21I9Q3oZjLhwBknRU0F4';
const VAPID_PRIVATE = '2mGN0otHFzSqiQCsigPh5RLVW_WjNOtCsUYg9Eguqe0';
const VAPID_SUBJECT = 'mailto:dtech.rd@gmail.com';
const DEFAULT_CONFIG = { umbral: 6, recarga_habitual: 16 };
const FALLBACK_AVG = 3.26;
const DR_MS = -4 * 3600 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const round2 = (n: number) => Math.round(n * 100) / 100;
const drNow = () => new Date(Date.now() + DR_MS);
const drDate = (d = drNow()) => d.toISOString().slice(0, 10);
const drIso = (d = drNow()) => d.toISOString().slice(0, 19);
const addDays = (fecha: string, n: number) => {
  const d = new Date(fecha + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const hoursBetween = (a: string, b: string) =>
  (new Date(b + 'Z').getTime() - new Date(a + 'Z').getTime()) / 3600000;

/* ---------------- Edesur ---------------- */

async function edesurReporte(nic: string) {
  const d = drNow();
  const [y, m, dd] = d.toISOString().slice(0, 10).split('-');
  const fecha = `${dd}/${m}/${y}`;
  const H = { Origin: 'https://ov.edesur.com.do', Referer: 'https://ov.edesur.com.do/' };
  const r1 = await fetch(
    `https://teleconsumoapi.edesur.com.do/teleconsumos/GenerarURL?FechaReporte=${fecha}&Nic=${nic}`,
    { headers: H },
  );
  const j1: any = await r1.json();
  if (!j1?.message) throw new Error('Edesur no generó el reporte');
  const r2 = await fetch(
    `https://teleconsumoapi.edesur.com.do/teleconsumos/GetDataTeleconsumoHash?hash=${j1.message}`,
    { headers: H },
  );
  const j2: any = await r2.json();
  const o = j2?.object;
  if (!o || !o.informacionCliente) throw new Error('Contrato sin datos en Edesur');
  return o;
}

async function nicTelemedido(nic: string) {
  const r = await fetch(
    `https://ovapi.edesur.com.do/ovapi/IndraComplaints/checkContractTelemedido?NIC=${nic}`,
    { headers: { Origin: 'https://ov.edesur.com.do', Referer: 'https://ov.edesur.com.do/' } },
  );
  const t = (await r.text()).trim();
  return t === '1';
}

/* ---------------- Datos por contrato ---------------- */

async function lista(base44: any, entidad: string, nic: string, extra: any = {}) {
  const r = await base44.asServiceRole.entities[entidad].filter({ nic, ...extra }, { limit: 400 });
  return r?.items ?? [];
}

async function leerTodo(base44: any, nic: string) {
  const estados = await lista(base44, 'PkEstado', nic);
  const get = (clave: string) => {
    const e = estados.find((x: any) => x.clave === clave);
    if (!e) return null;
    try { return JSON.parse(e.valor); } catch { return null; }
  };
  const consumos = (await lista(base44, 'PkConsumoDia', nic)).map((c: any) => ({ fecha: c.fecha, kwh: Number(c.kwh) }));
  const recargas = (await lista(base44, 'PkRecarga', nic)).map((r: any) => ({
    id: r.id, fecha: r.fecha, kwh: Number(r.kwh), monto_rd: r.monto_rd ?? null, nota: r.nota ?? '',
  }));
  return { anchor: get('anchor'), config: get('config'), sync: get('sync'), consumos, recargas };
}

async function guardarEstado(base44: any, nic: string, clave: string, valor: any) {
  const found = await base44.asServiceRole.entities.PkEstado.filter({ nic, clave }, { limit: 1 });
  const rec = found?.items?.[0];
  const data = { nic, clave, valor: JSON.stringify(valor) };
  if (rec) await base44.asServiceRole.entities.PkEstado.update(rec.id, data);
  else await base44.asServiceRole.entities.PkEstado.create(data);
}

/* ---------------- Cálculo ---------------- */

function calcular(anchorIn: any, config: any, consumos: any[], recargas: any[], sync: any) {
  const hoy = drDate();
  const ahora = drIso();
  const anchor = anchorIn ?? { kwh: 0, ts: `${hoy}T00:00:00` };
  const anchorDate = String(anchor.ts).slice(0, 10);
  const anchorHour = Number(String(anchor.ts).slice(11, 13)) || 0;

  const mapa = new Map<string, number>();
  consumos.forEach((c) => { if (c.fecha <= hoy) mapa.set(c.fecha, Number(c.kwh)); });
  const medidos = [...mapa.entries()].filter(([, v]) => v > 0).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const ult7 = medidos.slice(-7);
  const avg = ult7.length
    ? ult7.reduce((s, [, v]) => s + v, 0) / ult7.length
    : Number(config.promedio_manual) || FALLBACK_AVG;

  let medido = 0;
  for (const [f, v] of medidos) if (f > anchorDate) medido += v;
  const medidoAncla = mapa.get(anchorDate);
  if (medidoAncla && anchorDate < hoy) medido += medidoAncla * ((24 - anchorHour) / 24);

  const lastMeasured = medidos.length ? medidos[medidos.length - 1][0] : anchorDate;
  const coveredEnd = (lastMeasured && lastMeasured >= anchorDate) ? addDays(lastMeasured, 1) + 'T00:00:00' : anchor.ts;
  const desde = coveredEnd > anchor.ts ? coveredEnd : anchor.ts;
  const estimado = avg * (Math.max(0, hoursBetween(desde, ahora)) / 24);

  const tsAncla = String(anchor.ts);
  const recargado = recargas.filter((r) => String(r.fecha) > tsAncla).reduce((s, r) => s + Number(r.kwh || 0), 0);
  const saldo = Math.max(0, round2(Number(anchor.kwh || 0) + recargado - medido - estimado));
  const dias = avg > 0 ? saldo / avg : 0;
  const umbral = Number(config.umbral ?? 6);
  const habitual = Number(config.recarga_habitual ?? 16);
  const ultimos30 = medidos.slice(-30).reverse();

  return {
    ok: true,
    saldo_kwh: saldo,
    promedio_diario: round2(avg),
    dias_restantes: round2(dias),
    horas_restantes: Math.round(dias * 24),
    umbral,
    recarga_habitual: habitual,
    alerta: saldo < umbral,
    critico: saldo <= Math.max(1, umbral / 2),
    porcentaje: habitual > 0 ? Math.round((saldo / habitual) * 100) : 0,
    consumido_desde_ancla: round2(medido + estimado),
    medido: round2(medido),
    estimado: round2(estimado),
    recargado_desde_ancla: round2(recargado),
    ancla: { kwh: Number(anchor.kwh || 0), ts: anchor.ts, fecha: anchorDate },
    consumos: ultimos30.map(([fecha, kwh]) => ({ fecha, kwh: round2(kwh) })),
    recargas,
    hoy: { fecha: hoy, medido: mapa.has(hoy) ? round2(mapa.get(hoy)!) : null, estimado: round2(avg) },
    cliente: sync?.cliente ?? null,
    promedios: sync?.promedios ?? null,
    escala: sync?.escala ?? null,
    medidor: sync?.lecturas?.[0] ?? null,
    ultima_sync: sync?.ts ?? null,
    fecha_hasta: sync?.fechaHasta ?? null,
    ahora,
    nic: null,
  };
}

/* ---------------- Push ---------------- */

async function enviarPush(base44: any, payload: any, nic: string) {
  const subs = await base44.asServiceRole.entities.PkSuscripcion.filter({ nic, activa: true }, { limit: 50 });
  const listaSubs = subs?.items ?? [];
  if (!listaSubs.length) return { enviados: 0, error: 'sin suscripciones' };
  let webpush: any;
  try {
    webpush = (await import('npm:web-push@3.6.7')).default;
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  } catch (e) {
    return { enviados: 0, error: 'web-push no disponible: ' + String(e) };
  }
  let ok = 0;
  for (const s of listaSubs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
      );
      ok++;
      await base44.asServiceRole.entities.PkSuscripcion.update(s.id, { ultimo_envio: drIso() });
    } catch (e: any) {
      const code = e?.statusCode;
      if (code === 404 || code === 410) {
        await base44.asServiceRole.entities.PkSuscripcion.update(s.id, { activa: false }).catch(() => {});
      }
    }
  }
  return { enviados: ok };
}

/* ---------------- Handler ---------------- */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const base44 = createClientFromRequest(req);
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const action = String(body.action || 'state');

  try {
    /* --- registro --- */
    if (action === 'registrar') {
      const whatsapp = String(body.whatsapp || '').replace(/\D/g, '');
      const nic = String(body.nic || '').replace(/\D/g, '');
      if (whatsapp.length < 10) return json({ ok: false, error: 'WhatsApp inválido' }, 400);
      if (nic.length < 5) return json({ ok: false, error: 'Contrato inválido' }, 400);

      const porNic = await base44.asServiceRole.entities.PkCuenta.filter({ nic }, { limit: 1 });
      const dueno = porNic?.items?.[0];
      if (dueno && String(dueno.whatsapp) !== whatsapp) {
        return json({ ok: false, error: 'Ese contrato ya está registrado con otro WhatsApp' }, 409);
      }
      const porWa = await base44.asServiceRole.entities.PkCuenta.filter({ whatsapp }, { limit: 1 });
      const yaWa = porWa?.items?.[0];
      if (yaWa && String(yaWa.nic) !== nic) {
        return json({ ok: false, error: 'Ese WhatsApp ya tiene un contrato asociado' }, 409);
      }

      const telemedido = await nicTelemedido(nic).catch(() => false);
      let reporte: any = null;
      try { reporte = await edesurReporte(nic); } catch (e: any) {
        return json({ ok: false, error: 'No pude leer ese contrato en Edesur: ' + String(e?.message || e) }, 422);
      }

      const token = crypto.randomUUID().replace(/-/g, '');
      const cliente = reporte.informacionCliente || {};
      const data = { whatsapp, nic, token, nombre: cliente.nombreCliente || '', activo: true, telemedido };
      const cuenta = dueno
        ? await base44.asServiceRole.entities.PkCuenta.update(dueno.id, data)
        : await base44.asServiceRole.entities.PkCuenta.create(data);

      const consumos = (reporte.historicoConsumoDiario || []).map((d: any) => ({
        nic, fecha: String(d.fecha).slice(0, 10), kwh: Number(d.consumo), tipo_dia: String(d.tipoDia), origen: 'edesur',
      })).filter((d: any) => d.kwh > 0 && d.fecha);
      const previos = await lista(base44, 'PkConsumoDia', nic);
      const ya = new Set(previos.map((p: any) => p.fecha));
      const nuevos = consumos.filter((d: any) => !ya.has(d.fecha));
      if (nuevos.length) await base44.asServiceRole.entities.PkConsumoDia.bulkCreate(nuevos);

      if (body.kwh !== undefined && body.kwh !== null && body.kwh !== '') {
        await guardarEstado(base44, nic, 'anchor', { kwh: Number(body.kwh), ts: drIso() });
      }
      await guardarEstado(base44, nic, 'sync', {
        ts: drIso(), fechaHasta: reporte.parametros?.fechaHasta ?? null,
        cliente, promedios: reporte.habitosConsumo, escala: reporte.escalaPrecios,
        lecturas: reporte.resumenLecturas || [], mensual: reporte.historicoConsumoMensual || [],
      });
      const todo = await leerTodo(base44, nic);
      const st = calcular(todo.anchor, { ...DEFAULT_CONFIG, ...(todo.config || {}) }, todo.consumos, todo.recargas, todo.sync);
      return json({ ...st, nic, token, nombre: cliente.nombreCliente || '', telemedido });
    }

    /* --- autenticación por token --- */
    const token = String(body.token || '');
    const cs = await base44.asServiceRole.entities.PkCuenta.filter({ token }, { limit: 1 });
    const cuenta = cs?.items?.[0];
    if (!cuenta) return json({ ok: false, error: 'sesion' }, 401);
    const nic = String(cuenta.nic);

    if (action === 'state' || action === 'estado') {
      const t = await leerTodo(base44, nic);
      const st = calcular(t.anchor, { ...DEFAULT_CONFIG, ...(t.config || {}) }, t.consumos, t.recargas, t.sync);
      return json({ ...st, nic, nombre: cuenta.nombre || '', telemedido: cuenta.telemedido });
    }

    if (action === 'sync' || action === 'daily') {
      let sync_error: string | null = null;
      try {
        const reporte = await edesurReporte(nic);
        const consumos = (reporte.historicoConsumoDiario || []).map((d: any) => ({
          nic, fecha: String(d.fecha).slice(0, 10), kwh: Number(d.consumo), tipo_dia: String(d.tipoDia), origen: 'edesur',
        })).filter((d: any) => d.kwh > 0 && d.fecha);
        const previos = await lista(base44, 'PkConsumoDia', nic);
        const ya = new Set(previos.map((p: any) => p.fecha));
        const nuevos = consumos.filter((d: any) => !ya.has(d.fecha));
        if (nuevos.length) await base44.asServiceRole.entities.PkConsumoDia.bulkCreate(nuevos);
        await guardarEstado(base44, nic, 'sync', {
          ts: drIso(), fechaHasta: reporte.parametros?.fechaHasta ?? null,
          cliente: reporte.informacionCliente, promedios: reporte.habitosConsumo,
          escala: reporte.escalaPrecios, lecturas: reporte.resumenLecturas || [],
          mensual: reporte.historicoConsumoMensual || [],
        });
      } catch (e: any) {
        sync_error = String(e?.message || e);
      }
      const t = await leerTodo(base44, nic);
      const st = calcular(t.anchor, { ...DEFAULT_CONFIG, ...(t.config || {}) }, t.consumos, t.recargas, t.sync);
      let push = null;
      if (action === 'daily' && st.alerta) {
        push = await enviarPush(base44, {
          title: st.critico ? 'Te quedan pocas horas de luz' : 'Saldo de luz bajo',
          body: `Te quedan ${st.saldo_kwh} kWh (${Math.round(st.horas_restantes)} h). Contrato ${nic}.`,
          url: './',
        }, nic);
      }
      return json({ ...st, nic, nombre: cuenta.nombre || '', telemedido: cuenta.telemedido, synced: !sync_error, sync_error, push });
    }

    if (action === 'recarga') {
      const kwh = Number(body.kwh);
      if (!kwh || kwh <= 0) return json({ ok: false, error: 'kWh inválidos' }, 400);
      await base44.asServiceRole.entities.PkRecarga.create({
        nic, fecha: drIso(), kwh, monto_rd: body.monto_rd ? Number(body.monto_rd) : null,
        nota: body.nota || 'Recarga registrada en SuperKilo',
      });
      const t = await leerTodo(base44, nic);
      return json({ ...calcular(t.anchor, { ...DEFAULT_CONFIG, ...(t.config || {}) }, t.consumos, t.recargas, t.sync), nic });
    }

    if (action === 'reanclar') {
      const kwh = Number(body.kwh);
      if (Number.isNaN(kwh) || kwh < 0) return json({ ok: false, error: 'Saldo inválido' }, 400);
      await guardarEstado(base44, nic, 'anchor', { kwh, ts: body.ts || drIso() });
      const t = await leerTodo(base44, nic);
      return json({ ...calcular(t.anchor, { ...DEFAULT_CONFIG, ...(t.config || {}) }, t.consumos, t.recargas, t.sync), nic });
    }

    if (action === 'config') {
      const prev = (await leerTodo(base44, nic)).config || {};
      await guardarEstado(base44, nic, 'config', {
        ...DEFAULT_CONFIG, ...prev,
        umbral: body.umbral !== undefined ? Number(body.umbral) : (prev.umbral ?? 6),
        recarga_habitual: body.recarga_habitual !== undefined ? Number(body.recarga_habitual) : (prev.recarga_habitual ?? 16),
      });
      const t = await leerTodo(base44, nic);
      return json({ ...calcular(t.anchor, { ...DEFAULT_CONFIG, ...(t.config || {}) }, t.consumos, t.recargas, t.sync), nic });
    }

    if (action === 'subscribe') {
      const sub = body.subscription || {};
      if (!sub.endpoint) return json({ ok: false, error: 'Suscripción inválida' }, 400);
      const existe = await base44.asServiceRole.entities.PkSuscripcion.filter({ endpoint: sub.endpoint }, { limit: 1 });
      const data = {
        endpoint: sub.endpoint, p256dh: sub.keys?.p256dh ?? '', auth: sub.keys?.auth ?? '',
        agente: String(body.agente || '').slice(0, 120), activa: true, nic,
      };
      if (existe?.items?.[0]) await base44.asServiceRole.entities.PkSuscripcion.update(existe.items[0].id, data);
      else await base44.asServiceRole.entities.PkSuscripcion.create(data);
      return json({ ok: true, suscrito: true });
    }

    if (action === 'vapid') return json({ ok: true, publicKey: VAPID_PUBLIC });

    return json({ ok: false, error: 'Acción desconocida' }, 400);
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
