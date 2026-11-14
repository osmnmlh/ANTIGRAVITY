import type { HealthStatus, HealthType } from './types'

export const DEMO_MISSION_DOSE_BUDGET_MSV = 200

export function getStatus(
  type: HealthType,
  value: number,
  radiationBudgetMsv = DEMO_MISSION_DOSE_BUDGET_MSV,
): HealthStatus {
  switch (type) {
    case 'heartRate':
      if (value < 40 || value > 120) return 'red'
      if (value < 50 || value > 100) return 'amber'
      return 'green'
    case 'bloodPressureSys':
      if (value < 90 || value >= 140) return 'red'
      if (value >= 130) return 'amber'
      return 'green'
    case 'bloodPressureDia':
      if (value < 60 || value >= 90) return 'red'
      if (value >= 80) return 'amber'
      return 'green'
    case 'spo2':
      if (value < 90) return 'red'
      if (value < 95) return 'amber'
      return 'green'
    case 'bodyTemp':
      if (value < 35 || value >= 38.5) return 'red'
      if (value < 36.1 || value >= 37.6) return 'amber'
      return 'green'
    case 'bloodGlucose':
      if (value < 54 || value > 180) return 'red'
      if (value < 70 || value > 125) return 'amber'
      return 'green'
    case 'sleepHours':
      if (value < 5) return 'red'
      if (value < 7) return 'amber'
      return 'green'
    case 'mood':
      if (value <= 2) return 'red'
      if (value === 3) return 'amber'
      return 'green'
    case 'radiationDose': {
      const budgetUse = value / radiationBudgetMsv
      if (budgetUse > 0.8) return 'red'
      if (budgetUse >= 0.5) return 'amber'
      return 'green'
    }
  }
}

export const statusLabels: Record<HealthStatus, string> = {
  green: 'NORMAL',
  amber: 'DİKKAT',
  red: 'KRİTİK',
  missing: 'VERİ YOK',
}

export const statusDescriptions: Record<HealthStatus, string> = {
  green: 'Gösterge demo referans aralığında.',
  amber: 'Tekrar ölç ve değişimi takip et.',
  red: 'Mürettebat sağlık sorumlusuna haber ver.',
  missing: 'Bu gösterge için ölçüm alınmadı.',
}
