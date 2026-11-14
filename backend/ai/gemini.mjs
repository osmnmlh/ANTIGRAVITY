// One place that talks to the Gemini REST API (server-side only, the key never leaves the backend).
// Used by chat.mjs and advice.mjs. No SDK, plain fetch.

// gemini-2.5-flash is closed to new API keys (HTTP 404). The big flash models answered 503 / timed out on the day we tested,
// the lite alias answered in about 1.5 s, so it is the default. Override with GEMINI_MODEL.
export const DEFAULT_MODEL = 'gemini-flash-lite-latest';
export const DEFAULT_DEADLINE_MS = 8_000;

/**
 * Calls generateContent and returns the parsed JSON object the model produced.
 * One retry on 503/429 ("high demand", usually answered by the next try), all inside one deadline.
 * Throws on any failure; callers fall back to their deterministic text.
 */
export async function callGemini({
  apiKey, model = DEFAULT_MODEL, system, contents, schema, temperature = 0.3,
  deadlineMs = DEFAULT_DEADLINE_MS, fetchImpl = fetch,
}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const signal = AbortSignal.timeout(deadlineMs);
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { temperature, responseMimeType: 'application/json', responseSchema: schema },
  });

  let res;
  for (let attempt = 1; ; attempt++) {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body,
      signal,
    });
    if (res.ok || attempt >= 2 || ![429, 503].includes(res.status)) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
}
