// POST /api/ai/chat (issue #12, shared/contracts/ai.md section 5). Answers are Turkish (team decision).
// The threshold engine's statuses are given to the model as facts; the model only words the answer.
// Without a key, on timeout or on a bad reply, a deterministic Turkish answer is built from the same facts.

const ESCALATION = ['none', 'cmo', 'flightSurgeon'];
const MAX_TURNS = 6;
const MAX_CHARS = 500;
const SHOWN = 4;
const RANK = { red: 0, amber: 1, green: 2 };

/** Conversational Turkish names, used in answers. */
const NAME = {
  heartRate: 'nabız', bloodPressureSys: 'büyük tansiyon', bloodPressureDia: 'küçük tansiyon', spo2: 'kandaki oksijen',
  bodyTemp: 'vücut ısısı', bloodGlucose: 'kan şekeri', sleepHours: 'uyku', mood: 'ruh hali', radiationDose: 'radyasyon dozu',
  ppO2: 'kabin oksijeni', ppCO2: 'kabin CO2', pressure: 'kabin basıncı', temperature: 'kabin sıcaklığı',
  humidity: 'kabin nemi', contaminant: 'gaz (amonyak)', radiationRate: 'radyasyon doz hızı', lifeSupportPower: 'yaşam destek gücü',
};
const STATUS_WORD = { green: 'normal', amber: 'dikkat', red: 'KRİTİK' };
const POWER = { nominal: 'normal', degraded: 'düşük', fault: 'arızalı' };
const ESCALATE_TEXT = {
  none: 'Yeni bir belirti olmadıkça uçuş cerrahına başvurmaya gerek yok.',
  cmo: 'Mürettebat sağlık sorumlusunu bilgilendirin ve kısa süre içinde tekrar ölçün.',
  flightSurgeon: 'Uçuş cerrahına hemen başvurun.',
};
const CABIN_DO_NOW = 'Kabin sistemlerini kontrol edin ve acil durum prosedürünü uygulayın.';

// Keyword → topics (Turkish first, English kept for mixed questions). The scope decides which topics exist.
const TOPICS = [
  [/nab[ıi]?z|kal[pb]|heart|pulse/i, ['heartRate']],
  [/tansiyon|kan bas[ıi]nc|blood pressure/i, ['bloodPressureSys', 'bloodPressureDia']],
  [/oksijen|spo2|\bo2\b|sat[uü]rasyon|oxygen/i, ['spo2', 'ppO2']],
  [/ate[sş]|v[uü]cut [ıi]s|s[ıi]cakl[ıi]k|fever|temperature/i, ['bodyTemp', 'temperature']],
  [/[sş]eker|glikoz|glucose/i, ['bloodGlucose']],
  [/uyku|uyu|sleep/i, ['sleepHours']],
  [/ruh|stres|moral|mood/i, ['mood']],
  [/radyasyon|doz|g[uü]ne[sş] f[ıi]rt|radiation/i, ['radiationDose', 'radiationRate']],
  [/co2|karbon/i, ['ppCO2']],
  [/bas[ıi]n[cç]|s[ıi]z[ıi]nt|leak/i, ['pressure']],
  [/gaz|amonyak|zehir|gas/i, ['contaminant']],
  [/elektrik|g[uü][cç]|power/i, ['lifeSupportPower']],
  [/nem\b|humid/i, ['humidity']],
];

function cleanMessages(messages) {
  if (messages !== undefined && !Array.isArray(messages)) throw new Error('messages must be an array');
  return (messages ?? [])
    .filter((m) => m && typeof m.text === 'string' && m.text.trim())
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text.trim().slice(0, MAX_CHARS) }));
}

const maxEscalation = (a, b) => (ESCALATION.indexOf(a) >= ESCALATION.indexOf(b) ? a : b);
const levelFor = (statuses) => (statuses.includes('red') ? 'flightSurgeon' : statuses.includes('amber') ? 'cmo' : 'none');
const fmt = (v) => (typeof v === 'number' && !Number.isInteger(v) ? String(Math.round(v * 10) / 10) : String(v));

function valueText(i) {
  if (i.type === 'lifeSupportPower') return POWER[i.value] ?? String(i.value);
  const v = fmt(i.value);
  if (i.unit === '%') return `%${v}`;
  if (i.unit === '1-5') return `${v}/5`;
  if (i.unit === 'h') return `${v} saat`;
  return i.unit ? `${v} ${i.unit}` : v;
}

/**
 * @param {object} o
 * @param {() => object} o.context       index.mjs context(): { crew, cabin, vitalLabel, vitalGuidance, commsDelayMinutes }
 * @param {() => object[]} o.activeAlerts
 * @param {{ apiKey?: string, model?: string }} [o.gemini]
 */
export function createChat({ context, activeAlerts, gemini = {}, disclaimer, log = console, fetchImpl = fetch }) {
  const model = gemini.model || 'gemini-flash-latest';

  /** Everything the answer may rely on, already evaluated by the rules engine. */
  function facts({ scope, crewId }) {
    const ctx = context();
    const cabin = ctx.cabin.snapshot();
    const crew = scope === 'crew' ? ctx.crew.filter((c) => c.id === crewId) : ctx.crew.filter((c) => c.inCabin);
    if (scope === 'crew' && crew.length === 0) throw Object.assign(new Error(`unknown crewId: ${crewId}`), { status: 404 });
    const alerts = activeAlerts().filter((a) => (scope === 'cabin'
      ? a.scope === 'cabin' || a.crewIds.some((id) => crew.some((c) => c.id === id))
      : a.crewIds.includes(crewId)));
    const items = [
      ...crew.flatMap((c) => Object.entries(c.vitals).map(([type, v]) => ({
        kind: 'vital', crew: c, type, value: v.value, unit: v.unit, status: v.status,
      }))),
      ...(scope === 'cabin' ? cabin.readings.map((r) => ({
        kind: 'cabin', type: r.metric, value: r.value, unit: r.unit, status: r.status,
      })) : []),
    ];
    const escalation = levelFor([...items.map((i) => i.status), ...alerts.map((a) => a.severity)]);
    return { ctx, scope, crew, cabin, alerts, items, escalation };
  }

  function prompt(f) {
    const who = f.scope === 'crew'
      ? `One astronaut: ${f.crew[0].name} (${f.crew[0].id}).`
      : `Whole cabin "${f.cabin.module}" and its crew: ${f.crew.map((c) => c.name).join(', ')}.`;
    const lines = f.items.map((i) => `- ${i.kind === 'vital' && f.scope === 'cabin' ? `${i.crew.name} ` : ''}${i.type} (${NAME[i.type] ?? i.type}): ${fmt(i.value)} ${i.unit} -> ${i.status}`);
    const alerts = f.alerts.map((a) => `- [${a.severity}] ${a.title}`);
    return [
      'You are the on-board health assistant of a deep-space crew. This is demo software, not a medical device.',
      `Context: ${who} Earth comms delay up to ${f.ctx.commsDelayMinutes} minutes, so the crew must act first.`,
      'Readings with their status computed by the threshold engine. These colors are FINAL: never change, soften or re-judge them.',
      ...lines,
      'Active alerts:', ...(alerts.length ? alerts : ['- none']),
      `Minimum escalation level (deterministic): ${f.escalation}.`,
      'Rules: answer in TURKISH (only switch language if the user clearly writes in another language). Plain words, max 4 short sentences.',
      'Say what is normal and what is not, why it matters in space, 1-2 concrete actions, and when to contact the crew medical officer (mürettebat sağlık sorumlusu) or flight surgeon (uçuş cerrahı).',
      'Never diagnose, never prescribe or dose medication. If asked to, or if the question is unrelated to crew health or the cabin,',
      'say briefly that you cannot help with that and offer to explain the current readings instead.',
      'Return JSON: reply, escalation (none|cmo|flightSurgeon, never lower than the minimum), indicators (types you talked about, e.g. "spo2"), suggestions (2 short Turkish follow-up questions).',
    ].join('\n');
  }

  async function askGemini(f, messages) {
    const contents = messages.length
      ? messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }))
      : [{ role: 'user', parts: [{ text: 'Kısa bir durum brifingi ver.' }] }];
    const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': gemini.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt(f) }] },
        contents,
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              reply: { type: 'STRING' },
              escalation: { type: 'STRING', enum: ESCALATION },
              indicators: { type: 'ARRAY', items: { type: 'STRING' } },
              suggestions: { type: 'ARRAY', items: { type: 'STRING' } },
            },
            required: ['reply', 'escalation'],
          },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data = await res.json();
    const out = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
    if (typeof out.reply !== 'string' || !out.reply.trim()) throw new Error('Gemini returned no reply');
    return out;
  }

  function fallback(f, question) {
    const known = new Set(f.items.map((i) => i.type));
    const topics = new Set(TOPICS.filter(([re]) => re.test(question)).flatMap(([, t]) => t).filter((t) => known.has(t)));
    const who = (i) => (i.kind === 'vital' && f.scope === 'cabin' ? `${i.crew.name}: ` : '');
    const line = (i) => `${who(i)}${NAME[i.type] ?? i.type} ${valueText(i)} (${STATUS_WORD[i.status]})`;
    // Worst first; at equal severity the cabin comes before a single person (it affects everyone).
    const flagged = f.items.filter((i) => i.status !== 'green')
      .sort((a, b) => RANK[a.status] - RANK[b.status] || (a.kind === 'cabin' ? -1 : 0) - (b.kind === 'cabin' ? -1 : 0));
    const focus = topics.size ? f.items.filter((i) => topics.has(i.type)) : flagged;
    const subject = f.scope === 'crew' ? f.crew[0].name : 'Kabin ve mürettebat';
    const more = flagged.length - SHOWN;

    const parts = [];
    if (topics.size) parts.push(`${focus.map(line).join('; ')}.`);
    else if (flagged.length === 0) parts.push(`${subject} iyi durumda: tüm değerler normal aralıkta.`);
    else parts.push(`${subject}: ${flagged.length} değer dikkat gerektiriyor: ${flagged.slice(0, SHOWN).map(line).join('; ')}${more > 0 ? ` ve ${more} değer daha` : ''}. Diğer değerler normal.`);

    const top = focus.find((i) => i.status !== 'green');
    if (top) {
      const alert = f.alerts.find((a) => a.metrics.some((m) => m.type === top.type && (!m.crewId || m.crewId === top.crew?.id)));
      const doNow = alert?.advice?.doNow ?? (top.kind === 'vital' ? f.ctx.vitalGuidance(top.type, top.status).doNow : [CABIN_DO_NOW]);
      if (doNow?.length) parts.push(`Şimdi: ${doNow.slice(0, 2).join(' ')}`);
    }
    parts.push(ESCALATE_TEXT[f.escalation]);

    const first = flagged[0];
    const suggestions = [first ? `${NAME[first.type] ?? first.type} için ne yapmalı?` : 'Uyku durumu nasıl?', 'Ne zaman uçuş cerrahını aramalıyım?'];
    return { reply: parts.join(' '), escalation: f.escalation, indicators: [...new Set(focus.map((i) => i.type))], suggestions };
  }

  /** @returns {Promise<{ reply, source, model, escalation, indicators, suggestions, disclaimer }>} */
  return async function chat(body) {
    const crewId = body?.crewId ?? null;
    const scope = body?.scope ?? (crewId ? 'crew' : 'cabin');
    if (!['crew', 'cabin'].includes(scope)) throw new Error('scope must be "crew" or "cabin"');
    if (scope === 'crew' && !crewId) throw new Error('crewId is required for scope "crew"');
    const messages = cleanMessages(body?.messages);
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.text ?? '';
    const f = facts({ scope, crewId });
    const valid = new Set(f.items.map((i) => i.type));

    if (gemini.apiKey) {
      try {
        const out = await askGemini(f, messages);
        return {
          reply: out.reply.trim(),
          source: 'gemini',
          model,
          escalation: maxEscalation(ESCALATION.includes(out.escalation) ? out.escalation : 'none', f.escalation),
          indicators: (out.indicators ?? []).filter((t) => valid.has(t)),
          suggestions: (out.suggestions ?? []).filter((s) => typeof s === 'string').slice(0, 3),
          disclaimer,
        };
      } catch (err) {
        log.warn?.(`[ai] chat: Gemini failed, using fallback: ${err.message}`);
      }
    }
    return { ...fallback(f, lastUser), source: 'fallback', model: null, disclaimer };
  };
}
