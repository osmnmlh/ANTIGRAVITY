// Pre-renders every spoken alert phrase with an ElevenLabs voice into web/public/ai-voice/ (mp3 + manifest.json).
// The web plays these clips (with a light "dull" filter) instead of the browser voice; a phrase without a clip still uses the browser voice.
//
//   1. backend/.env:  ELEVENLABS_API_KEY=...      (git-ignored; optional ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL)
//   2. node --experimental-strip-types backend/ai/make-voice-clips.mjs          (from the repo root; --force re-renders all)
//
// Existing clips are skipped, so a rerun only spends quota on new phrases. The key is only read here, never by the server or the web.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { metricDefinitions } from '../../web/src/domain/types.ts';
import { spokenPhrases } from './rules.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
try { process.loadEnvFile(here('../.env')); } catch { /* reported below */ }

const KEY = process.env.ELEVENLABS_API_KEY;
const VOICE = process.env.ELEVENLABS_VOICE_ID ?? '6GYyziau4Hk8qdg7od5c'; // "Betül Tuna", Turkish female (team choice)
const MODEL = process.env.ELEVENLABS_MODEL ?? 'eleven_multilingual_v2';
// "Hafif donuk": very stable and style-free = flat, little emotion; a touch slower. The web adds a soft low-pass on top.
const VOICE_SETTINGS = { stability: 0.9, similarity_boost: 0.8, style: 0, use_speaker_boost: false, speed: 0.94 };
const OUT = here('../../web/public/ai-voice/');
const force = process.argv.includes('--force');

const all = JSON.parse(readFileSync(here('../../shared/mock/all-data.json'), 'utf8'));
const single = Object.entries(metricDefinitions).filter(([type]) => !type.startsWith('bloodPressure')).map(([, m]) => m.label);
const phrases = [
  ...spokenPhrases(all.astronauts.map((a) => a.fullName), single),
  'Sesli uyarılar açıldı.', 'Bildirimler açıldı.', // confirmations of the voice toggle and the test phone
];

if (!KEY) {
  console.error(`ELEVENLABS_API_KEY yok. backend/.env dosyasına ekleyin, sonra tekrar çalıştırın. (${phrases.length} cümle, ~${phrases.join('').length} karakter kota harcar.)`);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
const manifestPath = `${OUT}manifest.json`;
const manifest = existsSync(manifestPath) && !force ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { clips: {} };
const save = () => writeFileSync(manifestPath, `${JSON.stringify({ voice: VOICE, model: MODEL, settings: VOICE_SETTINGS, clips: manifest.clips }, null, 2)}\n`);

let made = 0;
for (const text of phrases) {
  const file = `${createHash('sha1').update(`${VOICE}|${text}`).digest('hex').slice(0, 12)}.mp3`;
  if (!force && manifest.clips[text] === file && existsSync(OUT + file)) continue;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: VOICE_SETTINGS }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    save();
    console.error(`HATA ${res.status} "${text}": ${(await res.text()).slice(0, 300)}`);
    console.error(`${made} klip üretildi; sorun giderilince tekrar çalıştırın, kalanlardan devam eder.`);
    process.exit(1);
  }
  writeFileSync(OUT + file, Buffer.from(await res.arrayBuffer()));
  manifest.clips[text] = file;
  made++;
  console.log(`✓ ${text}`);
  await new Promise((r) => setTimeout(r, 400));
}
save();
console.log(`\nBitti: ${made} yeni klip, toplam ${Object.keys(manifest.clips).length} (${OUT}). web/public/ai-voice/ klasörünü commit edin.`);
