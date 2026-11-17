import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

/**
 * Prekilo API — backend Deno (Base44 functions)
 * Consulta el reporte oficial de teleconsumo de Edesur con solo el NIC,
 * guarda el consumo diario real y calcula el saldo de kWh disponible.
 *
 * Acciones (POST body.action):
 *   state     -> estado calculado (saldo, dias, horas, historial)
 *   sync      -> jala el reporte de Edesur y actualiza el consumo del medidor
 *   daily     -> sync + aviso push si el saldo esta por debajo del umbral
 *   recarga   -> registra una recarga de kWh
 *   reanclar  -> fija el saldo real que muestra el medidor
 *   config    -> guarda umbral y recarga habitual
 *   subscribe -> guarda la suscripcion push del navegador
 *   pushTest  -> envia una notificacion de prueba
 */

const NIC = '7014973';
const VAPID_PUBLIC = 'BIqtPx_TyqDS0xMo25-mb0p40Yd6Fuy9R0kN8Iw5xte_v1Ff6LVeLLFlBlEepBVCY8v21I9Q3oZjLhwBknRU0F4';
const VAPID_PRIVATE = '2mGN0otHFzSqiQCsigPh5RLVW_WjNOtCsUYg9Eguqe0';
const VAPID_SUBJECT = 'mailto:dtech.rd@gmail.com';

const DEFAULT_CONFIG = { umbral: 6, recarga_habitual: 16, promedio_manual: null };
const FALLBACK_AVG = 3.26;
const DR_MS = -4 * 3600 * 1000; // America/Santo_Domingo (UTC-4, sin horario de verano)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// Reloj de pared en Republica Dominicana
function drNow() {
  return new Date(Date.now() + DR_MS);
}
function drDate(d = drNow()) {
  return d.toISOString().slice(0, 10);
}
function drIso(d = drNow()) {
  return d.toISOString().slice(0, 19);
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function hoursBetween(aIso: string, bIso: string) {
  return (new Date(bIso + 'Z').getTime() - new Date(aIso + 'Z').getTime()) / 3600000;
}
function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function getEstado(base44: any, clave: string) {
  const page = await base44.asServiceRole.entities.PkEstado.filter({ clave }, { limit: 1 });
  const rec = page?.items?.[0];
  if (!rec) return null;
  try {
    return { id: rec.id, data: JSON.parse(rec.valor || '{}') };
  } catch {
    return { id: rec.id, data: {} };
  }
}

async function setEstado(base44: any, clave: string, data: unknown) {
  const valor = JSON.stringify(data);
  const cur = await getEstado(base44, clave);
  if (cur?.id) {
    await base44.asServiceRole.entities.PkEstado.update(cur.id, { clave, valor });
  } else {
    await base44.asServiceRole.entities.PkEstado.create({ clave, valor });
  }
  return data;
}

/* ---------------- Edesur ---------------- */

async function consultarEdesur() {
  const hoy = drNow();
  const fecha = `${String(hoy.getUTCDate()).padStart(2, '0')}/${String(hoy.getUTCMonth() + 1).padStart(2, '0')}/${hoy.getUTCFullYear()}`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
    'Origin': 'https://ov.edesur.com.do',
    'Referer': 'https://ov.edesur.com.do/',
  };
  const urlGen = `https://teleconsumoapi.edesur.com.do/teleconsumos/GenerarURL?FechaReporte=${encodeURIComponent(fecha)}&Nic=${NIC}`;
  const r1 = await fetch(urlGen, { headers });
  const j1 = await r1.json();
  const hash = j1?.message;
  if (!hash) {
    return { ok: false, error: j1?.Message || 'Edesur no devolvio el enlace del reporte', raw: j1 };
  }
  const r2 = await fetch(`https://teleconsumoapi.edesur.com.do/teleconsumos/GetDataTeleconsumoHash?hash=${encodeURIComponent(hash)}`, { headers });
  const j2 = await r2.json();
  if (!j2?.object) {
    return { ok: false, error: j2?.Message || 'Reporte de teleconsumo no disponible', raw: j2 };
  }
  return { ok: true, reporte: j2.object, hash };
}

/* ---------------- Calculo ---------------- */

function computeState(opts: {
  anchor: { kwh: number; ts: string };
  config: { umbral: number; recarga_habitual: number; promedio_manual: number | null };
  consumos: { fecha: string; kwh: number; tipo_dia?: string }[];
  recargas: { fecha: string; kwh: number }[];
  lastSync?: any;
}) {
  const { anchor, config, consumos, recargas, lastSync } = opts;
  const ahora = drIso();
  const hoy = drDate();

  // Orden y mapa de consumo medido
  const mapa = new Map<string, number>();
  for (const c of consumos || []) {
    if (c?.fecha) mapa.set(String(c.fecha).slice(0, 10), Number(c.kwh) || 0);
  }

  // Promedio real de los ultimos 7 dias medidos
  const medidos = [...mapa.entries()].filter(([f, v]) => v > 0 && f <= hoy).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const ultimos7 = medidos.slice(-7);
  const avg7 = ultimos7.length ? ultimos7.reduce((s, x) => s + x[1], 0) / ultimos7.length : FALLBACK_AVG;
  const dailyAvg = round2(config?.promedio_manual || avg7 || FALLBACK_AVG);

  const anchorDate = String(anchor.ts).slice(0, 10);
  const anchorHour = Number(String(anchor.ts).slice(11, 13)) + Number(String(anchor.ts).slice(14, 16)) / 60;

  // 1) dias completos despues del dia del ancla
  let consumido = 0;
  for (const [f, v] of medidos) {
    if (f > anchorDate) consumido += v;
  }
  // 2) la parte restante del dia del ancla, si ya esta medida
  const medidoAncla = mapa.get(anchorDate);
  if (medidoAncla && anchorDate < hoy) {
    consumido += medidoAncla * ((24 - anchorHour) / 24);
  }

  // 3) lo que aun no esta medido: desde el corte de medicion hasta ahora
  const lastMeasured = medidos.length ? medidos[medidos.length - 1][0] : anchorDate;
  const coveredEnd = medidos.some(([f]) => f > anchorDate) ? addDays(lastMeasured, 1) + 'T00:00:00' : anchor.ts;
  const desde = coveredEnd > anchor.ts ? coveredEnd : anchor.ts;
  const horasEstimadas = Math.max(0, hoursBetween(desde, ahora));
  const estimado = dailyAvg * (horasEstimadas / 24);

  // 4) recargas despues del ancla
  const recargado = (recargas || [])
    .filter((r) => r?.fecha && String(r.fecha).slice(0, 19) >= String(anchor.ts).slice(0, 19))
    .reduce((s, r) => s + (Number(r.kwh) || 0), 0);

  const saldo = Math.max(0, round2(anchor.kwh + recargado - consumido - estimado));
  const diasRestantes = dailyAvg > 0 ? saldo / dailyAvg : 0;
  const horasRestantes = diasRestantes * 24;

  const ultimos30 = medidos.slice(-30).map(([fecha, kwh]) => ({ fecha, kwh: round2(kwh) }));
  const umbral = Number(config?.umbral ?? DEFAULT_CONFIG.umbral);
  const recargaHabitual = Number(config?.recarga_habitual ?? DEFAULT_CONFIG.recarga_habitual);

  return {
    ok: true,
    saldo_kwh: saldo,
    promedio_diario: dailyAvg,
    dias_restantes: round2(diasRestantes),
    horas_restantes: Math.round(horasRestantes),
    umbral,
    recarga_habitual: recargaHabitual,
    alerta: saldo < umbral,
    critico: saldo < umbral / 2,
    porcentaje: Math.max(0, Math.min(100, round2((saldo / (recargaHabitual || 16)) * 100))),
    consumido_desde_ancla: round2(consumido + estimado),
    medido: round2(consumido),
    estimado: round2(estimado),
    recargado_desde_ancla: round2(recargado),
    ancla: { kwh: anchor.kwh, ts: anchor.ts, fecha: anchorDate },
    consumos: ultimos30.reverse(),
    recargas: (recargas || []).slice(-12).reverse(),
    hoy: { fecha: hoy, medido: mapa.has(hoy) ? round2(mapa.get(hoy)!) : null, estimado: round2((dailyAvg / 24) * (Number(ahora.slice(11, 13)) + Number(ahora.slice(14, 16)) / 60)) },
    cliente: lastSync?.cliente ?? null,
    promedios: lastSync?.promedios ?? null,
    escala: lastSync?.escala ?? null,
    medidor: lastSync?.medidor ?? null,
    ultima_sync: lastSync?.ts ?? null,
    fecha_hasta: lastSync?.fechaHasta ?? null,
    ahora,
  };
}

async function leerTodo(base44: any) {
  const [anchorRec, configRec, syncRec] = await Promise.all([
    getEstado(base44, 'anchor'),
    getEstado(base44, 'config'),
    getEstado(base44, 'sync'),
  ]);
  const consumos = await base44.asServiceRole.entities.PkConsumoDia.list({ limit: 400 });
  const recargas = await base44.asServiceRole.entities.PkRecarga.list({ limit: 200 });
  return {
    anchorRec,
    configRec,
    syncRec,
    consumos: (consumos?.items ?? []).map((r: any) => ({ id: r.id, fecha: r.fecha, kwh: Number(r.kwh) || 0, tipo_dia: r.tipo_dia })),
    recargas: (recargas?.items ?? []).map((r: any) => ({ id: r.id, fecha: r.fecha, kwh: Number(r.kwh) || 0, nota: r.nota, monto_rd: r.monto_rd })),
  };
}

async function estadoCompleto(base44: any) {
  const { anchorRec, configRec, syncRec, consumos, recargas } = await leerTodo(base44);
  const anchor = anchorRec?.data ?? { kwh: 5, ts: `${drDate()}T14:00:00` };
  const config = { ...DEFAULT_CONFIG, ...(configRec?.data ?? {}) };
  return computeState({ anchor, config, consumos, recargas, lastSync: syncRec?.data });
}

/* ---------------- Push ---------------- */

async function enviarPush(base44: any, payload: any) {
  const subs = await base44.asServiceRole.entities.PkSuscripcion.filter({ activa: true }, { limit: 50 });
  const lista = subs?.items ?? [];
  if (!lista.length) return { enviados: 0, error: 'sin suscripciones' };

  let webpush: any;
  try {
    webpush = (await import('npm:web-push@3.6.7')).default;
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  } catch (e) {
    return { enviados: 0, error: 'web-push no disponible: ' + String(e) };
  }

  let ok = 0;
  const fallos: string[] = [];
  for (const s of lista) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
      );
      ok++;
      await base44.asServiceRole.entities.PkSuscripcion.update(s.id, { ultimo_envio: drIso() });
    } catch (e: any) {
      const code = e?.statusCode;
      fallos.push(`${code ?? 'err'}`);
      if (code === 404 || code === 410) {
        await base44.asServiceRole.entities.PkSuscripcion.update(s.id, { activa: false }).catch(() => {});
      }
    }
  }
  return { enviados: ok, fallos };
}

/* ---------------- Handler ---------------- */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const base44 = createClientFromRequest(req);
  let body: any = {};
  if (req.method === 'POST') {
    try {
      body = await req.json();
    } catch {
      body = {};
    }
  } else {
    const u = new URL(req.url);
    body = Object.fromEntries(u.searchParams.entries());
  }
  const action = String(body.action || 'state');

  try {
    if (action === 'state') {
      return json(await estadoCompleto(base44));
    }

    if (action === 'sync' || action === 'daily') {
      const res = await consultarEdesur();
      if (!res.ok) {
        const est = await estadoCompleto(base44);
        return json({ ...est, synced: false, sync_error: res.error });
      }
      const rep: any = res.reporte;
      const diarios: any[] = rep.historicoConsumoDiario ?? [];

      // Upsert del consumo diario
      const existentes = await base44.asServiceRole.entities.PkConsumoDia.list({ limit: 400 });
      const mapaExist = new Map<string, any>();
      for (const r of existentes?.items ?? []) mapaExist.set(String(r.fecha).slice(0, 10), r);

      let nuevos = 0;
      let cambios = 0;
      for (const d of diarios) {
        const fecha = String(d.fecha).slice(0, 10);
        const kwh = Number(d.consumo) || 0;
        const tipo = d.tipoDia === 0 ? 'fin_semana' : 'entre_semana';
        const prev = mapaExist.get(fecha);
        if (!prev) {
          await base44.asServiceRole.entities.PkConsumoDia.create({ fecha, kwh, tipo_dia: tipo, origen: 'edesur' });
          nuevos++;
        } else if (Math.abs((Number(prev.kwh) || 0) - kwh) > 0.004) {
          await base44.asServiceRole.entities.PkConsumoDia.update(prev.id, { kwh, tipo_dia: tipo, origen: 'edesur' });
          cambios++;
        }
      }

      const lastSync = {
        ts: drIso(),
        fechaHasta: String(rep.parametros?.fechaHasta ?? '').slice(0, 10),
        cliente: rep.informacionCliente ?? null,
        promedios: rep.habitosConsumo ?? null,
        escala: rep.escalaPrecios ?? null,
        medidor: (rep.resumenLecturas ?? []).slice(-1)[0] ?? null,
        mensual: rep.historicoConsumoMensual ?? null,
      };
      await setEstado(base44, 'sync', lastSync);

      const est = await estadoCompleto(base44);

      if (action === 'daily') {
        let push: any = null;
        if (est.alerta) {
          push = await enviarPush(base44, {
            title: est.critico ? 'Prekilo · saldo crítico' : 'Prekilo · saldo bajo',
            body: `Te quedan ${est.saldo_kwh} kWh (${est.horas_restantes} h de luz). Recarga ${est.recarga_habitual} kWh.`,
            saldo: est.saldo_kwh,
            url: '/prekilo/',
            tag: 'prekilo-alerta',
          });
        }
        return json({ ...est, synced: true, nuevos, cambios, push });
      }
      return json({ ...est, synced: true, nuevos, cambios });
    }

    if (action === 'recarga') {
      const kwh = Number(body.kwh || 0);
      if (!kwh || kwh <= 0) return json({ ok: false, error: 'kWh inválidos' }, 400);
      await base44.asServiceRole.entities.PkRecarga.create({
        fecha: drIso(),
        kwh,
        monto_rd: body.monto_rd ? Number(body.monto_rd) : undefined,
        nota: body.nota ? String(body.nota).slice(0, 120) : 'Recarga registrada desde Prekilo',
      });
      return json(await estadoCompleto(base44));
    }

    if (action === 'reanclar') {
      const kwh = Number(body.kwh);
      if (Number.isNaN(kwh) || kwh < 0) return json({ ok: false, error: 'kWh inválidos' }, 400);
      const ts = body.ts ? String(body.ts).slice(0, 19) : `${drDate()}T${drIso().slice(11, 19)}`;
      await setEstado(base44, 'anchor', { kwh, ts });
      return json(await estadoCompleto(base44));
    }

    if (action === 'config') {
      const cur = await getEstado(base44, 'config');
      const cfg = { ...DEFAULT_CONFIG, ...(cur?.data ?? {}) };
      if (body.umbral !== undefined) cfg.umbral = Number(body.umbral);
      if (body.recarga_habitual !== undefined) cfg.recarga_habitual = Number(body.recarga_habitual);
      if (body.promedio_manual !== undefined) cfg.promedio_manual = body.promedio_manual === null ? null : Number(body.promedio_manual);
      await setEstado(base44, 'config', cfg);
      return json(await estadoCompleto(base44));
    }

    if (action === 'subscribe') {
      const sub = body.subscription ?? body;
      if (!sub?.endpoint) return json({ ok: false, error: 'suscripción inválida' }, 400);
      const p256dh = sub.keys?.p256dh ?? sub.p256dh;
      const auth = sub.keys?.auth ?? sub.auth;
      const existentes = await base44.asServiceRole.entities.PkSuscripcion.filter({ endpoint: sub.endpoint }, { limit: 1 });
      const prev = existentes?.items?.[0];
      if (prev) {
        await base44.asServiceRole.entities.PkSuscripcion.update(prev.id, { p256dh, auth, activa: true, agente: String(body.agente || '').slice(0, 160) });
      } else {
        await base44.asServiceRole.entities.PkSuscripcion.create({ endpoint: sub.endpoint, p256dh, auth, activa: true, agente: String(body.agente || '').slice(0, 160) });
      }
      return json({ ok: true });
    }

    if (action === 'pushTest') {
      const est = await estadoCompleto(base44);
      const r = await enviarPush(base44, {
        title: 'Prekilo activo',
        body: `Notificaciones listas. Saldo actual: ${est.saldo_kwh} kWh.`,
        saldo: est.saldo_kwh,
        url: '/prekilo/',
        tag: 'prekilo-test',
      });
      return json({ ok: true, ...r, vapid_public: VAPID_PUBLIC });
    }

    if (action === 'pushCheck') {
      try {
        const webpush: any = (await import('npm:web-push@3.6.7')).default;
        webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
        const subs = await base44.asServiceRole.entities.PkSuscripcion.filter({ activa: true }, { limit: 50 });
        return json({ ok: true, webpush: 'cargado', suscripciones: (subs?.items ?? []).length, vapor: VAPID_PUBLIC.slice(0, 12) });
      } catch (e: any) {
        return json({ ok: false, error: 'web-push fallo: ' + String(e?.message || e) }, 500);
      }
    }

    if (action === 'vapid') {
      return json({ ok: true, vapid_public: VAPID_PUBLIC, nic: NIC });
    }

    return json({ ok: false, error: 'acción desconocida: ' + action }, 400);
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
