import { useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import './App.css'
import { ThreeBodyMap } from './components/ThreeBodyMap'
import { latestSampleFor, useHealthData } from './data/useHealthData'
import { guidanceByType } from './domain/guidance'
import {
  DEMO_MISSION_DOSE_BUDGET_MSV,
  getStatus,
  statusDescriptions,
  statusLabels,
} from './domain/thresholds'
import {
  healthTypes,
  metricDefinitions,
  type HealthStatus,
  type HealthType,
} from './domain/types'

type MissionEnvironment = 'iss' | 'lunar' | 'mars'

const missionEnvironments: Record<
  MissionEnvironment,
  { label: string; short: string; latency: string; detail: string; icon: string }
> = {
  iss: {
    label: 'ISS · Alçak Dünya yörüngesi',
    short: 'ISS',
    latency: '1.3 sn',
    detail: 'Dünya ile yakın gerçek zamanlı iletişim',
    icon: 'LEO',
  },
  lunar: {
    label: 'Artemis · Ay yüzeyi',
    short: 'AY',
    latency: '2.6 sn',
    detail: 'Ay yüzey operasyonları',
    icon: 'LUNAR',
  },
  mars: {
    label: 'Mars · Derin uzay geçişi',
    short: 'MARS',
    latency: '14 dk',
    detail: 'Gecikme nedeniyle otonom öz değerlendirme',
    icon: 'DEEP SPACE',
  },
}

const inputRanges: Record<HealthType, { min: number; max: number; step: number }> = {
  heartRate: { min: 30, max: 180, step: 1 },
  bloodPressureSys: { min: 60, max: 220, step: 1 },
  bloodPressureDia: { min: 30, max: 140, step: 1 },
  spo2: { min: 60, max: 100, step: 1 },
  bodyTemp: { min: 32, max: 43, step: 0.1 },
  bloodGlucose: { min: 30, max: 350, step: 1 },
  sleepHours: { min: 0, max: 24, step: 0.1 },
  mood: { min: 1, max: 5, step: 1 },
  radiationDose: { min: 0, max: 300, step: 0.1 },
}

const metricOrder: HealthType[] = [
  'heartRate',
  'bloodPressureSys',
  'bloodPressureDia',
  'spo2',
  'bodyTemp',
  'bloodGlucose',
  'sleepHours',
  'mood',
  'radiationDose',
]

const trendOffsets: Record<HealthType, number[]> = {
  heartRate: [-5, -2, 1, 0, 3, -1, 0],
  bloodPressureSys: [-4, -2, 0, 2, -1, 1, 0],
  bloodPressureDia: [-3, -1, 0, 2, -2, 1, 0],
  spo2: [1, 0, -1, 1, 0, 0, 0],
  bodyTemp: [-0.2, -0.1, 0, 0.1, 0, 0.1, 0],
  bloodGlucose: [-5, -2, 2, -3, 4, 1, 0],
  sleepHours: [0.6, 0.2, -0.4, -0.8, -0.3, 0.1, 0],
  mood: [0, -1, 0, 1, 0, 0, 0],
  radiationDose: [-3, -2, -1, 0, 1, 2, 0],
}

function getStatusTone(status: HealthStatus) {
  return `status-${status}`
}

function getLatestByType(samples: ReturnType<typeof useHealthData>['samples']) {
  return Object.fromEntries(
    healthTypes.map((type) => [type, latestSampleFor(samples, type)]),
  ) as Record<HealthType, ReturnType<typeof latestSampleFor>>
}

function formatValue(type: HealthType, value: number | undefined) {
  if (value === undefined) return '—'
  if (type === 'bodyTemp' || type === 'sleepHours' || type === 'radiationDose') {
    return value.toFixed(1)
  }
  return String(value)
}

function StatusBadge({ status }: { status: HealthStatus }) {
  return (
    <span className={`status-badge ${getStatusTone(status)}`}>
      <span className="status-dot" />
      {statusLabels[status]}
    </span>
  )
}

function TrendChart({ type, value }: { type: HealthType; value: number }) {
  const offsets = trendOffsets[type]
  const scale = type === 'bodyTemp' ? 0.35 : type === 'sleepHours' ? 0.7 : type === 'mood' ? 1 : type === 'radiationDose' ? 3 : type === 'spo2' ? 1 : 5
  const values = offsets.map((offset, index) => {
    if (index === offsets.length - 1) return value
    const adjusted = value + offset * scale
    return type === 'mood' ? Math.min(5, Math.max(1, Math.round(adjusted))) : Math.max(0, adjusted)
  })
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const points = values.map((point, index) => ({
    x: 8 + (index * 264) / (values.length - 1),
    y: 112 - ((point - min) / span) * 82,
    value: point,
  }))
  const pointString = points.map(({ x, y }) => `${x},${y}`).join(' ')
  const areaPath = `M ${points[0].x} 122 L ${points.map(({ x, y }) => `${x} ${y}`).join(' L ')} L ${points[points.length - 1].x} 122 Z`

  return (
    <div className="trend-chart" role="img" aria-label={`${metricDefinitions[type].label}: yedi günlük simüle edilmiş eğilim`}>
      <div className="trend-chart-head">
        <div>
          <span className="eyebrow">7 GÜNLÜK EĞİLİM</span>
          <span className="chart-caption">Simüle edilmiş geçmiş</span>
        </div>
        <span className="chart-period">SON 7 GÜN</span>
      </div>
      <svg viewBox="0 0 280 134" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity=".23" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[30, 71, 112].map((y) => (
          <line className="chart-grid-line" key={y} x1="0" x2="280" y1={y} y2={y} />
        ))}
        <path className="chart-area" d={areaPath} />
        <polyline className="chart-line" points={pointString} />
        {points.map(({ x, y }, index) => (
          <circle
            className={`chart-point ${index === points.length - 1 ? 'chart-point-current' : ''}`}
            cx={x}
            cy={y}
            key={`${x}-${y}`}
            r={index === points.length - 1 ? 4 : 2}
          />
        ))}
      </svg>
      <div className="trend-days">
        {['08', '09', '10', '11', '12', '13', '14'].map((day) => <span key={day}>{day}</span>)}
      </div>
    </div>
  )
}

function App() {
  const { samples, addSample, addSamples, resetSamples } = useHealthData()
  const [environment, setEnvironment] = useState<MissionEnvironment>('mars')
  const [selectedMetric, setSelectedMetric] = useState<HealthType>('heartRate')
  const [focusedMetric, setFocusedMetric] = useState<HealthType | null>(null)
  const [inputType, setInputType] = useState<HealthType>('heartRate')
  const [inputValue, setInputValue] = useState('72')
  const [formMessage, setFormMessage] = useState('')
  const [scenarioMessage, setScenarioMessage] = useState('')

  const latest = useMemo(() => getLatestByType(samples), [samples])
  const values = useMemo(
    () =>
      Object.fromEntries(healthTypes.map((type) => [type, latest[type]?.value])) as Record<
        HealthType,
        number | undefined
      >,
    [latest],
  )
  const statuses = useMemo(
    () =>
      Object.fromEntries(
        healthTypes.map((type) => {
          const sample = latest[type]
          return [type, sample ? getStatus(type, sample.value) : 'missing']
        }),
      ) as Record<HealthType, HealthStatus>,
    [latest],
  )
  const statusCounts = useMemo(
    () =>
      healthTypes.reduce(
        (counts, type) => {
          counts[statuses[type]] += 1
          return counts
        },
        { green: 0, amber: 0, red: 0, missing: 0 } as Record<HealthStatus, number>,
      ),
    [statuses],
  )
  const overallStatus: HealthStatus =
    statusCounts.red > 0
      ? 'red'
      : statusCounts.amber > 0
        ? 'amber'
        : statusCounts.missing > 0
          ? 'missing'
          : 'green'
  const readiness = Math.max(
    0,
    Math.min(
      100,
      100 - statusCounts.red * 24 - statusCounts.amber * 9 - statusCounts.missing * 7,
    ),
  )
  const selectedSample = latest[selectedMetric]
  const selectedStatus = statuses[selectedMetric]
  const selectedGuidance = guidanceByType[selectedMetric]
  const activeEnvironment = missionEnvironments[environment]

  function selectMetric(type: HealthType) {
    setSelectedMetric(type)
    setFocusedMetric(type)
  }

  function handleManualEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = Number(inputValue)
    const range = inputRanges[inputType]
    if (!Number.isFinite(value) || value < range.min || value > range.max) {
      setFormMessage(`Değer ${range.min}–${range.max} aralığında olmalı.`)
      return
    }
    if (inputType === 'mood' && !Number.isInteger(value)) {
      setFormMessage('Ruh hâli puanı 1–5 arasında tam sayı olmalı.')
      return
    }
    addSample(inputType, value, 'manual')
    selectMetric(inputType)
    setFormMessage(`${metricDefinitions[inputType].shortLabel} ölçümü kaydedildi.`)
    setScenarioMessage('')
  }

  function runSolarScenario() {
    addSample('radiationDose', 170, 'mock')
    selectMetric('radiationDose')
    setScenarioMessage('Güneş parçacık olayı senaryosu etkin · 170 mSv / 200 mSv demo görev bütçesi')
    setFormMessage('')
  }

  function runSleepScenario() {
    const timestamp = new Date().toISOString()
    addSamples([
      { id: crypto.randomUUID(), crewId: 'crew-1', type: 'sleepHours', value: 4.2, unit: 'h', timestamp, source: 'mock' },
      { id: crypto.randomUUID(), crewId: 'crew-1', type: 'mood', value: 3, unit: '1-5', timestamp, source: 'mock' },
    ])
    selectMetric('sleepHours')
    setScenarioMessage('Uyku yoksunluğu senaryosu etkin · uyku ve ruh hâli göstergeleri güncellendi')
    setFormMessage('')
  }

  function restoreBaseline() {
    resetSamples()
    selectMetric('heartRate')
    setScenarioMessage('Başlangıç demo verileri geri yüklendi.')
    setFormMessage('')
  }

  const currentTime = new Date().toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand-lockup" href="#dashboard" aria-label="ANTIGRAVITY ana panel">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="brand-text">
            <strong>ANTIGRAVITY</strong>
            <small>CREW HEALTH SYSTEM</small>
          </span>
        </a>
        <div className="topbar-center">
          <span className="live-indicator"><i /> DEMO TELEMETRİSİ</span>
          <span className="topbar-divider" />
          <span className="mission-day">GÖREV GÜNÜ <b>120</b></span>
        </div>
        <div className="crew-profile">
          <span className="crew-avatar">AK</span>
          <span><strong>Ahmet Özkan Taşsever</strong><small>MISSION SPECIALIST</small></span>
          <button type="button" className="profile-menu" aria-label="Profil menüsü">···</button>
        </div>
      </header>

      <main id="dashboard" className="dashboard">
        <section className="page-heading">
          <div>
            <div className="breadcrumb"><span>FLIGHT DECK</span><b>/</b><span>CREW HEALTH</span></div>
            <h1>Mürettebat sağlık görünümü</h1>
            <p className="page-subtitle">Göstergeyi gör · ne anlama geldiğini anla · sonraki adımı belirle.</p>
          </div>
          <div className="heading-meta">
            <span className="sync-state"><i /> SİMÜLE EDİLMİŞ VERİ</span>
            <span className="utc-clock">UTC {currentTime}</span>
          </div>
        </section>

        <section className="mission-strip" aria-label="Görev bilgileri">
          <div className="mission-select-wrap">
            <span className="mission-icon">{activeEnvironment.icon}</span>
            <label htmlFor="mission-environment">
              <span className="eyebrow">GÖREV ORTAMI</span>
              <select
                id="mission-environment"
                data-testid="mission-environment"
                value={environment}
                onChange={(event) => setEnvironment(event.target.value as MissionEnvironment)}
              >
                {Object.entries(missionEnvironments).map(([key, mission]) => (
                  <option key={key} value={key}>{mission.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mission-context">{activeEnvironment.detail}</div>
          <div className={`latency-block ${environment === 'mars' ? 'latency-delayed' : ''}`}>
            <span className="latency-icon" aria-hidden="true">↗</span>
            <span><small>DÜNYA İLETİŞİM GECİKMESİ</small><strong>{activeEnvironment.latency}</strong></span>
          </div>
          <div className="readiness-block">
            <div className="readiness-gauge" style={{ '--readiness': `${readiness}%` } as CSSProperties}>
              <span>{readiness}</span>
            </div>
            <span><small>GÖREV HAZIRLIĞI</small><strong>DEMO SKORU</strong></span>
          </div>
        </section>

        {environment === 'mars' && (
          <div className="autonomy-note" role="status" data-testid="autonomy-note">
            <span className="autonomy-icon">!</span>
            <p><strong>Otonom öz değerlendirme modu</strong> · Dünya’dan yanıt gecikebilir. Önce mürettebat protokolünü izle; kritik durumda ekip sağlık sorumlusuna haber ver.</p>
            <span className="autonomy-delay">14 DK GECİKME</span>
          </div>
        )}

        <section className="dashboard-grid">
          <details className="dashboard-disclosure control-column" data-testid="controls-disclosure">
            <summary className="disclosure-summary">
              <span className="disclosure-icon" aria-hidden="true">+</span>
              <span className="disclosure-copy">
                <span className="eyebrow">GÖREV ARAÇLARI</span>
                <strong>Ölçüm ve senaryo kontrolleri</strong>
                <small>Manuel kayıt · Demo senaryoları</small>
              </span>
              <span className="disclosure-chevron" aria-hidden="true">⌄</span>
            </summary>
            <div className="disclosure-content">
            <section className="panel manual-panel">
              <div className="panel-heading">
                <div><span className="eyebrow">HIZLI GİRİŞ</span><h2>Ölçüm kaydet</h2></div>
                <span className="panel-icon">+</span>
              </div>
              <form onSubmit={handleManualEntry}>
                <label className="field-label" htmlFor="metric-type">Gösterge</label>
                <select
                  id="metric-type"
                  data-testid="entry-type"
                  value={inputType}
                  onChange={(event) => {
                    const nextType = event.target.value as HealthType
                    setInputType(nextType)
                    setInputValue(latest[nextType] ? String(latest[nextType]?.value) : '')
                    setFormMessage('')
                  }}
                >
                  {metricOrder.map((type) => (
                    <option key={type} value={type}>{metricDefinitions[type].input}</option>
                  ))}
                </select>
                <label className="field-label" htmlFor="metric-value">Ölçüm değeri</label>
                <div className="value-input-wrap">
                  <input
                    id="metric-value"
                    data-testid="entry-value"
                    type="number"
                    min={inputRanges[inputType].min}
                    max={inputRanges[inputType].max}
                    step={inputRanges[inputType].step}
                    required
                    value={inputValue}
                    onChange={(event) => setInputValue(event.target.value)}
                  />
                  <span>{metricDefinitions[inputType].displayUnit}</span>
                </div>
                <button className="primary-button" type="submit" data-testid="entry-submit">
                  <span>Ölçümü kaydet</span><b>↗</b>
                </button>
                {formMessage && <p className="form-message" role="status">{formMessage}</p>}
              </form>
              <div className="panel-footnote"><span className="source-dot" /> Kayıtlar bu tarayıcıda saklanır.</div>
            </section>

            <section className="panel scenario-panel">
              <div className="panel-heading">
                <div><span className="eyebrow">DEMO ARAÇLARI</span><h2>Senaryo çalıştır</h2></div>
                <span className="scenario-pulse"><i /></span>
              </div>
              <button className="scenario-button" type="button" onClick={runSolarScenario} data-testid="scenario-solar">
                <span className="scenario-symbol solar-symbol">☼</span>
                <span><strong>Güneş olayı</strong><small>Radyasyon uyarısını göster</small></span>
                <b>→</b>
              </button>
              <button className="scenario-button" type="button" onClick={runSleepScenario} data-testid="scenario-sleep">
                <span className="scenario-symbol sleep-symbol">Zz</span>
                <span><strong>Uyku yoksunluğu</strong><small>Uyku ve ruh hâlini değiştir</small></span>
                <b>→</b>
              </button>
              {scenarioMessage && <p className="scenario-message" role="status">{scenarioMessage}</p>}
              <button className="reset-button" type="button" onClick={restoreBaseline} data-testid="scenario-reset">
                Başlangıç verilerine dön
              </button>
            </section>

            <div className="hazards-panel">
              <span className="eyebrow">NASA HRP · 5 UZAY TEHLİKESİ</span>
              <div className="hazard-chips">
                <span>Radyasyon</span><span>İzolasyon</span><span>Uzaklık</span><span>Yerçekimi</span><span>Kapalı ortam</span>
              </div>
            </div>
            </div>
          </details>

          <section className="body-column">
            <div className="section-label"><span>02</span> DURUM HARİTASI</div>
            <section className="panel body-panel">
              <div className="panel-heading body-heading">
                <div><span className="eyebrow">MÜRETTEBAT / AST-01</span><h2>Vücut risk haritası</h2></div>
                <div className="body-heading-tools">
                  <button
                    className="map-reset-button"
                    data-testid="body-map-reset"
                    onClick={() => setFocusedMetric(null)}
                    type="button"
                  >
                    GENEL GÖRÜNÜM
                  </button>
                  <span className="map-live"><i /> GÜNCEL</span>
                </div>
              </div>
              <section className={`overview-panel ${getStatusTone(overallStatus)}`} data-testid="overall-status">
                <div className="overview-copy">
                  <span className="eyebrow">GENEL SAĞLIK DURUMU</span>
                  <h2>{overallStatus === 'green' ? 'Tüm göstergeler nominal' : overallStatus === 'amber' ? 'Takip gereken göstergeler var' : overallStatus === 'red' ? 'Kritik gösterge tespit edildi' : 'Ölçüm bekleniyor'}</h2>
                  <p>{statusDescriptions[overallStatus]}</p>
                </div>
                <StatusBadge status={overallStatus} />
                <div className="overview-counts">
                  <span className="status-green"><i /> {statusCounts.green} normal</span>
                  <span className="status-amber"><i /> {statusCounts.amber} dikkat</span>
                  <span className="status-red"><i /> {statusCounts.red} kritik</span>
                </div>
              </section>
              <div className="map-indicator-layout">
                <ThreeBodyMap
                  environment={environment}
                  statuses={statuses}
                  values={values}
                  selected={selectedMetric}
                  focused={focusedMetric}
                  onSelect={selectMetric}
                />
                <aside className="map-indicators" aria-label="Mürettebat sağlık göstergeleri">
                  <div className="map-indicators-heading">
                    <span className="eyebrow">CANLI GÖSTERGELER</span>
                    <span>{metricOrder.length} ÖLÇÜM</span>
                  </div>
                  <div className="map-indicator-list">
                    {metricOrder.map((type, index) => {
                      const sample = latest[type]
                      const status = statuses[type]
                      return (
                        <button
                          className={`map-indicator-card ${getStatusTone(status)} ${selectedMetric === type ? 'is-selected' : ''}`}
                          data-testid={`status-card-${type}`}
                          key={type}
                          onClick={() => selectMetric(type)}
                          type="button"
                        >
                          <span className="map-indicator-index">0{index + 1}</span>
                          <span className="map-indicator-copy">
                            <span>{metricDefinitions[type].shortLabel}</span>
                            <strong>{formatValue(type, sample?.value)} <small>{metricDefinitions[type].displayUnit}</small></strong>
                          </span>
                          <StatusBadge status={status} />
                        </button>
                      )
                    })}
                  </div>
                </aside>
              </div>
              <div className="map-instruction"><span>↖</span> Bir bölgeye dokunarak ölçümü ve rehberi aç</div>
            </section>
          </section>

          <details className="dashboard-disclosure guidance-column" data-testid="guidance-disclosure">
            <summary className="disclosure-summary">
              <span className={`disclosure-icon status-${selectedStatus}`} aria-hidden="true">◎</span>
              <span className="disclosure-copy">
                <span className="eyebrow">SEÇİLİ GÖSTERGE · {metricDefinitions[selectedMetric].shortLabel.toLocaleUpperCase('tr-TR')}</span>
                <strong>{formatValue(selectedMetric, selectedSample?.value)} {metricDefinitions[selectedMetric].displayUnit} · Rehber ve eğilim</strong>
                <small>{selectedGuidance.hazard}</small>
              </span>
              <StatusBadge status={selectedStatus} />
              <span className="disclosure-chevron" aria-hidden="true">⌄</span>
            </summary>
            <div className="disclosure-content">
            <section className="panel guidance-panel" data-testid="guidance-panel">
              <div className="guidance-topline">
                <span className="eyebrow">SEÇİLİ GÖSTERGE</span>
                <StatusBadge status={selectedStatus} />
              </div>
              <div className="metric-readout">
                <div>
                  <h2>{metricDefinitions[selectedMetric].label}</h2>
                  <span className="metric-value" data-testid="selected-value">{formatValue(selectedMetric, selectedSample?.value)} <small>{metricDefinitions[selectedMetric].displayUnit}</small></span>
                </div>
                <span className={`metric-orbit ${getStatusTone(selectedStatus)}`} aria-hidden="true">
                  <span />
                </span>
              </div>
              <div className="guidance-hazard"><span>BAĞLANTILI UZAY TEHLİKESİ</span><strong>{selectedGuidance.hazard}</strong></div>
              <TrendChart type={selectedMetric} value={selectedSample?.value ?? 0} />
              <div className="guidance-copy">
                <div className="guidance-item">
                  <span className="guidance-index">01</span>
                  <div><h3>Ne anlama geliyor?</h3><p>{selectedGuidance.what}</p></div>
                </div>
                <div className="guidance-item">
                  <span className="guidance-index">02</span>
                  <div><h3>Uzayda neden önemli?</h3><p>{selectedGuidance.why}</p></div>
                </div>
                <div className="guidance-item action-item">
                  <span className="guidance-index">03</span>
                  <div><h3>Şimdi ne yapabilirsin?</h3><ul>{selectedGuidance.doNow.map((action) => <li key={action}>{action}</li>)}</ul></div>
                </div>
              </div>
              <div className={`escalation-note ${getStatusTone(selectedStatus)}`}>
                <span className="escalation-mark">!</span>
                <p><strong>{selectedStatus === 'red' ? 'Ekip desteği' : 'Ne zaman haber vermeli?'}</strong><br />{selectedGuidance.escalate}</p>
              </div>
              <p className="sample-meta">
                Kaynak: {selectedSample?.source === 'manual' ? 'Manuel giriş' : selectedSample?.source === 'watch' ? 'Saat simülasyonu' : selectedSample?.source === 'iphone' ? 'Telefon' : 'Demo verisi'}
                {selectedSample ? ` · ${new Date(selectedSample.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}` : ''}
              </p>
            </section>
            </div>
          </details>
        </section>

        <footer className="app-footer">
          <span className="footer-brand"><span className="brand-mark small"><span /><span /><span /></span> ANTIGRAVITY · MISSION HEALTH DEMO</span>
          <span className="medical-disclaimer">Demo yazılımıdır, tıbbi cihaz değildir. Değerler örnek/simüle edilmiştir; tıbbi karar yerine geçmez.</span>
          <span className="dose-budget">DEMO DOZ BÜTÇESİ: {DEMO_MISSION_DOSE_BUDGET_MSV} mSv</span>
        </footer>
      </main>
    </div>
  )
}

export default App
