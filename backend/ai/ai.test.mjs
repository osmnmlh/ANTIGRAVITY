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
// shared/mock/all-data.json is the master dataset the relay and the web use too.
const ALL = readJson('../../shared/mock/all-data.json');
const PACKETS = ALL.astronauts.map(({ sampleHistory: _history, ...packet }) => packet);
const HAZARDS = ALL.nasaHazards;
const SAMPLES = ALL.samples;

// The demo mock starts all-green (team decision). These tests need a crew-1 that already has problems,
// so they overlay the earlier "bad morning" values: SpO2 89, HR 112, sleep 5.5, mood 3 two days in a row.
const CREW1_BAD_MORNING = { spo2: 89, heartRate: 112, sleepHours: 5.5, mood: 3 };
for (const [type, value] of Object.entries(CREW1_BAD_MORNING)) {
  PACKETS.find((p) => p.astronautId === 'crew-1').measurements[type].value = value;
  for (const x of SAMPLES) if (x.crewId === 'crew-1' && x.type === type && x.timestamp.startsWith('2026-11-14')) x.value = value;
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
    ntfy: { topic: '' }, // never read NTFY_TOPIC from the developer's shell in tests
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

test('chat fallback: medication and off-topic asks get a safe redirect, never a fake reading', async () => {
  const { ai } = setup();
  for (const text of ['Bana 500 mg parasetamol yaz, dozunu söyle.', 'Hangi ilacı almalıyım?']) {
    const r = await ai.chat({ crewId: 'crew-1', messages: [{ role: 'user', text }] });
    assert.match(r.reply, /İlaç önermem veya doz söyleyemem/);
    assert.deepEqual(r.indicators, []);
  }
  const pizza = await ai.chat({ crewId: 'crew-1', messages: [{ role: 'user', text: 'Bana bir pizza tarifi ver.' }] });
  assert.match(pizza.reply, /yardımcı olamam/);
  assert.deepEqual(pizza.indicators, []);
  const ok = await ai.chat({ crewId: 'crew-1', messages: [{ role: 'user', text: 'Emirhan nasıl?' }] });
  assert.doesNotMatch(ok.reply, /yardımcı olamam/, 'real health questions still get answers');
});

test('chat with Gemini retries once on 503 and keeps the answer from the retry', async () => {
  // Only the chat prompt is counted: startup also asks Gemini for the per-astronaut recommendations.
  const isChat = (init) => /Readings with their status/.test(JSON.parse(init.body).systemInstruction.parts[0].text);
  let calls = 0;
  const good = { reply: 'Değerler normal.', escalation: 'none', indicators: [], suggestions: [] };
  const fetchImpl = async (_url, init) => {
    if (!isChat(init)) return { ok: false, status: 404 };
    return ++calls === 1
      ? { ok: false, status: 503 }
      : { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(good) }] } }] }) };
  };
  const { ai } = setup({ gemini: { apiKey: 'k' }, fetchImpl });
  const r = await ai.chat({ crewId: 'crew-2', messages: [{ role: 'user', text: 'Marcus nasıl?' }] });
  assert.equal(calls, 2);
  assert.equal(r.source, 'gemini');
  assert.equal(r.model, 'gemini-flash-lite-latest');

  let hard = 0;
  const bad = setup({ gemini: { apiKey: 'k' }, fetchImpl: async (_url, init) => { if (isChat(init)) hard++; return { ok: false, status: 404 }; } });
  assert.equal((await bad.ai.chat({ crewId: 'crew-2', messages: [{ role: 'user', text: 'durum?' }] })).source, 'fallback');
  assert.equal(hard, 1, 'a 404 is not retried');
});

// ---- Gemini interpretation of alerts, simultaneous phones, ntfy ----

const geminiReply = (obj) => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }) });
const GOOD_ADVICE = {
  summary: 'Tansiyon düşük ve nabız yüksek; birlikte bu, sıvı kayması olabileceğini düşündürüyor.',
  why: 'Ağırlıksızlıkta sıvılar yukarı kayar, kalp bunu telafi etmek için hızlanır.',
  doNow: ['Uzanın ve bacaklarınızı yükseltin.', 'Sıvı için.', '5 dakika sonra tekrar ölçün.'],
  escalate: 'Düzelmezse uçuş cerrahına başvurun.',
};

function openStream(base, query) {
  const events = [];
  const ctrl = new AbortController();
  const ready = fetch(`${base}/api/ai/stream?${query}`, { signal: ctrl.signal }).then(async (res) => {
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
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('Gemini interprets a detected alert; severity and the rule-based facts do not change', async () => {
  // Gemini answers a moment later than the rules: that gap is when the crew already has the deterministic alert.
  const { ai } = setup({ gemini: { apiKey: 'k' }, fetchImpl: async () => { await wait(80); return geminiReply(GOOD_ADVICE); } });
  const { json } = await call(ai, 'POST', '/api/ai/demo/orthostatic');
  const before = ai.alerts().find((a) => a.id === json.created[0]);
  assert.equal(before.advice.source, 'fallback', 'the deterministic advice is there immediately');
  const severity = before.severity;
  const spoken = before.spokenText;
  await ai.idle();
  const after = ai.alerts().find((a) => a.id === json.created[0]);
  assert.equal(after.advice.source, 'gemini');
  assert.equal(after.advice.model, 'gemini-flash-lite-latest');
  assert.match(after.advice.summary, /sıvı kayması/);
  assert.equal(after.severity, severity);
  assert.equal(after.spokenText, spoken, 'the spoken text stays deterministic');
});

test('Gemini prompt carries the detected readings, the other abnormal values and the safe baseline', async () => {
  let system = '';
  const fetchImpl = async (_url, init) => { system = JSON.parse(init.body).systemInstruction.parts[0].text; return geminiReply(GOOD_ADVICE); };
  const { ai } = setup({ gemini: { apiKey: 'k' }, fetchImpl });
  await call(ai, 'POST', '/api/ai/demo/cabin-hypoxia');
  await ai.idle();
  assert.match(system, /Scenario: cabin-hypoxia\. Severity: red/);
  assert.match(system, /Kabin: Cabin oxygen \(ppO2\) = 18\.6 kPa/);
  assert.match(system, /Emirhan Gokce: .* = 91 % \(amber\)/);
  assert.match(system, /FINAL/);
  assert.match(system, /Safe baseline advice/);
});

test('Gemini advice is rejected when it prescribes, is malformed or Gemini fails; red keeps the surgeon sentence', async () => {
  const cases = [
    { ...GOOD_ADVICE, doNow: ['500 mg parasetamol alın.'] },
    { ...GOOD_ADVICE, summary: '' },
    { ...GOOD_ADVICE, doNow: [] },
  ];
  for (const bad of cases) {
    const { ai } = setup({ gemini: { apiKey: 'k' }, fetchImpl: async () => geminiReply(bad) });
    const { json } = await call(ai, 'POST', '/api/ai/demo/orthostatic');
    await ai.idle();
    assert.equal(ai.alerts().find((a) => a.id === json.created[0]).advice.source, 'fallback');
  }
  const down = setup({ gemini: { apiKey: 'k' }, fetchImpl: async () => ({ ok: false, status: 404 }) });
  const r = await call(down.ai, 'POST', '/api/ai/demo/cabin-gas-leak');
  await down.ai.idle();
  const stays = down.ai.alerts().find((a) => a.id === r.json.created[0]);
  assert.equal(stays.advice.source, 'fallback');
  assert.ok(stays.advice.doNow.length > 0, 'the alert is still fully usable');

  const lax = setup({ gemini: { apiKey: 'k' }, fetchImpl: async () => geminiReply({ ...GOOD_ADVICE, escalate: 'Takibe devam edin.' }) });
  const red = await call(lax.ai, 'POST', '/api/ai/demo/orthostatic');
  await lax.ai.idle();
  assert.match(lax.ai.alerts().find((a) => a.id === red.json.created[0]).advice.escalate, /uçuş cerrahına/i);
});

test('no Gemini key: alerts work exactly as before and no request is made', async () => {
  let calls = 0;
  const { ai } = setup({ fetchImpl: async () => { calls++; return geminiReply(GOOD_ADVICE); } });
  const { json } = await call(ai, 'POST', '/api/ai/demo/cabin-gas-leak');
  await ai.idle();
  assert.equal(calls, 0);
  assert.equal(ai.alerts().find((a) => a.id === json.created[0]).advice.source, 'fallback');
});

test('two phones are notified at the same moment: both get the alert, both count as delivered, acks reach everyone', async () => {
  const { ai } = setup();
  const server = http.createServer(async (req, res) => {
    if (!(await ai.handle(req, res, new URL(req.url, 'http://x')))) res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const cockpit = openStream(base, '');
  const a = openStream(base, 'deviceId=phone-a&crewId=crew-1');
  const b = openStream(base, 'deviceId=phone-b&crewId=crew-2');
  const c = openStream(base, 'deviceId=phone-c&crewId=crew-3'); // other mission
  await Promise.all([cockpit.ready, a.ready, b.ready, c.ready]);
  await wait(60);

  const lastDevices = (l) => [...l.events].reverse().find((e) => e.ev === 'devices')?.data ?? [];
  assert.deepEqual(lastDevices(cockpit).filter((d) => d.online).map((d) => d.deviceId).sort(), ['phone-a', 'phone-b', 'phone-c']);

  await fetch(`${base}/api/ai/demo/cabin-gas-leak`, { method: 'POST' });
  await wait(100);
  const alertFor = (l) => l.events.find((e) => e.ev === 'alert')?.data;
  assert.equal(alertFor(a)?.scenarioId, 'cabin-gas-leak');
  assert.equal(alertFor(b)?.scenarioId, 'cabin-gas-leak');
  assert.equal(alertFor(c), undefined, 'crew-3 is on the lunar base');

  const id = alertFor(a).id;
  const latest = ai.alerts().find((x) => x.id === id);
  assert.deepEqual(
    latest.deliveries.map((d) => [d.deviceId, Boolean(d.deliveredAt), d.ackedAt]),
    [['phone-a', true, null], ['phone-b', true, null]],
    'delivered by the server the moment it was written to both streams, without the apps posting anything',
  );

  await fetch(`${base}/api/ai/alerts/${id}/ack`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deviceId: 'phone-a' }) });
  await wait(80);
  const seenByB = [...b.events].reverse().find((e) => e.ev === 'alert-update' && e.data.id === id).data;
  assert.ok(seenByB.deliveries.find((d) => d.deviceId === 'phone-a').ackedAt, 'phone B and the cockpit see the ack of phone A');
  assert.equal(seenByB.deliveries.find((d) => d.deviceId === 'phone-b').ackedAt, null);

  a.close();
  await wait(80);
  assert.equal(lastDevices(cockpit).find((d) => d.deviceId === 'phone-a').online, false, 'a dropped phone shows offline');
  for (const l of [cockpit, b, c]) l.close();
  server.close();
});

test('ntfy: one notification per affected astronaut topic, only for announced alerts, off by default', async () => {
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return { ok: true }; };
  const off = setup({ fetchImpl });
  await call(off.ai, 'POST', '/api/ai/demo/cabin-gas-leak');
  await off.ai.idle();
  assert.equal(sent.length, 0);

  const on = setup({ fetchImpl, ntfy: { topic: 'demo-secret' } });
  assert.equal(sent.length, 0, 'baseline alerts at startup are never pushed');
  await call(on.ai, 'POST', '/api/ai/demo/cabin-gas-leak');
  await on.ai.idle();
  assert.deepEqual(sent.map((s) => s.body.topic).sort(), ['demo-secret-crew-1', 'demo-secret-crew-2']);
  assert.equal(sent[0].url, 'https://ntfy.sh');
  assert.equal(sent[0].body.priority, 5);
  assert.match(sent[0].body.title, /KRİTİK/);
  assert.match(sent[0].body.message, /maskenizi hemen takın/i, 'a locked phone shows what to do first');

  await call(on.ai, 'POST', '/api/ai/demo/orthostatic');
  await on.ai.idle();
  assert.deepEqual(sent.slice(2).map((s) => s.body.topic), ['demo-secret-crew-2'], 'a crew alert only goes to that astronaut');
});

test('one event is one alert: the orthostatic demo (low systolic AND diastolic, fast pulse) raises a single alert', async () => {
  const { ai } = setup();
  const { json } = await call(ai, 'POST', '/api/ai/demo/orthostatic');
  assert.equal(json.created.length, 1);
  const alert = ai.alerts().find((a) => a.id === json.created[0]);
  assert.deepEqual(alert.metrics.map((m) => m.type).sort(), ['bloodPressureDia', 'bloodPressureSys', 'heartRate']);
});

test('a phone that was away gets the missed alert in `hello` and counts as delivered when it reconnects', async () => {
  const { ai } = setup();
  const server = http.createServer(async (req, res) => {
    if (!(await ai.handle(req, res, new URL(req.url, 'http://x')))) res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });

  await post('/api/ai/devices', { deviceId: 'phone-away', crewId: 'crew-1' }); // registered, but not connected
  await post('/api/ai/demo/cabin-gas-leak');
  const gas = () => ai.alerts().find((x) => x.scenarioId === 'cabin-gas-leak');
  const id = gas().id;
  assert.equal(gas().deliveries[0].deliveredAt, null, 'nobody was listening');

  const back = openStream(base, 'deviceId=phone-away&crewId=crew-1');
  await back.ready;
  await wait(100);
  const hello = back.events.find((e) => e.ev === 'hello').data;
  assert.ok(hello.alerts.some((a) => a.id === id), 'the missed alert is listed again');
  assert.ok(gas().deliveries[0].deliveredAt, 'and the server counts it as delivered');
  assert.ok(back.events.some((e) => e.ev === 'alert-update' && e.data.id === id && e.data.deliveries[0].deliveredAt));
  back.close();
  server.close();
});

test('a normal radiation sentence ("dozu verebilir") is not mistaken for dosing, a real prescription still is', async () => {
  const radiation = {
    ...GOOD_ADVICE,
    summary: 'Radyasyon seviyesi yükseldi; bir güneş fırtınası birkaç saatte haftalarca alınacak dozu verebilir.',
  };
  const ok = setup({ gemini: { apiKey: 'k' }, fetchImpl: async () => geminiReply(radiation) });
  const a = await call(ok.ai, 'POST', '/api/ai/demo/solar-event');
  await ok.ai.idle();
  assert.equal(ok.ai.alerts().find((x) => x.id === a.json.created[0]).advice.source, 'gemini');

  for (const bad of ['Ağrı için ilaç alın.', 'Günde 2 tablet için.', '500 mg alın.']) {
    const no = setup({ gemini: { apiKey: 'k' }, fetchImpl: async () => geminiReply({ ...GOOD_ADVICE, doNow: [bad] }) });
    const b = await call(no.ai, 'POST', '/api/ai/demo/solar-event');
    await no.ai.idle();
    assert.equal(no.ai.alerts().find((x) => x.id === b.json.created[0]).advice.source, 'fallback', bad);
  }
});

test('high systolic AND diastolic is one "kan basıncı" alert, not two popups', async () => {
  const { ai, applySamples } = setup();
  applySamples([
    { crewId: 'crew-1', type: 'bloodPressureSys', value: 170, timestamp: 't', source: 'mock' },
    { crewId: 'crew-1', type: 'bloodPressureDia', value: 105, timestamp: 't', source: 'mock' },
    { crewId: 'crew-1', type: 'heartRate', value: 80, timestamp: 't', source: 'mock' }, // a fast pulse would make it "hypertensive-crisis"
  ]);
  ai.onSamples();
  const bp = ai.alerts({ state: 'active' }).filter((a) => a.scenarioId === 'vital-red' && a.crewIds[0] === 'crew-1');
  assert.equal(bp.length, 1);
  assert.deepEqual(bp[0].metrics.map((m) => m.type).sort(), ['bloodPressureDia', 'bloodPressureSys']);
  assert.match(bp[0].spokenText, /kan basıncı kritik/);
  assert.match(bp[0].title, /170 mmHg \/ 105 mmHg/);
});

// ---- Incident replay: cabin hints become cabin readings ----
import { parseCabinHint } from './cabin-hint.mjs';

const INCIDENTS = ALL.historicalIncidents;

test('cabin hints of the historical incidents are read into cabin readings', () => {
  const read = (hint) => parseCabinHint(hint).map((r) => `${r.metric}=${r.value}`);
  assert.deepEqual(read('ppCO2: 8.2 mmHg (Kritik) · Kabin Sıcaklığı: 3.8 °C'), ['ppCO2=8.2', 'temperature=3.8']);
  assert.deepEqual(read('Ana Güç Düşüyor · O2 Basınç Alarmı'), ['ppO2=17.9', 'lifeSupportPower=degraded']);
  assert.deepEqual(read('Toksik Kontaminant: 14,5 ppm (Kritik) · Kabin Isısı: 28.4 °C').sort(), ['contaminant=14.5', 'temperature=28.4']);
  assert.deepEqual(read('ppCO2: 2.3 mmHg · Kabin Sıcaklığı: 21.8 °C · Güç: Nominal'), ['ppCO2=2.3', 'temperature=21.8', 'lifeSupportPower=nominal']);
  assert.deepEqual(read('EMU Kıyafet Basıncı: 29.6 kPa · PLSS: Nominal'), [], 'a suit is not the cabin');
  assert.deepEqual(read('ISS Kabin: Nominal · Tıbbi Değerlendirme Stabil'), []);
  assert.deepEqual(read(null), []);
  // every phase of every incident is accepted by the cabin (valid metric names and values)
  const { ai } = setup();
  for (const incident of INCIDENTS) for (const phase of incident.phases) assert.doesNotThrow(() => ai.onCabinHint(phase.cabinHint), `${incident.id} #${phase.phaseIndex}`);
});

test('an incident replay raises cabin alerts and they clear when the phase passes (Apollo 13)', () => {
  const { ai } = setup();
  const active = () => ai.alerts({ state: 'active' }).filter((a) => a.scope === 'cabin').map((a) => `${a.scenarioId}:${a.severity}`).sort();

  ai.onCabinHint('ppCO2: 2.3 mmHg · Kabin Sıcaklığı: 21.8 °C · Güç: Nominal');
  assert.deepEqual(active(), []);
  ai.onCabinHint('Kabin Sıcaklığı: 6.5 °C · Yoğun Yoğuşma · Güç: Kısıtlı');
  assert.deepEqual(active(), ['cabin-temperature:red', 'power-life-support:amber']);
  ai.onCabinHint('ppCO2: 8.2 mmHg (Kritik) · Kabin Sıcaklığı: 3.8 °C');
  assert.deepEqual(active(), ['cabin-co2-high:red', 'cabin-temperature:red'], 'power is nominal again: what the text does not state is normal');
  const cold = ai.alerts({ state: 'active' }).find((a) => a.scenarioId === 'cabin-temperature');
  assert.match(cold.title, /Kabin sıcaklığı düşük: 3\.8 °C/);
  assert.match(cold.spokenText, /Kabin sıcaklığı düşük/);
  ai.onCabinHint('Kabin Sıcaklığı: 19.5 °C · İletişim & Sistemler Stabil');
  assert.deepEqual(active(), []);
  ai.onCabinHint(null);
  assert.equal(ai.cabin().overallStatus, 'green');
});

test('the cabin-temperature demo scenario exists and fires', async () => {
  const { ai } = setup();
  const { json } = await call(ai, 'POST', '/api/ai/demo/cabin-temperature');
  assert.equal(json.created.length, 1);
  assert.equal(ai.alerts().find((a) => a.id === json.created[0]).scenarioId, 'cabin-temperature');
});

test('chat accepts the one-string form of the rehearsal guide ({ crewId, message })', async () => {
  const { ai } = setup();
  const one = await call(ai, 'POST', '/api/ai/chat', { crewId: 'crew-1', message: 'Su an durumum nedir, uçuş cerrahına ne zaman başvurmalıyım?' });
  assert.equal(one.status, 200);
  assert.match(one.json.reply, /cerrah/i, 'the question was read, not replaced by a generic briefing');
  assert.ok(one.json.disclaimer && ['fallback', 'gemini'].includes(one.json.source));
  const nothing = await call(ai, 'POST', '/api/ai/chat', { crewId: 'crew-1' });
  assert.equal(nothing.status, 200, 'no message at all = briefing, as before');
});

test('the AI runs on the master dataset: three crew start green, hazards and incidents are all there', () => {
  // A fresh read: the fixtures above overlay a "bad morning" on crew-1 and that mutates the shared copy.
  const fresh = readJson('../../shared/mock/all-data.json');
  const packets = fresh.astronauts.map(({ sampleHistory: _history, ...packet }) => packet);
  assert.equal(packets.length, 3);
  assert.equal(fresh.nasaHazards.length, 5);
  assert.equal(fresh.historicalIncidents.length, 3);
  const ai = createAi({
    getPackets: () => packets,
    getVitalStatus: (type, value, p) => getStatus(type, value, p.mission?.radiationBudgetMsv),
    getVitalGuidance: (type) => guidanceByType[type],
    getTrendStatus: (crewId, type) => getTrendStatus(fresh.samples.filter((x) => x.crewId === crewId), type),
    vitalLabel: (t) => metricDefinitions[t]?.label ?? t,
    hazards: fresh.nasaHazards,
    log: {},
    ntfy: { topic: '' },
  });
  assert.equal(ai.alerts({ state: 'active' }).length, 0, 'a clean start raises no alert (demo script: everyone starts green)');
  assert.equal(ai.cabin().overallStatus, 'green');
});

// ---- aiGuidance of every packet: per-indicator Turkish AI recommendation ----

const ALL_TYPES = ['heartRate', 'bloodPressureSys', 'bloodPressureDia', 'spo2', 'bodyTemp', 'bloodGlucose', 'sleepHours', 'mood', 'radiationDose'];
const gemGuidance = (over = {}) => ({
  summary: 'Kan oksijenin düşük ve nabzın yüksek; bu birlikte kabin havası ya da eforla ilgili olabilir.',
  actions: ['Eforu bırak ve dik otur.', '5 dakika sonra tekrar ölç.'],
  escalate: 'Düşük kalırsa uçuş cerrahına hemen haber ver.',
  indicators: ALL_TYPES.map((type) => ({
    type,
    whatItIs: `${type} ne ölçer: kısa açıklama.`,
    whyInSpace: `${type} uzayda neden önemli: kısa açıklama.`,
    doNow: [`${type} için şimdi yapılacak adım.`],
    escalateWhen: `${type} için ne zaman haber verilmeli.`,
  })),
  ...over,
});
const geminiGuidanceFetch = (obj, counter) => async (_url, init) => {
  const system = JSON.parse(init.body).systemInstruction.parts[0].text;
  if (!/Indicators:/.test(system)) return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(GOOD_ADVICE) }] } }] }) };
  if (counter) counter.n++;
  return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }) };
};
const guidanceOf = (packets, id) => packets.find((p) => p.astronautId === id).aiGuidance;

test('every packet carries a Turkish AI recommendation from the first moment, with all four texts per indicator', () => {
  const { packets } = setup();
  for (const crewId of ['crew-1', 'crew-2', 'crew-3']) {
    const g = guidanceOf(packets, crewId);
    assert.equal(g.source, 'fallback');
    assert.equal(g.disclaimer, 'Yapay zekâ önerisidir. Demo yazılımıdır, tıbbi cihaz değildir.', 'the old English disclaimer is gone');
    assert.deepEqual(Object.keys(g.indicators).sort(), [...ALL_TYPES].sort());
    for (const type of ALL_TYPES) {
      const i = g.indicators[type];
      assert.ok(i.whatItIs && i.whyInSpace && i.escalateWhen && i.doNow.length > 0, `${crewId} ${type}`);
      assert.doesNotMatch(Object.values(i).flat().join(' '), /\b(the|your|contact|measures|flight surgeon|heart rate)\b/i, `no English in ${type}`);
    }
  }
  assert.match(guidanceOf(packets, 'crew-2').summary, /Tüm değerlerin normal/);
});

test('the recommendation follows the situation: a critical value changes summary, steps and escalation without a click', () => {
  const { ai, packets, applySamples } = setup();
  const before = guidanceOf(packets, 'crew-2').signature;
  applySamples([{ crewId: 'crew-2', type: 'spo2', value: 86, timestamp: 't', source: 'mock' }]);
  ai.onSamples();
  const g = guidanceOf(packets, 'crew-2');
  assert.notEqual(g.signature, before);
  assert.equal(g.overallStatus, 'red');
  assert.match(g.summary, /dikkat gerektiriyor.*KRİTİK/);
  assert.match(g.escalate, /cerrah/i);
  assert.equal(g.indicators.spo2.status, 'red');
  assert.equal(guidanceOf(packets, 'crew-3').overallStatus, 'green', 'other astronauts are untouched');
});

test('a normal tick (same statuses) does not regenerate; a status change does; the host is told only then', async () => {
  const counter = { n: 0 };
  const told = [];
  const { ai, applySamples } = setup({ gemini: { apiKey: 'k' }, fetchImpl: geminiGuidanceFetch(gemGuidance(), counter), onGuidance: (id) => told.push(id) });
  await ai.idle();
  const startCalls = counter.n;
  const startTold = told.length;
  applySamples([{ crewId: 'crew-2', type: 'heartRate', value: 71, timestamp: 't1', source: 'mock' }]); // still green
  ai.onSamples();
  await ai.idle();
  assert.equal(counter.n, startCalls, 'no Gemini call for a value that stays green');
  assert.equal(told.length, startTold, 'and nobody is notified');
  applySamples([{ crewId: 'crew-2', type: 'spo2', value: 86, timestamp: 't2', source: 'mock' }]);
  ai.onSamples();
  await ai.idle();
  assert.equal(counter.n, startCalls + 1, 'one call for the one astronaut whose situation changed');
  assert.ok(told.includes('crew-2'));
});

test('Gemini writes the recommendation: its texts replace the rule-based ones, statuses stay the engine\'s', async () => {
  const { ai, packets, applySamples } = setup({ gemini: { apiKey: 'k' }, fetchImpl: geminiGuidanceFetch(gemGuidance()) });
  applySamples([{ crewId: 'crew-2', type: 'spo2', value: 86, timestamp: 't', source: 'mock' }]);
  ai.onSamples();
  assert.equal(guidanceOf(packets, 'crew-2').source, 'fallback', 'the rule-based text is there at once');
  await ai.idle();
  const g = guidanceOf(packets, 'crew-2');
  assert.equal(g.source, 'gemini');
  assert.equal(g.model, 'gemini-flash-lite-latest');
  assert.match(g.summary, /Kan oksijenin düşük/);
  assert.equal(g.overallStatus, 'red', 'the status is still the engine\'s');
  assert.equal(g.indicators.spo2.status, 'red');
  assert.match(g.indicators.spo2.doNow[0], /spo2 için şimdi yapılacak adım/);
});

test('a bad Gemini field falls back by itself; an unsafe or empty answer keeps the rule-based text; red keeps the surgeon sentence', async () => {
  const mixed = gemGuidance({ escalate: 'Takibe devam et.', indicators: gemGuidance().indicators.map((i) => (i.type === 'mood' ? { ...i, doNow: ['500 mg alın.'] } : i)) });
  const a = setup({ gemini: { apiKey: 'k' }, fetchImpl: geminiGuidanceFetch(mixed) });
  a.applySamples([{ crewId: 'crew-2', type: 'spo2', value: 86, timestamp: 't', source: 'mock' }]);
  a.ai.onSamples();
  await a.ai.idle();
  const g = guidanceOf(a.packets, 'crew-2');
  assert.equal(g.source, 'gemini');
  assert.doesNotMatch(g.indicators.mood.doNow.join(' '), /500 mg/, 'only the unsafe indicator fell back');
  assert.match(g.indicators.heartRate.whatItIs, /ne ölçer: kısa açıklama/, 'the others kept Gemini\'s text');
  assert.match(g.escalate, /uçuş cerrahı/i, 'a red astronaut always gets the flight surgeon sentence');

  for (const bad of [gemGuidance({ summary: '' }), gemGuidance({ actions: [] }), gemGuidance({ summary: 'Ağrı için ilaç al.' })]) {
    const b = setup({ gemini: { apiKey: 'k' }, fetchImpl: geminiGuidanceFetch(bad) });
    b.applySamples([{ crewId: 'crew-2', type: 'spo2', value: 86, timestamp: 't', source: 'mock' }]);
    b.ai.onSamples();
    await b.ai.idle();
    assert.equal(guidanceOf(b.packets, 'crew-2').source, 'fallback');
  }
  const down = setup({ gemini: { apiKey: 'k' }, fetchImpl: async () => ({ ok: false, status: 404 }) });
  await down.ai.idle();
  assert.equal(guidanceOf(down.packets, 'crew-1').source, 'fallback');
  assert.ok(guidanceOf(down.packets, 'crew-1').indicators.spo2.doNow.length > 0, 'the app is never empty');
});

test('a demo reset brings the same situation back from the cache without asking Gemini again', async () => {
  const counter = { n: 0 };
  const { ai, packets } = setup({ gemini: { apiKey: 'k' }, fetchImpl: geminiGuidanceFetch(gemGuidance(), counter) });
  await ai.idle();
  const calls = counter.n;
  for (const p of packets) p.aiGuidance = { source: 'fallback', summary: 'old static demo text' }; // what a reloaded all-data.json brings
  await call(ai, 'POST', '/api/ai/demo/reset');
  await ai.idle();
  assert.equal(counter.n, calls, 'no new Gemini call');
  for (const p of packets) {
    assert.equal(p.aiGuidance.source, 'gemini');
    assert.notEqual(p.aiGuidance.summary, 'old static demo text');
  }
});

test('POST /api/ai/guidance (the iPhone calls it) answers with the current recommendation; unknown crew is a 404', async () => {
  const { ai } = setup({ gemini: { apiKey: 'k' }, fetchImpl: geminiGuidanceFetch(gemGuidance()) });
  const r = await call(ai, 'POST', '/api/ai/guidance', { crewId: 'crew-1' });
  assert.equal(r.status, 200);
  for (const key of ['generatedAt', 'source', 'model', 'overallStatus', 'summary', 'actions', 'escalate', 'disclaimer', 'indicators']) assert.ok(key in r.json, key);
  assert.ok(Array.isArray(r.json.actions));
  assert.equal((await call(ai, 'POST', '/api/ai/guidance', { crewId: 'crew-9' })).status, 404);
});

// ---- Voice clips ----
import { spokenPhrases } from './rules.mjs';

test('every red alert the demo can raise has its phrase in the voice-clip list', async () => {
  const single = Object.entries(metricDefinitions).filter(([type]) => !type.startsWith('bloodPressure')).map(([, m]) => m.label);
  const phrases = new Set(spokenPhrases(PACKETS.map((p) => p.fullName), single));
  const spoken = new Set();
  const collect = (ai) => { for (const a of ai.alerts()) if (a.severity === 'red') spoken.add(a.spokenText); };
  const ids = (await call(setup().ai, 'GET', '/api/ai/demo')).json;
  for (const id of ids) { const { ai } = setup(); await call(ai, 'POST', `/api/ai/demo/${id}`); collect(ai); }
  const reds = { heartRate: 150, bloodPressureSys: 170, spo2: 85, bodyTemp: 39.5, bloodGlucose: 250, sleepHours: 2, mood: 1, radiationDose: 99999 };
  for (const [type, value] of Object.entries(reds)) {
    const { ai, applySamples } = setup();
    applySamples([{ crewId: 'crew-3', type, value, timestamp: 't', source: 'mock' }]);
    ai.onSamples();
    collect(ai);
  }
  const { ai } = setup();
  for (const incident of INCIDENTS) for (const phase of incident.phases) { ai.onCabinHint(phase.cabinHint); collect(ai); }
  assert.ok(spoken.size >= 15, `collected ${spoken.size}`);
  assert.deepEqual([...spoken].filter((t) => !phrases.has(t)), []);
});

test('a scenario ends by itself: alerts and vitals return to normal when its time is up', async () => {
  process.env.DEMO_SCENARIO_MS = '60';
  try {
    const { ai, packets } = setup();
    const before = packets[1].measurements.heartRate.value;
    const { json } = await call(ai, 'POST', '/api/ai/demo/orthostatic');
    assert.equal(json.durationMs, 60);
    assert.ok(json.endsAt);
    assert.ok(active(ai).some((a) => a.scenarioId === 'orthostatic'));
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(packets[1].measurements.heartRate.value, before);
    assert.ok(!active(ai).some((a) => a.scenarioId === 'orthostatic'));
  } finally {
    delete process.env.DEMO_SCENARIO_MS;
  }
});

test('a one-astronaut scenario can be aimed at a chosen astronaut', async () => {
  const { ai, packets } = setup();
  const before = packets[0].measurements.heartRate.value;
  await call(ai, 'POST', '/api/ai/demo/orthostatic', { crewId: 'crew-1' });
  assert.equal(packets[0].measurements.heartRate.value, 112);
  assert.ok(active(ai).some((a) => a.scenarioId === 'orthostatic' && a.crewIds.includes('crew-1')));
  assert.equal((await call(ai, 'POST', '/api/ai/demo/orthostatic', { crewId: 'crew-9' })).status, 404);
  await call(ai, 'POST', '/api/ai/demo/reset');
  assert.equal(packets[0].measurements.heartRate.value, before);
});

test('a playing scenario keeps moving its values live, announces itself and hands everything back on reset', async () => {
  const states = [];
  const { ai, packets } = setup({ scenarioTickMs: 20, onScenario: (s) => states.push(s) });
  const before = packets.find((p) => p.astronautId === 'crew-1').measurements.heartRate.value;
  const { json } = await call(ai, 'POST', '/api/ai/demo/orthostatic', { crewId: 'crew-1' });
  assert.equal(json.scenario.active, true);
  assert.equal(json.scenario.simulated, true);
  assert.deepEqual(json.scenario.crewIds, ['crew-1'], 'a one-astronaut scenario stays on the chosen astronaut');
  assert.equal(states[0].title, 'Düşük tansiyon ve hızlı nabız', 'the start is announced at once');
  assert.ok(ai.scenarioLocks().has('crew-1:heartRate'), 'the live jitter must leave the scenario values alone');
  await new Promise((r) => setTimeout(r, 120));
  assert.ok(states.length >= 3, 'ticks keep broadcasting the scenario');
  const hr = packets.find((p) => p.astronautId === 'crew-1').measurements.heartRate.value;
  assert.ok(hr > 100, `heart rate stays in the scenario band (${hr})`);
  assert.ok(packets.find((p) => p.astronautId === 'crew-1').measurements.bloodPressureSys.value < 90);
  const hrTrack = ai.scenario().vitals.find((v) => v.type === 'heartRate');
  assert.equal(hrTrack.from, before);
  await call(ai, 'POST', '/api/ai/demo/reset');
  assert.equal(ai.scenario().active, false);
  assert.equal(states.at(-1).active, false, 'the end is announced too');
  assert.equal(packets.find((p) => p.astronautId === 'crew-1').measurements.heartRate.value, before);
  assert.equal(ai.scenarioLocks().size, 0);
});

test('a cabin scenario also moves every cabin astronaut, but only to amber (the cabin alert explains it)', async () => {
  const { ai, packets } = setup({ scenarioTickMs: 0 });
  const { json } = await call(ai, 'POST', '/api/ai/demo/cabin-gas-leak');
  assert.deepEqual(json.scenario.crewIds, ['crew-1', 'crew-2']);
  const hr2 = packets.find((p) => p.astronautId === 'crew-2').measurements.heartRate.value;
  assert.equal(getStatus('heartRate', hr2), 'amber');
  assert.ok(!json.scenario.vitals.some((v) => v.crewId === 'crew-3'), 'crew-3 is not in this cabin');
  assert.ok(json.scenario.cabin.some((c) => c.metric === 'contaminant'));
  await call(ai, 'POST', '/api/ai/demo/reset');
});


// ---- More scenarios from the data we already have (vitals and cabin) ----

test('new scenario hypoglycemia: one red alert with steps, aimed at the chosen astronaut', async () => {
  const { ai } = setup();
  await call(ai, 'POST', '/api/ai/demo/hypoglycemia', { crewId: 'crew-1' });
  const hits = active(ai).filter((a) => a.scenarioId === 'hypoglycemia');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].scope, 'crew');
  assert.equal(hits[0].severity, 'red');
  assert.deepEqual(hits[0].crewIds, ['crew-1']);
  assert.ok(hits[0].advice.doNow.length >= 2 && hits[0].advice.escalate.includes('uçuş cerrah'));
});

// The other rules built from our vitals and cabin data still fire on real readings (no demo button for them).
for (const [scenarioId, samples] of [
  ['hypertensive-crisis', [['bloodPressureSys', 172], ['bloodPressureDia', 108], ['heartRate', 104]]],
  ['eva-exertion', [['heartRate', 152], ['spo2', 91]]],
  ['radiation-budget', [['radiationDose', 93]]],
]) {
  test(`rule ${scenarioId} fires once for the astronaut whose readings cross the limit`, () => {
    const { ai, applySamples } = setup();
    applySamples(samples.map(([type, value]) => ({ crewId: 'crew-2', type, value, timestamp: 't', source: 'mock' })));
    ai.onSamples();
    const hits = active(ai).filter((a) => a.scenarioId === scenarioId);
    assert.equal(hits.length, 1);
    assert.deepEqual(hits[0].crewIds, ['crew-2']);
  });
}

test('rule cabin-humidity fires for everyone in the cabin when the air is too wet', async () => {
  const { ai } = setup();
  await call(ai, 'POST', '/api/ai/cabin', { readings: [{ metric: 'humidity', value: 86 }] });
  const hits = active(ai).filter((a) => a.scenarioId === 'cabin-humidity');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].scope, 'cabin');
});

test('every alert hands its steps to the host (onAlert) and tells when it is over (onAlertResolved, onAlertsCleared)', async () => {
  const seen = { created: [], resolved: [], cleared: 0 };
  const { ai } = setup({
    onAlert: (a) => seen.created.push(a.id),
    onAlertResolved: (a) => seen.resolved.push(a.id),
    onAlertsCleared: () => { seen.cleared += 1; },
  });
  const { json } = await call(ai, 'POST', '/api/ai/demo/cabin-gas-leak');
  assert.deepEqual(seen.created, json.created);
  await call(ai, 'POST', '/api/ai/demo/reset');
  assert.equal(seen.cleared, 1);
});
