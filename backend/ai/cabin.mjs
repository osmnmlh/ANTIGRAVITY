// Cabin environment state and demo thresholds (shared/contracts/ai.md section 1).
// The backend computes every status here; clients only render it.

const band = (redLow, amberLow, amberHigh, redHigh) => (v) =>
  v < redLow || v > redHigh ? 'red' : v < amberLow || v > amberHigh ? 'amber' : 'green';

export const CABIN_METRICS = {
  ppO2: { label: 'Cabin oxygen (ppO2)', unit: 'kPa', status: band(18, 19.5, 23.1, 25) },
  ppCO2: { label: 'Cabin CO2 (ppCO2)', unit: 'mmHg', status: (v) => (v >= 6 ? 'red' : v >= 3 ? 'amber' : 'green') },
  pressure: { label: 'Cabin pressure', unit: 'kPa', status: band(90, 97, 103, 105) },
  temperature: { label: 'Cabin temperature', unit: '°C', status: band(15, 18, 27, 30) },
  humidity: { label: 'Cabin humidity', unit: '%', status: band(15, 25, 70, 80) },
  contaminant: { label: 'Gas contaminant', unit: 'ppm', status: (v) => (v >= 10 ? 'red' : v >= 1 ? 'amber' : 'green') },
  radiationRate: { label: 'Radiation dose rate', unit: 'mSv/day', status: (v) => (v >= 5 ? 'red' : v >= 1 ? 'amber' : 'green') },
  lifeSupportPower: {
    label: 'Life-support power',
    unit: '',
    status: (v) => (v === 'fault' ? 'red' : v === 'degraded' ? 'amber' : 'green'),
  },
};

const POWER_STATES = ['nominal', 'degraded', 'fault'];
const RANK = { green: 0, amber: 1, red: 2 };

export const NOMINAL_CABIN = {
  ppO2: 20.9,
  ppCO2: 2.4,
  pressure: 101.2,
  temperature: 22.5,
  humidity: 48,
  contaminant: 0.2,
  radiationRate: 0.5,
  lifeSupportPower: 'nominal',
};

export function cabinStatus(metric, value) {
  return CABIN_METRICS[metric].status(value);
}

export function createCabin({ module = 'Ares-IV crew cabin', crewIds = [], now = () => new Date() } = {}) {
  let readings;
  let updatedAt;

  const reading = (metric, value, timestamp, label) => ({
    metric,
    value,
    unit: CABIN_METRICS[metric].unit,
    status: cabinStatus(metric, value),
    timestamp,
    ...(metric === 'contaminant' ? { label: label ?? 'ammonia' } : {}),
  });

  function reset() {
    updatedAt = now().toISOString();
    readings = Object.fromEntries(
      Object.entries(NOMINAL_CABIN).map(([m, v]) => [m, reading(m, v, updatedAt)]),
    );
  }

  /** Accepts [{ metric, value, label? }]; throws on unknown metric or bad value. */
  function update(list) {
    if (!Array.isArray(list) || list.length === 0) throw new Error('readings must be a non-empty array');
    const timestamp = now().toISOString();
    for (const r of list) {
      if (!CABIN_METRICS[r?.metric]) throw new Error(`unknown cabin metric: ${r?.metric}`);
      const ok = r.metric === 'lifeSupportPower' ? POWER_STATES.includes(r.value) : Number.isFinite(r.value);
      if (!ok) throw new Error(`invalid value for ${r.metric}: ${JSON.stringify(r.value)}`);
      readings[r.metric] = reading(r.metric, r.value, timestamp, r.label);
    }
    updatedAt = timestamp;
  }

  function snapshot() {
    const list = Object.values(readings);
    const overallStatus = list.reduce((w, r) => (RANK[r.status] > RANK[w] ? r.status : w), 'green');
    return { module, crewIds: [...crewIds], overallStatus, readings: list, updatedAt };
  }

  reset();
  return { reset, update, snapshot, get: (metric) => readings[metric] };
}
