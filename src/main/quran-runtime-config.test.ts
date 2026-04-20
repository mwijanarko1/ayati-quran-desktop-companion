import { describe, expect, it } from 'vitest';

import { createDefaultAyahLensState } from './ayah-reflection-store';
import { resolveQuranClientConfig } from './quran-runtime-config';

describe('resolveQuranClientConfig', () => {
  it('prefers setup credentials over environment defaults', () => {
    const state = createDefaultAyahLensState();
    state.quranConfig = {
      clientId: 'setup-client-id',
      encryptedClientSecret: 'encrypted-secret',
      redirectUri: 'ayati://oauth/callback',
      environment: 'prelive',
    };

    const config = resolveQuranClientConfig({
      state,
      env: {
        QURAN_CLIENT_ID: 'env-client-id',
        QURAN_CLIENT_SECRET: 'env-client-secret',
        QURAN_REDIRECT_URI: 'env://callback',
        QURAN_FOUNDATION_ENV: 'production',
      },
      decryptSecret: (value) => value === 'encrypted-secret' ? 'setup-secret' : null,
    });

    expect(config).toEqual({
      clientId: 'setup-client-id',
      clientSecret: 'setup-secret',
      redirectUri: 'ayati://oauth/callback',
      authBaseUrl: 'https://prelive-oauth2.quran.foundation',
      apiBaseUrl: 'https://apis-prelive.quran.foundation',
    });
  });

  it('falls back to env vars when setup credentials are blank', () => {
    const config = resolveQuranClientConfig({
      state: createDefaultAyahLensState(),
      env: {
        QURAN_CLIENT_ID: 'env-client-id',
        QF_CLIENT_SECRET: 'env-secret',
        QURAN_REDIRECT_URI: 'ayati://oauth/callback',
        QURAN_AUTH_BASE_URL: 'https://auth.example.test',
        QURAN_API_BASE_URL: 'https://api.example.test',
      },
      decryptSecret: () => null,
    });

    expect(config).toEqual({
      clientId: 'env-client-id',
      clientSecret: 'env-secret',
      redirectUri: 'ayati://oauth/callback',
      authBaseUrl: 'https://auth.example.test',
      apiBaseUrl: 'https://api.example.test',
    });
  });

  it('uses env-selected production endpoints when setup credentials are blank', () => {
    const config = resolveQuranClientConfig({
      state: createDefaultAyahLensState(),
      env: {
        QURAN_CLIENT_ID: 'env-client-id',
        QURAN_FOUNDATION_ENV: 'production',
      },
      decryptSecret: () => null,
    });

    expect(config.authBaseUrl).toBe('https://oauth2.quran.foundation');
    expect(config.apiBaseUrl).toBe('https://apis.quran.foundation');
  });

  it('does not provide client credentials when setup and env credentials are blank', () => {
    const config = resolveQuranClientConfig({
      state: createDefaultAyahLensState(),
      env: {},
      decryptSecret: () => null,
    });

    expect(config.clientId).toBe('');
    expect(config.clientSecret).toBeUndefined();
    expect(config.redirectUri).toBe('ayati://oauth/callback');
    expect(config.authBaseUrl).toBe('https://prelive-oauth2.quran.foundation');
    expect(config.apiBaseUrl).toBe('https://apis-prelive.quran.foundation');
  });
});
