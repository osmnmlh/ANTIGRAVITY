// Optional extra channel: push to phones that are LOCKED or have the app closed, through ntfy.sh
// (the phone installs the free "ntfy" app and subscribes to a topic). Off unless NTFY_TOPIC is set.
//
// Privacy: ntfy.sh topics are public to anyone who knows the name. Use a long random topic name and demo data only.
// One topic per astronaut (`<NTFY_TOPIC>-crew-1`), so a crew alert never reaches somebody else's phone.
// Subscribe the phone of crew-1 to:  <NTFY_TOPIC>-crew-1

export function createNtfy({ topic = process.env.NTFY_TOPIC, server = process.env.NTFY_SERVER || 'https://ntfy.sh', fetchImpl = fetch, log = console } = {}) {
  const enabled = Boolean(topic);

  /** Sends one notification per affected astronaut. Never throws; failures are only logged. */
  async function send(alert) {
    if (!enabled) return [];
    const results = await Promise.allSettled(alert.crewIds.map(async (crewId) => {
      const res = await fetchImpl(server, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // JSON publishing keeps Turkish characters intact (HTTP headers would not).
        body: JSON.stringify({
          topic: `${topic}-${crewId}`,
          title: `${alert.severity === 'red' ? '🔴 KRİTİK' : '🟠 DİKKAT'} · ${alert.title}`,
          message: alert.spokenText,
          priority: alert.severity === 'red' ? 5 : 4,
          tags: [alert.severity === 'red' ? 'rotating_light' : 'warning'],
        }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) throw new Error(`ntfy HTTP ${res.status}`);
      return crewId;
    }));
    for (const r of results) if (r.status === 'rejected') log.warn?.(`[ai] ntfy: ${r.reason.message}`);
    return results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  }

  return { enabled, topic: topic ?? null, send };
}
