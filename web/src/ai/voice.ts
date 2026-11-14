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

// ---- Which voice, how fast: a Turkish FEMALE voice by default, adjustable ("Ses ayarları") ----

export interface VoicePrefs {
  /** `voiceURI` of the chosen voice, or null = the best female Turkish voice of this device. */
  voiceURI: string | null
  rate: number
  pitch: number
}

/** Starting points for the "robotic female" character. Browsers differ: the lab sliders exist because the final taste is by ear. */
export const VOICE_PRESETS: Record<string, { label: string; rate: number; pitch: number }> = {
  robot: { label: 'Robotik kadın', rate: 0.88, pitch: 0.85 },
  natural: { label: 'Doğal kadın', rate: 1, pitch: 1.05 },
  clear: { label: 'Yavaş ve net', rate: 0.8, pitch: 1 },
}

const PREFS_KEY = 'antigravity.ai.voice.prefs'
const DEFAULT_PREFS: VoicePrefs = { voiceURI: null, rate: VOICE_PRESETS.robot.rate, pitch: VOICE_PRESETS.robot.pitch }
let prefs = readPrefs()
const prefListeners = new Set<() => void>()

function readPrefs(): VoicePrefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<VoicePrefs>
    return {
      voiceURI: typeof parsed.voiceURI === 'string' ? parsed.voiceURI : null,
      rate: clamp(Number(parsed.rate), 0.5, 1.5, DEFAULT_PREFS.rate),
      pitch: clamp(Number(parsed.pitch), 0.5, 1.6, DEFAULT_PREFS.pitch),
    }
  } catch {
    return DEFAULT_PREFS
  }
}

function clamp(n: number, min: number, max: number, fallback: number) {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export function setVoicePrefs(patch: Partial<VoicePrefs>) {
  prefs = { ...prefs, ...patch, rate: clamp(patch.rate ?? prefs.rate, 0.5, 1.5, prefs.rate), pitch: clamp(patch.pitch ?? prefs.pitch, 0.5, 1.6, prefs.pitch) }
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* private mode: the choice lasts for this page only */
  }
  for (const l of prefListeners) l()
}

export function useVoicePrefs(): VoicePrefs {
  return useSyncExternalStore(
    (l) => {
      prefListeners.add(l)
      return () => prefListeners.delete(l)
    },
    () => prefs,
    () => DEFAULT_PREFS,
  )
}

// Names of the Turkish system voices: Windows "Microsoft Emel", macOS/iOS "Yelda", Chrome "Google Türkçe" are female; "Microsoft Tolga" is male.
const FEMALE_VOICE = /emel|yelda|filiz|seda|zeynep|ay[sş]e|google t[uü]rk[cç]e|\bfemale\b|kad[ıi]n/i
const MALE_VOICE = /tolga|\bcem\b|ahmet|mehmet|\bmale\b|erkek/i

export const isFemaleVoice = (v: SpeechSynthesisVoice) => FEMALE_VOICE.test(v.name) && !MALE_VOICE.test(v.name)

/** Higher is better: a female Turkish voice first, neural / online voices a little ahead of the plain local ones. */
export function scoreVoice(v: SpeechSynthesisVoice): number {
  if (!v.lang?.toLowerCase().startsWith('tr')) return -100
  return (isFemaleVoice(v) ? 10 : 0) - (MALE_VOICE.test(v.name) ? 20 : 0) + (/online|natural|neural/i.test(v.name) ? 2 : 0) + (v.localService ? 1 : 0)
}

export function turkishVoices(): SpeechSynthesisVoice[] {
  return (window.speechSynthesis?.getVoices() ?? []).filter((v) => v.lang?.toLowerCase().startsWith('tr')).sort((a, b) => scoreVoice(b) - scoreVoice(a))
}

function chosenVoice(): SpeechSynthesisVoice | undefined {
  const all = turkishVoices()
  return (prefs.voiceURI ? all.find((v) => v.voiceURI === prefs.voiceURI) : undefined) ?? all[0]
}

/** The voices of this device, refreshed when the browser finishes loading them (Chrome loads them late). */
export function useTurkishVoices(): SpeechSynthesisVoice[] {
  const synth = typeof window === 'undefined' ? undefined : window.speechSynthesis
  return useSyncExternalStore(
    (l) => {
      synth?.addEventListener?.('voiceschanged', l)
      return () => synth?.removeEventListener?.('voiceschanged', l)
    },
    () => cachedVoices(),
    () => EMPTY_VOICES,
  )
}
const EMPTY_VOICES: SpeechSynthesisVoice[] = []
let voicesKey = ''
let voicesCache: SpeechSynthesisVoice[] = EMPTY_VOICES
function cachedVoices() {
  const list = turkishVoices()
  const key = list.map((v) => v.voiceURI).join('|')
  if (key !== voicesKey) {
    voicesKey = key
    voicesCache = list
  }
  return voicesCache
}

function makeUtterance(text: string): SpeechSynthesisUtterance {
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = 'tr-TR'
  const voice = chosenVoice()
  if (voice) utter.voice = voice
  utter.rate = prefs.rate
  utter.pitch = prefs.pitch
  return utter
}

export function speak(text: string, delayMs = 0) {
  const synth = window.speechSynthesis
  if (!synth || !text) return
  const utter = makeUtterance(text)
  window.setTimeout(() => synth.speak(utter), delayMs)
}

/** Plays a short alert phrase with the current settings (the "Dene" button). */
export function sampleVoice(text: string) {
  window.speechSynthesis?.cancel()
  speak(text)
}

/**
 * Only the important ones are spoken: a red alert gets the alarm tone and ONE short phrase ("Uyarı. Kan basıncı düşük.").
 * An amber alert only gets a soft tone. Details are never spoken here; the crew asks for them ("Sesli oku").
 * Does nothing while voice is off.
 */
export function announce(severity: 'red' | 'amber', text: string) {
  if (!enabled) return
  beep(severity)
  if (severity === 'red') speak(text, 650)
}

/** Reads a longer text on request (a click is a user gesture, so it works even with the alert voice off). `onEnd` fires when it finishes or is stopped. */
export function readAloud(text: string, onEnd: () => void): boolean {
  const synth = window.speechSynthesis
  if (!synth) return false
  synth.cancel() // drop the short alert phrase that may still be playing
  const utter = makeUtterance(text)
  utter.onend = onEnd
  utter.onerror = onEnd
  synth.speak(utter)
  return true
}

export function stopReading() {
  window.speechSynthesis?.cancel()
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
