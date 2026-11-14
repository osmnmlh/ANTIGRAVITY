// POST /api/ai/chat (issue #12, shared/contracts/ai.md section 5).
// The threshold engine's statuses are given to the model as facts; the model only words the answer.
// Without a key, on timeout or on a bad reply, a deterministic answer is built from the same facts (EN or TR).

const ESCALATION = ['none', 'cmo', 'flightSurgeon'];
const MAX_TURNS = 6;
const MAX_CHARS = 500;

const TR = {
  heartRate: 'nabız', bloodPressureSys: 'büyük tansiyon', bloodPressureDia: 'küçük tansiyon', spo2: 'kandaki oksijen',
  bodyTemp: 'vücut ısısı', bloodGlucose: 'kan şekeri', sleepHours: 'uyku', mood: 'ruh hali', radiationDose: 'radyasyon dozu',
  ppO2: 'kabin oksijeni', ppCO2: 'kabin CO2', pressure: 'kabin basıncı', temperature: 'kabin sıcaklığı',
  humidity: 'kabin nemi', contaminant: 'gaz kirliliği', radiationRate: 'radyasyon doz hızı', lifeSupportPower: 'yaşam destek gücü',
};
const STATUS_WORD = {
  en: { green: 'normal', amber: 'needs attention', red: 'CRITICAL' },
  tr: { green: 'normal', amber: 'dikkat', red: 'KRİTİK' },
};

// Keyword → topics. Vital types and cabin metrics share one list; the scope decides which ones exist.
const TOPICS = [
  [/heart|pulse|\bhr\b|nab[ıi]z|kalp/i, ['heartRate']],
  [/blood pressure|\bbp\b|tansiyon|kan bas[ıi]nc/i, ['bloodPressureSys', 'bloodPressureDia']],
  [/oxygen|spo2|\bo2\b|oksijen|sat[uü]rasyon/i, ['spo2', 'ppO2']],
  [/fever|body temp|temperature|ate[sş]|v[uü]cut [ıi]s/i, ['bodyTemp', 'temperature']],
  [/glucose|sugar|[sş]eker|glikoz/i, ['bloodGlucose']],
  [/sleep|uyku|uyu/i, ['sleepHours']],
  [/mood|stress|ruh|stres|moral/i, ['mood']],
  [/radiation|dose|solar|radyasyon|doz|g[uü]ne[sş] f[ıi]rt/i, ['radiationDose', 'radiationRate']],
  [/co2|carbon|karbon/i, ['ppCO2']],
  [/cabin pressure|leak|bas[ıi]n[cç]|s[ıi]z[ıi]nt/i, ['pressure']],
  [/gas|ammonia|gaz|amonyak|zehir/i, ['contaminant']],
  [/power|electric|elektrik|g[uü][cç]/i, ['lifeSupportPower']],
  [/humid|nem/i, ['humidity']],
];

export const detectLang = (text) =>
  /[çğıöşüÇĞİÖŞÜ]|\b(nas[ıi]l|durum|neden|ne yap|mi|m[ıi]|var m[ıi]|astronot)\b/i.test(text) ? 'tr' : 'en';

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
const RANK = { red: 0, amber: 1, green: 2 };

function valueText(i, lang) {
  const v = fmt(i.value);
  if (i.unit === '%') return lang === 'tr' ? `%${v}` : `${v}%`;
  if (i.unit === '1-5') return `${v}/5`;
  if (i.unit === 'h' && lang === 'tr') return `${v} saat`;
  return i.unit ? `${v} ${i.unit}` : v;
}

const TR_DO_NOW = {
  vital: 'Eforu bırakın, dinlenin ve 5 dakika sonra tekrar ölçün.',
  contaminant: 'Hemen maskenizi takın ve güvenli modüle geçin.',
  radiationRate: "Korunaklı fırtına sığınağına geçin ve EVA'yı erteleyin.",
  cabin: 'Kabin sistemlerini kontrol edin ve acil durum prosedürünü uygulayın.',
};

/**
 * @param {object} o
 * @param {() => object} o.context       index.mjs context(): { crew, cabin, vitalLabel, vitalGuidance, commsDelayMinutes }
 * @param {() => object[]} o.activeAlerts
 * @param {{ apiKey?: string, model?: string }} [o.gemini]
 */
export function createChat({ context, activeAlerts, gemini = {}, disclaimer, log = console, fetchImpl = fetch }) {
  const model = gemini.model || 'gemini-2.5-flash';

  /** Everything the answer may rely on, already evaluated by the rules engine. */
  function facts({ scope, crewId }) {
    const ctx = context();
    const cabin = ctx.cabin.snapshot();
    const crew = scope === 'crew' ? ctx.crew.filter((c) => c.id === crewId) : ctx.crew.filter((c) => c.inCabin);
    if (scope === 'crew' && crew.length === 0) throw Object.assign(new Error(`unknown crewId: ${crewId}`), { status: 404 });
    const alerts = activeAlerts().filter((a) => (scope === 'cabin' ? a.scope === 'cabin' || a.crewIds.some((id) => crew.some((c) => c.id === id)) : a.crewIds.includes(crewId)));
    const items = [
      ...crew.flatMap((c) => Object.entries(c.vitals).map(([type, v]) => ({
        kind: 'vital', crew: c, type, label: ctx.vitalLabel(type), value: v.value, unit: v.unit, status: v.status,
      }))),
      ...(scope === 'cabin' ? cabin.readings.map((r) => ({
        kind: 'cabin', type: r.metric, label: r.label ? `${r.label} (gas)` : r.metric, value: r.value, unit: r.unit, status: r.status,
      })) : []),
    ];
    const escalation = levelFor([...items.map((i) => i.status), ...alerts.map((a) => a.severity)]);
    return { ctx, scope, crew, cabin, alerts, items, escalation };
  }

  function prompt(f) {
    const who = f.scope === 'crew'
      ? `One astronaut: ${f.crew[0].name} (${f.crew[0].id}).`
      : `Whole cabin "${f.cabin.module}" and its crew: ${f.crew.map((c) => c.name).join(', ')}.`;
    const lines = f.items.map((i) => `- ${i.kind === 'vital' && f.scope === 'cabin' ? `${i.crew.name} ` : ''}${i.type}: ${fmt(i.value)} ${i.unit} -> ${i.status}`);
    const alerts = f.alerts.map((a) => `- [${a.severity}] ${a.title}`);
    return [
      'You are the on-board health assistant of a deep-space crew. This is demo software, not a medical device.',
      `Context: ${who} Earth comms delay up to ${f.ctx.commsDelayMinutes} minutes, so the crew must act first.`,
      'Readings with their status computed by the threshold engine. These colors are FINAL: never change, soften or re-judge them.',
      ...lines,
      'Active alerts:', ...(alerts.length ? alerts : ['- none']),
      `Minimum escalation level (deterministic): ${f.escalation}.`,
      'Rules: answer the latest user message in the SAME language the user wrote in. Plain words, max 4 short sentences.',
      'Say what is normal and what is not, why it matters in space, 1-2 concrete actions, and when to contact the crew medical officer or flight surgeon.',
      'Never diagnose, never prescribe or dose medication. If asked to, or if the question is unrelated to crew health or the cabin,',
      'say briefly that you cannot help with that and offer to explain the current readings instead.',
      'Return JSON: reply, escalation (none|cmo|flightSurgeon, never lower than the minimum), indicators (types you talked about), suggestions (2 short follow-up questions in the user language).',
    ].join('\n');
  }

  async function askGemini(f, messages, lang) {
    const contents = messages.length
      ? messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }))
      : [{ role: 'user', parts: [{ text: lang === 'tr' ? 'Kısa bir durum brifingi ver.' : 'Give me a short status briefing.' }] }];
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

  function fallback(f, question, lang) {
    const known = new Set(f.items.map((i) => i.type));
    const topics = new Set(TOPICS.filter(([re]) => re.test(question)).flatMap(([, t]) => t).filter((t) => known.has(t)));
    const label = (i) => (lang === 'tr' ? TR[i.type] ?? i.label : i.label);
    const who = (i) => (i.kind === 'vital' && f.scope === 'cabin' ? `${i.crew.name}: ` : '');
    const line = (i) => `${who(i)}${label(i)} ${valueText(i, lang)} (${STATUS_WORD[lang][i.status]})`;
    // Worst first; at equal severity the cabin comes before a single person (it affects everyone).
    const flagged = f.items.filter((i) => i.status !== 'green')
      .sort((a, b) => RANK[a.status] - RANK[b.status] || (a.kind === 'cabin' ? -1 : 0) - (b.kind === 'cabin' ? -1 : 0));
    const SHOWN = 4;
    const more = flagged.length - SHOWN;
    const focus = topics.size ? f.items.filter((i) => topics.has(i.type)) : flagged;
    const subject = f.scope === 'crew' ? f.crew[0].name : lang === 'tr' ? 'Kabin ve mürettebat' : 'The cabin and crew';

    const parts = [];
    if (!topics.size && flagged.length === 0) {
      parts.push(lang === 'tr' ? `${subject} iyi durumda: tüm değerler normal aralıkta.` : `${subject}: all readings are in the normal range.`);
    } else if (!topics.size) {
      parts.push(lang === 'tr'
        ? `${subject}: ${flagged.length} değer dikkat gerektiriyor: ${flagged.slice(0, SHOWN).map(line).join('; ')}${more > 0 ? ` ve ${more} değer daha` : ''}. Diğer değerler normal.`
        : `${subject}: ${flagged.length} reading(s) need attention: ${flagged.slice(0, SHOWN).map(line).join('; ')}${more > 0 ? ` and ${more} more` : ''}. Everything else is normal.`);
    } else {
      parts.push(`${focus.map(line).join('; ')}.`);
    }
    const top = focus.find((i) => i.status !== 'green');
    if (top && lang === 'tr') parts.push(TR_DO_NOW[top.kind === 'vital' ? 'vital' : TR_DO_NOW[top.type] ? top.type : 'cabin']);
    if (top && lang === 'en') {
      const alert = f.alerts.find((a) => a.metrics.some((m) => m.type === top.type));
      const doNow = alert?.advice?.doNow ?? (top.kind === 'vital' ? f.ctx.vitalGuidance(top.type, top.status).doNow : []);
      if (doNow.length) parts.push(`Do now: ${doNow.slice(0, 2).join(' ')}`);
    }
    parts.push({
      en: { none: 'No need to contact the flight surgeon unless new symptoms appear.', cmo: 'Tell the crew medical officer and re-measure soon.', flightSurgeon: 'Contact the flight surgeon now.' },
      tr: { none: 'Yeni bir belirti olmadıkça uçuş cerrahına başvurmaya gerek yok.', cmo: 'Mürettebat sağlık sorumlusunu bilgilendirin ve kısa süre içinde tekrar ölçün.', flightSurgeon: 'Uçuş cerrahına hemen başvurun.' },
    }[lang][f.escalation]);

    const firstFlag = flagged[0];
    const suggestions = lang === 'tr'
      ? [firstFlag ? `${TR[firstFlag.type] ?? firstFlag.label} için ne yapmalı?` : 'Uyku durumu nasıl?', 'Ne zaman uçuş cerrahını aramalıyım?']
      : [firstFlag ? `What should I do about ${firstFlag.label.replace(/\s*\(.*\)/, '').toLowerCase()}?` : 'How is sleep looking?', 'When should I call the flight surgeon?'];
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
    const lang = body?.lang === 'tr' || body?.lang === 'en' ? body.lang : detectLang(lastUser);
    const f = facts({ scope, crewId });
    const valid = new Set(f.items.map((i) => i.type));

    if (gemini.apiKey) {
      try {
        const out = await askGemini(f, messages, lang);
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
    return { ...fallback(f, lastUser, lang), source: 'fallback', model: null, disclaimer };
  };
}
