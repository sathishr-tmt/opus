// Provider-agnostic LLM access with automatic failover.
//
// Order of attempts:
//   1. Google Gemini  (GEMINI_API_KEY)  — handles PDFs natively
//   2. Groq           (GROQ_API_KEY)    — text only, very fast, generous free tier
//
// Callers get one function, llmJson(). If every configured provider fails it
// throws, and the caller falls back to a deterministic non-AI path. This is
// what stops a single provider outage from breaking Rewrite entirely.
import { geminiConfigured, geminiJson } from './gemini.js';

const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

function groqConfigured() {
  return Boolean(process.env.GROQ_API_KEY);
}

function anyLlmConfigured() {
  return geminiConfigured() || groqConfigured();
}

async function groqJson(prompt) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY is not set.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Groq HTTP ${response.status}: ${text.slice(0, 300)}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '';

    try {
      return JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error('Groq did not return valid JSON.');
    }
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Ask whichever provider is available for a JSON response.
 *
 * @param {string} prompt      The instruction text.
 * @param {Array}  geminiParts Extra Gemini parts (e.g. an inline PDF).
 * @param {string} plainText   Text version of the same document, for providers
 *                             that cannot accept files. Appended to the prompt.
 * @returns {Promise<{data:object, provider:string}>}
 */
async function llmJson(prompt, geminiParts = [], plainText = '') {
  const errors = [];

  if (geminiConfigured()) {
    try {
      const data = await geminiJson(prompt, geminiParts);
      return { data, provider: 'gemini' };
    } catch (error) {
      errors.push(`gemini: ${error.message}`);
      console.error('LLM: Gemini failed —', error.message);
    }
  }

  if (groqConfigured()) {
    try {
      const combined = plainText
        ? `${prompt}\n\nDOCUMENT TEXT:\n${plainText.slice(0, 24000)}`
        : prompt;
      const data = await groqJson(combined);
      return { data, provider: 'groq' };
    } catch (error) {
      errors.push(`groq: ${error.message}`);
      console.error('LLM: Groq failed —', error.message);
    }
  }

  throw new Error(
    errors.length ? errors.join(' | ') : 'No LLM provider is configured.'
  );
}

export { llmJson, anyLlmConfigured, groqConfigured };
