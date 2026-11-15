import { AI_LABELS as L } from './labels'
import { VOICE_PRESETS, isFemaleVoice, sampleVoice, setVoicePrefs, useTurkishVoices, useVoicePrefs } from './voice'
import { Icon } from './Icon'
import './ai.css'

/** "Ses ayarları": pick the voice of this device (female Turkish voices first), a character preset, speed and tone, and hear it. */
export function VoiceSettings() {
  const voices = useTurkishVoices()
  const prefs = useVoicePrefs()
  const selected = prefs.voiceURI && voices.some((v) => v.voiceURI === prefs.voiceURI) ? prefs.voiceURI : ''

  return (
    <div className="ai-voice-panel" data-testid="ai-voice-settings">
      <p className="ai-list-title">{L.voiceSettings}</p>

      {voices.length === 0 ? (
        <p className="ai-muted">{L.voiceNone}</p>
      ) : (
        <label className="ai-field">
          <span>Ses</span>
          <select value={selected} onChange={(e) => setVoicePrefs({ voiceURI: e.target.value || null })} data-testid="ai-voice-select">
            <option value="">{L.voiceAuto}</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>{v.name}{isFemaleVoice(v) ? ` · ${L.voiceFemale}` : ''}</option>
            ))}
          </select>
        </label>
      )}

      <div className="ai-field">
        <span>{L.voicePresets}</span>
        <div className="ai-demo-grid">
          {Object.entries(VOICE_PRESETS).map(([key, p]) => (
            <button key={key} type="button" className="ai-chip" data-testid={`ai-voice-preset-${key}`}
              onClick={() => { setVoicePrefs({ rate: p.rate, pitch: p.pitch }); sampleVoice(L.voiceSample) }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <label className="ai-field">
        <span>{L.voiceRate} <small>{prefs.rate.toFixed(2)}</small></span>
        <input type="range" min="0.5" max="1.5" step="0.05" value={prefs.rate} data-testid="ai-voice-rate"
          onChange={(e) => setVoicePrefs({ rate: Number(e.target.value) })} />
        <small className="ai-range-ends"><span>{L.voiceSlow}</span><span>{L.voiceFast}</span></small>
      </label>

      <label className="ai-field">
        <span>{L.voicePitch} <small>{prefs.pitch.toFixed(2)}</small></span>
        <input type="range" min="0.5" max="1.6" step="0.05" value={prefs.pitch} data-testid="ai-voice-pitch"
          onChange={(e) => setVoicePrefs({ pitch: Number(e.target.value) })} />
        <small className="ai-range-ends"><span>{L.voiceLow}</span><span>{L.voiceHigh}</span></small>
      </label>

      <button type="button" className="ai-btn ai-btn-primary" onClick={() => sampleVoice(L.voiceSample)} data-testid="ai-voice-try">
        <Icon name="play" size={14} /> {L.voiceTry}
      </button>
      <p className="ai-muted ai-voice-note">{L.voiceNote}</p>
    </div>
  )
}
