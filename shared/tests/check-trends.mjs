import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  assessIndicatorTrend,
  getEffectiveStatus,
  getOverallStatus,
  getTrendStatus,
} from '../../web/src/domain/thresholds.ts';

const cases = JSON.parse(
  fs.readFileSync(new URL('./trend-cases.json', import.meta.url), 'utf8')
);

for (const tc of cases) {
  const assessment = assessIndicatorTrend(tc.samples, tc.type);
  assert.equal(assessment.pointStatus, tc.expectedPoint, `${tc.name}: pointStatus`);
  assert.equal(assessment.trendStatus, tc.expectedTrend, `${tc.name}: trendStatus`);
  assert.equal(assessment.effectiveStatus, tc.expectedEffective, `${tc.name}: effectiveStatus`);
  assert.equal(assessment.direction, tc.expectedDirection, `${tc.name}: direction`);
  assert.equal(getTrendStatus(tc.samples, tc.type), tc.expectedTrend, `${tc.name}: getTrendStatus`);
  assert.equal(getEffectiveStatus(tc.samples, tc.type), tc.expectedEffective, `${tc.name}: getEffectiveStatus`);
  console.log(`PASS ${tc.name} -> point=${assessment.pointStatus}, trend=${assessment.trendStatus}, effective=${assessment.effectiveStatus}`);
}

const mockSamples = JSON.parse(
  fs.readFileSync(new URL('../mock/samples.json', import.meta.url), 'utf8')
);
const mockPackets = JSON.parse(
  fs.readFileSync(new URL('../mock/astronaut-packets.json', import.meta.url), 'utf8')
);

// Team decision (14 Nov): the demo opens with every astronaut green; red/amber come from a scenario on stage
// (backend/ai demo scenarios or the historical incident replay). Trend rules themselves are covered by trend-cases.json above.
for (const crew of mockPackets.astronauts) {
  const crewSamples = mockSamples.filter((s) => s.crewId === crew.astronautId);
  assert.ok(crewSamples.length >= 63, `${crew.astronautId} should have full multi-day sample history`);
  for (const type of Object.keys(crew.measurements)) {
    const t = assessIndicatorTrend(crewSamples, type);
    assert.equal(t.effectiveStatus, 'green', `${crew.astronautId} ${type} should start green (point=${t.pointStatus}, trend=${t.trendStatus})`);
  }
  const overall = getOverallStatus(crew, mockSamples);
  console.log(`MOCK CREW ${crew.astronautId} (${crewSamples.length} samples) -> overall=${overall}`);
  assert.equal(overall, 'green', `${crew.astronautId} should start green`);
}

console.log('ALL TREND CHECKS PASSED');
