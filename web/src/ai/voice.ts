// Alarm tone (Web Audio) + Turkish speech (speechSynthesis). Browsers block audio until the user clicks once,
// so voice starts OFF and the toggle click is what unlocks it. The choice is remembered per browser.

import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'antigravity.ai.voice'
let enabled = readEnabled()
let audio: AudioContext | null = null
const listeners = new Set<() => void>()

function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

function unlock() {
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume()
  } catch {
    audio = null
  }
}

// Voice remembered as ON from an earlier visit still needs one gesture after reload: unlock on the first click/key.
if (typeof window !== 'undefined') {
  const firstGesture = () => {
    if (enabled) unlock()
    window.removeEventListener('pointerdown', firstGesture)
    window.removeEventListener('keydown', firstGesture)
  }
  window.addEventListener('pointerdown', firstGesture)
  window.addEventListener('keydown', firstGesture)
}

export function setVoiceEnabled(on: boolean) {
  enabled = on
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    /* private mode: keep it for this page only */
  }
  if (on) unlock()
  else window.speechSynthesis?.cancel()
  for (const l of listeners) l()
}

export function useVoiceEnabled(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => enabled,
    () => false,
  )
}

/** Red: three fast high beeps. Amber: two slower lower beeps. */
export function beep(severity: 'red' | 'amber') {
  if (!audio || audio.state !== 'running') return
  const [count, freq, gap] = severity === 'red' ? [3, 880, 0.18] : [2, 620, 0.3]
  const start = audio.currentTime + 0.02
  for (let i = 0; i < count; i++) {
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'square'
    osc.frequency.value = freq
    const t = start + i * gap
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.15, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
    osc.connect(gain).connect(audio.destination)
    osc.start(t)
    osc.stop(t + 0.13)
  }
}

function turkishVoice(): SpeechSynthesisVoice | undefined {
  return window.speechSynthesis?.getVoices().find((v) => v.lang?.toLowerCase().startsWith('tr'))
}

export function speak(text: string, delayMs = 0) {
  const synth = window.speechSynthesis
  if (!synth || !text) return
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = 'tr-TR'
  const voice = turkishVoice()
  if (voice) utter.voice = voice
  utter.rate = 1
  window.setTimeout(() => synth.speak(utter), delayMs)
}

/** Beep, then say it. Does nothing while voice is off. */
export function announce(severity: 'red' | 'amber', text: string) {
  if (!enabled) return
  beep(severity)
  speak(text, severity === 'red' ? 650 : 700)
}

export function isVoiceEnabled() {
  return enabled
}

/** Called from the toggle's click handler, so the browser treats it as a user gesture. */
export function toggleVoice(confirmText: string) {
  const next = !enabled
  setVoiceEnabled(next)
  if (next) speak(confirmText)
}
