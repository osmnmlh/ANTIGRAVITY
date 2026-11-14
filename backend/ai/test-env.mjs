// One command for a complete AI test environment: the relay (with the AI module + Gemini if backend/.env has a key)
// and the web dev server, reachable from other devices in the same network.
//
//   node --experimental-strip-types backend/ai/test-env.mjs            (from the repo root)
//   node --experimental-strip-types backend/ai/test-env.mjs --no-web   (relay only)
//
// Prints the cockpit page and one phone link per astronaut. Ctrl+C stops everything.

import { spawn, spawnSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const WEB_PORT = Number(process.env.WEB_PORT ?? 5174);
const RELAY_PORT = Number(process.env.PORT ?? 8787);
const withWeb = !process.argv.includes('--no-web');

// A phone can only reach the real Wi-Fi / Ethernet address, not VirtualBox, Hyper-V, WSL or Docker adapters.
const VIRTUAL = /virtual|vethernet|vmware|vbox|docker|wsl|hyper-v|bluetooth|loopback|tailscale|zerotier/i;
const lan = Object.entries(networkInterfaces())
  .flatMap(([name, list]) => (list ?? []).map((i) => ({ name, address: i.address, family: i.family, internal: i.internal })))
  .filter((i) => i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.'))
  .map((i) => ({ ...i, rank: /wi-?fi|wlan|wireless|^en0$/i.test(i.name) ? 0 : VIRTUAL.test(i.name) || i.address.startsWith('192.168.56.') ? 9 : 1 }))
  .sort((a, b) => a.rank - b.rank);
const host = lan[0]?.address ?? 'localhost';

const crew = JSON.parse(readFileSync(`${root}shared/mock/all-data.json`, 'utf8')).astronauts;
const children = [];

function start(name, command, args, options) {
  const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], ...options });
  const tag = `[${name}] `;
  const pipe = (stream) => stream.on('data', (d) => String(d).split('\n').filter((l) => l.trim() && !/ExperimentalWarning|trace-warnings/.test(l)).forEach((l) => console.log(tag + l)));
  pipe(child.stdout);
  pipe(child.stderr);
  child.on('exit', (code) => console.log(`${tag}stopped (${code})`));
  children.push(child);
  return child;
}

function stopAll() {
  for (const c of children) {
    if (c.exitCode !== null) continue;
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F']);
    else c.kill('SIGTERM');
  }
  process.exit(0);
}
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

start('relay', process.execPath, ['--experimental-strip-types', 'backend/server.mjs'], { env: { ...process.env, PORT: String(RELAY_PORT) } });
if (withWeb) {
  start('web', `npm run dev -- --host --port ${WEB_PORT} --strictPort`, [], { cwd: `${root}web`, shell: true });
}

setTimeout(() => {
  const line = '─'.repeat(78);
  console.log(`\n${line}\n ANTIGRAVITY AI test environment\n${line}`);
  console.log(` Relay health   http://localhost:${RELAY_PORT}/api/health   (gemini: true = key found in backend/.env)`);
  if (withWeb) {
    console.log(` Ana uygulama   http://localhost:${WEB_PORT}/            (web ekibinin arayüzü, AI bileşenleri bağlı)`);
    console.log(` AI sandbox     http://localhost:${WEB_PORT}/ai-preview.html`);
    console.log(' Telefonlar (aynı Wi-Fi\'daki gerçek telefonda veya yeni sekmede aç):');
    for (const c of crew) console.log(`   ${c.fullName.padEnd(22)} http://${host}:${WEB_PORT}/phone.html?crewId=${c.astronautId}`);
    if (lan.length > 1) console.log(` Diğer ağ adresleri: ${lan.slice(1).map((i) => `${i.address} (${i.name})`).join(', ')}`);
    console.log(` Kullanılan adres: ${host}${lan[0] ? ` (${lan[0].name})` : ''}`);
  }
  console.log(` Telefon açılmıyorsa: Windows güvenlik duvarı ${WEB_PORT} ve ${RELAY_PORT} portlarına izin vermeli; ayni Wi-Fi'da olun.`);
  console.log(`${line}\n`);
}, 4000);
