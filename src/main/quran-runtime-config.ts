import type { AyahLensState } from './ayah-types';

export interface QuranRuntimeConfigEnv {
  QURAN_CLIENT_ID?: string;
  QF_CLIENT_ID?: string;
  QURAN_CLIENT_SECRET?: string;
  QF_CLIENT_SECRET?: string;
  QURAN_REDIRECT_URI?: string;
  QURAN_FOUNDATION_ENV?: string;
  QURAN_AUTH_BASE_URL?: string;
  QURAN_API_BASE_URL?: string;
}

export interface QuranRuntimeConfig {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  authBaseUrl?: string;
  apiBaseUrl?: string;
}

interface ResolveQuranClientConfigOptions {
  state: AyahLensState;
  env: QuranRuntimeConfigEnv;
  decryptSecret: (value: string | null | undefined) => string | null;
}

function getDefaultAuthBaseUrl(environment?: string): string {
  return environment === 'prelive'
    ? 'https://prelive-oauth2.quran.foundation'
    : 'https://oauth2.quran.foundation';
}

function getDefaultApiBaseUrl(environment?: string): string {
  return environment === 'prelive'
    ? 'https://apis-prelive.quran.foundation'
    : 'https://apis.quran.foundation';
}

function pickNonBlank(...values: Array<string | null | undefined>): string | undefined {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim();
}

function normalizeQuranEnvironment(environment?: string): 'prelive' | 'production' {
  return environment === 'production' ? 'production' : 'prelive';
}

export function resolveQuranClientConfig({
  state,
  env,
  decryptSecret,
}: ResolveQuranClientConfigOptions): QuranRuntimeConfig {
  const setupConfig = state.quranConfig;
  const setupSecret = decryptSecret(setupConfig.encryptedClientSecret);
  const envClientId = pickNonBlank(env.QURAN_CLIENT_ID, env.QF_CLIENT_ID);
  const envClientSecret = pickNonBlank(env.QURAN_CLIENT_SECRET, env.QF_CLIENT_SECRET);
  const hasSetupCredentials = Boolean(
    pickNonBlank(setupConfig.clientId, setupConfig.encryptedClientSecret),
  );
  const environment = normalizeQuranEnvironment(hasSetupCredentials
    ? setupConfig.environment
    : (env.QURAN_FOUNDATION_ENV || setupConfig.environment));
  const authBaseUrl = pickNonBlank(env.QURAN_AUTH_BASE_URL) ?? getDefaultAuthBaseUrl(environment);
  const apiBaseUrl = pickNonBlank(env.QURAN_API_BASE_URL) ?? getDefaultApiBaseUrl(environment);

  return {
    clientId: pickNonBlank(setupConfig.clientId, envClientId) ?? '',
    clientSecret: pickNonBlank(setupSecret, envClientSecret),
    redirectUri: pickNonBlank(setupConfig.redirectUri, env.QURAN_REDIRECT_URI) ?? 'ayati://oauth/callback',
    authBaseUrl,
    apiBaseUrl,
  };
}
