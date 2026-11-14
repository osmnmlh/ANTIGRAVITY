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

const crew1Samples = mockSamples.filter((s) => s.crewId === 'crew-1');

const bpTrend = assessIndicatorTrend(crew1Samples, 'bloodPressureSys');
assert.equal(bpTrend.pointStatus, 'green', 'crew-1 mock bloodPressureSys point should stay green');
assert.equal(bpTrend.trendStatus, 'amber', 'crew-1 mock bloodPressureSys trend should trigger amber');
assert.equal(bpTrend.effectiveStatus, 'amber', 'crew-1 mock bloodPressureSys effective should be amber');

const moodTrend = assessIndicatorTrend(crew1Samples, 'mood');
assert.equal(moodTrend.pointStatus, 'amber', 'crew-1 mock mood point should be amber');
assert.equal(moodTrend.trendStatus, 'red', 'crew-1 mock mood 2-day rule should escalate to red');
assert.equal(moodTrend.effectiveStatus, 'red', 'crew-1 mock mood effective should be red');

const radTrend = assessIndicatorTrend(crew1Samples, 'radiationDose');
assert.equal(radTrend.pointStatus, 'green', 'crew-1 mock radiation point should be green');
assert.equal(radTrend.trendStatus, 'amber', 'crew-1 mock radiation spike should trigger amber');

for (const crew of mockPackets.astronauts) {
  const crewSamples = mockSamples.filter((s) => s.crewId === crew.astronautId);
  assert.ok(crewSamples.length >= 63, `${crew.astronautId} should have full multi-day sample history`);
  const overall = getOverallStatus(crew, mockSamples);
  console.log(`MOCK CREW ${crew.astronautId} (${crewSamples.length} samples) -> overall=${overall}`);
  if (crew.astronautId === 'crew-1') assert.equal(overall, 'red');
  if (crew.astronautId === 'crew-2') assert.equal(overall, 'green');
  if (crew.astronautId === 'crew-3') assert.equal(overall, 'amber');
}

console.log('ALL TREND CHECKS PASSED');
