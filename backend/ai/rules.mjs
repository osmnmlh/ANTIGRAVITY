// Scenario rules: deterministic, they decide WHEN an alert fires and HOW severe it is.
// The AI (later phases) only rewrites the advice text. Scenario list: docs/ai/ROADMAP.md.
//
// evaluate(ctx) → Firing[]:
//   { key, scenarioId, scope, hazardId, crewIds, severity, metrics, title, spokenText, advice: { why, doNow, escalate } }

const COMMS = (ctx) => `Earth comms delay can be up to ${ctx.commsDelayMinutes} minutes, so act first.`;
const worst = (...s) => (s.includes('red') ? 'red' : 'amber');
const num = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10));

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
      title: title(r), spokenText: spoken(r),
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
    title: `Cabin oxygen low: ${low.length} crew members show low blood oxygen`,
    spokenText: `Warning. Cabin oxygen is low at ${num(o2.value)} kilopascals and ${low.length} crew members have low blood oxygen. The cabin is the likely cause.`,
    advice: {
      why: 'Several people dropping at the same time points to the cabin air, not to one person. Low oxygen slows thinking before you feel short of breath.',
      doNow: ['Stop all exertion and put on oxygen masks.', 'Check the oxygen generation system and cabin pressure.', 'Re-measure everyone\'s SpO2 in 5 minutes.'],
      escalate: `Contact the flight surgeon now. ${COMMS(ctx)}`,
    },
  }];
}

const CABIN_RULES = [
  cabinHypoxia,
  cabinRule({
    scenarioId: 'cabin-o2-low', metric: 'ppO2', hazardId: 'hostileClosedEnvironments',
    when: (_ctx, fired) => !fired.has('cabin-hypoxia'),
    title: (r) => `Cabin oxygen ${r.value < 19.5 ? 'low' : 'high'}: ${num(r.value)} kPa`,
    spoken: (r) => `Warning. Cabin oxygen pressure is ${r.value < 19.5 ? 'low' : 'high'}, ${num(r.value)} kilopascals.`,
    why: 'Oxygen outside the safe band affects thinking and breathing (low) or raises fire risk (high).',
    doNow: ['Stop exertion and stay calm.', 'Check the oxygen generation system and look for leaks.', 'Watch the crew for headache, dizziness or confusion.'],
    escalate: 'Alert the crew medical officer; contact the flight surgeon if anyone has symptoms or the value keeps moving.',
  }),
  cabinRule({
    scenarioId: 'cabin-gas-leak', metric: 'contaminant', hazardId: 'hostileClosedEnvironments',
    title: (r) => `Gas release in the cabin: ${r.label} ${num(r.value)} ppm`,
    spoken: (r) => `Warning. Gas release in the crew cabin. ${r.label} is at ${num(r.value)} parts per million.${r.status === 'red' ? ' Put on your mask.' : ''}`,
    why: 'Ammonia from the cooling loop irritates eyes and lungs, and in a closed cabin there is nowhere for it to go.',
    doNow: ['Put on your emergency mask now.', 'Move to the designated safe module and close the hatch.', 'Check each other for coughing or eye pain.'],
    escalate: 'Contact the flight surgeon now if anyone has trouble breathing, chest pain or eye pain.',
  }),
  cabinRule({
    scenarioId: 'cabin-co2-high', metric: 'ppCO2', hazardId: 'hostileClosedEnvironments',
    title: (r) => `Cabin CO2 high: ${num(r.value)} mmHg`,
    spoken: (r) => `Caution. Carbon dioxide in the cabin is high, ${num(r.value)} millimeters of mercury.`,
    why: 'CO2 builds up fast in a closed cabin and causes headaches, poor focus and faster breathing.',
    doNow: ['Check the CO2 scrubber and fans.', 'Reduce exertion until levels fall.', 'Watch for headaches and slow thinking.'],
    escalate: 'Contact the flight surgeon if anyone has a severe headache, confusion or breathing trouble.',
  }),
  cabinRule({
    scenarioId: 'cabin-pressure-drop', metric: 'pressure', hazardId: 'hostileClosedEnvironments',
    title: (r) => `Cabin pressure out of range: ${num(r.value)} kPa`,
    spoken: (r) => `Warning. Cabin pressure is ${num(r.value)} kilopascals.${r.status === 'red' ? ' Possible leak.' : ''}`,
    why: 'Pressure loss lowers the oxygen you can breathe and can mean a hull or seal leak.',
    doNow: ['Run the leak check procedure.', 'Keep pressure suits and masks within reach.', 'Close hatches to isolate modules if pressure keeps falling.'],
    escalate: 'Contact the flight surgeon and mission control now if pressure keeps falling or anyone feels unwell.',
  }),
  cabinRule({
    scenarioId: 'solar-event', metric: 'radiationRate', hazardId: 'spaceRadiation',
    title: (r) => `Solar particle event: radiation ${num(r.value)} mSv/day`,
    spoken: (r) => `Warning. Radiation dose rate is ${num(r.value)} millisieverts per day. ${r.status === 'red' ? 'Go to the storm shelter now.' : 'Prepare to shelter.'}`,
    why: 'A solar storm can deliver weeks of normal dose in hours, raising long-term cancer and nervous-system risk.',
    doNow: ['Move to the shielded storm shelter.', 'Postpone any EVA.', 'Keep your dosimeter on and log your time in the shelter.'],
    escalate: 'Report your dose to the flight surgeon once you are sheltered; contact them now if anyone feels nausea.',
  }),
  cabinRule({
    scenarioId: 'power-life-support', metric: 'lifeSupportPower', hazardId: 'hostileClosedEnvironments',
    title: (r) => `Life-support power ${r.value}`,
    spoken: (r) => `Warning. Life-support power is ${r.value}. Oxygen and CO2 systems may be affected.`,
    why: 'Without power, oxygen generation and CO2 removal stop and the air degrades within hours.',
    doNow: ['Switch life support to backup power.', 'Watch cabin oxygen and CO2 closely.', 'Limit exertion to save oxygen.'],
    escalate: 'Contact mission control now; contact the flight surgeon if anyone shows symptoms.',
  }),
];

// ---- Crew scenarios: one alert per astronaut, routed only to their devices ----

function crewFiring(ctx, c, { scenarioId, hazardId, severity, types, title, spokenText, why, doNow, escalate }) {
  return {
    scenarioId, scope: 'crew', hazardId, crewIds: [c.id], severity,
    metrics: types.map((t) => vitalMetric(c, t)),
    title: `${c.name}: ${title}`, spokenText,
    advice: { why, doNow, escalate: `${escalate} ${COMMS(ctx)}` },
  };
}

function crewRules(ctx, c, cabinHypoxiaFired) {
  const v = (t) => c.vitals[t]?.value;
  const out = [];
  if (v('bloodPressureSys') < 90 && v('heartRate') > 100) {
    out.push(crewFiring(ctx, c, {
      scenarioId: 'orthostatic', hazardId: 'gravityFields', severity: 'red',
      types: ['bloodPressureSys', 'heartRate'],
      title: 'low blood pressure with a fast heart rate',
      spokenText: `Warning. ${c.name}'s blood pressure is low, ${v('bloodPressureSys')} systolic, and heart rate is ${v('heartRate')}.`,
      why: 'In weightlessness body fluids shift and the heart deconditions, so blood pressure can drop and the heart races to compensate.',
      doNow: ['Lie down or sit with legs raised.', 'Drink fluids with electrolytes.', 'Re-measure blood pressure in 5 minutes.'],
      escalate: 'Contact the flight surgeon now if systolic stays below 90 or there is fainting or chest pain.',
    }));
  }
  if (v('bodyTemp') >= 37.6 && v('heartRate') > 100) {
    out.push(crewFiring(ctx, c, {
      scenarioId: 'infection-suspected', hazardId: 'hostileClosedEnvironments',
      severity: worst(c.vitals.bodyTemp.status, c.vitals.heartRate.status),
      types: ['bodyTemp', 'heartRate'],
      title: 'fever with a fast heart rate',
      spokenText: `Caution. ${c.name} has a temperature of ${num(v('bodyTemp'))} degrees and a heart rate of ${v('heartRate')}.`,
      why: 'Spaceflight weakens the immune system and microbes spread easily in a closed cabin.',
      doNow: ['Rest and limit contact with the crew.', 'Drink fluids.', 'Re-measure temperature in 1 hour.'],
      escalate: 'Contact the flight surgeon if temperature reaches 38.5 °C or there is breathing trouble.',
    }));
  }
  if (c.vitals.spo2?.status === 'red' && !(c.inCabin && cabinHypoxiaFired)) {
    out.push(crewFiring(ctx, c, {
      scenarioId: 'individual-hypoxia', hazardId: 'hostileClosedEnvironments', severity: 'red',
      types: ['spo2'],
      title: `blood oxygen ${v('spo2')}% while cabin air is normal`,
      spokenText: `Warning. ${c.name}'s blood oxygen is ${v('spo2')} percent. Cabin air is normal, so check the crew member.`,
      why: 'Cabin oxygen is fine, so the cause is more likely the person (lungs, circulation) or the sensor.',
      doNow: ['Stop exertion and sit upright.', 'Re-check the sensor fit and re-measure in 5 minutes.', 'Breathe slowly and deeply.'],
      escalate: 'If it stays below 90%, alert the crew medical officer and contact the flight surgeon now.',
    }));
  }
  if (v('sleepHours') < 6 && v('mood') <= 3) {
    out.push(crewFiring(ctx, c, {
      scenarioId: 'fatigue-isolation', hazardId: 'isolationConfinement', severity: 'amber',
      types: ['sleepHours', 'mood'],
      title: 'short sleep and low mood',
      spokenText: `Notice. ${c.name} slept ${num(v('sleepHours'))} hours and reports low mood.`,
      why: 'Months of isolation and disrupted day-night cycles wear down sleep and mood, which affects focus and safety.',
      doNow: ['Use the light therapy schedule tonight.', 'Rebalance today\'s workload.', 'Book a private call with family or the support team.'],
      escalate: 'Talk to the flight surgeon or psychologist if this continues for 2 more days.',
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
        title: `${c.name}: ${label} critical (${num(s.value)} ${s.unit})`,
        spokenText: `Warning. ${c.name}'s ${label.toLowerCase()} is at a critical level, ${num(s.value)} ${s.unit}.`,
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
