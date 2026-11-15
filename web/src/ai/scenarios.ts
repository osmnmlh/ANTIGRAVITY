// Human-readable description of the 4 showcase scenarios the Senaryolar tab starts (POST /api/ai/demo/:id) for the "Senaryolar" workspace.
// The ids are the relay's; the texts are for the person standing on stage, so each one says what happens and who gets notified.

export const HAZARD_TR = {
  spaceRadiation: 'Uzay radyasyonu',
  isolationConfinement: 'İzolasyon ve kapalı ortam',
  distanceFromEarth: "Dünya'dan uzaklık",
  gravityFields: 'Yerçekimi alanları',
  hostileClosedEnvironments: 'Düşmanca kapalı ortam',
} as const

export type HazardId = keyof typeof HAZARD_TR

export interface ScenarioMeta {
  id: string
  title: string
  /** `cabin` goes to everyone in the cabin, `crew` to one astronaut only. */
  scope: 'cabin' | 'crew'
  severity: 'red' | 'amber'
  hazard: HazardId
  description: string
}

export const AI_SCENARIOS: ScenarioMeta[] = [
  {
    id: 'cabin-gas-leak', title: 'Kabinde gaz sızıntısı', scope: 'cabin', severity: 'red', hazard: 'hostileClosedEnvironments',
    description: 'Soğutma hattından amonyak karışır. Tüm mürettebatın ekranına, telefonuna ve saatine uyarı düşer, kısa sesli uyarı verilir, AI maske takmayı önerir.',
  },
  {
    id: 'cabin-hypoxia', title: 'Kabin kaynaklı oksijen düşüşü', scope: 'cabin', severity: 'red', hazard: 'hostileClosedEnvironments',
    description: 'Kabin oksijeni düşer ve iki astronotun kan oksijeni birlikte azalır. Sistem sorunun kişide değil kabinde olduğunu tek uyarıyla söyler.',
  },
  {
    id: 'solar-event', title: 'Güneş parçacık fırtınası', scope: 'cabin', severity: 'red', hazard: 'spaceRadiation',
    description: 'Radyasyon doz hızı birkaç saatte haftalık dozu geçer. Mürettebat fırtına sığınağına yönlendirilir, uzay yürüyüşü ertelenir.',
  },
  {
    id: 'orthostatic', title: 'Düşük tansiyon ve hızlı nabız', scope: 'crew', severity: 'red', hazard: 'gravityFields',
    description: 'Mikro yerçekiminde sıvı kayması: tansiyon düşer, kalp telafi için hızlanır. Uyarı yalnızca seçtiğin astronotun telefonuna ve saatine gider.',
  },
]
