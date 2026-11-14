// Gemini interprets a freshly detected alert for the crew (alert.advice.summary / why / doNow / escalate).
//
// The rules engine already decided WHAT happened and HOW severe it is, and wrote a safe deterministic advice.
// This module only asks Gemini to connect the readings ("tansiyon düşük VE nabız yüksek → sıvı kayması olabilir"),
// word it for the crew and adapt the steps to the situation. It never changes severity, and its output is rejected
// (the deterministic advice stays) when it is malformed, prescribes medication, or forgets to say when to call the flight surgeon.

import { callGemini, DEFAULT_MODEL } from './gemini.mjs';
import { CABIN_METRICS } from './cabin.mjs';
import { looksUnsafe } from './safety.mjs';

const CLIP = { summary: 300, why: 340, step: 180, escalate: 320 };
const MAX_PARALLEL = 3;

const clip = (v, n) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, n) : '');

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    why: { type: 'STRING' },
    doNow: { type: 'ARRAY', items: { type: 'STRING' } },
    escalate: { type: 'STRING' },
  },
  required: ['summary', 'why', 'doNow', 'escalate'],
};

/**
 * @param {object} o
 * @param {{ apiKey?: string, model?: string }} o.gemini
 * @param {object[]} [o.hazards]  nasa-hazards.json `hazards`
 */
export function createAdviceWriter({ gemini = {}, hazards = [], fetchImpl = fetch, log = console, now = () => new Date() }) {
  const model = gemini.model || DEFAULT_MODEL;
  const enabled = Boolean(gemini.apiKey);
  let running = 0;
  const waiting = [];
  const inflight = new Set();

  const label = (m, ctx) => (m.kind === 'cabin' ? CABIN_METRICS[m.type]?.label ?? m.type : ctx.vitalLabel(m.type));

  function prompt(alert, ctx) {
    const hazard = hazards.find((h) => h.id === alert.hazardId);
    const crewName = (id) => ctx.crew.find((c) => c.id === id)?.name ?? id;
    const metrics = alert.metrics.map((m) => `- ${m.kind === 'vital' ? `${crewName(m.crewId)}: ` : 'Kabin: '}${label(m, ctx)} = ${m.value} ${m.unit} (${m.status})`);
    const cabinFlags = ctx.cabin.snapshot().readings.filter((r) => r.status !== 'green').map((r) => `- ${CABIN_METRICS[r.metric]?.label ?? r.metric} = ${r.value} ${r.unit} (${r.status})`);
    const others = ctx.otherAlerts.map((a) => `- [${a.severity}] ${a.title}`);
    return [
      'You are the on-board health assistant of a deep-space crew. This is demo software, not a medical device.',
      'A rules engine has just detected a problem. Its severity and the readings are FINAL facts: never change, soften or re-judge them.',
      `Scenario: ${alert.scenarioId}. Severity: ${alert.severity}. Scope: ${alert.scope === 'cabin' ? 'whole cabin' : 'one astronaut'}. Title: ${alert.title}`,
      `Affected: ${alert.crewIds.map(crewName).join(', ')}. Earth comms delay up to ${ctx.commsDelayMinutes} minutes, so the crew must act first.`,
      'Readings that fired the rule:', ...metrics,
      'Other abnormal cabin readings:', ...(cabinFlags.length ? cabinFlags : ['- none']),
      'Other active alerts:', ...(others.length ? others : ['- none']),
      hazard ? `NASA HRP hazard: ${hazard.title}: ${hazard.summary}` : '',
      `Safe baseline advice (keep its intent, you may reword and adapt it): why="${alert.advice?.why ?? ''}"; steps=${JSON.stringify(alert.advice?.doNow ?? [])}; escalate="${alert.advice?.escalate ?? ''}"`,
      'Write in TURKISH, plain words, no jargon, addressed to the crew.',
      'summary: 1-2 sentences interpreting what the readings mean TOGETHER and what is the likely cause (say "olabilir", never diagnose).',
      'why: why this matters in space (max 2 sentences). doNow: 1-3 short concrete self-care steps, most urgent first.',
      'escalate: when to contact the crew medical officer (mürettebat sağlık sorumlusu) and the flight surgeon (uçuş cerrahı); mention the comms delay when relevant.',
      'Never prescribe or dose medication. Do not invent readings that are not listed above.',
    ].filter(Boolean).join('\n');
  }

  /** Returns the validated advice, or null when Gemini's answer must not be used. */
  function accept(out, alert) {
    if (!out || typeof out !== 'object') return null;
    const steps = (Array.isArray(out.doNow) ? out.doNow : []).map((s) => clip(s, CLIP.step)).filter(Boolean).slice(0, 3);
    const next = { summary: clip(out.summary, CLIP.summary), why: clip(out.why, CLIP.why), doNow: steps, escalate: clip(out.escalate, CLIP.escalate) };
    if (!next.summary || !next.why || !next.escalate || steps.length === 0) return null;
    if (looksUnsafe([next.summary, next.why, next.escalate, ...steps].join(' '))) return null;
    // "When to call the flight surgeon" is mandatory for a critical alert; keep our sentence when the model left it out.
    if (alert.severity === 'red' && !/uçuş cerrah/i.test(next.escalate)) {
      next.escalate = `${next.escalate} ${alert.advice?.escalate ?? 'Uçuş cerrahına hemen başvurun.'}`.trim().slice(0, CLIP.escalate + 120);
    }
    return next;
  }

  async function slot() {
    if (running < MAX_PARALLEL) { running++; return; }
    await new Promise((resolve) => waiting.push(resolve));
  }
  function release() {
    const next = waiting.shift();
    if (next) next(); else running--;
  }

  /**
   * @returns {Promise<object|null>} advice object ({summary, why, doNow, escalate, source:'gemini', model, generatedAt}) or null
   *          to keep the deterministic one. Never throws.
   */
  async function write(alert, ctx) {
    if (!enabled) return null;
    const task = (async () => {
      await slot();
      try {
        const out = await callGemini({
          apiKey: gemini.apiKey, model, system: prompt(alert, ctx), fetchImpl,
          contents: [{ role: 'user', parts: [{ text: 'Bu uyarıyı mürettebat için yorumla.' }] }], schema: SCHEMA,
        });
        const next = accept(out, alert);
        if (!next) {
          log.warn?.(`[ai] advice for ${alert.id} rejected, keeping the rule-based one`);
          return null;
        }
        return { ...next, source: 'gemini', model, generatedAt: now().toISOString() };
      } catch (err) {
        log.warn?.(`[ai] advice for ${alert.id}: Gemini failed, keeping the rule-based one: ${err.message}`);
        return null;
      } finally {
        release();
      }
    })();
    inflight.add(task);
    try { return await task; } finally { inflight.delete(task); }
  }

  return { enabled, model, write, idle: () => Promise.allSettled([...inflight]) };
}
