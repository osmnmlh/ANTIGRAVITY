// Scenario rules: deterministic, they decide WHEN an alert fires and HOW severe it is.
// The AI (later phases) only rewrites the advice text. Scenario list: docs/ai/ROADMAP.md.
// User-facing text is Turkish (team decision). `spokenText` is a SHORT phrase without numbers or advice
// ("Uyarı. Kan basıncı düşük."): clients speak it only for red alerts, the details are read on request.
//
// evaluate(ctx) → Firing[]:
//   { key, scenarioId, scope, hazardId, crewIds, severity, metrics, title, spokenText, advice: { why, doNow, escalate } }

const COMMS = (ctx) => `Dünya ile iletişim gecikmesi ${ctx.commsDelayMinutes} dakikaya kadar çıkabilir; önce siz harekete geçin.`;
const worst = (...s) => (s.includes('red') ? 'red' : 'amber');
const num = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10));
const lead = (status) => (status === 'red' ? 'Uyarı.' : 'Dikkat.');
const lower = (s) => s.toLocaleLowerCase('tr-TR');
const cap = (s) => s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1);

/** Name without rank prefix, for speech ("Cmdr. Marcus Chen" → "Marcus Chen"). */
const spokenName = (name) => name.replace(/^(Dr|Cmdr|Cdr|Capt|Lt)\.\s*/i, '');

const GAS = { ammonia: 'amonyak' };
const POWER = { nominal: 'normal', degraded: 'düşük', fault: 'arızalı' };

const cabinMetric = (r) => ({ kind: 'cabin', type: r.metric, value: r.value, unit: r.unit, status: r.status });
const vitalMetric = (c, type) => {
  const v = c.vitals[type];
  return { kind: 'vital', crewId: c.id, type, value: v.value, unit: v.unit, status: v.status };
};

// ---- Cabin scenarios: one alert for everyone inside the cabin ----

function cabinRule({ scenarioId, metric, hazardId, title, spoken, why, doNow, escalate, when }) {
  return (ctx, fired) => {
    const r = ctx.cabin.get(metric);
    if (r.status === 'green' || (when && !when(ctx, fired))) return [];
    return [{
      scenarioId, scope: 'cabin', hazardId, crewIds: ctx.cabinCrewIds, severity: r.status,
      metrics: [cabinMetric(r)],
      title: title(r), spokenText: `${lead(r.status)} ${spoken(r)}`,
      advice: { why, doNow, escalate: `${escalate} ${COMMS(ctx)}` },
    }];
  };
}

function cabinHypoxia(ctx) {
  const o2 = ctx.cabin.get('ppO2');
  const low = ctx.crew.filter((c) => c.inCabin && c.vitals.spo2?.value < 94);
  if (o2.status === 'green' || low.length < 2) return [];
  return [{
    scenarioId: 'cabin-hypoxia', scope: 'cabin', hazardId: 'hostileClosedEnvironments',
    crewIds: ctx.cabinCrewIds, severity: 'red',
    metrics: [cabinMetric(o2), ...low.map((c) => vitalMetric(c, 'spo2'))],
    title: `Kabin oksijeni düşük: ${low.length} astronotta kan oksijeni düştü`,
    spokenText: 'Uyarı. Kabin oksijeni düşük, mürettebatta oksijen düşüşü.',
    advice: {
      why: 'Birden fazla kişide aynı anda düşüş olması, sorunun kişide değil kabin havasında olduğunu gösterir. Düşük oksijen, nefes darlığı hissedilmeden önce düşünmeyi yavaşlatır.',
      doNow: ['Tüm eforu bırakın ve oksijen maskelerini takın.', 'Oksijen üretim sistemini ve kabin basıncını kontrol edin.', 'Herkesin SpO2 değerini 5 dakika sonra tekrar ölçün.'],
      escalate: `Uçuş cerrahına hemen haber verin. ${COMMS(ctx)}`,
    },
  }];
}

const CABIN_RULES = [
  cabinHypoxia,
  cabinRule({
    scenarioId: 'cabin-o2-low', metric: 'ppO2', hazardId: 'hostileClosedEnvironments',
    when: (_ctx, fired) => !fired.has('cabin-hypoxia'),
    title: (r) => `Kabin oksijeni ${r.value < 19.5 ? 'düşük' : 'yüksek'}: ${num(r.value)} kPa`,
    spoken: (r) => `Kabin oksijeni ${r.value < 19.5 ? 'düşük' : 'yüksek'}.`,
    why: 'Güvenli aralığın dışındaki oksijen, düşükse düşünmeyi ve nefes almayı, yüksekse yangın riskini etkiler.',
    doNow: ['Eforu bırakın ve sakin kalın.', 'Oksijen üretim sistemini kontrol edin, sızıntı arayın.', 'Mürettebatta baş ağrısı, baş dönmesi veya bilinç bulanıklığı olup olmadığını izleyin.'],
    escalate: 'Mürettebat sağlık sorumlusunu bilgilendirin; belirti varsa veya değer değişmeye devam ederse uçuş cerrahına başvurun.',
  }),
  cabinRule({
    scenarioId: 'cabin-gas-leak', metric: 'contaminant', hazardId: 'hostileClosedEnvironments',
    title: (r) => `Kabinde gaz salınımı: ${GAS[r.label] ?? r.label} ${num(r.value)} ppm`,
    spoken: () => 'Kabinde gaz salınımı.',
    why: 'Soğutma hattından sızan amonyak gözleri ve akciğerleri tahriş eder; kapalı kabinde dağılacak yeri yoktur.',
    doNow: ['Acil durum maskenizi hemen takın.', 'Güvenli modüle geçin ve kapağı kapatın.', 'Birbirinizi öksürük veya göz ağrısı açısından kontrol edin.'],
    escalate: 'Nefes darlığı, göğüs ağrısı veya göz ağrısı olan varsa uçuş cerrahına hemen başvurun.',
  }),
  cabinRule({
    scenarioId: 'cabin-co2-high', metric: 'ppCO2', hazardId: 'hostileClosedEnvironments',
    title: (r) => `Kabin CO2 yüksek: ${num(r.value)} mmHg`,
    spoken: () => 'Kabinde karbondioksit yüksek.',
    why: 'Kapalı kabinde CO2 hızla birikir; baş ağrısı, dikkat dağınıklığı ve hızlı nefes almaya yol açar.',
    doNow: ['CO2 temizleyicisini ve fanları kontrol edin.', 'Değer düşene kadar eforu azaltın.', 'Baş ağrısı ve yavaş düşünmeye dikkat edin.'],
    escalate: 'Şiddetli baş ağrısı, bilinç bulanıklığı veya nefes sorunu olan varsa uçuş cerrahına başvurun.',
  }),
  cabinRule({
    scenarioId: 'cabin-pressure-drop', metric: 'pressure', hazardId: 'hostileClosedEnvironments',
    title: (r) => `Kabin basıncı aralık dışında: ${num(r.value)} kPa`,
    spoken: (r) => `Kabin basıncı ${r.value < 97 ? 'düşük' : 'yüksek'}.`,
    why: 'Basınç kaybı solunabilir oksijeni azaltır ve gövde ya da conta sızıntısına işaret edebilir.',
    doNow: ['Sızıntı kontrol prosedürünü başlatın.', 'Basınçlı giysileri ve maskeleri yakında tutun.', 'Basınç düşmeye devam ederse kapakları kapatıp modülleri ayırın.'],
    escalate: 'Basınç düşmeye devam ederse veya kendini kötü hisseden varsa uçuş cerrahına ve görev kontrolüne hemen haber verin.',
  }),
  cabinRule({
    scenarioId: 'solar-event', metric: 'radiationRate', hazardId: 'spaceRadiation',
    title: (r) => `Güneş parçacık fırtınası: radyasyon ${num(r.value)} mSv/gün`,
    spoken: () => 'Radyasyon seviyesi yüksek.',
    why: 'Bir güneş fırtınası birkaç saatte haftalarca alınacak dozu verebilir; uzun vadeli kanser ve sinir sistemi riskini artırır.',
    doNow: ['Korunaklı fırtına sığınağına geçin.', 'Planlanan uzay yürüyüşünü erteleyin.', 'Dozimetrenizi takılı tutun ve sığınakta geçen süreyi kaydedin.'],
    escalate: 'Sığınağa geçtikten sonra dozunuzu uçuş cerrahına bildirin; mide bulantısı olan varsa hemen başvurun.',
  }),
  cabinRule({
    scenarioId: 'power-life-support', metric: 'lifeSupportPower', hazardId: 'hostileClosedEnvironments',
    title: (r) => `Yaşam destek gücü ${POWER[r.value] ?? r.value}`,
    spoken: (r) => `Yaşam destek gücü ${POWER[r.value] ?? r.value}.`,
    why: 'Güç olmadan oksijen üretimi ve CO2 temizliği durur; hava birkaç saat içinde bozulur.',
    doNow: ['Yaşam desteğini yedek güce alın.', 'Kabin oksijeni ve CO2 değerlerini yakından izleyin.', 'Oksijen tasarrufu için eforu sınırlayın.'],
    escalate: 'Görev kontrolüne hemen haber verin; belirti gösteren varsa uçuş cerrahına başvurun.',
  }),
];

// ---- Crew scenarios: one alert per astronaut, routed only to their devices ----

function crewFiring(ctx, c, { scenarioId, hazardId, severity, types, title, spokenText, why, doNow, escalate }) {
  return {
    scenarioId, scope: 'crew', hazardId, crewIds: [c.id], severity,
    metrics: types.map((t) => vitalMetric(c, t)),
    title: `${c.name}: ${title}`, spokenText: `${lead(severity)} ${spokenText}`,
    advice: { why, doNow, escalate: `${escalate} ${COMMS(ctx)}` },
  };
}

function crewRules(ctx, c, cabinHypoxiaFired) {
  const v = (t) => c.vitals[t]?.value;
  const name = spokenName(c.name);
  const out = [];
  if (v('bloodPressureSys') < 90 && v('heartRate') > 100) {
    out.push(crewFiring(ctx, c, {
      scenarioId: 'orthostatic', hazardId: 'gravityFields', severity: 'red',
      // the abnormal diastolic value belongs to the same event, so it must not raise a second "vital red" alert
      types: ['bloodPressureSys', ...(c.vitals.bloodPressureDia && c.vitals.bloodPressureDia.status !== 'green' ? ['bloodPressureDia'] : []), 'heartRate'],
      title: 'düşük tansiyon ve hızlı nabız',
      spokenText: `${name} için kan basıncı düşük.`,
      why: 'Ağırlıksızlıkta vücut sıvıları yer değiştirir ve kalp zayıflar; tansiyon düşebilir ve kalp bunu telafi etmek için hızlanır.',
      doNow: ['Uzanın veya bacaklarınızı yükseltip oturun.', 'Elektrolitli sıvı için.', 'Tansiyonu 5 dakika sonra tekrar ölçün.'],
      escalate: "Büyük tansiyon 90'ın altında kalırsa, bayılma veya göğüs ağrısı olursa uçuş cerrahına hemen başvurun.",
    }));
  }
  if (v('bodyTemp') >= 37.6 && v('heartRate') > 100) {
    out.push(crewFiring(ctx, c, {
      scenarioId: 'infection-suspected', hazardId: 'hostileClosedEnvironments',
      severity: worst(c.vitals.bodyTemp.status, c.vitals.heartRate.status),
      types: ['bodyTemp', 'heartRate'],
      title: 'ateş ve hızlı nabız',
      spokenText: `${name} için ateş yüksek.`,
      why: 'Uzay uçuşu bağışıklık sistemini zayıflatır ve mikroplar kapalı kabinde kolayca yayılır.',
      doNow: ['Dinlenin ve mürettebatla teması sınırlayın.', 'Bol sıvı için.', 'Vücut ısısını 1 saat sonra tekrar ölçün.'],
      escalate: "Ateş 38,5 °C'ye ulaşırsa veya nefes sorunu olursa uçuş cerrahına başvurun.",
    }));
  }
  if (c.vitals.spo2?.status === 'red' && !(c.inCabin && cabinHypoxiaFired)) {
    out.push(crewFiring(ctx, c, {
      scenarioId: 'individual-hypoxia', hazardId: 'hostileClosedEnvironments', severity: 'red',
      types: ['spo2'],
      title: `kan oksijeni %${v('spo2')}, kabin havası normal`,
      spokenText: `${name} için kan oksijeni düşük.`,
      why: 'Kabin oksijeni normal olduğu için neden büyük olasılıkla kişide (akciğer, dolaşım) ya da sensörde.',
      doNow: ['Eforu bırakın ve dik oturun.', 'Sensörün takılışını kontrol edip 5 dakika sonra tekrar ölçün.', 'Yavaş ve derin nefes alın.'],
      escalate: "%90'ın altında kalırsa mürettebat sağlık sorumlusunu uyarın ve uçuş cerrahına hemen başvurun.",
    }));
  }
  // Multi-day part comes from the shared trend rule (2 days at mood <= 3 → red), never a copy of it.
  const moodTrend = c.trend('mood');
  if (c.vitals.mood && (moodTrend === 'red' || (v('sleepHours') < 6 && v('mood') <= 3))) {
    out.push(crewFiring(ctx, c, {
      scenarioId: 'fatigue-isolation', hazardId: 'isolationConfinement',
      severity: [c.vitals.mood.status, moodTrend].includes('red') ? 'red' : 'amber',
      types: c.vitals.sleepHours ? ['sleepHours', 'mood'] : ['mood'],
      title: moodTrend === 'red' ? 'iki gündür düşük ruh hali' : 'kısa uyku ve düşük ruh hali',
      spokenText: moodTrend === 'red'
        ? `${name} için ruh hali iki gündür düşük.`
        : `${name} için uyku ve ruh hali düşük.`,
      why: 'Aylarca süren izolasyon ve bozulan gece-gündüz döngüsü uykuyu ve ruh halini yıpratır; bu da dikkati ve güvenliği etkiler.',
      doNow: ['Bu akşam ışık terapisi programını uygulayın.', 'Bugünkü iş yükünü yeniden dengeleyin.', 'Ailenizle veya destek ekibiyle özel bir görüşme planlayın.'],
      escalate: 'Bu durum 2 gün daha sürerse uçuş cerrahı veya psikologla konuşun.',
    }));
  }
  return out;
}

function vitalRed(ctx, c, covered) {
  return Object.entries(c.vitals)
    .filter(([type, s]) => s.status === 'red' && !covered.has(`${c.id}:${type}`))
    .map(([type, s]) => {
      const label = ctx.vitalLabel(type);
      const g = ctx.vitalGuidance(type, 'red');
      return {
        scenarioId: 'vital-red', scope: 'crew', hazardId: ctx.hazardFor(type), crewIds: [c.id], severity: 'red',
        metrics: [vitalMetric(c, type)],
        title: `${c.name}: ${lower(label)} kritik (${num(s.value)} ${s.unit})`,
        spokenText: `Uyarı. ${spokenName(c.name)} için ${lower(label)} kritik.`,
        advice: { why: g.why, doNow: g.doNow, escalate: `${g.escalate} ${COMMS(ctx)}` },
        type,
      };
    });
}

export function evaluate(ctx) {
  const firings = [];
  const fired = new Set();
  for (const rule of CABIN_RULES) {
    for (const f of rule(ctx, fired)) {
      firings.push(f);
      fired.add(f.scenarioId);
    }
  }
  const covered = new Set(
    firings.flatMap((f) => f.metrics.filter((m) => m.kind === 'vital').map((m) => `${m.crewId}:${m.type}`)),
  );
  for (const c of ctx.crew) {
    const own = crewRules(ctx, c, fired.has('cabin-hypoxia'));
    for (const f of own) for (const m of f.metrics) covered.add(`${c.id}:${m.type}`);
    firings.push(...own, ...vitalRed(ctx, c, covered));
  }
  // Key = what makes an alert "the same" across evaluations.
  for (const f of firings) {
    f.key = [f.scenarioId, f.scope === 'crew' ? f.crewIds[0] : 'cabin', f.type].filter(Boolean).join(':');
    delete f.type;
  }
  return firings;
}
