// Command Code, a provider gg-core doesn't ship: its registration, transport routing and live list. Run: npm test
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AUTH_PROVIDERS, getModel, getModelsForProvider, setProviderCatalog } from '@kenkaiiii/gg-core';
import { providerRegistry } from '@kenkaiiii/gg-ai';

// The transports command-code delegates to, faked before it captures them at import.
const seen = [];
providerRegistry.register('deepseek', { stream: (o) => { seen.push(['openai', o]); return 'openai'; } });
providerRegistry.register('anthropic', { stream: (o) => { seen.push(['anthropic', o]); return 'anthropic'; } });

const cc = await import('../commandcode.mjs');
const { keyCards } = await import('../providers.mjs');

assert.ok(AUTH_PROVIDERS.some((p) => p.value === cc.VALUE), 'the setup guide and panel list it');
assert.equal(keyCards(AUTH_PROVIDERS, () => false).find((k) => k.id === cc.VALUE).name, 'Command Code');
assert.ok(providerRegistry.has(cc.VALUE), 'its transport is registered');
assert.equal(cc.MODELS_URL, 'https://api.commandcode.ai/provider/v1/models');

// Claude answers on /v1/messages, everything else on /v1/chat/completions, and each gets its own base URL.
assert.equal(cc.routeFor('command-code/claude-haiku-5-5'), 'anthropic');
assert.equal(cc.routeFor('command-code/deepseek/deepseek-v4-flash'), 'openai');
assert.equal(cc.commandCodeStream({ provider: cc.VALUE, model: 'command-code/claude-haiku-5-5', apiKey: 'k' }), 'anthropic');
assert.deepEqual(seen.at(-1), ['anthropic', { provider: 'anthropic', model: 'claude-haiku-5-5', apiKey: 'k', baseUrl: cc.ANTHROPIC_BASE_URL, webSearch: false }]);
assert.equal(cc.commandCodeStream({ provider: cc.VALUE, model: 'command-code/Qwen/Qwen3.8-Max', apiKey: 'k' }), 'openai');
assert.deepEqual(seen.at(-1), ['openai', { provider: cc.VALUE, model: 'Qwen/Qwen3.8-Max', apiKey: 'k', baseUrl: cc.OPENAI_BASE_URL, webSearch: false }]);
assert.equal(cc.wireModel('Qwen/Qwen3.8-Max'), 'Qwen/Qwen3.8-Max', 'an id without the namespace is left alone');

// The list's rows become namespaced ModelInfo rows; repeats and rows without an id are dropped.
const parsed = cc.parseCommandCodeCatalog({ data: [
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', context_length: 1_000_000, supported_endpoints: ['/messages'] },
  { id: 'gpt-6-luna', name: 'GPT-6 Luna', context_length: 1_050_000, supported_endpoints: ['/chat/completions', '/responses'] },
  { id: 'gpt-6-luna', name: 'GPT-6 Luna again' },
  { name: 'no id' },
] });
assert.deepEqual(parsed.map((m) => m.id), ['command-code/claude-haiku-5-5', 'command-code/gpt-6-luna']);
assert.deepEqual(parsed.map((m) => m.name), ['Claude Haiku 5.5', 'GPT-6 Luna']);
assert.ok(parsed.every((m) => m.provider === cc.VALUE && m.supportsImages && m.contextWindow >= 8_000));

// A few known models ship with it, so it works before the first list arrives.
assert.equal(getModelsForProvider(cc.VALUE).length, cc.FALLBACK_MODELS.length);
assert.equal(getModel('command-code/gpt-6-luna').provider, cc.VALUE, 'namespaced ids stay distinct from OpenAI’s');

// The live list replaces the starter one and survives a restart offline.
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'roamies-commandcode-'));
const { createCatalogs } = await import('../catalogs.mjs');
const body = { object: 'list', data: [
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', context_length: 1_000_000 },
  { id: 'gpt-6-luna', name: 'GPT-6 Luna', context_length: 1_050_000 },
] };
const calls = [];
const online = createCatalogs({
  auth: { getCredentials: async () => null }, dir,
  fetch: async (url) => { calls.push(url); return { ok: true, status: 200, json: async () => body }; },
});
assert.equal(await online.refresh(cc.VALUE), true, 'the live list changed the menu');
assert.deepEqual(calls, [cc.MODELS_URL]);
assert.deepEqual(getModelsForProvider(cc.VALUE).map((m) => m.id), ['command-code/claude-haiku-5-5', 'command-code/gpt-6-luna']);
await (await import('../store.mjs')).flushWrites();
const cached = JSON.parse(await fs.readFile(path.join(dir, 'command-code-models.json'), 'utf8'));
assert.equal(cached.url, cc.MODELS_URL);

setProviderCatalog(cc.VALUE, undefined);
const offline = createCatalogs({ auth: { getCredentials: async () => null }, dir, fetch: async () => { throw new Error('offline'); } });
await offline.load();
assert.deepEqual(getModelsForProvider(cc.VALUE).map((m) => m.id), ['command-code/claude-haiku-5-5', 'command-code/gpt-6-luna'], 'the cached list comes back');

await fs.rm(dir, { recursive: true, force: true });
console.log('command code ok');
