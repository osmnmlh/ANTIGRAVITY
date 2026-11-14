// ANTIGRAVITY relay backend: zero dependencies, mock data in RAM, no database.
// Run: node --experimental-strip-types server.mjs   (Node 22.6+; flag is a no-op on Node 23.6+)
//
// Status colors come from web/src/domain/thresholds.ts (imported directly, no third copy).
// Gemini is only called here so the API key never reaches a browser or phone.
// Every client must keep working when this server is down (fall back to shared/mock/*.json).

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DEMO_DISCLAIMER,
  INDICATOR_META,
  INDICATOR_ORDER,
  getOverallStatus,
  getStatus,
  getTrendStatus,
} from '../web/src/domain/thresholds.ts';
import { guidanceByType } from '../web/src/domain/guidance.ts';
import { metricDefinitions } from '../web/src/domain/types.ts';
import { createAi } from './ai/index.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
try { process.loadEnvFile(here('./.env')); } catch { /* .env is optional */ }

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0'; // 0.0.0.0 so a phone on the same Wi-Fi can reach it
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-flash-lite-latest';
const AI_DISCLAIMER = `AI-generated suggestion. ${DEMO_DISCLAIMER}`; // same string as shared/mock packets
let geminiLastError = null; // shown in /api/health so a failing key is visible without the server logs
const RANK = { green: 0, missing: 1, amber: 2, red: 3 };

// ---- In-memory state, loaded from shared mock data on every start ----
const readJson = (p) => JSON.parse(readFileSync(here(p), 'utf8'));
const INITIAL_BUNDLE = readJson('../shared/mock/astronaut-packets.json');
const INITIAL_SAMPLES = readJson('../shared/mock/samples.json');
const hazards = readJson('../shared/mock/nasa-hazards.json').hazards;
const incidents = readJson('../shared/mock/historical-incidents.json').incidents;

let bundle = structuredClone(INITIAL_BUNDLE);
let samples = structuredClone(INITIAL_SAMPLES);

const findPacket = (crewId) => bundle.astronauts.find((a) => a.astronautId === crewId);
const withStatus = (p) => ({ ...p, overallStatus: getOverallStatus(p, samples) });

// ---- Server-Sent Events: push every change to open dashboards & mobile clients ----
const clients = new Set();
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 20_000).unref();

// ---- Samples: accept HealthSample or HealthSample[] (AGENTS.md data contract) ----
function syncWatchVitals(packet, sample) {
  const vitals = packet.watchTelemetry?.vitals;
  if (!vitals) return;
  if (sample.type === 'heartRate') vitals.currentHeartRate = sample.value;
  if (sample.type === 'spo2') vitals.bloodOxygenPercentage = sample.value;
  if (sample.type === 'bodyTemp') vitals.bodyTemperature = sample.value;
  packet.watchTelemetry.syncTimestamp = sample.timestamp;
}

function addSamples(input) {
  const list = Array.isArray(input) ? input : [input];
  const touched = new Set();
  const added = [];
  for (const s of list) {
    if (!INDICATOR_ORDER.includes(s?.type) || typeof s.value !== 'number' || !findPacket(s.crewId)) {
      throw new Error(`invalid sample: ${JSON.stringify(s)}`);
    }
    const sample = {
      id: s.id ?? crypto.randomUUID(),
      crewId: s.crewId,
      type: s.type,
      value: s.value,
      unit: s.unit ?? INDICATOR_META[s.type].unit,
      timestamp: s.timestamp ?? new Date().toISOString(),
      source: s.source ?? 'manual',
    };
    samples.push(sample);
    added.push(sample);
    const packet = findPacket(sample.crewId);
    const prev = packet.measurements[sample.type];
    if (!prev || prev.timestamp <= sample.timestamp) {
      packet.measurements[sample.type] = {
        value: sample.value, unit: sample.unit, timestamp: sample.timestamp, source: sample.source,
      };
      packet.lastUpdated = sample.timestamp;
      syncWatchVitals(packet, sample);
    }
    touched.add(sample.crewId);
  }
  const packets = [...touched].map((id) => withStatus(findPacket(id)));
  for (const s of added) broadcast('sample', s);
  for (const p of packets) broadcast('packet', p);
  return packets;
}

// ---- AI module (backend/ai/, ADR-0007): proactive alerts, cabin, phone fan-out, chat ----
const ai = createAi({
  getPackets: () => bundle.astronauts,
  getVitalStatus: (type, value, packet) => getStatus(type, value, packet.mission?.radiationBudgetMsv),
  getVitalGuidance: (type) => guidanceByType[type],
  getTrendStatus: (crewId, type) => getTrendStatus(samples.filter((s) => s.crewId === crewId), type),
  vitalLabel: (type) => metricDefinitions[type]?.label ?? type,
  hazards,
  applySamples: (list) => addSamples(list), // vital demo scenarios write real samples, so web SSE sees them too
  gemini: { apiKey: GEMINI_API_KEY, model: GEMINI_MODEL },
});

// Rehearsal reset (POST /api/demo/reset and /api/simulation/reset): stop any simulation, reload shared/mock/*.json
// into RAM (same as a restart), reset the AI module (alerts, cabin) and send every client a fresh `hello`.
function resetRelay() {
  const payload = resetAllData();
  ai.resetDemo();
  broadcast('hello', { astronauts: bundle.astronauts.map(withStatus), simulation: payload });
  return payload;
}

// ---- AI guidance: Gemini when a key is set, deterministic fallback otherwise ----
function indicatorStatuses(packet) {
  return INDICATOR_ORDER.map((type) => {
    const m = packet.measurements[type];
    return { type, value: m?.value, unit: m?.unit, status: getStatus(type, m?.value, packet.mission.radiationBudgetMsv) };
  });
}

// Turkish UI everywhere (ADR-0005): texts come from web/src/domain/guidance.ts + metricDefinitions labels.
const STATUS_TR = { amber: 'dikkat', red: 'KRİTİK' };
function fallbackGuidance(packet) {
  const flagged = indicatorStatuses(packet)
    .filter((i) => i.status === 'amber' || i.status === 'red')
    .sort((a, b) => RANK[b.status] - RANK[a.status]);
  if (flagged.length === 0) {
    return {
      summary: 'Tüm değerlerin normal aralıkta. Günlük rutinine devam et.',
      actions: ['Planlanan egzersiz önlemlerine devam et.', 'Uyku ve sıvı alımı düzenini koru.'],
      escalate: 'Şu an uçuş cerrahına başvurman gerekmiyor. Yeni bir belirti fark edersen haber ver.',
    };
  }
  const label = (t) => metricDefinitions[t]?.label ?? t;
  const list = flagged.map((i) => `${label(i.type)} ${i.value} ${i.unit} (${STATUS_TR[i.status]})`).join(', ');
  return {
    summary: `${flagged.length} değer dikkat gerektiriyor: ${list}.`,
    actions: [...new Set(flagged.slice(0, 3).map((i) => guidanceByType[i.type].doNow[0]))],
    escalate: guidanceByType[flagged[0].type].escalate,
  };
}

async function geminiGuidance(packet, overallStatus) {
  const hazardContext = hazards
    .filter((h) => packet.activeHazardIds?.includes(h.id))
    .map((h) => `- ${h.title}: ${h.summary}`)
    .join('\n');
  const prompt = [
    'You support an astronaut on a long-duration mission. This is demo software, not a medical device.',
    'Write plain-language self-care guidance in Turkish (the astronaut reads Turkish). Do not diagnose. Do not change the status colors below; they are final.',
    'Return JSON only: {"summary": string (max 2 sentences), "actions": string[] (1-3 concrete steps), "escalate": string (when to contact the crew medical officer / flight surgeon)}.',
    `Mission: ${packet.mission.name}, day ${packet.mission.missionDay}, comms delay ${packet.mission.commsDelayMinutes} min.`,
    `Overall status (deterministic): ${overallStatus}`,
    'Readings:',
    ...indicatorStatuses(packet).map((i) => `- ${i.type}: ${i.value ?? 'missing'} ${i.unit ?? ''} -> ${i.status}`),
    'NASA Human Research Program hazards active for this mission (https://www.nasa.gov/hrp/hazards/):',
    hazardContext || '- none listed',
  ].join('\n');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
      }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).replace(/\s+/g, " ").slice(0, 300)}`);
  const data = await res.json();
  const out = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
  if (typeof out.summary !== 'string' || !Array.isArray(out.actions) || typeof out.escalate !== 'string') {
    throw new Error('Gemini returned an unexpected shape');
  }
  return { summary: out.summary, actions: out.actions.slice(0, 3).map(String), escalate: out.escalate };
}

async function createAiGuidance(crewId) {
  const packet = findPacket(crewId);
  if (!packet) throw new Error(`unknown crewId: ${crewId}`);
  const overallStatus = getOverallStatus(packet);
  let text;
  let source = 'fallback';
  if (GEMINI_API_KEY) {
    try {
      text = await geminiGuidance(packet, overallStatus);
      source = 'gemini';
      geminiLastError = null;
    } catch (err) {
      geminiLastError = `${new Date().toISOString()} ${err.message}`;
      console.warn(`[ai] Gemini failed, using fallback: ${err.message}`);
    }
  }
  text ??= fallbackGuidance(packet);
  packet.aiGuidance = {
    generatedAt: new Date().toISOString(),
    source,
    model: source === 'gemini' ? GEMINI_MODEL : null,
    overallStatus,
    ...text,
    disclaimer: AI_DISCLAIMER,
  };
  broadcast('packet', withStatus(packet));
  return packet.aiGuidance;
}

// ---- Simulation engine (live telemetry jitter & historical incident replay) ----
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const stepInt = (v, d, lo, hi) => Math.round(clamp(v + (Math.floor(Math.random() * (d * 2 + 1)) - d), lo, hi));
const stepTemp = (v, lo, hi) => Number(clamp(v + (Math.floor(Math.random() * 3) - 1) * 0.1, lo, hi).toFixed(1));

// Live jitter stays inside green for everyone (team decision: red/amber only from a scenario or incident replay).
// Steps are small enough that the 3-reading drift rule cannot fire; SpO2 stays 98-99 so it never "falls" 3 times in a row.
const LIVE_BOUNDS = {
  'crew-1': { heartRate: [66, 80], bloodPressureSys: [110, 122], bloodPressureDia: [68, 78], spo2: [98, 99], bodyTemp: [36.4, 36.9], bloodGlucose: [88, 104] },
  'crew-2': { heartRate: [60, 72], bloodPressureSys: [112, 122], bloodPressureDia: [70, 78], spo2: [98, 99], bodyTemp: [36.4, 36.8], bloodGlucose: [88, 98] },
  'crew-3': { heartRate: [70, 82], bloodPressureSys: [112, 124], bloodPressureDia: [72, 78], spo2: [98, 99], bodyTemp: [36.5, 36.9], bloodGlucose: [90, 106] },
};

let preSimSnapshot = null;
const simState = {
  mode: 'idle',
  running: false,
  crewId: null,
  incidentId: null,
  phaseIndex: 0,
  totalPhases: 0,
  activePhase: null,
  intervalMs: 2000,
  startedAt: null,
  endedAt: null,
  highestSeverity: 'green',
  alertsByType: new Map(),
  timer: null,
  timerKind: null,
};

function clearSimTimer() {
  if (!simState.timer) return;
  if (simState.timerKind === 'interval') clearInterval(simState.timer);
  else clearTimeout(simState.timer);
  simState.timer = null;
  simState.timerKind = null;
}

function recordSimulationAlerts(packet, phaseLabel) {
  for (const type of INDICATOR_ORDER) {
    const val = packet.measurements[type]?.value;
    const status = getStatus(type, val, packet.mission.radiationBudgetMsv);
    if (RANK[status] > RANK[simState.highestSeverity]) simState.highestSeverity = status;
    if (status === 'amber' || status === 'red') {
      const prev = simState.alertsByType.get(type);
      if (!prev || RANK[status] > RANK[prev.peakStatus]) {
        simState.alertsByType.set(type, {
          type,
          peakStatus: status,
          extremeValue: val,
          unit: INDICATOR_META[type].unit,
          phaseLabel,
        });
      }
    }
  }
}

function simulationPayload(extra = {}) {
  const incident = simState.incidentId ? incidents.find((i) => i.id === simState.incidentId) : null;
  return {
    mode: simState.mode,
    running: simState.running,
    crewId: simState.crewId,
    incidentId: simState.incidentId,
    incidentTitle: incident?.title ?? null,
    historicalOutcome: incident?.historicalOutcome ?? null,
    phaseIndex: simState.phaseIndex,
    totalPhases: simState.totalPhases,
    activePhase: simState.activePhase,
    intervalMs: simState.intervalMs,
    startedAt: simState.startedAt,
    endedAt: simState.endedAt,
    highestSeverity: simState.highestSeverity,
    triggeredAlerts: Array.from(simState.alertsByType.values()),
    flightSurgeonEscalated: simState.highestSeverity === 'red',
    ...extra,
  };
}

function resetSimulationTracking(mode, crewId, intervalMs) {
  simState.mode = mode;
  simState.running = true;
  simState.crewId = crewId;
  simState.incidentId = null;
  simState.phaseIndex = 0;
  simState.totalPhases = 0;
  simState.activePhase = null;
  simState.intervalMs = intervalMs;
  simState.startedAt = new Date().toISOString();
  simState.endedAt = null;
  simState.highestSeverity = 'green';
  simState.alertsByType.clear();
}

function ensureSnapshot() {
  if (!preSimSnapshot) {
    preSimSnapshot = { bundle: structuredClone(bundle), samples: structuredClone(samples) };
  }
}

function restoreSnapshotOrInitial(useInitial = false) {
  const source = useInitial || !preSimSnapshot
    ? { bundle: INITIAL_BUNDLE, samples: INITIAL_SAMPLES }
    : preSimSnapshot;
  bundle = structuredClone(source.bundle);
  samples = structuredClone(source.samples);
  if (useInitial || preSimSnapshot) preSimSnapshot = null;
  for (const p of bundle.astronauts) broadcast('packet', withStatus(p));
  ai.onCabinHint(null); // cabin back to nominal
  ai.onSamples(); // values are back to normal: open alerts resolve
}

function generateLiveTick(targetCrewIds) {
  const ts = new Date().toISOString();
  const batch = [];
  for (const id of targetCrewIds) {
    const pkt = findPacket(id);
    if (!pkt) continue;
    const b = LIVE_BOUNDS[id] ?? LIVE_BOUNDS['crew-2'];
    const cur = (k) => pkt.measurements[k]?.value;
    batch.push(
      { crewId: id, type: 'heartRate', value: stepInt(cur('heartRate') ?? 72, 2, ...b.heartRate), timestamp: ts, source: 'watch' },
      { crewId: id, type: 'bloodPressureSys', value: stepInt(cur('bloodPressureSys') ?? 118, 2, ...b.bloodPressureSys), timestamp: ts, source: 'manual' },
      { crewId: id, type: 'bloodPressureDia', value: stepInt(cur('bloodPressureDia') ?? 74, 1, ...b.bloodPressureDia), timestamp: ts, source: 'manual' },
      { crewId: id, type: 'spo2', value: stepInt(cur('spo2') ?? 97, 1, ...b.spo2), timestamp: ts, source: 'watch' },
      { crewId: id, type: 'bodyTemp', value: stepTemp(cur('bodyTemp') ?? 36.5, ...b.bodyTemp), timestamp: ts, source: 'watch' },
      { crewId: id, type: 'bloodGlucose', value: stepInt(cur('bloodGlucose') ?? 95, 2, ...b.bloodGlucose), timestamp: ts, source: 'manual' },
      { crewId: id, type: 'radiationDose', value: Number(((cur('radiationDose') ?? 20) + 0.001).toFixed(3)) /* slow: a fast climb would trip the daily dose-rate trend rule */, timestamp: ts, source: 'mock' },
    );
  }
  const updated = addSamples(batch);
  ai.onSamples(); // proactive alerts reach the web and the phones during the simulation too
  for (const p of updated) recordSimulationAlerts(p, 'Canlı Simülasyon');
  broadcast('simulation', simulationPayload());
}

function startLiveSimulation({ crewId = null, intervalMs = 2000 } = {}) {
  if (crewId && !findPacket(crewId)) throw new Error(`unknown crewId: ${crewId}`);
  const safeInterval = clamp(Number(intervalMs) || 2000, 200, 30_000);
  clearSimTimer();
  ensureSnapshot();
  resetSimulationTracking('live', crewId, safeInterval);
  const targets = crewId ? [crewId] : bundle.astronauts.map((a) => a.astronautId);
  generateLiveTick(targets);
  simState.timerKind = 'interval';
  simState.timer = setInterval(() => generateLiveTick(targets), safeInterval);
  simState.timer.unref?.();
  return simulationPayload();
}

function startIncidentSimulation({ incidentId, crewId = 'crew-1', stepIntervalMs } = {}) {
  const incident = incidents.find((i) => i.id === incidentId);
  if (!incident) {
    const err = new Error(`unknown incidentId: ${incidentId}`);
    err.status = 404;
    throw err;
  }
  if (!findPacket(crewId)) throw new Error(`unknown crewId: ${crewId}`);

  clearSimTimer();
  ensureSnapshot();
  const overrideMs = stepIntervalMs ? clamp(Number(stepIntervalMs), 100, 30_000) : null;
  resetSimulationTracking('incident', crewId, overrideMs ?? incident.phases[0].durationMs);
  simState.incidentId = incident.id;
  simState.totalPhases = incident.phases.length;

  const runPhase = (idx) => {
    if (!simState.running || simState.incidentId !== incident.id) return;
    const phase = incident.phases[idx];
    const ts = new Date().toISOString();
    simState.phaseIndex = idx;
    simState.activePhase = phase;
    const batch = INDICATOR_ORDER.map((type) => ({
      crewId,
      type,
      value: phase.metrics[type],
      timestamp: ts,
      source: type === 'heartRate' || type === 'spo2' || type === 'sleepHours' || type === 'mood' ? 'watch' : 'mock',
    }));
    const [updated] = addSamples(batch);
    ai.onCabinHint(phase.cabinHint); // cabin values of the incident phase -> cabin alerts
    ai.onSamples();
    recordSimulationAlerts(updated, `${phase.missionTimeLabel} · ${phase.title}`);
    broadcast('simulation', simulationPayload());

    const waitMs = overrideMs ?? phase.durationMs;
    if (idx + 1 < incident.phases.length) {
      simState.timerKind = 'timeout';
      simState.timer = setTimeout(() => runPhase(idx + 1), waitMs);
      simState.timer.unref?.();
    } else {
      simState.timerKind = 'timeout';
      simState.timer = setTimeout(() => {
        simState.running = false;
        simState.mode = 'summary';
        simState.endedAt = new Date().toISOString();
        simState.timer = null;
        simState.timerKind = null;
        broadcast('simulation', simulationPayload({ completedAllPhases: true }));
      }, waitMs);
      simState.timer.unref?.();
    }
  };

  runPhase(0);
  return simulationPayload();
}

function stopSimulation({ reset = true } = {}) {
  clearSimTimer();
  const wasRunning = simState.running;
  simState.running = false;
  simState.endedAt = simState.endedAt ?? new Date().toISOString();
  const summary = simulationPayload({ completedAllPhases: false, stoppedEarly: wasRunning });
  if (reset) {
    restoreSnapshotOrInitial(false);
    simState.mode = 'idle';
    simState.crewId = null;
    simState.incidentId = null;
    simState.phaseIndex = 0;
    simState.totalPhases = 0;
    simState.activePhase = null;
    broadcast('simulation', simulationPayload());
  } else {
    simState.mode = 'summary';
    broadcast('simulation', summary);
  }
  return summary;
}

function resetAllData() {
  clearSimTimer();
  simState.running = false;
  simState.mode = 'idle';
  simState.crewId = null;
  simState.incidentId = null;
  simState.phaseIndex = 0;
  simState.totalPhases = 0;
  simState.activePhase = null;
  simState.startedAt = null;
  simState.endedAt = null;
  simState.highestSeverity = 'green';
  simState.alertsByType.clear();
  restoreSnapshotOrInitial(true);
  const payload = simulationPayload();
  broadcast('simulation', payload);
  return payload;
}

// ---- Rate limits: loose on purpose. On stage 2 iPhones + the web can share one venue IP. ----
// AI routes cost Gemini quota (free tier is small and the key is shared), so they get a tighter bucket.
const LIMITS = {
  ai: { max: Number(process.env.RATE_AI_PER_MIN ?? 30), test: (r) => /^POST \/api\/ai\/(guidance|chat)$/.test(r) },
  all: { max: Number(process.env.RATE_ALL_PER_MIN ?? 600), test: () => true },
};
const hits = new Map(); // "bucket:ip" → { count, resetAt }
function rateLimited(ip, route) {
  if (route === 'GET /api/health' || route === 'OPTIONS /api/health') return null; // Render's health check
  const now = Date.now();
  for (const [name, { max, test }] of Object.entries(LIMITS)) {
    if (!test(route)) continue;
    const key = `${name}:${ip}`;
    let h = hits.get(key);
    if (!h || h.resetAt <= now) hits.set(key, (h = { count: 0, resetAt: now + 60_000 }));
    if (++h.count > max) return Math.ceil((h.resetAt - now) / 1000);
  }
  return null;
}
setInterval(() => { const now = Date.now(); for (const [k, h] of hits) if (h.resetAt <= now) hits.delete(k); }, 60_000).unref();

// ---- HTTP plumbing ----
function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 200_000) throw new Error('body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();

  const url = new URL(req.url, 'http://localhost');
  const route = `${req.method} ${url.pathname}`;
  const started = Date.now();
  res.on('finish', () => {
    if (route !== 'GET /api/health') console.log(`[http] ${route} ${res.statusCode} ${Date.now() - started}ms`); // health is polled by Render
  });
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
  const retryAfter = rateLimited(ip, route);
  if (retryAfter) {
    res.setHeader('retry-after', String(retryAfter));
    return send(res, 429, { error: `Çok fazla istek, ${retryAfter} sn sonra tekrar deneyin.`, retryAfter });
  }
  try {
    if (route === 'POST /api/demo/reset' || route === 'POST /api/simulation/reset') {
      return send(res, 200, resetRelay());
    }
    if (await ai.handle(req, res, url)) return; // /api/ai/* except /api/ai/guidance (handled below)
    if (route === 'GET /api/health') {
      return send(res, 200, {
        ok: true, gemini: Boolean(GEMINI_API_KEY), model: GEMINI_API_KEY ? GEMINI_MODEL : null, geminiLastError, clients: clients.size, ai: true,
        simulation: { mode: simState.mode, running: simState.running, incidentId: simState.incidentId },
      });
    }
    if (route === 'GET /api/packets') {
      return send(res, 200, { ...bundle, astronauts: bundle.astronauts.map(withStatus) });
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/packets/')) {
      const packet = findPacket(decodeURIComponent(url.pathname.slice('/api/packets/'.length)));
      return packet ? send(res, 200, withStatus(packet)) : send(res, 404, { error: 'unknown crewId' });
    }
    if (route === 'GET /api/samples') {
      const crewId = url.searchParams.get('crewId');
      return send(res, 200, crewId ? samples.filter((s) => s.crewId === crewId) : samples);
    }
    if (route === 'POST /api/samples') {
      const packets = addSamples(await readBody(req));
      ai.onSamples();
      return send(res, 201, { packets });
    }
    if (route === 'GET /api/incidents') {
      return send(res, 200, { disclaimer: DEMO_DISCLAIMER, incidents });
    }
    if (route === 'GET /api/simulation') {
      return send(res, 200, {
        ...simulationPayload(),
        incidents: incidents.map(({ id, title, dateLabel, missionName }) => ({ id, title, dateLabel, missionName })),
      });
    }
    if (route === 'POST /api/simulation/live/start') {
      return send(res, 200, startLiveSimulation(await readBody(req)));
    }
    if (route === 'POST /api/simulation/incident/start') {
      return send(res, 200, startIncidentSimulation(await readBody(req)));
    }
    if (route === 'POST /api/simulation/stop') {
      return send(res, 200, stopSimulation(await readBody(req)));
    }
    if (route === 'POST /api/ai/guidance') {
      const { crewId } = await readBody(req);
      return send(res, 200, await createAiGuidance(crewId));
    }
    if (route === 'GET /api/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      res.write(`event: hello\ndata: ${JSON.stringify({ astronauts: bundle.astronauts.map(withStatus), simulation: simulationPayload() })}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    send(res, 404, { error: `no route ${route}` });
  } catch (err) {
    send(res, err.status ?? 400, { error: err.message });
  }
});

// Time limits for *receiving* a request (slow or stuck clients). SSE responses stay open; Gemini has its own 20 s timeout.
server.headersTimeout = 10_000;
server.requestTimeout = 15_000;

server.listen(PORT, HOST, () => {
  console.log(`ANTIGRAVITY relay on http://localhost:${PORT}  (Gemini: ${GEMINI_API_KEY ? GEMINI_MODEL : 'off, using fallback'})`);
});
