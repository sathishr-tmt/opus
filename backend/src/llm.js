// Provider-agnostic LLM access with automatic failover.
//
// Order of attempts:
//   1. Google Gemini  (GEMINI_API_KEY)  — handles PDFs natively
//   2. Groq           (GROQ_API_KEY)    — text only, very fast, generous free tier
//
// Callers get one function, llmJson(). If every configured provider fails it
// throws, and the caller falls back to a deterministic non-AI path. That is
// what stops a single provider outage from breaking a feature entirely.
import { geminiConfigured, geminiJson } from './gemini.js';

const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Reasoning models (gpt-oss, qwen3, deepseek-r1) put their answer in a
// `reasoning` field, ignore response_format, and wrap output in think tags.
// Detected by name so the request and the parsing both adapt.
const REASONING_MODEL = /gpt-oss|qwen3|deepseek-r1|reasoning/i.test(GROQ_MODEL);

function groqConfigured() {
  return Boolean(process.env.GROQ_API_KEY);
}

function anyLlmConfigured() {
  return geminiConfigured() || groqConfigured();
}

/**
 * Pull a JSON object out of whatever a model actually returned.
 *
 * Models wrap JSON in prose, in markdown fences, or in <think> blocks, and
 * reasoning models often emit several objects before the real answer. Scanning
 * for balanced braces and taking the LAST complete object that parses is the
 * only approach that survives all of those.
 */
function extractJson(raw) {
  if (!raw) return null;

  let text = String(raw)
    .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
    .replace(/<\|[^|]*\|>/g, ' ')
    .replace(/```json/gi, '```')
    .replace(/```/g, ' ')
    .trim();

  // Fast path: the whole thing is already JSON.
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // fall through to scanning
  }

  const candidates = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        candidates.push(text.slice(start, i + 1));
        start = -1;
      }
      if (depth < 0) depth = 0;
    }
  }

  // Later objects are more likely to be the final answer than earlier ones
  // emitted while the model was thinking.
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = JSON.parse(candidates[i]);
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length) {
        return parsed;
      }
    } catch {
      // try the next candidate
    }
  }

  return null;
}

async function groqJson(prompt) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY is not set.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  const body = {
    model: GROQ_MODEL,
    temperature: 0.4,
    messages: [
      {
        role: 'system',
        content:
          'You reply with a single valid JSON object and nothing else. ' +
          'No explanation, no markdown, no code fences.'
      },
      { role: 'user', content: prompt }
    ]
  };

  // gpt-oss models ignore response_format and can misbehave when it is set,
  // so it is only sent to models that genuinely honour it.
  if (!REASONING_MODEL) {
    body.response_format = { type: 'json_object' };
  }

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Groq HTTP ${response.status}: ${text.slice(0, 300)}`);
    }

    const data = await response.json();
    const message = data?.choices?.[0]?.message || {};

    // Reasoning models put the answer in `reasoning`; ordinary models use
    // `content`. Try every field they are known to use.
    const raw =
      message.content ||
      message.reasoning ||
      message.reasoning_content ||
      '';

    const parsed = extractJson(raw);

    if (!parsed) {
      throw new Error(
        `Groq returned no readable JSON (model ${GROQ_MODEL}). ` +
          `First 200 chars: ${String(raw).slice(0, 200)}`
      );
    }

    return parsed;
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
      if (data && typeof data === 'object') {
        return { data, provider: 'gemini' };
      }
      errors.push('gemini: empty response');
    } catch (error) {
      errors.push(`gemini: ${error.message}`);
      console.error('LLM: Gemini failed —', error.message);
    }
  }

  if (groqConfigured()) {
    try {
      // Only append the document when the prompt does not already carry it,
      // otherwise the page text is sent twice and wastes the token budget.
      const combined =
        plainText && !prompt.includes(plainText.slice(0, 200))
          ? `${prompt}\n\nDOCUMENT TEXT:\n${plainText.slice(0, 20000)}`
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
