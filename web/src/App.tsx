import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import './App.css'
import { ThreeBodyMap } from './components/ThreeBodyMap'
import { AiChat, AlertCenter, DevicesPanel, useAiIndicatorGuidance } from './ai'
import { ScenariosView } from './ai/ScenariosView'
import { CrewCockpit } from './components/CrewCockpit'
import './cosmos-shell.css'
import { astronautProfiles, latestSampleFor, useHealthData } from './data/useHealthData'
import { taskApi, useTaskSync } from './data/taskSync'
import { guidanceByType } from './domain/guidance'
import {
  getStatus,
  statusDescriptions,
  statusLabels,
} from './domain/thresholds'
import {
  healthTypes,
  metricDefinitions,
  type HealthStatus,
  type HealthSample,
  type HealthType,
} from './domain/types'

type Workspace = 'astronauts' | 'base' | 'scenarios'
type TaskPriority = 'normal' | 'high'
type AlertSeverity = 'info' | 'warning' | 'critical'
type AlertRecipient = 'all' | (typeof astronautProfiles)[number]['id']

interface MissionTask {
  id: string
  title: string
  details: string
  assigneeId: (typeof astronautProfiles)[number]['id']
  dueAt: string
  priority: TaskPriority
  completed: boolean
  createdAt: string
  /** `alert`: a step of an alert, assigned by the relay and removed when the alert is over. */
  source?: 'manual' | 'alert'
}

interface CrewMessage {
  id: string
  title: string
  message: string
  recipientId: AlertRecipient
  severity: AlertSeverity
  acknowledged: boolean
  createdAt: string
}

const taskStorageKey = 'antigravity.mission-tasks.v1'
const messageStorageKey = 'antigravity.crew-messages.v1'

function isMissionTask(value: unknown): value is MissionTask {
  if (!value || typeof value !== 'object') return false
  const task = value as Record<string, unknown>
  return (
    typeof task.id === 'string' &&
    typeof task.title === 'string' &&
    typeof task.details === 'string' &&
    astronautProfiles.some(({ id }) => id === task.assigneeId) &&
    typeof task.dueAt === 'string' &&
    (task.priority === 'normal' || task.priority === 'high') &&
    typeof task.completed === 'boolean' &&
    typeof task.createdAt === 'string'
  )
}

function isCrewMessage(value: unknown): value is CrewMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Record<string, unknown>
  return (
    typeof message.id === 'string' &&
    typeof message.title === 'string' &&
    typeof message.message === 'string' &&
    (message.recipientId === 'all' || astronautProfiles.some(({ id }) => id === message.recipientId)) &&
    (message.severity === 'info' || message.severity === 'warning' || message.severity === 'critical') &&
    typeof message.acknowledged === 'boolean' &&
    typeof message.createdAt === 'string'
  )
}

function readMissionTasks(): MissionTask[] {
  try {
    const stored = window.localStorage.getItem(taskStorageKey)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (Array.isArray(parsed) && parsed.every(isMissionTask)) return parsed
    console.error('Saved mission tasks have an invalid shape; starting with an empty task list.')
    return []
  } catch (error) {
    console.error('Could not load mission tasks from local storage.', error)
    return []
  }
}

function readCrewMessages(): CrewMessage[] {
  try {
    const stored = window.localStorage.getItem(messageStorageKey)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (Array.isArray(parsed) && parsed.every(isCrewMessage)) return parsed
    console.error('Saved crew messages have an invalid shape; starting with an empty message list.')
    return []
  } catch (error) {
    console.error('Could not load crew messages from local storage.', error)
    return []
  }
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

function TrendChart({ type, samples }: { type: HealthType; samples: HealthSample[] }) {
  const orderedSamples = [...samples].sort(
    (left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp),
  )
  const firstTimestamp = Date.parse(orderedSamples[0].timestamp)
  const lastTimestamp = Date.parse(orderedSamples[orderedSamples.length - 1].timestamp)
  const rangeStart = Math.max(firstTimestamp, lastTimestamp - 6 * 24 * 60 * 60 * 1000)
  const filteredSamples = orderedSamples.filter((sample) => Date.parse(sample.timestamp) >= rangeStart)
  const recentSamples = filteredSamples.length >= 2 ? filteredSamples : orderedSamples.slice(-7)

  // Keep one latest sample per calendar day over the 7-day window so live bursts don't cram spikes or duplicate day labels
  const dailyMap = new Map<string, HealthSample>()
  for (const sample of recentSamples) {
    const date = new Date(sample.timestamp)
    const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    dailyMap.set(dayKey, sample)
  }
  const dailySamples = Array.from(dailyMap.values())
  const useDailyPoints = dailySamples.length >= 2
  const plotSamples = useDailyPoints ? dailySamples : recentSamples

  const values = plotSamples.map(({ value }) => value)
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const padding = (maximum - minimum) * 0.15 || Math.max(Math.abs(minimum) * 0.02, 0.1)
  const min = minimum - padding
  const span = maximum - minimum + padding * 2
  const chartStart = Date.parse(plotSamples[0].timestamp)
  const chartEnd = Date.parse(plotSamples[plotSamples.length - 1].timestamp)
  const dateSpan = chartEnd - chartStart
  const points = plotSamples.map((sample) => ({
    x: 8 + (dateSpan
      ? ((Date.parse(sample.timestamp) - chartStart) / dateSpan) * 264
      : 132),
    y: 112 - ((sample.value - min) / span) * 82,
    date: new Date(sample.timestamp).toLocaleDateString('tr-TR', { day: '2-digit' }),
  }))
  const pointString = points.map(({ x, y }) => `${x},${y}`).join(' ')
  const areaPath = `M ${points[0].x} 112 L ${points.map(({ x, y }) => `${x} ${y}`).join(' L ')} L ${points[points.length - 1].x} 112 Z`

  const intradayTickCount = Math.min(5, Math.max(2, plotSamples.length))
  const axisLabels = useDailyPoints
    ? points.map(({ x, date }, index) => ({ key: `${index}-${x}-${date}`, text: date }))
    : Array.from({ length: intradayTickCount }, (_, index) => {
        const ts = chartStart + (dateSpan * index) / Math.max(intradayTickCount - 1, 1)
        const text = new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
        return { key: `${index}-${Math.round(ts)}`, text }
      })

  return (
    <div className="trend-chart" role="img" aria-label={`${metricDefinitions[type].label}: kaydedilmiş yedi günlük ölçümler`}>
      <div className="trend-chart-head">
        <div>
          <span className="eyebrow">7 GÜNLÜK EĞİLİM</span>
          <span className="chart-caption">Kaydedilmiş ölçümler</span>
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
        <polyline className="chart-line" points={pointString} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="trend-days">
        {axisLabels.map(({ key, text }) => <span key={key}>{text}</span>)}
      </div>
    </div>
  )
}

function App() {
  const { samples, connection, simulation, scenario, startLiveSimulation, stopLiveSimulation } = useHealthData()
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace>('astronauts')
  const [missionTasks, setMissionTasks] = useState<MissionTask[]>(readMissionTasks)
  const [crewMessages, setCrewMessages] = useState<CrewMessage[]>(readCrewMessages)
  useTaskSync(setMissionTasks)
  const [clockNow, setClockNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(new Date()), 15_000)
    return () => window.clearInterval(timer)
  }, [])
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDetails, setTaskDetails] = useState('')
  const [taskAssignee, setTaskAssignee] = useState<(typeof astronautProfiles)[number]['id']>('crew-1')
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('normal')
  const [taskDueAt, setTaskDueAt] = useState('')
  const [alertTitle, setAlertTitle] = useState('')
  const [alertMessage, setAlertMessage] = useState('')
  const [alertRecipient, setAlertRecipient] = useState<AlertRecipient>('all')
  const [alertSeverity, setAlertSeverity] = useState<AlertSeverity>('critical')
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [showMessageForm, setShowMessageForm] = useState(false)
  const [selectedCrewId, setSelectedCrewId] = useState<(typeof astronautProfiles)[number]['id']>('crew-1')
  const [cockpitCrewId, setCockpitCrewId] = useState<(typeof astronautProfiles)[number]['id']>('crew-1')
  const [selectedMetric, setSelectedMetric] = useState<HealthType>('heartRate')
  const [focusedMetric, setFocusedMetric] = useState<HealthType | null>(null)
  const [simulationActionError, setSimulationActionError] = useState('')
  const autoStartAttempted = useRef(false)
  const pendingSimulationCrew = useRef<string | null>(null)

  const selectedAstronaut = astronautProfiles.find(({ id }) => id === selectedCrewId) ?? astronautProfiles[0]
  const crewSamples = useMemo(
    () => samples.filter((sample) => sample.crewId === selectedCrewId),
    [samples, selectedCrewId],
  )
  const latest = useMemo(() => getLatestByType(crewSamples), [crewSamples])
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
          return [type, sample ? getStatus(type, sample.value, selectedAstronaut.radiationBudgetMsv) : 'missing']
        }),
      ) as Record<HealthType, HealthStatus>,
    [latest, selectedAstronaut.radiationBudgetMsv],
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
  const selectedSample = latest[selectedMetric]
  const selectedStatus = statuses[selectedMetric]
  // AI recommendation of the backend for this indicator (Gemini, or its Turkish rules); the local rule texts when the relay is offline.
  const aiIndicator = useAiIndicatorGuidance(selectedCrewId, selectedMetric, selectedStatus)
  const selectedGuidance = aiIndicator
    ? { ...guidanceByType[selectedMetric], what: aiIndicator.whatItIs, why: aiIndicator.whyInSpace, doNow: aiIndicator.doNow, escalate: aiIndicator.escalateWhen }
    : guidanceByType[selectedMetric]
  const selectedTrendSamples = useMemo(
    () => crewSamples.filter((sample) => sample.type === selectedMetric),
    [crewSamples, selectedMetric],
  )
  const selectedAstronautTasks = useMemo(
    () => missionTasks.filter((task) => task.assigneeId === selectedCrewId),
    [missionTasks, selectedCrewId],
  )

  useEffect(() => {
    if (connection !== 'connected') return
    if (simulation.running && simulation.crewId !== selectedCrewId) {
      if (pendingSimulationCrew.current !== selectedCrewId) {
        const targetCrewId = selectedCrewId
        pendingSimulationCrew.current = targetCrewId
        startLiveSimulation(targetCrewId).catch((error: unknown) => {
          if (pendingSimulationCrew.current === targetCrewId) pendingSimulationCrew.current = null
          console.error('Could not switch live telemetry to the selected astronaut.', error)
          setSimulationActionError('Seçili astronot için canlı akış başlatılamadı.')
        })
      }
      return
    }
    if (simulation.running) pendingSimulationCrew.current = null
    if (simulation.running || simulation.mode !== 'idle') {
      autoStartAttempted.current = true
      return
    }
    if (autoStartAttempted.current) return

    autoStartAttempted.current = true
    startLiveSimulation(selectedCrewId).catch((error: unknown) => {
      console.error('Could not automatically start live telemetry.', error)
      setSimulationActionError('Canlı simülasyon başlatılamadı. Yeniden denemek için düğmeyi kullan.')
    })
  }, [connection, selectedCrewId, simulation.crewId, simulation.mode, simulation.running, startLiveSimulation])
  const crewOverview = useMemo(
    () =>
      astronautProfiles.map((astronaut) => {
        const astronautSamples = samples.filter((sample) => sample.crewId === astronaut.id)
        const latestMeasurements = getLatestByType(astronautSamples)
        const statuses = Object.fromEntries(
          healthTypes.map((type) => {
            const sample = latestMeasurements[type]
            return [type, sample ? getStatus(type, sample.value, astronaut.radiationBudgetMsv) : 'missing']
          }),
        ) as Record<HealthType, HealthStatus>
        const redIndicators = healthTypes.filter((type) => statuses[type] === 'red')
        const amberCount = healthTypes.filter((type) => statuses[type] === 'amber').length
        const hasMeasurements = healthTypes.some((type) => latestMeasurements[type])
        const overallStatus: HealthStatus = redIndicators.length
          ? 'red'
          : amberCount
            ? 'amber'
            : hasMeasurements
              ? 'green'
              : 'missing'
        return {
          ...astronaut,
          overallStatus,
          redIndicators,
          latestMeasurements,
        }
      }),
    [samples],
  )

  useEffect(() => {
    try {
      window.localStorage.setItem(taskStorageKey, JSON.stringify(missionTasks))
    } catch (error) {
      console.error('Could not save mission tasks to local storage.', error)
    }
  }, [missionTasks])

  useEffect(() => {
    try {
      window.localStorage.setItem(messageStorageKey, JSON.stringify(crewMessages))
    } catch (error) {
      console.error('Could not save crew messages to local storage.', error)
    }
  }, [crewMessages])

  function selectMetric(type: HealthType) {
    setSelectedMetric(type)
    setFocusedMetric(type)
  }

  async function toggleLiveSimulation() {
    setSimulationActionError('')
    try {
      if (simulation.running) {
        await stopLiveSimulation()
      } else {
        await startLiveSimulation(selectedCrewId)
      }
    } catch (error) {
      console.error('Could not update the live telemetry simulation.', error)
      setSimulationActionError('Canlı simülasyon başlatılamadı. Backend bağlantısını kontrol et.')
    }
  }

  function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = taskTitle.trim()
    if (!title) return
    const task: MissionTask = {
      id: crypto.randomUUID(),
      title,
      details: taskDetails.trim(),
      assigneeId: taskAssignee,
      dueAt: taskDueAt,
      priority: taskPriority,
      completed: false,
      createdAt: new Date().toISOString(),
    }
    setMissionTasks((current) => [task, ...current])
    void taskApi.create(task)
    setTaskTitle('')
    setTaskDetails('')
    setTaskDueAt('')
    setShowTaskForm(false)
  }

  function handleDeleteTask(task: MissionTask) {
    const shouldDelete = window.confirm(`"${task.title}" görevini silmek istediğine emin misin?`)
    if (!shouldDelete) return
    setMissionTasks((current) => current.filter((item) => item.id !== task.id))
    void taskApi.remove(task.id)
  }

  function toggleTask(task: MissionTask) {
    setMissionTasks((current) =>
      current.map((item) => item.id === task.id ? { ...item, completed: !item.completed } : item),
    )
    void taskApi.setCompleted(task.id, !task.completed)
  }

  function handleSendCrewMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = alertTitle.trim()
    const message = alertMessage.trim()
    if (!title || !message) return
    setCrewMessages((current) => [{
      id: crypto.randomUUID(),
      title,
      message,
      recipientId: alertRecipient,
      severity: alertSeverity,
      acknowledged: false,
      createdAt: new Date().toISOString(),
    }, ...current])
    setAlertTitle('')
    setAlertMessage('')
    setShowMessageForm(false)
  }

  const currentTime = clockNow.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
  const automaticHealthAlerts = crewOverview.flatMap((astronaut) =>
    astronaut.redIndicators.map((type) => ({
      id: `${astronaut.id}-${type}`,
      astronaut,
      type,
      value: astronaut.latestMeasurements[type]?.value,
    })),
  )
  const openTaskCount = missionTasks.filter((task) => !task.completed).length
  const unacknowledgedMessageCount = crewMessages.filter((message) => !message.acknowledged).length

  return (
    <div className="app-shell">
      <AlertCenter
        onOpenAstronaut={(crewId) => {
          setSelectedCrewId(crewId as typeof selectedCrewId)
          setActiveWorkspace('astronauts')
        }}
      />
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
          <span className={`live-indicator is-${connection}`} data-testid="data-connection">
            <i />
            {connection === 'connected'
              ? simulation.running ? 'CANLI AKIŞ' : 'BACKEND BAĞLI'
              : connection === 'connecting' ? 'BAĞLANIYOR' : 'JSON YEDEK VERİ'}
          </span>
        </div>
        <div className="crew-profile">
          <span className="crew-avatar" aria-hidden="true">GK</span>
          <span><strong>Görev Kontrol</strong><small>Yer destek ekibi</small></span>
          <button type="button" className="profile-menu" aria-label="Profil menüsü">···</button>
        </div>
      </header>

      <nav className="workspace-nav" aria-label="Görev çalışma alanları" data-testid="workspace-navigation">
        <button
          className={`workspace-tab ${activeWorkspace === 'astronauts' ? 'is-active' : ''}`}
          data-testid="workspace-astronauts"
          onClick={() => setActiveWorkspace('astronauts')}
          type="button"
          aria-current={activeWorkspace === 'astronauts' ? 'page' : undefined}
        >
          <span className="workspace-tab-icon" aria-hidden="true">◉</span>
          <span>Astronotlar</span>
          <small>SAĞLIK GÖRÜNÜMÜ</small>
        </button>
        <button
          className={`workspace-tab ${activeWorkspace === 'base' ? 'is-active' : ''}`}
          data-testid="workspace-base"
          onClick={() => setActiveWorkspace('base')}
          type="button"
          aria-current={activeWorkspace === 'base' ? 'page' : undefined}
        >
          <span className="workspace-tab-icon" aria-hidden="true">⌂</span>
          <span>Ana üs</span>
          {(automaticHealthAlerts.length + unacknowledgedMessageCount + openTaskCount > 0) && (
            <b className="workspace-alert-count">{automaticHealthAlerts.length + unacknowledgedMessageCount + openTaskCount}</b>
          )}
          <small>GÖREV KONTROLÜ</small>
        </button>
        <button
          className={`workspace-tab ${activeWorkspace === 'scenarios' ? 'is-active' : ''}`}
          data-testid="workspace-scenarios"
          onClick={() => setActiveWorkspace('scenarios')}
          type="button"
          aria-current={activeWorkspace === 'scenarios' ? 'page' : undefined}
        >
          <span className="workspace-tab-icon" aria-hidden="true">▶</span>
          <span>Senaryolar</span>
          <small>DEMO TETİKLEYİCİ</small>
        </button>
      </nav>

      <main id="dashboard" className="dashboard">
        {activeWorkspace === 'astronauts' ? (
          <>
        <section className="page-heading">
          <div>
            <h1>Mürettebat sağlık görünümü</h1>
          </div>
          <div className="heading-meta">
            <button
              className={`simulation-toggle ${simulation.running ? 'is-running' : ''}`}
              data-testid="live-simulation-toggle"
              disabled={connection !== 'connected'}
              onClick={() => void toggleLiveSimulation()}
              type="button"
            >
              {simulation.running ? 'CANLI AKIŞI DURDUR' : 'CANLI SİMÜLASYONU BAŞLAT'}
            </button>
            {simulationActionError && <p className="simulation-action-error" role="alert">{simulationActionError}</p>}
            <span className="utc-clock" title="Dünya referans saati (UTC). Türkiye saati için +3 saat.">
              <small>Görev saati · UTC</small>
              <b>{currentTime}</b>
            </span>
          </div>
        </section>

        <section className="astronaut-selector" aria-label="Astronot seçimi">
          <div className="astronaut-selector-heading">
            <div>
              <h2>Astronot profili</h2>
            </div>
          </div>
          <div className="astronaut-select-box">
            <label className="astronaut-select-field" htmlFor="astronaut-select">
              <select
                id="astronaut-select"
                data-testid="astronaut-selector"
                value={selectedCrewId}
                onChange={(event) => {
                  const astronaut = astronautProfiles.find(({ id }) => id === event.target.value)
                  if (!astronaut) {
                    console.error(`No astronaut profile exists for ${event.target.value}.`)
                    return
                  }
                  setSelectedCrewId(astronaut.id)
                  setFocusedMetric(selectedMetric)
                }}
              >
                {astronautProfiles.map((astronaut) => (
                  <option key={astronaut.id} value={astronaut.id}>
                    {astronaut.name} · {astronaut.code}
                  </option>
                ))}
              </select>
            </label>
            <span className="astronaut-identity" data-testid="astronaut-identity">
              <strong>{selectedAstronaut.code}</strong>
              <span>{selectedAstronaut.name}</span>
            </span>
          </div>
        </section>

        {scenario.active && scenario.crewIds?.includes(selectedCrewId) && (
          <div className="scenario-banner" data-testid="astronaut-scenario-banner" role="status">
            <span>
              ▶ Senaryo simülasyonu sürüyor: <strong>{scenario.title}</strong> · {selectedAstronaut.name} için değerler canlı
              değişiyor (simüle edilmiş veri)
            </span>
            <button className="scenarios-link small" onClick={() => setActiveWorkspace('scenarios')} type="button">
              Canlı verileri aç
            </button>
          </div>
        )}

        <section className="dashboard-grid">
          <div className="control-column">
            <details className="dashboard-disclosure" data-testid="astronaut-tasks-panel" open>
              <summary className="disclosure-summary">
                <span className="disclosure-icon" aria-hidden="true">✓</span>
                <span className="disclosure-copy">
                  <strong>{selectedAstronaut.name} · Atanmış görevler</strong>
                </span>
                <span className="assigned-task-count">{selectedAstronautTasks.length}</span>
                <span className="disclosure-chevron" aria-hidden="true">⌄</span>
              </summary>
              <div className="disclosure-content">
                <section className="panel assigned-task-panel">
                  {selectedAstronautTasks.length ? (
                    <div className="base-task-list" data-testid="astronaut-task-list">
                      {selectedAstronautTasks.map((task) => (
                        <article
                          className={`base-task-card ${task.completed ? 'is-completed' : ''}`}
                          data-testid={`astronaut-task-${task.id}`}
                          key={task.id}
                        >
                          <button
                            aria-label={task.completed ? 'Görevi yeniden aç' : 'Görevi tamamlandı olarak işaretle'}
                            aria-pressed={task.completed}
                            className="task-complete-toggle"
                            data-testid={`astronaut-task-toggle-${task.id}`}
                            onClick={() => toggleTask(task)}
                            type="button"
                          >
                            {task.completed ? '✓' : ''}
                          </button>
                          <div className="base-task-content">
                            <div className="base-task-title-line">
                              <strong>{task.title}</strong>
                              {task.source === 'alert' && <span className="task-priority-tag">SENARYO</span>}
                            {task.priority === 'high' && <span className="task-priority-tag">YÜKSEK</span>}
                            </div>
                            {task.details && <p>{task.details}</p>}
                            <span className="base-task-meta">
                              {task.dueAt
                                ? `Son tarih · ${new Date(task.dueAt).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                                : 'Son tarih belirtilmedi'}
                            </span>
                          </div>
                          <span className={`task-status ${task.completed ? 'done' : ''}`}>{task.completed ? 'TAMAM' : 'AÇIK'}</span>
                          <button
                            aria-label={`Görevi sil: ${task.title}`}
                            className="task-delete-button"
                            data-testid={`astronaut-task-delete-${task.id}`}
                            onClick={() => handleDeleteTask(task)}
                            type="button"
                          >
                            SİL
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="base-empty-state" data-testid="astronaut-tasks-empty">
                      <span>{selectedAstronaut.code}</span>
                      <strong>Henüz atanmış görev yok</strong>
                      <button
                        className="assigned-task-link"
                        data-testid="go-to-base-tasks"
                        onClick={() => setActiveWorkspace('base')}
                        type="button"
                      >
                        Ana üs görev panosuna git <b aria-hidden="true">→</b>
                      </button>
                    </div>
                  )}
                </section>
              </div>
            </details>

            <div className="ai-slot">
              <AiChat crewId={selectedCrewId} crewName={selectedAstronaut.name} />
            </div>
          </div>

          <section className="body-column">
            <section className="panel body-panel">
              <div className="panel-heading body-heading">
                <div><h2>{selectedAstronaut.name} · Sağlık görünümü</h2></div>
                <div className="body-heading-tools">
                  <button
                    className="map-reset-button"
                    data-testid="body-map-reset"
                    onClick={() => setFocusedMetric(null)}
                    type="button"
                  >
                    GENEL GÖRÜNÜM
                  </button>
                </div>
              </div>
              <section className={`overview-panel ${getStatusTone(overallStatus)}`} data-testid="overall-status">
                <div className="overview-copy">
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
                  environment={selectedAstronaut.environment}
                  astronautCode={selectedAstronaut.code}
                  astronautName={selectedAstronaut.name}
                  statuses={statuses}
                  values={values}
                  selected={selectedMetric}
                  focused={focusedMetric}
                  onSelect={selectMetric}
                />
                <aside className="map-indicators" aria-label="Mürettebat sağlık göstergeleri">
                  <div className="map-indicators-heading">
                    <span className="eyebrow">CANLI GÖSTERGELER</span>
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
            </section>
          </section>

          <section className="panel guidance-panel guidance-column" data-testid="guidance-panel">
              <div className="guidance-static-head">
                <span className={`disclosure-icon status-${selectedStatus}`} aria-hidden="true">◎</span>
                <span className="disclosure-copy">
                  <strong>{formatValue(selectedMetric, selectedSample?.value)} {metricDefinitions[selectedMetric].displayUnit} · Rehber ve eğilim</strong>
                  <small>{selectedGuidance.hazard}</small>
                </span>
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
              {selectedTrendSamples.length > 1 ? (
                <TrendChart type={selectedMetric} samples={selectedTrendSamples} />
              ) : (
                <div className="trend-chart-empty" data-testid="trend-data-pending">
                  <span className="eyebrow">7 GÜNLÜK EĞİLİM</span>
                  <strong>{selectedTrendSamples.length ? 'Haftalık seri bekleniyor' : 'Ölçüm bekleniyor'}</strong>
                  <p>
                    {selectedTrendSamples.length
                      ? `${selectedAstronaut.name} için şu an yalnızca tek ölçüm var; eğilim için ek kayıt gerekli.`
                      : `${selectedAstronaut.name} için ölçüm geldiğinde eğilim burada görüntülenecek.`}
                  </p>
                </div>
              )}
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
              <p className="sample-meta" data-testid="guidance-source">
                {aiIndicator ? (aiIndicator.source === 'gemini' ? '✦ AI önerisi · Gemini' : '✦ AI önerisi · kural tabanlı') : 'Kural tabanlı öneri (AI sunucusu çevrimdışı)'}
              </p>
              <p className="sample-meta">
                Kaynak: {selectedSample?.source === 'manual' ? 'Manuel giriş' : selectedSample?.source === 'watch' ? 'Saat simülasyonu' : selectedSample?.source === 'iphone' ? 'Telefon' : 'Demo verisi'}
                {selectedSample ? ` · ${new Date(selectedSample.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}` : ''}
              </p>
          </section>
        </section>

        <footer className="app-footer">
          <span className="footer-brand"><span className="brand-mark small"><span /><span /><span /></span> ANTIGRAVITY · MISSION HEALTH DEMO</span>
          <span className="medical-disclaimer">Demo yazılımıdır, tıbbi cihaz değildir. Değerler örnek/simüle edilmiştir; tıbbi karar yerine geçmez.</span>
        </footer>
          </>
        ) : activeWorkspace === 'scenarios' ? (
          <ScenariosView
            crewId={selectedCrewId}
            onCrewChange={(crewId) => {
              const astronaut = astronautProfiles.find(({ id }) => id === crewId)
              if (astronaut) setSelectedCrewId(astronaut.id)
            }}
            scenario={scenario}
            onOpenBase={() => setActiveWorkspace('base')}
            onOpenAstronaut={(crewId) => {
              const astronaut = astronautProfiles.find(({ id }) => id === crewId)
              if (astronaut) setSelectedCrewId(astronaut.id)
              setActiveWorkspace('astronauts')
            }}
          />
        ) : (
          <>
            <section className="base-welcome">
              <div className="base-welcome-row">
                <h1>Görev kontrol merkezi</h1>
                <div className="base-welcome-pills" aria-label="Görev merkezi özeti">
                  <span className="base-pill">{crewOverview.length} Astronot</span>
                  <span className="base-pill">{openTaskCount} Açık Görev</span>
                  <span className={`base-pill ${unacknowledgedMessageCount ? 'is-warning' : ''}`}>
                    {unacknowledgedMessageCount} Bekleyen Mesaj
                  </span>
                  {automaticHealthAlerts.length > 0 && (
                    <span className="base-pill is-critical">
                      {automaticHealthAlerts.length} Kritik Uyarı
                    </span>
                  )}
                </div>
              </div>
            </section>

            <section className="base-roster panel">
              <div className="panel-heading">
                <div><h2>Görev ekibi</h2></div>
              </div>
              <CrewCockpit
                crew={crewOverview.map(({ id, name, code, role, overallStatus }) => ({ id, name, code, role, status: overallStatus }))}
                selectedId={cockpitCrewId}
                onSelect={setCockpitCrewId}
              />
              <div className="base-roster-list">
                {crewOverview.map((astronaut) => (
                  <article
                    className={`base-roster-row ${astronaut.id === cockpitCrewId ? 'is-selected' : ''}`}
                    data-testid={`base-crew-${astronaut.id}`}
                    key={astronaut.id}
                    onClick={() => setCockpitCrewId(astronaut.id)}
                  >
                    <span className="base-crew-avatar">{astronaut.code.slice(-2)}</span>
                    <span className="base-crew-main">
                      <strong>{astronaut.name}</strong>
                    </span>
                    <span className="base-crew-mission">{astronaut.missionName}</span>
                    <span className={`base-health-state ${getStatusTone(astronaut.overallStatus)}`}>
                      <i /> {statusLabels[astronaut.overallStatus]}
                    </span>
                    <span className="base-crew-note">
                      {astronaut.redIndicators.length
                        ? `${astronaut.redIndicators.length} kritik gösterge`
                        : astronaut.overallStatus === 'amber'
                          ? 'Takip gerekli'
                          : 'Açık kritik yok'}
                    </span>
                    <button
                      className="base-open-astronaut"
                      data-testid={`base-open-${astronaut.id}`}
                      onClick={() => {
                        setSelectedCrewId(astronaut.id)
                        setActiveWorkspace('astronauts')
                      }}
                      type="button"
                    >
                      SAĞLIĞI AÇ <span>↗</span>
                    </button>
                  </article>
                ))}
              </div>
              <p className="base-disclaimer">Sağlık durumu demo eşikleriyle hesaplanır; klinik değerlendirme değildir.</p>
            </section>

            {automaticHealthAlerts.length > 0 && (
              <section className="panel base-alerts-banner" aria-label="Açık sağlık uyarıları">
                <div className="panel-heading">
                  <div><h2>Açık sağlık uyarıları <small>{automaticHealthAlerts.length}</small></h2></div>
                </div>
                <div className="base-health-alert-list">
                  {automaticHealthAlerts.map(({ id, astronaut, type, value }) => (
                    <article className="base-health-alert" data-testid={`health-alert-${id}`} key={id}>
                      <span className="alert-indicator-icon">!</span>
                      <div>
                        <strong>{astronaut.name} · {metricDefinitions[type].shortLabel}</strong>
                        <p>{formatValue(type, value)} {metricDefinitions[type].displayUnit} · Demo eşiği kritik</p>
                      </div>
                      <button
                        data-testid={`alert-open-${astronaut.id}`}
                        onClick={() => {
                          setSelectedCrewId(astronaut.id)
                          setSelectedMetric(type)
                          setFocusedMetric(type)
                          setActiveWorkspace('astronauts')
                        }}
                        type="button"
                      >
                        İNCELE ↗
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section className="base-operations-grid">
              <section className="panel base-operation-panel">
                <div className="panel-heading">
                  <div><h2>Atanmış işler <small>{missionTasks.length}</small></h2></div>
                  <button
                    aria-expanded={showTaskForm}
                    className={`base-panel-toggle ${showTaskForm ? 'is-open' : ''}`}
                    data-testid="toggle-task-form"
                    onClick={() => setShowTaskForm((open) => !open)}
                    type="button"
                  >
                    {showTaskForm ? 'Vazgeç' : '+ Görev ata'}
                  </button>
                </div>

                {showTaskForm && (
                  <form className="base-form base-inline-form" onSubmit={handleCreateTask} data-testid="task-form">
                    <label className="field-label" htmlFor="task-title">Görev adı</label>
                    <input
                      id="task-title"
                      data-testid="task-title"
                      maxLength={90}
                      onChange={(event) => setTaskTitle(event.target.value)}
                      placeholder="Örn. Güneş paneli kontrolü"
                      required
                      value={taskTitle}
                    />
                    <label className="field-label" htmlFor="task-details">Talimat / not</label>
                    <textarea
                      id="task-details"
                      data-testid="task-details"
                      maxLength={400}
                      onChange={(event) => setTaskDetails(event.target.value)}
                      placeholder="Astronota iletilecek kısa görev açıklaması"
                      rows={2}
                      value={taskDetails}
                    />
                    <div className="base-form-row">
                      <label>
                        <span className="field-label">Atanacak astronot</span>
                        <select
                          data-testid="task-assignee"
                          onChange={(event) => setTaskAssignee(event.target.value as typeof taskAssignee)}
                          value={taskAssignee}
                        >
                          {astronautProfiles.map((astronaut) => (
                            <option key={astronaut.id} value={astronaut.id}>{astronaut.name}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className="field-label">Öncelik</span>
                        <select
                          data-testid="task-priority"
                          onChange={(event) => setTaskPriority(event.target.value as TaskPriority)}
                          value={taskPriority}
                        >
                          <option value="normal">Rutin</option>
                          <option value="high">Yüksek</option>
                        </select>
                      </label>
                    </div>
                    <label className="field-label" htmlFor="task-due">Son tarih (isteğe bağlı)</label>
                    <input
                      id="task-due"
                      data-testid="task-due"
                      onChange={(event) => setTaskDueAt(event.target.value)}
                      type="datetime-local"
                      value={taskDueAt}
                    />
                    <button className="primary-button base-submit" data-testid="task-submit" type="submit">
                      <span>Görevi ata</span><b>↗</b>
                    </button>
                  </form>
                )}

                {missionTasks.length ? (
                  <div className="base-task-list">
                    {missionTasks.map((task) => {
                      const assignee = astronautProfiles.find(({ id }) => id === task.assigneeId)
                      return (
                        <article className={`base-task-card ${task.completed ? 'is-completed' : ''}`} data-testid={`mission-task-${task.id}`} key={task.id}>
                          <button
                            aria-label={task.completed ? 'Görevi yeniden aç' : 'Görevi tamamlandı olarak işaretle'}
                            className="task-complete-toggle"
                            data-testid={`task-toggle-${task.id}`}
                            onClick={() => toggleTask(task)}
                            type="button"
                          >
                            {task.completed ? '✓' : ''}
                          </button>
                          <div className="base-task-content">
                            <div className="base-task-title-line">
                              <strong>{task.title}</strong>
                              {task.source === 'alert' && <span className="task-priority-tag">SENARYO</span>}
                            {task.priority === 'high' && <span className="task-priority-tag">YÜKSEK</span>}
                            </div>
                            {task.details && <p>{task.details}</p>}
                            <span className="base-task-meta">
                              {assignee?.name ?? 'Atanmamış'}
                              {task.dueAt ? ` · ${new Date(task.dueAt).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                            </span>
                          </div>
                          <span className={`task-status ${task.completed ? 'done' : ''}`}>{task.completed ? 'TAMAM' : 'AÇIK'}</span>
                          <button
                            aria-label={`Görevi sil: ${task.title}`}
                            className="task-delete-button"
                            data-testid={`task-delete-${task.id}`}
                            onClick={() => handleDeleteTask(task)}
                            type="button"
                          >
                            SİL
                          </button>
                        </article>
                      )
                    })}
                  </div>
                ) : (
                  <div className="base-empty-state" data-testid="tasks-empty">
                    <span>01</span><strong>Henüz görev atanmadı</strong>
                    <p>İlk görevi oluşturduğunda burada görünecek.</p>
                  </div>
                )}
              </section>

              <section className="panel base-operation-panel">
                <div className="panel-heading">
                  <div><h2>Mürettebat mesajları <small>{crewMessages.length}</small></h2></div>
                  <button
                    aria-expanded={showMessageForm}
                    className={`base-panel-toggle ${showMessageForm ? 'is-open' : ''}`}
                    data-testid="toggle-message-form"
                    onClick={() => setShowMessageForm((open) => !open)}
                    type="button"
                  >
                    {showMessageForm ? 'Vazgeç' : '+ Mesaj gönder'}
                  </button>
                </div>

                {showMessageForm && (
                  <form className="base-form base-inline-form" onSubmit={handleSendCrewMessage} data-testid="crew-message-form">
                    <label className="field-label" htmlFor="alert-title">Konu</label>
                    <input
                      id="alert-title"
                      data-testid="alert-title"
                      maxLength={90}
                      onChange={(event) => setAlertTitle(event.target.value)}
                      placeholder="Örn. Yaşam destek kontrolü"
                      required
                      value={alertTitle}
                    />
                    <div className="base-form-row">
                      <label>
                        <span className="field-label">Alıcı</span>
                        <select
                          data-testid="alert-recipient"
                          onChange={(event) => setAlertRecipient(event.target.value as AlertRecipient)}
                          value={alertRecipient}
                        >
                          <option value="all">Tüm mürettebat</option>
                          {astronautProfiles.map((astronaut) => (
                            <option key={astronaut.id} value={astronaut.id}>{astronaut.name}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className="field-label">Önem düzeyi</span>
                        <select
                          data-testid="alert-severity"
                          onChange={(event) => setAlertSeverity(event.target.value as AlertSeverity)}
                          value={alertSeverity}
                        >
                          <option value="critical">Kritik</option>
                          <option value="warning">Önemli</option>
                          <option value="info">Bilgi</option>
                        </select>
                      </label>
                    </div>
                    <label className="field-label" htmlFor="alert-message">Astronota iletilecek mesaj</label>
                    <textarea
                      id="alert-message"
                      data-testid="alert-message"
                      maxLength={500}
                      onChange={(event) => setAlertMessage(event.target.value)}
                      placeholder="Mesajı ve atılması gereken adımı açıkça yaz."
                      required
                      rows={3}
                      value={alertMessage}
                    />
                    <button className="primary-button base-submit alert-submit" data-testid="alert-submit" type="submit">
                      <span>Mesajı gönder · simülasyon</span><b>↗</b>
                    </button>
                    <p className="base-simulation-note">Bu demo iletimi yalnızca bu tarayıcıda kaydedilir; gerçek iletişim hattı değildir.</p>
                  </form>
                )}

                {crewMessages.length ? (
                  <div className="base-message-list">
                    {crewMessages.map((message) => {
                      const recipient = message.recipientId === 'all'
                        ? 'Tüm mürettebat'
                        : astronautProfiles.find(({ id }) => id === message.recipientId)?.name ?? 'Mürettebat'
                      return (
                        <article className={`base-message-card severity-${message.severity}`} data-testid={`crew-message-${message.id}`} key={message.id}>
                          <div className="base-message-topline">
                            <span className="message-severity">{message.severity === 'critical' ? 'KRİTİK' : message.severity === 'warning' ? 'ÖNEMLİ' : 'BİLGİ'}</span>
                            <span>{new Date(message.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} · SİMÜLE</span>
                          </div>
                          <strong>{message.title}</strong>
                          <p>{message.message}</p>
                          <div className="base-message-footer">
                            <span>ALICI · {recipient}</span>
                            <button
                              className={message.acknowledged ? 'is-acknowledged' : ''}
                              data-testid={`message-ack-${message.id}`}
                              disabled={message.acknowledged}
                              onClick={() => setCrewMessages((current) =>
                                current.map((item) => item.id === message.id ? { ...item, acknowledged: true } : item),
                              )}
                              type="button"
                            >
                              {message.acknowledged ? '✓ ONAYLANDI' : 'ALINDI · SİMÜLE ET'}
                            </button>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                ) : (
                  <div className="base-empty-state compact" data-testid="messages-empty">
                    <strong>Henüz mesaj gönderilmedi</strong>
                    <p>Gönderilen bilgilendirmeler ve onay durumları burada listelenir.</p>
                  </div>
                )}
              </section>
            </section>

            <section className="ai-base-side ai-base-panels" aria-label="Bağlı cihazlar">
              <DevicesPanel crewNames={Object.fromEntries(astronautProfiles.map((astronaut) => [astronaut.id, astronaut.name]))} />
            </section>

            <footer className="app-footer">
              <span className="footer-brand"><span className="brand-mark small"><span /><span /><span /></span> ANTIGRAVITY · MISSION CONTROL DEMO</span>
              <span className="medical-disclaimer">Demo yazılımıdır, tıbbi cihaz değildir. Sağlık uyarıları demo eşiklerine dayanır.</span>
            </footer>
          </>
        )}
      </main>
    </div>
  )
}

export default App
