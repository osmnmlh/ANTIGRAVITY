// Alert store, device registry and the filtered SSE hub (shared/contracts/ai.md sections 2-4).

const RANK = { amber: 1, red: 2 };

export function createAlertStore({ now, cooldownMs, disclaimer }) {
  const alerts = new Map();       // id → Alert
  const activeByKey = new Map();  // firing key → alert id
  const lastCreated = new Map();  // firing key → { at, severity }
  let seq = 0;

  const stamp = () => now().toISOString();
  const active = () => [...alerts.values()].filter((a) => a.state === 'active');

  function create(f, devicesFor) {
    const at = stamp();
    const alert = {
      id: `alert-${String(++seq).padStart(4, '0')}`,
      scope: f.scope, crewIds: f.crewIds, severity: f.severity,
      scenarioId: f.scenarioId, hazardId: f.hazardId,
      title: f.title, spokenText: f.spokenText, metrics: f.metrics,
      advice: { ...f.advice, source: 'fallback', model: null, generatedAt: at },
      deliveries: devicesFor(f.crewIds).map((d) => ({ deviceId: d.deviceId, crewId: d.crewId, deliveredAt: null, ackedAt: null })),
      cockpitAckedAt: null,
      state: 'active', createdAt: at, updatedAt: at, disclaimer,
    };
    alerts.set(alert.id, alert);
    activeByKey.set(f.key, alert.id);
    lastCreated.set(f.key, { at: now().getTime(), severity: f.severity });
    return alert;
  }

  function resolve(key) {
    const alert = alerts.get(activeByKey.get(key));
    activeByKey.delete(key);
    alert.state = 'resolved';
    alert.updatedAt = stamp();
    return alert;
  }

  /** Turns the current rule firings into new / changed / resolved alerts. Only status transitions create alerts. */
  function reconcile(firings, devicesFor) {
    const created = [];
    const updated = [];
    const seen = new Set();
    for (const f of firings) {
      seen.add(f.key);
      const current = alerts.get(activeByKey.get(f.key));
      if (current) {
        if (RANK[f.severity] > RANK[current.severity]) {
          updated.push(resolve(f.key));          // escalation amber → red is a new alert, so it notifies again
          created.push(create(f, devicesFor));
        } else if (JSON.stringify(f.metrics) !== JSON.stringify(current.metrics) || f.severity !== current.severity) {
          Object.assign(current, { severity: f.severity, metrics: f.metrics, title: f.title, spokenText: f.spokenText, updatedAt: stamp() });
          updated.push(current);                 // same problem, new numbers: update quietly
        }
        continue;
      }
      const last = lastCreated.get(f.key);
      const coolingDown = last && now().getTime() - last.at < cooldownMs && RANK[f.severity] <= RANK[last.severity];
      if (!coolingDown) created.push(create(f, devicesFor));
    }
    for (const key of [...activeByKey.keys()]) if (!seen.has(key)) updated.push(resolve(key));
    return { created, updated };
  }

  function mark(id, { deviceId, by }, field) {
    const alert = alerts.get(id);
    if (!alert) throw Object.assign(new Error(`unknown alert: ${id}`), { status: 404 });
    const at = stamp();
    if (by === 'cockpit' && field === 'ackedAt') {
      alert.cockpitAckedAt ??= at;
    } else {
      const d = alert.deliveries.find((x) => x.deviceId === deviceId);
      if (!d) throw new Error(`device ${deviceId} is not a recipient of ${id}`);
      d.deliveredAt ??= at;                     // an ack implies delivery
      if (field === 'ackedAt') d.ackedAt ??= at;
    }
    alert.updatedAt = at;
    return alert;
  }

  /** A phone that registers late still gets the active alerts meant for it. */
  function addRecipient(device) {
    const changed = [];
    for (const a of active()) {
      if (a.crewIds.includes(device.crewId) && !a.deliveries.some((d) => d.deviceId === device.deviceId)) {
        a.deliveries.push({ deviceId: device.deviceId, crewId: device.crewId, deliveredAt: null, ackedAt: null });
        a.updatedAt = stamp();
        changed.push(a);
      }
    }
    return changed;
  }

  function list({ crewId, state } = {}) {
    return [...alerts.values()]
      .filter((a) => (!crewId || a.crewIds.includes(crewId)) && (!state || a.state === state))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  function clear() {
    alerts.clear();
    activeByKey.clear();
    lastCreated.clear();
  }

  /** Replaces the advice of a still-active alert (Gemini wording arrives after the deterministic one). */
  function setAdvice(id, advice) {
    const alert = alerts.get(id);
    if (!alert || alert.state !== 'active') return null;
    alert.advice = advice;
    alert.updatedAt = stamp();
    return alert;
  }

  return {
    reconcile, delivered: (id, b) => mark(id, b, 'deliveredAt'), ack: (id, b) => mark(id, b, 'ackedAt'),
    addRecipient, setAdvice, get: (id) => alerts.get(id), list, active, clear,
  };
}

export function createDevices({ now }) {
  const devices = new Map();
  let isOnline = () => false;

  function register({ deviceId, crewId, platform = 'ios', name = null }) {
    if (typeof deviceId !== 'string' || !deviceId) throw new Error('deviceId is required');
    if (typeof crewId !== 'string' || !crewId) throw new Error('crewId is required');
    const device = { deviceId, crewId, platform, name, lastSeen: now().toISOString() };
    devices.set(deviceId, device);
    return device;
  }

  return {
    register,
    touch: (deviceId) => { const d = devices.get(deviceId); if (d) d.lastSeen = now().toISOString(); },
    has: (deviceId) => devices.has(deviceId),
    forCrew: (crewIds) => [...devices.values()].filter((d) => crewIds.includes(d.crewId)),
    list: () => [...devices.values()].map((d) => ({ ...d, online: isOnline(d.deviceId) })),
    setOnlineCheck: (fn) => { isOnline = fn; },
  };
}

/** SSE clients. A client with a crewId only gets alerts that include that crewId; the cockpit (no crewId) gets all. */
export function createHub() {
  const clients = new Set();
  let onChange = () => {};
  const ping = setInterval(() => { for (const c of clients) c.res.write(': ping\n\n'); }, 20_000);
  ping.unref?.();

  const write = (c, event, data) => c.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const wants = (c, alert) => !c.crewId || alert.crewIds.includes(c.crewId);

  return {
    add(req, res, { crewId, deviceId }, hello) {
      // x-accel-buffering: a proxy (Render) must not hold the events back; every alert has to arrive the moment it is written.
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.flushHeaders?.();
      const c = { res, crewId, deviceId };
      clients.add(c);
      req.on('close', () => { clients.delete(c); onChange(); });
      write(c, 'hello', hello(c));
      onChange();
      return c;
    },
    /** Called whenever a stream connects or drops, so the cockpit can show which phones are online. */
    setOnChange: (fn) => { onChange = fn; },
    /** Writes to every stream that wants this alert. Returns the deviceIds that were written to (the phones reached). */
    alert(event, alert) {
      const reached = [];
      for (const c of clients) {
        if (!wants(c, alert)) continue;
        write(c, event, alert);
        if (c.deviceId) reached.push(c.deviceId);
      }
      return reached;
    },
    all(event, dataFor) { for (const c of clients) write(c, event, dataFor(c)); },
    isOnline: (deviceId) => [...clients].some((c) => c.deviceId === deviceId),
    size: () => clients.size,
    filterAlerts: (c, alerts) => alerts.filter((a) => wants(c, a)),
  };
}
