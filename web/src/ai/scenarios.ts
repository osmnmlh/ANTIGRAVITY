// Human-readable description of the 12 alert scenarios the relay can raise (POST /api/ai/demo/:id) for the "Senaryolar" workspace.
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

/** Showcase scenarios first: they are the ones the demo script uses. */
export const AI_SCENARIOS: ScenarioMeta[] = [
  {
    id: 'cabin-gas-leak', title: 'Kabinde gaz sızıntısı', scope: 'cabin', severity: 'red', hazard: 'hostileClosedEnvironments',
    description: 'Soğutma hattından amonyak karışır. Tüm mürettebatın ekranına ve telefonuna uyarı düşer, kısa sesli uyarı verilir, AI maske takmayı önerir.',
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
    description: 'Mikro yerçekiminde sıvı kayması: tansiyon düşer, kalp telafi için hızlanır. Uyarı yalnızca o astronotun telefonuna gider.',
  },
  {
    id: 'cabin-o2-low', title: 'Kabin oksijeni düşük', scope: 'cabin', severity: 'red', hazard: 'hostileClosedEnvironments',
    description: 'Kabin oksijen basıncı güvenli aralığın altına iner. Oksijen üretim sistemini kontrol etme ve eforu bırakma önerilir.',
  },
  {
    id: 'cabin-co2-high', title: 'Kabinde CO₂ birikmesi', scope: 'cabin', severity: 'red', hazard: 'hostileClosedEnvironments',
    description: 'Karbondioksit hızla yükselir; baş ağrısı, dikkat dağınıklığı ve hızlı nefes beklenir. CO₂ temizleyicisinin kontrolü önerilir.',
  },
  {
    id: 'cabin-pressure-drop', title: 'Kabin basıncı düşüyor', scope: 'cabin', severity: 'red', hazard: 'hostileClosedEnvironments',
    description: 'Olası gövde veya conta sızıntısı. Sızıntı kontrol prosedürü, basınçlı giysiler ve kapakların kapatılması önerilir.',
  },
  {
    id: 'cabin-temperature', title: 'Soğuk kabin (Apollo 13)', scope: 'cabin', severity: 'red', hazard: 'hostileClosedEnvironments',
    description: 'Kabin sıcaklığı 3,8 °C’ye iner. Isıtma sistemi, yoğuşma ve elektronik cihazlar için adımlar önerilir.',
  },
  {
    id: 'power-life-support', title: 'Yaşam destek gücü arızası', scope: 'cabin', severity: 'red', hazard: 'hostileClosedEnvironments',
    description: 'Oksijen üretimi ve CO₂ temizliği tehlikede. Yedek güce geçiş ve görev kontrolüne haber verme önerilir.',
  },
  {
    id: 'infection-suspected', title: 'Ateş ve hızlı nabız', scope: 'crew', severity: 'red', hazard: 'hostileClosedEnvironments',
    description: 'Kapalı kabinde enfeksiyon şüphesi: ateş yükselir, nabız artar. Mürettebatla temasın sınırlanması ve sıvı alımı önerilir.',
  },
  {
    id: 'individual-hypoxia', title: 'Tek astronotta düşük oksijen', scope: 'crew', severity: 'red', hazard: 'hostileClosedEnvironments',
    description: 'Kabin havası normal ama bir astronotun kan oksijeni düşer: neden kabin değil, kişi ya da sensör olabilir.',
  },
  {
    id: 'fatigue-isolation', title: 'Yorgunluk ve düşük ruh hali', scope: 'crew', severity: 'amber', hazard: 'isolationConfinement',
    description: 'Uyku kısalır, ruh hali iki gündür düşük. Işık terapisi, iş yükünü dengeleme ve destek görüşmesi önerilir.',
  },
]
