import type {
  AstronautHealthPacket,
  HealthIndicatorType,
  HealthSample,
  HealthStatus,
  IndicatorGuidance,
  WatchTelemetryData,
} from './types.ts';

export const DEMO_DISCLAIMER = 'Demo software, not a medical device.';

/** Demo mission dose budget used when a packet does not carry its own `mission.radiationBudgetMsv`. */
export const DEMO_MISSION_DOSE_BUDGET_MSV = 200;
export const DEFAULT_RADIATION_BUDGET_MSV = DEMO_MISSION_DOSE_BUDGET_MSV;

export const INDICATOR_ORDER: HealthIndicatorType[] = [
  'heartRate',
  'bloodPressureSys',
  'bloodPressureDia',
  'spo2',
  'bodyTemp',
  'bloodGlucose',
  'sleepHours',
  'mood',
  'radiationDose',
];

export const INDICATOR_META: Record<
  HealthIndicatorType,
  { label: string; unit: string }
> = {
  heartRate: { label: 'Heart Rate', unit: 'bpm' },
  bloodPressureSys: { label: 'Blood Pressure (Sys)', unit: 'mmHg' },
  bloodPressureDia: { label: 'Blood Pressure (Dia)', unit: 'mmHg' },
  spo2: { label: 'Blood Oxygen (SpO2)', unit: '%' },
  bodyTemp: { label: 'Body Temperature', unit: '°C' },
  bloodGlucose: { label: 'Blood Glucose', unit: 'mg/dL' },
  sleepHours: { label: 'Sleep Hours', unit: 'h' },
  mood: { label: 'Mood', unit: '1-5' },
  radiationDose: { label: 'Cumulative Radiation', unit: 'mSv' },
};

export const STATUS_LABELS: Record<HealthStatus, string> = {
  green: 'Nominal',
  amber: 'Caution',
  red: 'Alert',
  missing: 'Missing',
};

const SEVERITY_RANK: Record<HealthStatus, number> = {
  green: 0,
  missing: 1,
  amber: 2,
  red: 3,
};

/**
 * Ranges are continuous (lower bound inclusive, upper bound exclusive) so decimal
 * readings such as 129.5 mmHg or 37.55 °C never fall into a gap between bands.
 */
export function getStatus(
  type: HealthIndicatorType,
  value: number | null | undefined,
  radiationBudgetMsv = DEFAULT_RADIATION_BUDGET_MSV
): HealthStatus {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'missing';
  }

  switch (type) {
    case 'heartRate':
      if (value >= 50 && value <= 100) return 'green';
      if (value >= 40 && value <= 120) return 'amber';
      return 'red';

    case 'bloodPressureSys':
      if (value >= 90 && value < 130) return 'green';
      if (value >= 130 && value < 140) return 'amber';
      return 'red';

    case 'bloodPressureDia':
      if (value >= 60 && value < 80) return 'green';
      if (value >= 80 && value < 90) return 'amber';
      return 'red';

    case 'spo2':
      if (value >= 95) return 'green';
      if (value >= 90) return 'amber';
      return 'red';

    case 'bodyTemp':
      if (value >= 36.1 && value < 37.6) return 'green';
      if (value >= 35.0 && value < 38.5) return 'amber';
      return 'red';

    case 'bloodGlucose':
      if (value >= 70 && value < 126) return 'green';
      if (value >= 54 && value <= 180) return 'amber';
      return 'red';

    case 'sleepHours':
      if (value >= 7) return 'green';
      if (value >= 5) return 'amber';
      return 'red';

    case 'mood':
      if (value >= 4) return 'green';
      if (value >= 3) return 'amber';
      return 'red';

    case 'radiationDose': {
      const budget = Math.max(radiationBudgetMsv, 1);
      const ratio = value / budget;
      if (ratio < 0.5) return 'green';
      if (ratio <= 0.8) return 'amber';
      return 'red';
    }
  }
}

export function getOverallStatus(
  packet: AstronautHealthPacket
): HealthStatus {
  let worst: HealthStatus = 'green';
  for (const type of INDICATOR_ORDER) {
    const snapshot = packet.measurements[type];
    const current = getStatus(
      type,
      snapshot?.value,
      packet.mission.radiationBudgetMsv
    );
    if (SEVERITY_RANK[current] > SEVERITY_RANK[worst]) {
      worst = current;
    }
  }
  return worst;
}

/**
 * Converts WatchTelemetryData from Apple Watch into canonical HealthSample[]
 * so watch telemetry flows directly into charts and status cards.
 */
export function watchTelemetryToSamples(
  telemetry: WatchTelemetryData
): HealthSample[] {
  const samples: HealthSample[] = [
    {
      id: `${telemetry.userId}-watch-hr-${telemetry.syncTimestamp}`,
      crewId: telemetry.userId,
      type: 'heartRate',
      // Thresholds are for resting heart rate; live HR during exercise would raise false alarms.
      value: telemetry.vitals.restingHeartRate ?? telemetry.vitals.currentHeartRate,
      unit: 'bpm',
      timestamp: telemetry.syncTimestamp,
      source: 'watch',
    },
  ];

  if (
    telemetry.vitals.bloodOxygenPercentage !== null &&
    telemetry.vitals.bloodOxygenPercentage !== undefined
  ) {
    samples.push({
      id: `${telemetry.userId}-watch-spo2-${telemetry.syncTimestamp}`,
      crewId: telemetry.userId,
      type: 'spo2',
      value: telemetry.vitals.bloodOxygenPercentage,
      unit: '%',
      timestamp: telemetry.syncTimestamp,
      source: 'watch',
    });
  }

  if (
    telemetry.vitals.bodyTemperature !== null &&
    telemetry.vitals.bodyTemperature !== undefined
  ) {
    samples.push({
      id: `${telemetry.userId}-watch-temp-${telemetry.syncTimestamp}`,
      crewId: telemetry.userId,
      type: 'bodyTemp',
      value: telemetry.vitals.bodyTemperature,
      unit: '°C',
      timestamp: telemetry.syncTimestamp,
      source: 'watch',
    });
  }

  return samples;
}

export function getGuidance(
  type: HealthIndicatorType,
  status: HealthStatus
): IndicatorGuidance {
  switch (type) {
    case 'heartRate':
      return {
        whatItIs:
          'Heart rate measures how many times your heart beats per minute at rest.',
        whyInSpace:
          'Altered gravity causes fluid shifts and cardiovascular deconditioning, which can raise resting pulse.',
        doNow:
          status === 'green'
            ? ['Keep up your daily countermeasures and hydration routine.']
            : [
                'Stop strenuous activity and sit or tether quietly for 5 minutes.',
                'Drink 250 mL of water and repeat the Apple Watch reading in 15 minutes.',
              ],
        escalateWhen:
          'Contact the crew medical officer and flight surgeon if resting heart rate stays above 120 bpm, below 40 bpm, or comes with dizziness or chest discomfort.',
      };

    case 'bloodPressureSys':
    case 'bloodPressureDia':
      return {
        whatItIs:
          'Blood pressure measures the force of blood pushing against artery walls.',
        whyInSpace:
          'Microgravity shifts fluids toward the head and chest, altering vascular tone over long missions.',
        doNow:
          status === 'green'
            ? ['Maintain regular aerobic and resistive exercise protocols.']
            : [
                'Rest quietly for 5 minutes with the cuff at heart level and re-measure.',
                'Check hydration and avoid caffeine before retesting.',
              ],
        escalateWhen:
          'Contact the flight surgeon if systolic pressure is 140 mmHg or higher, below 90 mmHg, or diastolic reaches 90 mmHg or higher.',
      };

    case 'spo2':
      return {
        whatItIs:
          'Blood oxygen saturation (SpO2) shows how much oxygen your red blood cells carry.',
        whyInSpace:
          'In a hostile closed cabin, a drop in SpO2 can warn of air-quality/CO2 issues or respiratory illness.',
        doNow:
          status === 'green'
            ? ['Cabin oxygen delivery and lung uptake look healthy.']
            : [
                'Stop exertion immediately, sit upright, and check cabin CO2/O2 readouts.',
                'Warm your wrist/finger and repeat the measurement in 5 minutes.',
              ],
        escalateWhen:
          'Alert the crew medical officer and contact the flight surgeon immediately if SpO2 remains below 90%.',
      };

    case 'bodyTemp':
      return {
        whatItIs:
          'Body temperature reflects your core thermal balance and immune response.',
        whyInSpace:
          'Closed habitats make infections spread more easily and thermal regulation differs without natural air convection.',
        doNow:
          status === 'green'
            ? ['Continue normal cabin thermal and hydration habits.']
            : [
                'Rest, hydrate, and re-measure oral/skin temperature in 30 minutes.',
                'Verify spacecraft cabin temperature and cooling loop status.',
              ],
        escalateWhen:
          'Contact the flight surgeon if temperature reaches 38.5 °C or higher, drops below 35.0 °C, or persists with chills.',
      };

    case 'bloodGlucose':
      return {
        whatItIs:
          'Blood glucose measures the concentration of sugar in your blood for cellular energy.',
        whyInSpace:
          'Nutrition shifts, spaceflight stress, and altered metabolism in closed habitats affect glucose control.',
        doNow:
          status === 'green'
            ? ['Stick to scheduled mission meals and hydration.']
            : [
                'If below 70 mg/dL, take 15 g of fast-acting carbohydrates and retest in 15 minutes. If elevated, hydrate and retest fasting.',
              ],
        escalateWhen:
          'Contact the flight surgeon immediately if glucose drops below 54 mg/dL or rises above 180 mg/dL.',
      };

    case 'sleepHours':
      return {
        whatItIs:
          'Sleep hours track total restorative sleep over the past 24 hours.',
        whyInSpace:
          'Isolation, confinement, noise, and shifting light cycles disrupt circadian rhythms.',
        doNow:
          status === 'green'
            ? ['Keep a consistent sleep window and cabin light schedule.']
            : [
                'Dim blue-light screens 60 minutes before sleep and adjust sleep-station ventilation.',
                'Schedule a brief recovery rest period if mission timeline permits.',
              ],
        escalateWhen:
          'Consult the crew medical officer and flight surgeon if sleep stays under 5 hours across multiple nights or impairs alertness.',
      };

    case 'mood':
      return {
        whatItIs:
          'Mood check-in captures your subjective stress, focus, and emotional resilience (1–5).',
        whyInSpace:
          'Long-duration isolation, confinement, and distance from Earth increase behavioral health strain.',
        doNow:
          status === 'green'
            ? ['Continue crew check-ins and scheduled family/ground audio messages.']
            : [
                'Take a 15-minute break, connect with a crewmate, or run a guided breathing exercise.',
                'Log any persistent symptoms on your Apple Watch check-in.',
              ],
        escalateWhen:
          'Reach out to the crew medical officer and flight behavioral health team if mood is 1–2 or remains at 3 for two or more consecutive days.',
      };

    case 'radiationDose':
      return {
        whatItIs:
          'Cumulative radiation dose tracks total ionizing radiation absorbed during the mission.',
        whyInSpace:
          'Space radiation raises long-term cancer, immune, and central nervous system risks outside Earth’s magnetosphere.',
        doNow:
          status === 'green'
            ? ['Standard spacecraft shielding is keeping exposure within plan.']
            : [
                'Check solar particle event alerts and move to higher-shielding habitat quarters if advised.',
              ],
        escalateWhen:
          'Alert mission control and the flight surgeon whenever cumulative exposure exceeds 80% of the mission budget or after any solar event.',
      };
  }
}

// Dashboard UI wording (Turkish, from the web dashboard). Keep English labels above for backend/AI text.
export const statusLabels: Record<HealthStatus, string> = {
  green: 'NORMAL',
  amber: 'DİKKAT',
  red: 'KRİTİK',
  missing: 'VERİ YOK',
};

export const statusDescriptions: Record<HealthStatus, string> = {
  green: 'Gösterge demo referans aralığında.',
  amber: 'Tekrar ölç ve değişimi takip et.',
  red: 'Mürettebat sağlık sorumlusuna haber ver.',
  missing: 'Bu gösterge için ölçüm alınmadı.',
};
