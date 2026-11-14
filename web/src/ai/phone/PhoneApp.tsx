// A test phone for the AI alerts: it registers as a device of one astronaut, receives every alert at the same moment as
// the other phones, vibrates, speaks, raises a system notification when in the background, and acknowledges.
// Open /phone.html?crewId=crew-1 on any device in the same network. Also a fallback client when no native app is available.

import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import packets from '../../../../shared/mock/astronaut-packets.json'
import { AlertCenter } from '..'
import { setStreamIdentity, useAiState } from '../aiStore'
import { AI_LABELS as L } from '../labels'
import { setVoiceEnabled, speak } from '../voice'
import '../../index.css'
import '../../App.css'
import '../ai.css'

const crew = packets.astronauts.map((a) => ({ id: a.astronautId, name: a.fullName }))
const params = new URLSearchParams(window.location.search)
const crewId = params.get('crewId')
const person = crew.find((c) => c.id === crewId)

/** crypto.randomUUID only exists on https / localhost; a phone on http://<ip> needs this. */
const newId = () => `phone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

function deviceId(): string {
  // sessionStorage = one id per tab, so two tabs on the same computer behave as two phones.
  const key = `antigravity.phone.device.${crewId}`
  try {
    const stored = window.sessionStorage.getItem(key)
    if (stored) return stored
    const created = newId()
    window.sessionStorage.setItem(key, created)
    return created
  } catch {
    return newId()
  }
}

const platform = /iPhone|iPad/i.test(navigator.userAgent) ? 'ios-safari' : /Android/i.test(navigator.userAgent) ? 'android-web' : 'web'
const id = person ? deviceId() : ''
if (person) setStreamIdentity({ deviceId: id, crewId: person.id, name: params.get('name') ?? `${platform} ${id.slice(-4)}`, platform })

function CrewChooser() {
  return (
    <main className="ai-phone">
      <h1 className="ai-phone-title">{L.phone.title}</h1>
      <p className="ai-muted">{L.phone.chooseCrew}</p>
      <div className="ai-phone-choices">
        {crew.map((c) => (
          <a key={c.id} className="ai-btn ai-btn-primary" href={`?crewId=${c.id}`} data-testid={`ai-phone-choose-${c.id}`}>{c.name}</a>
        ))}
      </div>
    </main>
  )
}

function Phone({ name }: { name: string }) {
  const [started, setStarted] = useState(false)
  const [notif, setNotif] = useState<string>(typeof Notification === 'undefined' ? L.phone.notifDenied : Notification.permission)
  const { alerts, connection } = useAiState()
  const mine = alerts.filter((a) => a.crewIds.includes(crewId ?? ''))

  async function start() {
    setVoiceEnabled(true) // this tap is the user gesture that unlocks audio
    speak('Bildirimler açıldı.')
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') setNotif(await Notification.requestPermission())
    } catch {
      /* not available on http origins or old browsers: sound, vibration and the popup still work */
    }
    setStarted(true)
  }

  return (
    <main className="ai-phone" data-testid="ai-phone" data-device={id}>
      <h1 className="ai-phone-title">{name}</h1>
      <p className="ai-muted">{L.phone.title} · {L.phone.deviceName} {id.slice(-4)} · <span data-testid="ai-phone-connection">{connection}</span></p>

      {!started ? (
        <section className="ai-phone-start">
          <p className="ai-muted">{L.phone.startHint}</p>
          <button type="button" className="ai-btn ai-btn-primary ai-phone-big" onClick={() => void start()} data-testid="ai-phone-start">
            🔔 {L.phone.start}
          </button>
        </section>
      ) : (
        <>
          <p className="ai-conn ai-conn-live" data-testid="ai-phone-running">
            <span className="ai-dot" aria-hidden="true" /> {L.phone.running} · {L.phone.notifications}: {notif === 'granted' ? L.phone.notifGranted : L.phone.notifDenied}
          </p>
          <h2 className="ai-list-title">{L.phone.myAlerts}</h2>
          {mine.length === 0 && <p className="ai-muted">{L.phone.waiting}</p>}
          <ul className="ai-phone-alerts">
            {mine.map((a) => {
              const mineDelivery = a.deliveries.find((d) => d.deviceId === id)
              return (
                <li key={a.id} className={`ai-list-item ai-sev-${a.severity}`} data-testid="ai-phone-alert">
                  <span className="ai-sev-chip">{L.severity[a.severity]}</span>
                  <strong>{a.title}</strong>
                  {a.advice?.summary && <span className="ai-muted">{a.advice.summary}</span>}
                  <span className="ai-muted">{mineDelivery?.ackedAt ? '✅ ' + L.ack : mineDelivery?.deliveredAt ? '📨' : ''}</span>
                </li>
              )
            })}
          </ul>
        </>
      )}
      {/* The same popup, voice and delivery logic as the cockpit, acknowledging as this device. */}
      <AlertCenter deviceId={id} />
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>{person ? <Phone name={person.name} /> : <CrewChooser />}</StrictMode>,
)
