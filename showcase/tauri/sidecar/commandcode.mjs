// Command Code's Provider API (commandcode.ai/docs/provider): one key for every top model, served in both OpenAI
// Chat Completions and Anthropic Messages shapes. gg-core doesn't ship it, so the provider, its transport and a
// starter model list are registered here; catalogs.mjs keeps the live list from /provider/v1/models up to date.
import { AUTH_PROVIDERS, setProviderCatalog } from '@kenkaiiii/gg-core';
import { providerRegistry } from '@kenkaiiii/gg-ai';

export const VALUE = 'command-code';
export const LABEL = 'Command Code';
export const OPENAI_BASE_URL = 'https://api.commandcode.ai/provider/v1';
// Anthropic's SDK appends /v1/messages itself, so Claude models stop at /provider.
export const ANTHROPIC_BASE_URL = 'https://api.commandcode.ai/provider';
export const MODELS_URL = `${OPENAI_BASE_URL}/models`;
export const KEY_PAGE = 'https://commandcode.ai/settings/keys';

// Model ids are namespaced (like local/ and opencode/) so Command Code's claude-haiku-5-5 can sit beside Anthropic's
// own: gg-core keeps one model per id. The wire id is what the request sends, without the namespace.
export const WIRE_PREFIX = `${VALUE}/`;
export const wireModel = (id) => String(id ?? '').replace(/^command-code\//, '');
const modelId = (wire) => `${WIRE_PREFIX}${wire}`;

// Claude models answer only on /v1/messages; everything else on /v1/chat/completions (the list's supported_endpoints).
export const isClaude = (wire) => /^claude[-/]/i.test(String(wire ?? ''));
export const routeFor = (id) => (isClaude(wireModel(id)) ? 'anthropic' : 'openai');

// Delegate to the same OpenAI and Anthropic stream functions gg-ai registers for its own providers, with Command
// Code's base URL. The wrapper runs after gg-ai loads, so both are registered by now.
const openaiStream = providerRegistry.get('deepseek')?.stream;
const anthropicStream = providerRegistry.get('anthropic')?.stream;
export function commandCodeStream(options) {
  const model = wireModel(options.model);
  if (isClaude(model)) {
    return anthropicStream({ ...options, provider: 'anthropic', model, baseUrl: ANTHROPIC_BASE_URL, webSearch: false });
  }
  return openaiStream({ ...options, provider: VALUE, model, baseUrl: OPENAI_BASE_URL, webSearch: false });
}
providerRegistry.register(VALUE, { stream: commandCodeStream });

// The setup guide's card and the panel's account row read these fields (providers.mjs keyCards, sidekick's state).
if (!AUTH_PROVIDERS.some((p) => p.value === VALUE)) {
  AUTH_PROVIDERS.push({
    value: VALUE,
    label: LABEL,
    description: 'Every top model, one API',
    methods: ['apikey'],
    apiKeyLabel: LABEL,
    methodDetails: {
      apikey: {
        method: 'apikey',
        label: 'Command Code API key',
        billing: 'Pay-per-token, metered against your Command Code plan.',
        when: 'Every plan except Go.',
      },
    },
  });
}

/** One row from GET /provider/v1/models → ModelInfo. The list doesn't say which models see images or think, so every
 *  model is offered (Roamies only lists models that see images) with thinking off. */
export function modelInfo(row) {
  const ctx = Math.max(8_000, Number(row?.context_length) || 200_000);
  const name = String(row?.name ?? row?.id ?? '').trim();
  return {
    id: modelId(String(row?.id ?? '').trim()),
    name: name || String(row?.id ?? ''),
    provider: VALUE,
    contextWindow: ctx,
    maxOutputTokens: Math.max(1024, Math.min(64_000, Math.floor(ctx / 4))),
    supportsThinking: false,
    supportsImages: true,
    supportsVideo: false,
    costTier: 'medium',
    maxThinkingLevel: 'off',
  };
}

/** GET /provider/v1/models → ModelInfo[]; rows without an id and repeats are dropped. */
export function parseCommandCodeCatalog(body) {
  const rows = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const wire = String(row?.id ?? '').trim();
    if (!wire || seen.has(wire)) continue;
    seen.add(wire);
    out.push(modelInfo({ ...row, id: wire }));
  }
  return out;
}

// A few known models so the provider works before the first list is fetched, and offline the first time.
export const FALLBACK_MODELS = [
  ['gpt-6-luna', 'GPT-6 Luna', 1_050_000],
  ['gpt-6-sol', 'GPT-6 Sol', 1_050_000],
  ['claude-haiku-5-5', 'Claude Haiku 5.5', 1_000_000],
  ['claude-sonnet-5-5', 'Claude Sonnet 5.5', 1_000_000],
  ['google/gemini-3.8-flash', 'Gemini 3.8 Flash', 1_000_000],
  ['deepseek/deepseek-v4-pro', 'DeepSeek V4 Pro', 1_000_000],
  ['moonshotai/Kimi-K3', 'Kimi K3', 1_000_000],
  ['Qwen/Qwen3.8-Max', 'Qwen 3.8 Max', 1_000_000],
].map(([id, name, contextWindow]) => modelInfo({ id, name, context_length: contextWindow }));
setProviderCatalog(VALUE, FALLBACK_MODELS);
