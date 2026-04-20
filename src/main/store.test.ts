import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultStoreSchema, migrateLegacyClawBotDefaults } from './store';

describe('store defaults', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses BYOK OpenRouter defaults for first-run provider settings', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'local-openrouter-key');

    const defaults = createDefaultStoreSchema();

    expect(defaults.clawbot).toEqual({
      url: 'https://openrouter.ai/api/v1',
      token: '',
      provider: 'openrouter',
      model: 'google/gemma-4-31b-it:free',
    });
  });

  it('migrates untouched legacy OpenClaw defaults before onboarding is completed', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'local-openrouter-key');
    const values: Record<string, unknown> = {
      'onboarding.completed': false,
      'onboarding.skipped': false,
      'clawbot.url': 'http://127.0.0.1:18789',
      'clawbot.token': '',
      'clawbot.provider': 'openclaw',
      'clawbot.model': 'openclaw',
    };
    const store = {
      get: vi.fn((key: string) => values[key]),
      set: vi.fn((key: string, value: unknown) => {
        values[key] = value;
      }),
    };

    migrateLegacyClawBotDefaults(store);

    expect(store.set).toHaveBeenCalledWith('clawbot.url', 'https://openrouter.ai/api/v1');
    expect(store.set).toHaveBeenCalledWith('clawbot.token', '');
    expect(store.set).toHaveBeenCalledWith('clawbot.provider', 'openrouter');
    expect(store.set).toHaveBeenCalledWith('clawbot.model', 'google/gemma-4-31b-it:free');
  });

  it('migrates untouched legacy OpenClaw defaults even after onboarding was completed', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'local-openrouter-key');
    const values: Record<string, unknown> = {
      'onboarding.completed': true,
      'onboarding.skipped': false,
      'clawbot.url': 'http://127.0.0.1:18789',
      'clawbot.token': '',
      'clawbot.provider': 'openclaw',
      'clawbot.model': 'openclaw',
    };
    const store = {
      get: vi.fn((key: string) => values[key]),
      set: vi.fn((key: string, value: unknown) => {
        values[key] = value;
      }),
    };

    migrateLegacyClawBotDefaults(store);

    expect(store.set).toHaveBeenCalledWith('clawbot.url', 'https://openrouter.ai/api/v1');
    expect(store.set).toHaveBeenCalledWith('clawbot.token', '');
    expect(store.set).toHaveBeenCalledWith('clawbot.provider', 'openrouter');
    expect(store.set).toHaveBeenCalledWith('clawbot.model', 'google/gemma-4-31b-it:free');
  });

  it('migrates legacy base URL when new provider defaults were merged into old settings', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'local-openrouter-key');
    const values: Record<string, unknown> = {
      'onboarding.completed': true,
      'onboarding.skipped': false,
      'clawbot.url': 'http://127.0.0.1:18789',
      'clawbot.token': 'local-openrouter-key',
      'clawbot.provider': 'openai-compatible',
      'clawbot.model': 'minimax/minimax-m2.5:free',
    };
    const store = {
      get: vi.fn((key: string) => values[key]),
      set: vi.fn((key: string, value: unknown) => {
        values[key] = value;
      }),
    };

    migrateLegacyClawBotDefaults(store);

    expect(store.set).toHaveBeenCalledWith('clawbot.url', 'https://openrouter.ai/api/v1');
    expect(store.set).toHaveBeenCalledWith('clawbot.token', '');
    expect(store.set).toHaveBeenCalledWith('clawbot.provider', 'openrouter');
    expect(store.set).toHaveBeenCalledWith('clawbot.model', 'google/gemma-4-31b-it:free');
  });

  it('updates the previous OpenRouter default model without replacing the saved token', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'local-openrouter-key');
    const values: Record<string, unknown> = {
      'onboarding.completed': true,
      'onboarding.skipped': false,
      'clawbot.url': 'https://openrouter.ai/api/v1',
      'clawbot.token': 'user-openrouter-key',
      'clawbot.provider': 'openrouter',
      'clawbot.model': 'minimax/minimax-m2.5:free',
    };
    const store = {
      get: vi.fn((key: string) => values[key]),
      set: vi.fn((key: string, value: unknown) => {
        values[key] = value;
      }),
    };

    migrateLegacyClawBotDefaults(store);

    expect(store.set).toHaveBeenCalledTimes(1);
    expect(store.set).toHaveBeenCalledWith('clawbot.model', 'google/gemma-4-31b-it:free');
  });

  it('migrates customized legacy OpenClaw setups to OpenRouter defaults', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'local-openrouter-key');
    const values: Record<string, unknown> = {
      'onboarding.completed': true,
      'onboarding.skipped': false,
      'clawbot.url': 'http://127.0.0.1:18789',
      'clawbot.token': 'custom-local-token',
      'clawbot.provider': 'openclaw',
      'clawbot.model': 'openclaw',
    };
    const store = {
      get: vi.fn((key: string) => values[key]),
      set: vi.fn((key: string, value: unknown) => {
        values[key] = value;
      }),
    };

    migrateLegacyClawBotDefaults(store);

    expect(store.set).toHaveBeenCalledWith('clawbot.url', 'https://openrouter.ai/api/v1');
    expect(store.set).toHaveBeenCalledWith('clawbot.token', '');
    expect(store.set).toHaveBeenCalledWith('clawbot.provider', 'openrouter');
    expect(store.set).toHaveBeenCalledWith('clawbot.model', 'google/gemma-4-31b-it:free');
  });
});
