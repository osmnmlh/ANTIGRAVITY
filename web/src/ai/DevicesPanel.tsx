import { useAiState } from './aiStore'
import { AI_LABELS as L } from './labels'
import './ai.css'

/**
 * Cockpit view of the crew phones: who is connected right now, and for the newest alert how many phones it reached
 * and who already acknowledged it. Updates live (the server pushes a `devices` event on every connect / disconnect).
 */
export function DevicesPanel({ crewNames = {} }: { crewNames?: Record<string, string> }) {
  const { devices, alerts } = useAiState()
  const newest = alerts[0]
  const online = devices.filter((d) => d.online).length
  const delivery = (deviceId: string) => newest?.deliveries.find((d) => d.deviceId === deviceId)

  return (
    <section className="ai-devices" aria-label={L.devicesTitle} data-testid="ai-devices">
      <header className="ai-devices-head">
        <p className="ai-list-title">📱 {L.devicesTitle}</p>
        <span className="ai-muted" data-testid="ai-devices-online">{online}/{devices.length} {L.online}</span>
      </header>

      {devices.length === 0 && <p className="ai-muted">{L.noDevices}</p>}

      <ul className="ai-device-list">
        {devices.map((d) => {
          const del = delivery(d.deviceId)
          return (
            <li key={d.deviceId} className="ai-device" data-testid={`ai-device-${d.deviceId}`} data-online={d.online}>
              <span className={`ai-dot ${d.online ? 'is-on' : ''}`} aria-hidden="true" />
              <span className="ai-device-name">
                {crewNames[d.crewId] ?? d.crewId}
                <small>{d.name ?? d.platform}</small>
              </span>
              <span className="ai-device-state">
                {del?.ackedAt ? '✅' : del?.deliveredAt ? '📨' : d.online ? '🟢' : '⚪'}
                {' '}{d.online ? L.online : L.offlineShort}
              </span>
            </li>
          )
        })}
      </ul>

      {newest && newest.deliveries.length > 0 && (
        <p className="ai-delivery" data-testid="ai-devices-summary">
          {L.reached(newest.deliveries.filter((d) => d.deliveredAt).length, newest.deliveries.length)}
          {newest.deliveries.every((d) => d.ackedAt) ? ` · ${L.allAcked}` : ` · ✅ ${newest.deliveries.filter((d) => d.ackedAt).length}`}
        </p>
      )}
    </section>
  )
}
