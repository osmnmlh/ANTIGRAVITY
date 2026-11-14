// Turns the cabin text of a historical incident phase (shared/mock/historical-incidents.json `cabinHint`) into cabin readings,
// so an incident replay raises cabin alerts too:
//
//   "ppCO2: 8.2 mmHg · Kabin Sıcaklığı: 3.8 °C"  →  [{ metric: 'ppCO2', value: 8.2 }, { metric: 'temperature', value: 3.8 }]
//
// Only what the text states is read. Anything it does not mention is nominal again (the caller resets the cabin first),
// so "Kontaminant: 0.2 ppm" in the last phase clears the alert. Suit pressure of an EVA (EMU) is not the cabin and is ignored.
// The few qualitative alarms are mapped to a fixed demo value (see QUALITATIVE).

const NUM = '(\\d+(?:[.,]\\d+)?)';
const num = (s) => Number(String(s).replace(',', '.'));

const PATTERNS = [
  { metric: 'ppCO2', re: new RegExp(`ppCO2:?\\s*${NUM}\\s*mmHg`, 'i') },
  { metric: 'temperature', re: new RegExp(`Kabin\\s*(?:Sıcaklığı|Isısı):?\\s*${NUM}\\s*°?\\s*C`, 'i') },
  { metric: 'contaminant', re: new RegExp(`(?:Kontaminant|Duman|Partikül)[^:·]*:\\s*${NUM}\\s*ppm`, 'i'), label: 'toksik gaz' },
  { metric: 'pressure', re: new RegExp(`(?:Hava\\s*Kilidi|Kabin)\\s*Basıncı:?\\s*${NUM}\\s*kPa`, 'i') },
];

// Alarms without a number in the text. Values are demo choices inside the red band of cabin.mjs.
const QUALITATIVE = [
  { re: /O2\s*Basınç\s*Alarmı/i, reading: { metric: 'ppO2', value: 17.9 } },
  { re: /Ana\s*Güç\s*Düşüyor/i, reading: { metric: 'lifeSupportPower', value: 'degraded' } },
];

const POWER = { nominal: 'nominal', kısıtlı: 'degraded', kisitli: 'degraded', arıza: 'fault', arızalı: 'fault', ariza: 'fault' };

/** @returns {{ metric: string, value: number|string, label?: string }[]} */
export function parseCabinHint(hint) {
  if (typeof hint !== 'string' || !hint.trim()) return [];
  const readings = [];
  for (const { metric, re, label } of PATTERNS) {
    const m = hint.match(re);
    if (m) readings.push({ metric, value: num(m[1]), ...(label ? { label } : {}) });
  }
  const power = hint.match(/Güç:\s*([A-Za-zİıŞşĞğÜüÖöÇç]+)/i);
  if (power && POWER[power[1].toLocaleLowerCase('tr-TR')]) readings.push({ metric: 'lifeSupportPower', value: POWER[power[1].toLocaleLowerCase('tr-TR')] });
  for (const { re, reading } of QUALITATIVE) {
    if (re.test(hint) && !readings.some((r) => r.metric === reading.metric)) readings.push({ ...reading });
  }
  return readings;
}
