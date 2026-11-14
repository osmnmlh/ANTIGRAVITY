// The per-astronaut AI recommendation that ships inside every packet (`packet.aiGuidance`, shown on the iPhone as "AI önerisi"):
// a short summary + steps for the astronaut AND, for every indicator, the four texts of the guidance sheet
// (Nedir? / Uzayda neden önemli? / Şimdi ne yapmalı? / Ne zaman uçuş cerrahı?).
//
// Gemini writes them from the statuses the threshold engine computed (those are FINAL facts). Until it answers, or without a key,
// the same fields are filled from the Turkish rule-based texts (web/src/domain/guidance.ts), and `source` says which one it is.
// Nothing here is static demo text: it is regenerated whenever an indicator's status or the active alerts of the astronaut change.

import { callGemini, DEFAULT_MODEL } from './gemini.mjs';
import { looksUnsafe } from './safety.mjs';

const RANK = { green: 0, missing: 0, amber: 1, red: 2 };
const STATUS_TR = { amber: 'dikkat', red: 'KRİTİK' };
const CLIP = { summary: 300, line: 260, step: 180 };
const clip = (v, n) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, n) : '');
const worst = (list) => list.reduce((w, s) => (RANK[s] > RANK[w] ? s : w), 'green');

const GUIDANCE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    actions: { type: 'ARRAY', items: { type: 'STRING' } },
    escalate: { type: 'STRING' },
    indicators: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING' },
          whatItIs: { type: 'STRING' },
          whyInSpace: { type: 'STRING' },
          doNow: { type: 'ARRAY', items: { type: 'STRING' } },
          escalateWhen: { type: 'STRING' },
        },
        required: ['type', 'whatItIs', 'whyInSpace', 'doNow', 'escalateWhen'],
      },
    },
  },
  required: ['summary', 'actions', 'escalate', 'indicators'],
};

/**
 * @param {object} o
 * @param {{ apiKey?: string, model?: string }} o.gemini
 * @param {(type: string, status: string) => object|null} o.getVitalGuidance  Turkish rule-based texts (guidanceByType)
 * @param {(type: string) => string} o.vitalLabel
 */
export function createGuidanceWriter({ gemini = {}, getVitalGuidance, vitalLabel, fetchImpl = fetch, log = console, now = () => new Date(), disclaimer }) {
  const model = gemini.model || DEFAULT_MODEL;
  const enabled = Boolean(gemini.apiKey);

  /** Only statuses and which scenarios are active decide the text, so a normal 2-second value tick never regenerates it. */
  function signature(crew, alerts, overall) {
    const statuses = Object.entries(crew.vitals).map(([t, v]) => `${t}:${v.status}`).sort().join(',');
    const active = alerts.map((a) => `${a.scenarioId}:${a.severity}`).sort().join(',');
    return `${overall}|${statuses}|${active}`;
  }

  const rulesFor = (type, status) => {
    const g = getVitalGuidance(type, status);
    return {
      whatItIs: g?.whatItIs ?? g?.what ?? '',
      whyInSpace: g?.whyInSpace ?? g?.why ?? '',
      doNow: (g?.doNow ?? []).slice(0, 3),
      escalateWhen: g?.escalateWhen ?? g?.escalate ?? 'Kırmızı durumda uçuş cerrahına haber verin.',
    };
  };

  const base = (overallStatus, sig) => ({ generatedAt: now().toISOString(), overallStatus, signature: sig, disclaimer });

  /** Deterministic Turkish recommendation: always available, instantly. */
  function fallback(crew, alerts, overallStatus) {
    const sig = signature(crew, alerts, overallStatus);
    const flagged = Object.entries(crew.vitals).filter(([, v]) => v.status === 'amber' || v.status === 'red')
      .sort((a, b) => RANK[b[1].status] - RANK[a[1].status]);
    const indicators = Object.fromEntries(Object.entries(crew.vitals).map(([type, v]) => [type, {
      status: v.status, value: v.value, unit: v.unit, ...rulesFor(type, v.status),
    }]));
    const cabinAlerts = alerts.filter((a) => a.scope === 'cabin').map((a) => a.title);
    let summary;
    let actions;
    let escalate;
    if (flagged.length === 0 && cabinAlerts.length === 0) {
      summary = 'Tüm değerlerin normal aralıkta. Günlük rutinine devam et.';
      actions = ['Planlanan egzersiz önlemlerine devam et.', 'Uyku ve sıvı alımı düzenini koru.'];
      escalate = 'Şu an uçuş cerrahına başvurman gerekmiyor. Yeni bir belirti fark edersen haber ver.';
    } else {
      const list = flagged.map(([t, v]) => `${vitalLabel(t)} ${v.value} ${v.unit} (${STATUS_TR[v.status]})`).join(', ');
      summary = [flagged.length ? `${flagged.length} değer dikkat gerektiriyor: ${list}.` : '', cabinAlerts.length ? `Kabinde aktif uyarı: ${cabinAlerts.join('; ')}.` : ''].filter(Boolean).join(' ');
      const fromAlerts = alerts.flatMap((a) => a.advice?.doNow?.slice(0, 1) ?? []);
      const fromVitals = flagged.slice(0, 3).map(([t, v]) => rulesFor(t, v.status).doNow[0]).filter(Boolean);
      actions = [...new Set([...fromAlerts, ...fromVitals])].slice(0, 3);
      escalate = flagged.length ? rulesFor(flagged[0][0], flagged[0][1].status).escalateWhen : 'Kabin uyarısı sürüyorsa uçuş cerrahına haber verin.';
    }
    return { ...base(overallStatus, sig), source: 'fallback', model: null, summary, actions, escalate, indicators };
  }

  function prompt(crew, alerts, overallStatus, ctx) {
    const lines = Object.entries(crew.vitals).map(([t, v]) => `- ${t} (${vitalLabel(t)}): ${v.value} ${v.unit} -> ${v.status}`);
    const titles = alerts.map((a) => `- [${a.severity}] ${a.title}`);
    return [
      'You are the on-board health assistant of a deep-space crew. This is demo software, not a medical device.',
      `Astronaut: ${crew.name}. Earth comms delay up to ${ctx.commsDelayMinutes} minutes, so the astronaut acts first.`,
      `Overall status (computed by the threshold engine, FINAL): ${overallStatus}. The status of every indicator below is FINAL too: never change, soften or re-judge it.`,
      'Indicators:', ...lines,
      'Active alerts for this astronaut / cabin:', ...(titles.length ? titles : ['- none']),
      'Write in TURKISH, plain words, addressed to the astronaut ("sen" or neutral).',
      'summary: 1-2 sentences about the situation. actions: 1-3 concrete steps for now. escalate: when to contact the crew medical officer / flight surgeon (uçuş cerrahı).',
      'indicators: one entry for EVERY indicator above, with its exact `type`: whatItIs (what it measures, 1 sentence), whyInSpace (why it matters in space, link to the NASA hazard, 1-2 sentences),',
      'doNow (1-3 steps matching the status; for a normal value one short upkeep step), escalateWhen (when to call, 1 sentence). Keep normal indicators short.',
      'Never diagnose, never name or dose medication. Do not invent readings.',
    ].join('\n');
  }

  /** Validated Gemini text merged over the fallback: a bad field falls back by itself, never the whole answer. */
  function accept(out, fb, overallStatus) {
    if (!out || typeof out !== 'object') return null;
    const summary = clip(out.summary, CLIP.summary);
    const escalate = clip(out.escalate, CLIP.line);
    const actions = (Array.isArray(out.actions) ? out.actions : []).map((s) => clip(s, CLIP.step)).filter(Boolean).slice(0, 3);
    if (!summary || !escalate || actions.length === 0 || looksUnsafe([summary, escalate, ...actions].join(' '))) return null;
    const byType = new Map((Array.isArray(out.indicators) ? out.indicators : []).filter((i) => i && typeof i.type === 'string').map((i) => [i.type, i]));
    const indicators = {};
    for (const [type, own] of Object.entries(fb.indicators)) {
      const g = byType.get(type);
      const doNow = (Array.isArray(g?.doNow) ? g.doNow : []).map((s) => clip(s, CLIP.step)).filter(Boolean).slice(0, 3);
      const next = { whatItIs: clip(g?.whatItIs, CLIP.line), whyInSpace: clip(g?.whyInSpace, CLIP.line), doNow, escalateWhen: clip(g?.escalateWhen, CLIP.line) };
      const ok = next.whatItIs && next.whyInSpace && next.escalateWhen && doNow.length > 0 && !looksUnsafe(Object.values(next).flat().join(' '));
      indicators[type] = ok ? { status: own.status, value: own.value, unit: own.unit, ...next } : own;
    }
    const fixed = overallStatus === 'red' && !/uçuş cerrah/i.test(escalate) ? `${escalate} ${fb.escalate}`.slice(0, CLIP.line + 120) : escalate;
    return { ...fb, source: 'gemini', model, generatedAt: now().toISOString(), summary, actions, escalate: fixed, indicators };
  }

  /** @returns {Promise<object|null>} the Gemini version of `fb`, or null to keep the fallback. Never throws. */
  async function write(crew, alerts, overallStatus, fb, ctx) {
    if (!enabled) return null;
    try {
      const out = await callGemini({
        apiKey: gemini.apiKey, model, system: prompt(crew, alerts, overallStatus, ctx), fetchImpl, schema: GUIDANCE_SCHEMA,
        contents: [{ role: 'user', parts: [{ text: 'Bu astronot için öneriyi hazırla.' }] }],
        deadlineMs: 12_000, // longer than an alert: it carries a text for every indicator
      });
      const next = accept(out, fb, overallStatus);
      if (!next) log.warn?.(`[ai] guidance for ${crew.id} rejected, keeping the rule-based one`);
      return next;
    } catch (err) {
      log.warn?.(`[ai] guidance for ${crew.id}: Gemini failed, keeping the rule-based one: ${err.message}`);
      return null;
    }
  }

  return { enabled, model, signature, fallback, write, worst };
}
