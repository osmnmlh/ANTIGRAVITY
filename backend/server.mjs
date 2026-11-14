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
  getGuidance,
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
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
const AI_DISCLAIMER = `AI-generated suggestion. ${DEMO_DISCLAIMER}`;
const RANK = { green: 0, missing: 1, amber: 2, red: 3 };

// ---- In-memory state, loaded from shared mock data on every start ----
const readJson = (p) => JSON.parse(readFileSync(here(p), 'utf8'));
const bundle = readJson('../shared/mock/astronaut-packets.json');
const samples = readJson('../shared/mock/samples.json');
const hazards = readJson('../shared/mock/nasa-hazards.json').hazards;

const findPacket = (crewId) => bundle.astronauts.find((a) => a.astronautId === crewId);
const withStatus = (p) => ({ ...p, overallStatus: getOverallStatus(p) });

// ---- Server-Sent Events: push every change to open dashboards ----
const clients = new Set();
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 20_000).unref();

// ---- Samples: accept HealthSample or HealthSample[] (AGENTS.md data contract) ----
function addSamples(input) {
  const list = Array.isArray(input) ? input : [input];
  const touched = new Set();
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
    const packet = findPacket(sample.crewId);
    const prev = packet.measurements[sample.type];
    if (!prev || prev.timestamp <= sample.timestamp) {
      packet.measurements[sample.type] = {
        value: sample.value, unit: sample.unit, timestamp: sample.timestamp, source: sample.source,
      };
      packet.lastUpdated = sample.timestamp;
    }
    touched.add(sample.crewId);
  }
  const packets = [...touched].map((id) => withStatus(findPacket(id)));
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

// Rehearsal reset: reload shared/mock/*.json into RAM (same as a restart), then reset the AI module.
function resetRelay() {
  const fresh = readJson('../shared/mock/astronaut-packets.json');
  Object.assign(bundle, fresh);
  samples.splice(0, samples.length, ...readJson('../shared/mock/samples.json'));
  broadcast('hello', { astronauts: bundle.astronauts.map(withStatus) });
}

// ---- AI guidance: Gemini when a key is set, deterministic fallback otherwise ----
function indicatorStatuses(packet) {
  return INDICATOR_ORDER.map((type) => {
    const m = packet.measurements[type];
    return { type, value: m?.value, unit: m?.unit, status: getStatus(type, m?.value, packet.mission.radiationBudgetMsv) };
  });
}

function fallbackGuidance(packet, overallStatus) {
  const flagged = indicatorStatuses(packet)
    .filter((i) => i.status === 'amber' || i.status === 'red')
    .sort((a, b) => RANK[b.status] - RANK[a.status]);
  if (flagged.length === 0) {
    return {
      summary: 'All your readings are in the normal range. Keep your daily routine.',
      actions: ['Continue the scheduled exercise countermeasures.', 'Keep your current sleep and hydration routine.'],
      escalate: 'No escalation needed. Contact the flight surgeon if you notice new symptoms.',
    };
  }
  const list = flagged.map((i) => `${i.type} ${i.value} ${i.unit} (${i.status})`).join(', ');
  return {
    summary: `${flagged.length} reading(s) need attention: ${list}. Overall status is ${overallStatus}.`,
    actions: flagged.slice(0, 3).map((i) => getGuidance(i.type, i.status).doNow[0]),
    escalate: getGuidance(flagged[0].type, flagged[0].status).escalateWhen,
  };
}

async function geminiGuidance(packet, overallStatus) {
  const hazardContext = hazards
    .filter((h) => packet.activeHazardIds?.includes(h.id))
    .map((h) => `- ${h.title}: ${h.summary}`)
    .join('\n');
  const prompt = [
    'You support an astronaut on a long-duration mission. This is demo software, not a medical device.',
    'Write plain-language self-care guidance. Do not diagnose. Do not change the status colors below; they are final.',
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
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
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
    } catch (err) {
      console.warn(`[ai] Gemini failed, using fallback: ${err.message}`);
    }
  }
  text ??= fallbackGuidance(packet, overallStatus);
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
  res.on('finish', () => console.log(`[http] ${route} ${res.statusCode} ${Date.now() - started}ms`));
  try {
    if (route === 'POST /api/demo/reset') {
      resetRelay();
      return ai.handle(req, res, new URL('/api/ai/demo/reset', 'http://localhost'));
    }
    if (await ai.handle(req, res, url)) return; // /api/ai/* except /api/ai/guidance (handled below)
    if (route === 'GET /api/health') {
      return send(res, 200, {
        ok: true, gemini: Boolean(GEMINI_API_KEY), model: GEMINI_API_KEY ? GEMINI_MODEL : null, clients: clients.size, ai: true,
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
    if (route === 'POST /api/ai/guidance') {
      const { crewId } = await readBody(req);
      return send(res, 200, await createAiGuidance(crewId));
    }
    if (route === 'GET /api/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      res.write(`event: hello\ndata: ${JSON.stringify({ astronauts: bundle.astronauts.map(withStatus) })}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    send(res, 404, { error: `no route ${route}` });
  } catch (err) {
    send(res, 400, { error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`ANTIGRAVITY relay on http://localhost:${PORT}  (Gemini: ${GEMINI_API_KEY ? GEMINI_MODEL : 'off, using fallback'})`);
});
