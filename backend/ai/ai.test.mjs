// Run from repo root: node --experimental-strip-types --test backend/ai/
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { INDICATOR_META, getStatus, getTrendStatus } from '../../web/src/domain/thresholds.ts';
import { guidanceByType } from '../../web/src/domain/guidance.ts';
import { metricDefinitions } from '../../web/src/domain/types.ts';
import { createAi } from './index.mjs';
import { cabinStatus } from './cabin.mjs';

const readJson = (p) => JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8'));
const PACKETS = readJson('../../shared/mock/astronaut-packets.json').astronauts;
const HAZARDS = readJson('../../shared/mock/nasa-hazards.json').hazards;
const SAMPLES = readJson('../../shared/mock/samples.json');

// The demo mock starts all-green (team decision). These tests need a crew-1 that already has problems,
// so they overlay the earlier "bad morning" values: SpO2 89, HR 112, sleep 5.5, mood 3 two days in a row.
const CREW1_BAD_MORNING = { spo2: 89, heartRate: 112, sleepHours: 5.5, mood: 3 };
for (const [type, value] of Object.entries(CREW1_BAD_MORNING)) {
  PACKETS.find((p) => p.astronautId === 'crew-1').measurements[type].value = value;
  SAMPLES.find((x) => x.crewId === 'crew-1' && x.type === type && x.timestamp.startsWith('2026-11-14')).value = value;
}

function setup(extra = {}) {
  const packets = structuredClone(PACKETS);
  const clock = { t: Date.parse('2026-11-14T08:00:00Z') };
  const applySamples = (list) => {
    for (const s of list) {
      packets.find((p) => p.astronautId === s.crewId).measurements[s.type] = {
        value: s.value, unit: INDICATOR_META[s.type].unit, timestamp: s.timestamp, source: s.source,
      };
    }
  };
  const ai = createAi({
    getPackets: () => packets,
    getVitalStatus: (type, value, p) => getStatus(type, value, p.mission?.radiationBudgetMsv),
    getVitalGuidance: (type) => guidanceByType[type],
    getTrendStatus: (crewId, type) => getTrendStatus(SAMPLES.filter((x) => x.crewId === crewId), type),
    vitalLabel: (t) => metricDefinitions[t]?.label ?? t,
    hazards: HAZARDS,
    applySamples,
    now: () => new Date(clock.t),
    log: {},
    ...extra,
  });
  return { ai, packets, clock, applySamples };
}

async function call(ai, method, path, body) {
  const server = http.createServer(async (req, res) => {
    if (!(await ai.handle(req, res, new URL(req.url, 'http://x')))) res.writeHead(404).end('{}');
  });
  await new Promise((r) => server.listen(0, r));
  const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body),
  });
  const json = await res.json();
  server.close();
  return { status: res.status, json };
}

const active = (ai) => ai.alerts({ state: 'active' });

test('cabin thresholds follow the contract table', () => {
  assert.equal(cabinStatus('ppO2', 20.9), 'green');
  assert.equal(cabinStatus('ppO2', 19.0), 'amber');
  assert.equal(cabinStatus('ppO2', 17.5), 'red');
  assert.equal(cabinStatus('ppCO2', 3), 'amber');
  assert.equal(cabinStatus('contaminant', 10), 'red');
  assert.equal(cabinStatus('lifeSupportPower', 'degraded'), 'amber');
});

test('problems present at start are a silent baseline (crew-1 SpO2 89, test fixture)', () => {
  const { ai } = setup();
  const a = active(ai).find((x) => x.scenarioId === 'individual-hypoxia');
  assert.ok(a, 'crew-1 low SpO2 is listed');
  assert.deepEqual(a.crewIds, ['crew-1']);
  assert.equal(ai.cabin().crewIds.join(), 'crew-1,crew-2', 'crew-3 is on another mission, not in this cabin');
  const fatigue = active(ai).find((x) => x.scenarioId === 'fatigue-isolation' && x.crewIds[0] === 'crew-1');
  assert.equal(fatigue?.severity, 'red', 'mood 3 on two days in a row → shared trend rule says red');
});

test('gas leak: one red cabin alert for everyone in the cabin, routed only to their phones', async () => {
  const { ai } = setup();
  for (const [deviceId, crewId] of [['phone-a', 'crew-1'], ['phone-b', 'crew-2'], ['phone-c', 'crew-3']]) {
    await call(ai, 'POST', '/api/ai/devices', { deviceId, crewId });
  }
  const { json } = await call(ai, 'POST', '/api/ai/demo/cabin-gas-leak');
  assert.equal(json.created.length, 1);
  const alert = ai.alerts().find((a) => a.id === json.created[0]);
  assert.equal(alert.severity, 'red');
  assert.equal(alert.scope, 'cabin');
  assert.deepEqual(alert.deliveries.map((d) => d.deviceId).sort(), ['phone-a', 'phone-b']);
  assert.ok(alert.advice.doNow.length > 0 && alert.advice.escalate.includes('uçuş cerrahı'));

  const again = await call(ai, 'POST', '/api/ai/demo/cabin-gas-leak');
  assert.equal(again.json.created.length, 0, 'same problem does not re-announce');
});

test('delivered and ack round-trip, plus cockpit ack', async () => {
  const { ai } = setup();
  await call(ai, 'POST', '/api/ai/devices', { deviceId: 'phone-b', crewId: 'crew-2' });
  const { json } = await call(ai, 'POST', '/api/ai/demo/orthostatic');
  const id = json.created[0];
  assert.equal(ai.alerts().find((a) => a.id === id).scenarioId, 'orthostatic');

  const d = await call(ai, 'POST', `/api/ai/alerts/${id}/delivered`, { deviceId: 'phone-b' });
  assert.ok(d.json.deliveries[0].deliveredAt);
  assert.equal(d.json.deliveries[0].ackedAt, null);
  const k = await call(ai, 'POST', `/api/ai/alerts/${id}/ack`, { deviceId: 'phone-b' });
  assert.ok(k.json.deliveries[0].ackedAt);
  const c = await call(ai, 'POST', `/api/ai/alerts/${id}/ack`, { by: 'cockpit' });
  assert.ok(c.json.cockpitAckedAt);
  const bad = await call(ai, 'POST', '/api/ai/alerts/nope/ack', { by: 'cockpit' });
  assert.equal(bad.status, 404);
});

test('cabin hypoxia replaces the separate cabin-O2 and per-person SpO2 alerts', async () => {
  const { ai } = setup();
  await call(ai, 'POST', '/api/ai/demo/cabin-hypoxia');
  const ids = active(ai).map((a) => a.scenarioId);
  assert.ok(ids.includes('cabin-hypoxia'));
  assert.ok(!ids.includes('cabin-o2-low'));
  assert.ok(!ids.includes('individual-hypoxia'), 'crew-1 SpO2 is explained by the cabin now');
});

test('a problem that clears is resolved; it does not re-announce within the cooldown', async () => {
  const { ai, clock } = setup();
  await call(ai, 'POST', '/api/ai/demo/solar-event');
  await call(ai, 'POST', '/api/ai/cabin', { readings: [{ metric: 'radiationRate', value: 0.4 }] });
  assert.ok(!active(ai).some((a) => a.scenarioId === 'solar-event'));
  assert.equal(ai.alerts({ state: 'resolved' })[0].scenarioId, 'solar-event');

  clock.t += 60_000;
  const soon = await call(ai, 'POST', '/api/ai/demo/solar-event');
  assert.equal(soon.json.created.length, 0, 'bounce inside 5 minutes is ignored');
  await call(ai, 'POST', '/api/ai/cabin', { readings: [{ metric: 'radiationRate', value: 0.4 }] });
  clock.t += 6 * 60_000;
  const later = await call(ai, 'POST', '/api/ai/demo/solar-event');
  assert.equal(later.json.created.length, 1);
});

test('amber → red escalation creates a new alert', async () => {
  const { ai } = setup();
  await call(ai, 'POST', '/api/ai/cabin', { readings: [{ metric: 'ppCO2', value: 4 }] });
  const r = await call(ai, 'POST', '/api/ai/cabin', { readings: [{ metric: 'ppCO2', value: 7 }] });
  assert.equal(r.status, 200);
  const co2 = ai.alerts().filter((a) => a.scenarioId === 'cabin-co2-high');
  assert.deepEqual(co2.map((a) => `${a.severity}:${a.state}`).sort(), ['amber:resolved', 'red:active']);
});

test('reset restores vitals and cabin and clears alerts', async () => {
  const { ai, packets } = setup();
  const before = packets[1].measurements.heartRate.value;
  await call(ai, 'POST', '/api/ai/demo/orthostatic');
  await call(ai, 'POST', '/api/ai/demo/cabin-gas-leak');
  await call(ai, 'POST', '/api/ai/demo/reset');
  assert.equal(packets[1].measurements.heartRate.value, before);
  assert.equal(ai.cabin().overallStatus, 'green');
  assert.ok(!active(ai).some((a) => ['orthostatic', 'cabin-gas-leak'].includes(a.scenarioId)));
});

test('bad input is a 400, unknown scenario a 404, other paths are left to the host', async () => {
  const { ai } = setup();
  assert.equal((await call(ai, 'POST', '/api/ai/cabin', { readings: [{ metric: 'ppO2', value: 'x' }] })).status, 400);
  assert.equal((await call(ai, 'POST', '/api/ai/devices', { crewId: 'crew-1' })).status, 400);
  assert.equal((await call(ai, 'POST', '/api/ai/demo/nope')).status, 404);
  assert.equal((await call(ai, 'POST', '/api/ai/guidance', {})).status, 404, 'host route untouched');
});

test('SSE: a phone only receives alerts for its astronaut; cabin alerts reach the cabin crew', async () => {
  const { ai } = setup();
  const server = http.createServer(async (req, res) => {
    if (!(await ai.handle(req, res, new URL(req.url, 'http://x')))) res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const listen = (q) => {
    const events = [];
    const ctrl = new AbortController();
    const ready = fetch(`${base}/api/ai/stream?${q}`, { signal: ctrl.signal }).then(async (res) => {
      const reader = res.body.getReader();
      let buf = '';
      (async () => {
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += new TextDecoder().decode(value);
            let i;
            while ((i = buf.indexOf('\n\n')) >= 0) {
              const chunk = buf.slice(0, i);
              buf = buf.slice(i + 2);
              const ev = chunk.match(/^event: (.+)$/m)?.[1];
              const data = chunk.match(/^data: (.+)$/m)?.[1];
              if (ev) events.push({ ev, data: JSON.parse(data) });
            }
          }
        } catch { /* aborted */ }
      })();
    });
    return { events, ready, close: () => ctrl.abort() };
  };

  const p1 = listen('deviceId=phone-a&crewId=crew-1');
  const p3 = listen('deviceId=phone-c&crewId=crew-3');
  await Promise.all([p1.ready, p3.ready]);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(ai.devices().filter((d) => d.online).length, 2, 'stream auto-registers and shows online');

  await fetch(`${base}/api/ai/demo/cabin-gas-leak`, { method: 'POST' });
  await fetch(`${base}/api/ai/demo/orthostatic`, { method: 'POST' }); // crew-2 only
  await new Promise((r) => setTimeout(r, 100));

  const alertsFor = (l) => l.events.filter((e) => e.ev === 'alert').map((e) => e.data.scenarioId);
  assert.deepEqual(alertsFor(p1), ['cabin-gas-leak']);
  assert.deepEqual(alertsFor(p3), [], 'crew-3 is on another mission');
  assert.ok(p1.events[0].ev === 'hello' && p1.events[0].data.cabin);
  p1.close(); p3.close();
  server.close();
});

// ---- Chat (#12) ----

test('chat fallback answers a Turkish status question from the computed statuses', async () => {
  const { ai } = setup();
  const r = await ai.chat({ crewId: 'crew-1', messages: [{ role: 'user', text: 'Astronotun şu anki durumu nasıl?' }] });
  assert.equal(r.source, 'fallback');
  assert.match(r.reply, /kandaki oksijen %89 \(KRİTİK\)/);
  assert.match(r.reply, /Uçuş cerrahına hemen başvurun/);
  assert.equal(r.escalation, 'flightSurgeon');
  assert.ok(r.disclaimer.includes('tıbbi cihaz değildir'));
  assert.match(r.reply, /Şimdi: /, 'includes a concrete action');
});

test('chat fallback: topic question, cabin scope, briefing', async () => {
  const { ai } = setup();
  const hr = await ai.chat({ crewId: 'crew-1', messages: [{ role: 'user', text: 'Nabzı nasıl?' }] });
  assert.deepEqual(hr.indicators, ['heartRate']);
  assert.match(hr.reply, /nabız 112 bpm \(dikkat\)/);

  await call(ai, 'POST', '/api/ai/demo/cabin-gas-leak');
  const cabin = await call(ai, 'POST', '/api/ai/chat', { scope: 'cabin', messages: [{ role: 'user', text: 'Kabinde gaz var mı?' }] });
  assert.equal(cabin.status, 200);
  assert.deepEqual(cabin.json.indicators, ['contaminant']);
  assert.match(cabin.json.reply, /gaz \(amonyak\) 14 ppm \(KRİTİK\)/);
  assert.match(cabin.json.reply, /maskenizi/, 'uses the gas-leak alert advice');

  const brief = await ai.chat({ scope: 'cabin', messages: [] });
  assert.ok(brief.reply.length > 0, 'empty messages = briefing');
});

test('chat input errors: 400 without crewId, 404 unknown crew', async () => {
  const { ai } = setup();
  assert.equal((await call(ai, 'POST', '/api/ai/chat', { scope: 'crew', messages: [] })).status, 400);
  assert.equal((await call(ai, 'POST', '/api/ai/chat', { crewId: 'crew-9', messages: [] })).status, 404);
});

test('chat with Gemini: statuses are facts, escalation cannot be lowered, failures fall back', async () => {
  let sent;
  const reply = { reply: 'She is fine.', escalation: 'none', indicators: ['spo2', 'made-up'], suggestions: ['Why?'] };
  const fetchImpl = async (_url, init) => {
    sent = JSON.parse(init.body);
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }) };
  };
  const { ai } = setup({ gemini: { apiKey: 'test-key' }, fetchImpl });
  const r = await ai.chat({ crewId: 'crew-1', messages: [{ role: 'user', text: 'How is she?' }] });
  assert.equal(r.source, 'gemini');
  assert.equal(r.escalation, 'flightSurgeon', 'red SpO2 → never "none"');
  assert.deepEqual(r.indicators, ['spo2']);
  const system = sent.systemInstruction.parts[0].text;
  assert.ok(system.includes('spo2 (kandaki oksijen): 89 % -> red'));
  assert.match(system, /FINAL/);

  const broken = setup({ gemini: { apiKey: 'k' }, fetchImpl: async () => ({ ok: false, status: 503 }) });
  const fb = await broken.ai.chat({ crewId: 'crew-1', messages: [{ role: 'user', text: 'status?' }] });
  assert.equal(fb.source, 'fallback');
});
