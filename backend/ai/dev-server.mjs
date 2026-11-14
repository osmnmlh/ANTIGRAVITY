// Standalone runner for the AI module: shared mock data, no team backend needed.
// It is also the reference adapter: the same deps go into createAi() inside backend/server.mjs.
//
// Run from repo root:  node --experimental-strip-types backend/ai/dev-server.mjs   (flag is a no-op on Node 23.6+)
// Default port 8788, so it can run next to the relay on 8787.

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { INDICATOR_META, getStatus, getTrendStatus } from '../../web/src/domain/thresholds.ts';
import { guidanceByType } from '../../web/src/domain/guidance.ts';
import { metricDefinitions } from '../../web/src/domain/types.ts';
import { createAi } from './index.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const readJson = (p) => JSON.parse(readFileSync(here(p), 'utf8'));
try { process.loadEnvFile(here('../.env')); } catch { /* backend/.env is optional; no key = fallback answers */ }
const PORT = Number(process.env.AI_PORT ?? 8788);

const bundle = readJson('../../shared/mock/astronaut-packets.json');
const hazards = readJson('../../shared/mock/nasa-hazards.json').hazards;
const samples = readJson('../../shared/mock/samples.json'); // history, feeds the shared trend rule
const findPacket = (crewId) => bundle.astronauts.find((a) => a.astronautId === crewId);

function applySamples(list) {
  for (const s of list) {
    const packet = findPacket(s.crewId);
    if (!packet || !INDICATOR_META[s.type] || typeof s.value !== 'number') throw new Error(`invalid sample: ${JSON.stringify(s)}`);
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
    const { value, unit, timestamp, source } = sample;
    packet.measurements[s.type] = { value, unit, timestamp, source };
  }
}

// ---- The adapter: this block is all the host has to provide ----
const ai = createAi({
  getPackets: () => bundle.astronauts,
  getVitalStatus: (type, value, packet) => getStatus(type, value, packet.mission?.radiationBudgetMsv),
  getVitalGuidance: (type) => guidanceByType[type],
  getTrendStatus: (crewId, type) => getTrendStatus(samples.filter((s) => s.crewId === crewId), type),
  vitalLabel: (type) => metricDefinitions[type]?.label ?? type,
  hazards,
  applySamples,
  gemini: { apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL },
});

http.createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();

  const url = new URL(req.url, 'http://localhost');
  if (await ai.handle(req, res, url)) return;

  // Same sample contract as the relay, so the same curl works on both servers.
  if (req.method === 'POST' && url.pathname === '/api/samples') {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw || '[]');
      const list = Array.isArray(body) ? body : [body];
      applySamples(list);
      ai.onSamples([...new Set(list.map((s) => s.crewId))]);
      res.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: err.message }));
    }
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: `no route ${req.method} ${url.pathname}` }));
}).listen(PORT, '0.0.0.0', () => {
  console.log(`ANTIGRAVITY AI dev server on http://localhost:${PORT}  Gemini: ${process.env.GEMINI_API_KEY ? 'on' : 'off (fallback)'}  (try: curl -X POST localhost:${PORT}/api/ai/demo/cabin-gas-leak)`);
});
