// ANTIGRAVITY AI module: proactive alerts, cabin monitoring, phone fan-out. Plug-and-play, zero dependencies.
// It never imports the host server; everything it needs comes in through `deps` (see README.md in this folder).
//
//   const ai = createAi({ getPackets, getVitalStatus, ... });
//   if (await ai.handle(req, res, url)) return;   // in the host's request handler, before its 404
//   ai.onSamples(crewIds);                         // after the host stored new health samples

import { createCabin } from './cabin.mjs';
import { evaluate } from './rules.mjs';
import { createAlertStore, createDevices, createHub } from './alerts.mjs';
import { createChat } from './chat.mjs';

const DISCLAIMER = 'Yapay zekâ önerisidir. Demo yazılımıdır, tıbbi cihaz değildir.';

/**
 * @param {object} deps
 * @param {() => object[]} deps.getPackets  Live astronaut packets (shared/mock/astronaut-packets.json shape).
 * @param {(type: string, value: number, packet: object) => 'green'|'amber'|'red'|'missing'} deps.getVitalStatus
 * @param {(type: string, status: string) => { why: string, doNow: string[], escalate: string }} [deps.getVitalGuidance]
 *        Turkish guidance (web/src/domain/guidance.ts shape; thresholds.ts getGuidance shape also accepted).
 * @param {(crewId: string, type: string) => string} [deps.getTrendStatus]  Shared multi-day trend rule (getTrendStatus over that crew's samples).
 * @param {(type: string) => string} [deps.vitalLabel]
 * @param {object[]} [deps.hazards]  shared/mock/nasa-hazards.json `hazards`.
 * @param {(samples: object[]) => void} [deps.applySamples]  Stores HealthSamples in the host. Needed only for vital demo scenarios.
 * @param {{ apiKey?: string, model?: string }} [deps.gemini]  Server-side only. No key = deterministic answers.
 * @param {string[]} [deps.cabinCrewIds]  Who is inside the monitored cabin. Default: crew sharing the first packet's mission.
 */
export function createAi(deps) {
  const {
    getPackets, getVitalStatus,
    getVitalGuidance = () => null,
    getTrendStatus = null,
    vitalLabel = (t) => t,
    hazards = [],
    applySamples = null,
    gemini = {},
    fetchImpl = fetch,
    now = () => new Date(),
    log = console,
    cooldownMs = 5 * 60_000,
  } = deps;
  if (typeof getPackets !== 'function' || typeof getVitalStatus !== 'function') {
    throw new Error('createAi needs getPackets() and getVitalStatus()');
  }

  const first = getPackets()[0];
  const cabinCrewIds = deps.cabinCrewIds
    ?? getPackets().filter((p) => p.mission?.name === first?.mission?.name).map((p) => p.astronautId);
  const cabin = createCabin({ module: `${first?.mission?.name ?? 'Spacecraft'} crew cabin`, crewIds: cabinCrewIds, now });
  const store = createAlertStore({ now, cooldownMs, disclaimer: DISCLAIMER });
  const devices = createDevices({ now });
  const hub = createHub();
  devices.setOnlineCheck(hub.isOnline);

  const hazardFor = (type) =>
    hazards.find((h) => h.id !== 'distanceFromEarth' && h.relatedIndicators?.includes(type))?.id ?? 'distanceFromEarth';

  const vitalGuidance = (type, status) => {
    const g = getVitalGuidance(type, status);
    return {
      why: g?.why ?? g?.whyInSpace ?? 'Bu değer uzay uçuşu için güvenli aralığın dışında.',
      doNow: g?.doNow?.slice(0, 3) ?? ['Eforu bırakın ve dinlenin.', '5 dakika sonra tekrar ölçün.'],
      escalate: g?.escalate ?? g?.escalateWhen ?? 'Kırmızı aralıkta kalırsa uçuş cerrahına hemen başvurun.',
    };
  };

  function context() {
    const crew = getPackets().map((p) => ({
      id: p.astronautId,
      name: p.fullName ?? p.astronautId,
      inCabin: cabinCrewIds.includes(p.astronautId),
      commsDelay: p.mission?.commsDelayMinutes ?? 0,
      trend: (type) => getTrendStatus?.(p.astronautId, type) ?? null,
      vitals: Object.fromEntries(
        Object.entries(p.measurements ?? {})
          .map(([type, m]) => [type, { value: m?.value, unit: m?.unit ?? '', status: getVitalStatus(type, m?.value, p) }])
          .filter(([, v]) => v.status !== 'missing' && typeof v.value === 'number'),
      ),
    }));
    const commsDelayMinutes = Math.max(20, ...crew.map((c) => c.commsDelay));
    return { cabin, cabinCrewIds, crew, commsDelayMinutes, vitalLabel, vitalGuidance, hazardFor };
  }

  /** Re-runs every rule. `silent` alerts are stored and sent as `alert-update`, so clients list them without beeping. */
  function run({ silent = false } = {}) {
    const { created, updated } = store.reconcile(evaluate(context()), devices.forCrew);
    for (const a of updated) hub.alert('alert-update', a);
    for (const a of created) {
      hub.alert(silent ? 'alert-update' : 'alert', a);
      log.info?.(`[ai] ${silent ? 'baseline' : 'ALERT'} ${a.severity} ${a.scenarioId} → ${a.crewIds.join(',')}: ${a.title}`);
    }
    return { created, updated };
  }

  const chat = createChat({ context, activeAlerts: () => store.active(), gemini, disclaimer: DISCLAIMER, log, fetchImpl });

  const hello = (c) => ({ cabin: cabin.snapshot(), alerts: hub.filterAlerts(c, store.active()) });
  const resync = () => hub.all('hello', hello);

  // ---- Demo triggers: readings that fire each scenario (rehearsal + stage) ----
  const patient = () => cabinCrewIds[1] ?? cabinCrewIds[0] ?? first?.astronautId;
  const DEMOS = {
    'cabin-o2-low': { cabin: [{ metric: 'ppO2', value: 17.5 }] },
    'cabin-gas-leak': { cabin: [{ metric: 'contaminant', value: 14, label: 'ammonia' }] },
    'cabin-co2-high': { cabin: [{ metric: 'ppCO2', value: 6.5 }] },
    'cabin-pressure-drop': { cabin: [{ metric: 'pressure', value: 88 }] },
    'solar-event': { cabin: [{ metric: 'radiationRate', value: 12 }] },
    'power-life-support': { cabin: [{ metric: 'lifeSupportPower', value: 'fault' }] },
    'cabin-hypoxia': {
      cabin: [{ metric: 'ppO2', value: 18.6 }],
      vitals: () => cabinCrewIds.slice(0, 2).map((crewId) => ({ crewId, type: 'spo2', value: 91 })),
    },
    orthostatic: { vitals: () => [['bloodPressureSys', 85], ['bloodPressureDia', 55], ['heartRate', 112]] },
    'infection-suspected': { vitals: () => [['bodyTemp', 38.6], ['heartRate', 108]] },
    'individual-hypoxia': { vitals: () => [['spo2', 86]] },
    'fatigue-isolation': { vitals: () => [['sleepHours', 4.5], ['mood', 2]] },
  };
  const restore = new Map(); // "crewId:type" → sample that puts the value back on reset

  function toSamples(list) {
    return list.map((s) => (Array.isArray(s) ? { crewId: patient(), type: s[0], value: s[1] } : s))
      .map((s) => ({ ...s, source: 'mock', timestamp: now().toISOString() }));
  }

  function runDemo(id) {
    const demo = DEMOS[id];
    if (!demo) throw Object.assign(new Error(`unknown scenario: ${id}`), { status: 404 });
    if (demo.vitals && !applySamples) {
      throw Object.assign(new Error('vital scenarios need deps.applySamples from the host'), { status: 501 });
    }
    if (demo.cabin) cabin.update(demo.cabin);
    if (demo.vitals) {
      const samples = toSamples(demo.vitals());
      for (const s of samples) {
        const key = `${s.crewId}:${s.type}`;
        const prev = getPackets().find((p) => p.astronautId === s.crewId)?.measurements?.[s.type];
        if (!restore.has(key) && prev) restore.set(key, { crewId: s.crewId, type: s.type, value: prev.value });
      }
      applySamples(samples);
    }
    hub.all('cabin', () => cabin.snapshot());
    return run();
  }

  function resetDemo() {
    if (applySamples && restore.size) applySamples(toSamples([...restore.values()]));
    restore.clear();
    cabin.reset();
    store.clear();
    run({ silent: true });
    resync();
  }

  // ---- HTTP ----
  const send = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };
  async function readBody(req) {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 50_000) throw new Error('body too large');
    }
    return raw ? JSON.parse(raw) : {};
  }

  const ROUTES = [
    ['GET', /^\/api\/ai\/health$/, () => ({
      ok: true, gemini: Boolean(gemini.apiKey), cabin: cabin.snapshot().overallStatus, activeAlerts: store.active().length,
      devices: devices.list().length, streams: hub.size(),
    })],
    ['GET', /^\/api\/ai\/cabin$/, () => cabin.snapshot()],
    ['POST', /^\/api\/ai\/cabin$/, async (req) => {
      cabin.update((await readBody(req)).readings);
      hub.all('cabin', () => cabin.snapshot());
      run();
      return cabin.snapshot();
    }],
    ['GET', /^\/api\/ai\/alerts$/, (_req, url) => store.list({
      crewId: url.searchParams.get('crewId') ?? undefined,
      state: url.searchParams.get('state') ?? undefined,
    })],
    ['POST', /^\/api\/ai\/alerts\/([^/]+)\/(delivered|ack)$/, async (req, _url, [, id, action]) => {
      const body = await readBody(req);
      const alert = action === 'ack' ? store.ack(id, body) : store.delivered(id, body);
      if (body.deviceId) devices.touch(body.deviceId);
      hub.alert('alert-update', alert);
      return alert;
    }],
    ['POST', /^\/api\/ai\/chat$/, async (req) => chat(await readBody(req))],
    ['GET', /^\/api\/ai\/devices$/, () => devices.list()],
    ['POST', /^\/api\/ai\/devices$/, async (req) => {
      const device = devices.register(await readBody(req));
      for (const a of store.addRecipient(device)) hub.alert('alert-update', a);
      return { ok: true };
    }],
    ['GET', /^\/api\/ai\/demo$/, () => Object.keys(DEMOS)],
    ['POST', /^\/api\/ai\/demo\/reset$/, () => { resetDemo(); return { ok: true }; }],
    ['POST', /^\/api\/ai\/demo\/([\w-]+)$/, (_req, _url, [, id]) => {
      const { created } = runDemo(id);
      return { ok: true, created: created.map((a) => a.id) };
    }],
  ];

  /** Handles /api/ai/* routes of this module. Returns false for anything else so the host can route it. */
  async function handle(req, res, url) {
    if (url.pathname === '/api/ai/stream' && req.method === 'GET') {
      const crewId = url.searchParams.get('crewId') || null;
      const deviceId = url.searchParams.get('deviceId') || null;
      if (deviceId && crewId && !devices.has(deviceId)) {
        for (const a of store.addRecipient(devices.register({ deviceId, crewId }))) hub.alert('alert-update', a);
      }
      if (deviceId) devices.touch(deviceId);
      hub.add(req, res, { crewId, deviceId }, hello);
      return true;
    }
    for (const [method, re, fn] of ROUTES) {
      const m = url.pathname.match(re);
      if (!m || req.method !== method) continue;
      try {
        send(res, 200, await fn(req, url, m));
      } catch (err) {
        send(res, err.status ?? 400, { error: err.message });
      }
      return true;
    }
    return false;
  }

  run({ silent: true }); // baseline: problems already present at start are listed, not announced
  log.info?.(`[ai] module ready: cabin "${cabin.snapshot().module}" with ${cabinCrewIds.join(', ')}`);

  return {
    handle,
    onSamples: () => run(),
    chat,
    // read-only views for the host or tests
    cabin: () => cabin.snapshot(),
    alerts: (q) => store.list(q),
    devices: () => devices.list(),
  };
}
