// Minimal Google Gemini (Generative Language API) client using fetch.
// Key + model come from the environment so nothing is hard-coded.
// gemini-2.0-flash was retired on 3 March 2026 — calls to it now 404.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function geminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

async function callGemini(parts, { json = false } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set.');

  // New-format Gemini "Auth keys" (AQ.Ab...) authenticate with the
  // x-goog-api-key header; the legacy ?key= parameter was for AIza keys.
  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent`;
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.4,
      ...(json ? { responseMimeType: 'application/json' } : {})
    }
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Gemini HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    const data = await response.json();
    const parts0 = data && data.candidates && data.candidates[0] &&
      data.candidates[0].content && data.candidates[0].content.parts;
    return Array.isArray(parts0) ? parts0.map((p) => p.text || '').join('') : '';
  } finally {
    clearTimeout(timeout);
  }
}

async function geminiText(prompt, extraParts = []) {
  return callGemini([{ text: prompt }, ...extraParts]);
}

async function geminiJson(prompt, extraParts = []) {
  const raw = await callGemini([{ text: prompt }, ...extraParts], { json: true });
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Gemini did not return valid JSON.');
  }
}

export { geminiConfigured, geminiText, geminiJson };
