import type { AstronautHealthPacket } from '../domain/types'
import './PacketCards.css'

export interface WatchTelemetryCardProps {
  packet?: AstronautHealthPacket | null
}

function formatSyncTime(timestamp: string): string {
  const parsed = Date.parse(timestamp)
  if (!Number.isFinite(parsed)) return timestamp
  return new Date(parsed).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`
  }
  return `${Math.round(meters)} m`
}

function formatAltitude(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`
  }
  return `${Math.round(meters)} m`
}

function formatG(value: number): string {
  return `${value.toFixed(2)} g`
}

export function WatchTelemetryCard({ packet }: WatchTelemetryCardProps) {
  const telemetry = packet?.watchTelemetry ?? null

  if (!packet || !telemetry) {
    return (
      <section
        className="packet-card"
        data-testid="watch-telemetry-card"
        aria-label="Apple Watch Telemetrisi"
      >
        <div className="packet-card-head">
          <div>
            <span className="packet-card-kicker">APPLE WATCH TELEMETRİSİ</span>
            <h3 className="packet-card-title">Sensör ve Aktivite Özeti</h3>
          </div>
        </div>
        <p className="packet-card-empty" data-testid="watch-telemetry-empty">
          Bu astronot için Apple Watch telemetrisi henüz yok.
        </p>
      </section>
    )
  }

  const { activitySummary, environmentalData, deviceModel, syncTimestamp } = telemetry
  const gForce = environmentalData?.gForce ?? null
  const gMagnitude = gForce
    ? Math.sqrt(gForce.xAxis ** 2 + gForce.yAxis ** 2 + gForce.zAxis ** 2)
    : null

  return (
    <section
      className="packet-card"
      data-testid="watch-telemetry-card"
      aria-label="Apple Watch Telemetrisi"
    >
      <div className="packet-card-head">
        <div>
          <span className="packet-card-kicker">APPLE WATCH TELEMETRİSİ</span>
          <h3 className="packet-card-title">{packet.fullName}</h3>
        </div>
        <div className="packet-card-meta">
          <span className="packet-card-pill">{deviceModel}</span>
          <span>Son senkron: {formatSyncTime(syncTimestamp)}</span>
        </div>
      </div>

      <div className="packet-section-grid">
        <div className="packet-subpanel" data-testid="watch-telemetry-activity">
          <h4 className="packet-subpanel-title">Aktivite</h4>
          <dl className="packet-kv-list">
            <div className="packet-kv-item">
              <dt>Adım</dt>
              <dd>{activitySummary.stepCount.toLocaleString('tr-TR')}</dd>
            </div>
            <div className="packet-kv-item">
              <dt>Aktif Kalori</dt>
              <dd>{Math.round(activitySummary.activeCaloriesBurned)} kcal</dd>
            </div>
            <div className="packet-kv-item">
              <dt>Egzersiz</dt>
              <dd>{activitySummary.exerciseMinutes} dk</dd>
            </div>
            <div className="packet-kv-item">
              <dt>Ayakta / Mesafe</dt>
              <dd>
                {activitySummary.standHours} sa · {formatDistance(activitySummary.distanceMeters)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="packet-subpanel" data-testid="watch-telemetry-environment">
          <h4 className="packet-subpanel-title">Ortam</h4>
          {environmentalData ? (
            <dl className="packet-kv-list">
              <div className="packet-kv-item">
                <dt>İrtifa</dt>
                <dd>{formatAltitude(environmentalData.altitudeMeters)}</dd>
              </div>
              <div className="packet-kv-item">
                <dt>Kabin Basıncı</dt>
                <dd>{environmentalData.atmosphericPressure.toFixed(1)} hPa</dd>
              </div>
            </dl>
          ) : (
            <p className="packet-card-empty">Ortam sensör verisi alınmadı.</p>
          )}
        </div>

        <div className="packet-subpanel" data-testid="watch-telemetry-gforce">
          <h4 className="packet-subpanel-title">G-Kuvveti</h4>
          {gForce ? (
            <>
              <div className="packet-kv-item">
                <dt>Bileşke İvme</dt>
                <dd>{gMagnitude !== null ? formatG(gMagnitude) : '—'}</dd>
              </div>
              <div className="packet-gforce-axes">
                <div className="packet-axis-chip">
                  <span>X Ekseni</span>
                  <strong>{formatG(gForce.xAxis)}</strong>
                </div>
                <div className="packet-axis-chip">
                  <span>Y Ekseni</span>
                  <strong>{formatG(gForce.yAxis)}</strong>
                </div>
                <div className="packet-axis-chip">
                  <span>Z Ekseni</span>
                  <strong>{formatG(gForce.zAxis)}</strong>
                </div>
              </div>
            </>
          ) : (
            <p className="packet-card-empty">İvmeölçer verisi henüz yok.</p>
          )}
        </div>
      </div>
    </section>
  )
}
