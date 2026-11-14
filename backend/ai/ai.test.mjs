// Run from repo root: node --experimental-strip-types --test backend/ai/
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { INDICATOR_META, getGuidance, getStatus } from '../../web/src/domain/thresholds.ts';
import { createAi } from './index.mjs';
import { cabinStatus } from './cabin.mjs';

const readJson = (p) => JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8'));
const PACKETS = readJson('../../shared/mock/astronaut-packets.json').astronauts;
const HAZARDS = readJson('../../shared/mock/nasa-hazards.json').hazards;

function setup() {
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
    getVitalGuidance: getGuidance,
    vitalLabel: (t) => INDICATOR_META[t].label,
    hazards: HAZARDS,
    applySamples,
    now: () => new Date(clock.t),
    log: {},
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

test('problems present at start are a silent baseline (crew-1 SpO2 89 in mock data)', () => {
  const { ai } = setup();
  const a = active(ai).find((x) => x.scenarioId === 'individual-hypoxia');
  assert.ok(a, 'crew-1 low SpO2 is listed');
  assert.deepEqual(a.crewIds, ['crew-1']);
  assert.equal(ai.cabin().crewIds.join(), 'crew-1,crew-2', 'crew-3 is on another mission, not in this cabin');
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
  assert.ok(alert.advice.doNow.length > 0 && alert.advice.escalate.includes('flight surgeon'));

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
