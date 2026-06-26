import { describe, expect, it } from 'vitest';

import {
  BYOK_OPENCODE_API_KEY_ENV,
  BYOK_OPENCODE_PROVIDER_ID,
  buildOpenCodeByokProviderConfig,
  opencodeByokModelId,
} from '../../src/runtimes/byok-opencode.js';

describe('byok-opencode runtime config', () => {
  it('prefixes raw BYOK models with the run-scoped OpenCode provider id', () => {
    expect(opencodeByokModelId('gpt-4o-mini')).toBe('open-design-byok/gpt-4o-mini');
    expect(opencodeByokModelId('open-design-byok/gpt-4o-mini')).toBe('open-design-byok/gpt-4o-mini');
    expect(opencodeByokModelId('default')).toBeNull();
  });

  it('builds OpenAI-compatible provider config without embedding the secret in JSON', () => {
    const out = buildOpenCodeByokProviderConfig(
      {
        protocol: 'senseaudio',
        apiKey: 'sk-secret',
        baseUrl: 'https://api.senseaudio.cn',
      },
      'deepseek-v4-flash',
    );

    expect(out?.modelId).toBe('open-design-byok/deepseek-v4-flash');
    expect(out?.env).toEqual({ [BYOK_OPENCODE_API_KEY_ENV]: 'sk-secret' });
    expect(JSON.stringify(out?.config)).not.toContain('sk-secret');
    expect(out?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/openai-compatible',
          options: {
            baseURL: 'https://api.senseaudio.cn',
            apiKey: `{env:${BYOK_OPENCODE_API_KEY_ENV}}`,
          },
          models: {
            'deepseek-v4-flash': {
              name: 'deepseek-v4-flash',
              limit: {
                context: 128_000,
                output: 16_384,
              },
            },
          },
        },
      },
    });
  });

  it('maps native OpenAI BYOK to the OpenAI provider package', () => {
    const out = buildOpenCodeByokProviderConfig(
      { protocol: 'openai', apiKey: 'sk-openai', baseUrl: 'https://api.openai.com/v1' },
      'gpt-5.5',
    );

    expect(out?.modelId).toBe('open-design-byok/gpt-5.5');
    expect(out?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/openai',
          options: {
            baseURL: 'https://api.openai.com/v1',
            apiKey: `{env:${BYOK_OPENCODE_API_KEY_ENV}}`,
          },
          models: {
            'gpt-5.5': {
              name: 'gpt-5.5',
            },
          },
        },
      },
    });
  });

  it('normalizes origin-only native provider base URLs for OpenCode provider packages', () => {
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'anthropic', apiKey: 'sk-ant', baseUrl: 'https://api.anthropic.com' },
      'claude-sonnet-4-5',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/anthropic',
          options: { baseURL: 'https://api.anthropic.com/v1' },
        },
      },
    });
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'google', apiKey: 'AIza', baseUrl: 'https://generativelanguage.googleapis.com/' },
      'gemini-3.5-flash',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/google',
          options: { baseURL: 'https://generativelanguage.googleapis.com/v1beta' },
        },
      },
    });
  });

  it('maps other BYOK protocols to provider packages', () => {
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'anthropic', apiKey: 'sk-ant', baseUrl: 'https://api.anthropic.com' },
      'claude-sonnet-4-5',
    )?.config).toMatchObject({
      provider: { [BYOK_OPENCODE_PROVIDER_ID]: { npm: '@ai-sdk/anthropic' } },
    });
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'google', apiKey: 'AIza', baseUrl: 'https://generativelanguage.googleapis.com' },
      'gemini-2.5-flash',
    )?.config).toMatchObject({
      provider: { [BYOK_OPENCODE_PROVIDER_ID]: { npm: '@ai-sdk/google' } },
    });
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'azure', apiKey: 'azure-key', baseUrl: 'https://example.openai.azure.com', apiVersion: '2024-10-21' },
      'gpt-4o',
    )?.config).toMatchObject({
      provider: { [BYOK_OPENCODE_PROVIDER_ID]: { npm: '@ai-sdk/azure' } },
    });
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'ollama', apiKey: 'ollama-key', baseUrl: 'https://ollama.com' },
      'gpt-oss:20b',
    )?.config).toMatchObject({
      provider: { [BYOK_OPENCODE_PROVIDER_ID]: { npm: '@ai-sdk/ollama' } },
    });
  });
});
