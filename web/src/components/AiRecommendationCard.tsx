import { useState } from 'react'
import type { AiGuidance, AstronautHealthPacket } from '../domain/types'
import './PacketCards.css'

export interface AiRecommendationCardProps {
  packet?: AstronautHealthPacket | null
  online: boolean
  onGuidanceGenerated?: (crewId: string, guidance: AiGuidance) => void
}

function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL
  if (typeof configured === 'string' && configured.trim().length > 0) {
    return configured.trim().replace(/\/$/, '')
  }
  if (typeof window === 'undefined') {
    return 'http://localhost:8787'
  }
  return `${window.location.protocol}//${window.location.hostname}:8787`
}

function formatGuidanceTime(timestamp: string): string {
  const parsed = Date.parse(timestamp)
  if (!Number.isFinite(parsed)) return ''
  return new Date(parsed).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function pickLatestGuidance(
  packetGuidance: AiGuidance | null | undefined,
  localGuidance: AiGuidance | undefined,
): AiGuidance | null {
  if (!packetGuidance && !localGuidance) return null
  if (!packetGuidance) return localGuidance ?? null
  if (!localGuidance) return packetGuidance
  const packetTime = Date.parse(packetGuidance.generatedAt)
  const localTime = Date.parse(localGuidance.generatedAt)
  if (Number.isFinite(localTime) && (!Number.isFinite(packetTime) || localTime >= packetTime)) {
    return localGuidance
  }
  return packetGuidance
}

export function AiRecommendationCard({
  packet,
  online,
  onGuidanceGenerated,
}: AiRecommendationCardProps) {
  const [generatedByCrew, setGeneratedByCrew] = useState<Record<string, AiGuidance>>({})
  const [loadingCrewId, setLoadingCrewId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const crewId = packet?.astronautId ?? ''
  const guidance = packet ? pickLatestGuidance(packet.aiGuidance, generatedByCrew[crewId]) : null
  const isGenerating = Boolean(crewId) && loadingCrewId === crewId

  async function handleGenerate() {
    if (!packet || !online || isGenerating) return
    setLoadingCrewId(packet.astronautId)
    setErrorMessage(null)

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/ai/guidance`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ crewId: packet.astronautId }),
        signal: AbortSignal.timeout(15_000),
      })

      const data: unknown = await response.json().catch(() => null)
      if (!response.ok || !data || typeof data !== 'object') {
        throw new Error('Öneri isteği başarısız oldu')
      }

      const nextGuidance = data as AiGuidance
      setGeneratedByCrew((prev) => ({
        ...prev,
        [packet.astronautId]: nextGuidance,
      }))
      onGuidanceGenerated?.(packet.astronautId, nextGuidance)
    } catch {
      setErrorMessage('AI önerisi alınamadı. Sunucu bağlantısını kontrol edin.')
    } finally {
      setLoadingCrewId(null)
    }
  }

  return (
    <section
      className="packet-card"
      data-testid="ai-recommendation-card"
      aria-label="Yapay Zeka Önerisi"
    >
      <div className="packet-card-head">
        <div>
          <span className="packet-card-kicker">YAPAY ZEKA ÖNERİSİ</span>
          <h3 className="packet-card-title">
            {packet ? `${packet.fullName} · Bakım Rehberi` : 'Bakım Rehberi'}
          </h3>
        </div>
        <button
          type="button"
          className="packet-btn"
          data-testid="ai-recommendation-generate"
          disabled={!online || !packet || isGenerating}
          onClick={handleGenerate}
        >
          {isGenerating ? 'Oluşturuluyor...' : 'AI önerisi oluştur'}
        </button>
      </div>

      {errorMessage && (
        <p className="packet-ai-error" role="status" data-testid="ai-recommendation-error">
          {errorMessage}
        </p>
      )}

      {!guidance ? (
        <p className="packet-card-empty" data-testid="ai-recommendation-empty">
          Henüz oluşturulmadı
        </p>
      ) : (
        <>
          <div className="packet-ai-block">
            <h4 className="packet-subpanel-title">Özet</h4>
            <p className="packet-ai-summary" data-testid="ai-recommendation-summary">
              {guidance.summary}
            </p>
          </div>

          {guidance.actions.length > 0 && (
            <div className="packet-ai-block">
              <h4 className="packet-subpanel-title">Önerilen Adımlar</h4>
              <ul className="packet-ai-actions" data-testid="ai-recommendation-actions">
                {guidance.actions.map((action, index) => (
                  <li key={`${index}-${action}`}>{action}</li>
                ))}
              </ul>
            </div>
          )}

          {guidance.escalate && (
            <div className="packet-ai-block">
              <h4 className="packet-subpanel-title">Uçuş Cerrahı Eskalasyonu</h4>
              <p className="packet-ai-escalate" data-testid="ai-recommendation-escalate">
                {guidance.escalate}
              </p>
            </div>
          )}
        </>
      )}

      <div className="packet-card-footer">
        <span className="packet-disclaimer" data-testid="ai-recommendation-disclaimer">
          Demo, tıbbi tavsiye değildir
        </span>
        {guidance?.generatedAt ? (
          <span className="packet-disclaimer">
            Güncelleme: {formatGuidanceTime(guidance.generatedAt)}
          </span>
        ) : !online ? (
          <span className="packet-disclaimer">Çevrimdışı mod · canlı sunucu gerekli</span>
        ) : null}
      </div>
    </section>
  )
}
