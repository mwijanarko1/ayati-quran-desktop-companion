import { createHash, randomBytes } from 'crypto';

import type {
  AyahCollection,
  QuranAudioFile,
  QuranBookmarkResult,
  QuranTafsirSnippet,
  QuranVerseContent,
} from './ayah-types';

type FetchLike = typeof fetch;

interface QuranFoundationClientOptions {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  authBaseUrl?: string;
  apiBaseUrl?: string;
  fetchImpl?: FetchLike;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  expires_at?: string;
  scope?: string;
  token_type?: string;
}

export interface StoredTokenSet {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  scopes: string[];
  expiresAt: number;
  userName?: string;
}

export class QuranFoundationError extends Error {
  constructor(
    public readonly code: 'auth_failed' | 'api_failed' | 'missing_config' | 'invalid_response',
    public readonly safeMessage: string,
    public readonly status?: number,
  ) {
    super(safeMessage);
    this.name = 'QuranFoundationError';
  }
}

function base64Url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function parseScopes(scope?: string): string[] {
  return scope?.split(/\s+/).filter(Boolean) ?? [];
}

function getDefaultAuthBaseUrl(): string {
  return process.env.QURAN_FOUNDATION_ENV === 'prelive'
    ? 'https://prelive-oauth2.quran.foundation'
    : 'https://oauth2.quran.foundation';
}

function getDefaultApiBaseUrl(): string {
  return process.env.QURAN_FOUNDATION_ENV === 'prelive'
    ? 'https://apis-prelive.quran.foundation'
    : 'https://apis.quran.foundation';
}

function sanitizeApiError(status: number): QuranFoundationError {
  if (status === 401 || status === 403) {
    return new QuranFoundationError(
      'auth_failed',
      'Quran Foundation sign-in failed. Check your credentials and try again.',
      status,
    );
  }

  return new QuranFoundationError(
    'api_failed',
    'Quran Foundation is unavailable right now. Try again after the API is reachable.',
    status,
  );
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseVerseKey(verseKey: string): { surah: number; ayah: number } {
  const [surah, ayah] = verseKey.split(':').map((part) => Number.parseInt(part, 10));
  if (!Number.isInteger(surah) || !Number.isInteger(ayah)) {
    throw new QuranFoundationError('invalid_response', 'Ayah reference is invalid.');
  }
  return { surah, ayah };
}

function getSingleAyahRange(verseKey: string): string {
  return `${verseKey}-${verseKey}`;
}

function normalizeAudioUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return new URL(url.replace(/^\/+/, ''), 'https://verses.quran.foundation/').toString();
}

function decodeJwtPayload(token?: string): Record<string, unknown> | null {
  if (!token) return null;
  const [, payload] = token.split('.');
  if (!payload) return null;

  try {
    const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=');
    return JSON.parse(Buffer.from(padded, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getUserNameFromIdToken(idToken?: string): string | undefined {
  const payload = decodeJwtPayload(idToken);
  if (!payload) return undefined;
  const firstName = typeof payload.first_name === 'string' ? payload.first_name : '';
  const lastName = typeof payload.last_name === 'string' ? payload.last_name : '';
  const fullName = `${firstName} ${lastName}`.trim();
  if (fullName) return fullName;
  return typeof payload.email === 'string' ? payload.email : undefined;
}

function assertIdTokenNonce(idToken: string | undefined, expectedNonce: string | undefined): void {
  if (!expectedNonce || !idToken) return;

  const payload = decodeJwtPayload(idToken);
  if (payload?.nonce === expectedNonce) return;

  throw new QuranFoundationError(
    'auth_failed',
    'Quran Foundation sign-in callback could not be verified.',
  );
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export class QuranFoundationClient {
  private readonly clientId: string;
  private readonly clientSecret?: string;
  private readonly redirectUri: string;
  private readonly authBaseUrl: string;
  private readonly apiBaseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: QuranFoundationClientOptions) {
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.redirectUri = options.redirectUri;
    this.authBaseUrl = options.authBaseUrl ?? getDefaultAuthBaseUrl();
    this.apiBaseUrl = options.apiBaseUrl ?? getDefaultApiBaseUrl();
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  buildAuthorizeUrl(params: {
    state: string;
    nonce?: string;
    codeChallenge: string;
    scopes: readonly string[];
  }): string {
    if (!this.clientId) {
      throw new QuranFoundationError(
        'missing_config',
        'Quran Foundation client ID is not configured.',
      );
    }

    const url = new URL('/oauth2/auth', this.authBaseUrl);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', params.scopes.join(' '));
    url.searchParams.set('state', params.state);
    if (params.nonce) {
      url.searchParams.set('nonce', params.nonce);
    }
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  async exchangeAuthorizationCode(
    code: string,
    codeVerifier: string,
    expectedNonce?: string,
  ): Promise<StoredTokenSet> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      code_verifier: codeVerifier,
    });

    return this.requestTokenWithClientAuthentication(body, expectedNonce);
  }

  async refreshToken(refreshToken: string): Promise<StoredTokenSet> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    return this.requestTokenWithClientAuthentication(body);
  }

  async requestContentToken(): Promise<StoredTokenSet> {
    if (!this.clientSecret) {
      throw new QuranFoundationError(
        'missing_config',
        'Quran Foundation content API is not configured.',
      );
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'content',
    });
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
    };

    return this.requestToken(body, headers);
  }

  async fetchVerseContent(
    accessToken: string,
    verseKey: string,
    translationId: number,
  ): Promise<QuranVerseContent> {
    const url = new URL(`/content/api/v4/verses/by_key/${encodeURIComponent(verseKey)}`, this.apiBaseUrl);
    url.searchParams.set('translations', String(translationId));
    url.searchParams.set('fields', 'text_uthmani');
    url.searchParams.set('words', 'false');
    url.searchParams.set('translation_fields', 'resource_name');

    const response = await this.fetchImpl(url.toString(), {
      method: 'GET',
      headers: this.getApiHeaders(accessToken),
    });

    if (!response.ok) {
      throw sanitizeApiError(response.status);
    }

    const payload = await response.json() as {
      verse?: {
        verse_key?: string;
        chapter_id?: number;
        verse_number?: number;
        text_uthmani?: string;
        translations?: Array<{ resource_id?: number; text?: string }>;
      };
    };
    const verse = payload.verse;
    const translation = verse?.translations?.[0];

    if (!verse?.verse_key || typeof verse.verse_number !== 'number' || !verse.text_uthmani || !translation?.text) {
      throw new QuranFoundationError(
        'invalid_response',
        'Quran Foundation returned an unexpected verse response.',
      );
    }

    return {
      verseKey: verse.verse_key,
      surahName: getSurahName(verse.chapter_id),
      ayahNumber: verse.verse_number,
      arabicText: stripHtml(verse.text_uthmani),
      translation: stripHtml(translation.text),
      translatorId: translation.resource_id ?? translationId,
    };
  }

  async createBookmark(
    accessToken: string,
    params: { verseKey: string; mushafId: number },
  ): Promise<QuranBookmarkResult> {
    const { surah, ayah } = parseVerseKey(params.verseKey);

    const response = await this.fetchImpl(new URL('/auth/v1/bookmarks', this.apiBaseUrl).toString(), {
      method: 'POST',
      headers: {
        ...this.getApiHeaders(accessToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key: surah,
        verseNumber: ayah,
        type: 'ayah',
        mushaf: params.mushafId,
      }),
    });

    if (!response.ok) {
      throw sanitizeApiError(response.status);
    }

    const payload = await response.json() as { data?: { id?: string } };
    return { bookmarkId: payload.data?.id ?? null };
  }

  async fetchTafsir(
    accessToken: string,
    verseKey: string,
    resourceId: number,
  ): Promise<QuranTafsirSnippet> {
    const url = new URL(
      `/content/api/v4/tafsirs/${encodeURIComponent(String(resourceId))}/by_ayah/${encodeURIComponent(verseKey)}`,
      this.apiBaseUrl,
    );
    url.searchParams.set('fields', 'resource_name,language_name');

    const response = await this.fetchImpl(url.toString(), {
      method: 'GET',
      headers: this.getApiHeaders(accessToken),
    });

    if (!response.ok) {
      throw sanitizeApiError(response.status);
    }

    const payload = await response.json() as {
      tafsir?: {
        resource_id?: number;
        resource_name?: string;
        language_name?: string;
        translated_name?: { language_name?: string };
        text?: string;
      };
    };
    const tafsir = payload.tafsir;
    if (typeof tafsir?.text !== 'string' || !tafsir.resource_name) {
      throw new QuranFoundationError(
        'invalid_response',
        'Quran Foundation returned an unexpected tafsir response.',
      );
    }

    return {
      resourceId: tafsir.resource_id ?? resourceId,
      resourceName: tafsir.resource_name,
      languageName: tafsir.language_name ?? tafsir.translated_name?.language_name,
      text: stripHtml(tafsir.text),
      fetchedAt: Date.now(),
    };
  }

  async fetchAyahAudio(
    accessToken: string,
    verseKey: string,
    recitationId: number,
    reciterName?: string,
  ): Promise<QuranAudioFile> {
    const url = new URL(
      `/content/api/v4/recitations/${encodeURIComponent(String(recitationId))}/by_ayah/${encodeURIComponent(verseKey)}`,
      this.apiBaseUrl,
    );
    url.searchParams.set('fields', 'url,duration,verse_key');

    const response = await this.fetchImpl(url.toString(), {
      method: 'GET',
      headers: this.getApiHeaders(accessToken),
    });

    if (!response.ok) {
      throw sanitizeApiError(response.status);
    }

    const payload = await response.json() as {
      audio_files?: Array<{ url?: string; duration?: number }>;
    };
    const audio = payload.audio_files?.[0];
    if (!audio?.url) {
      throw new QuranFoundationError(
        'invalid_response',
        'Quran Foundation returned an unexpected recitation response.',
      );
    }

    return {
      recitationId,
      reciterName,
      url: normalizeAudioUrl(audio.url),
      duration: audio.duration,
      fetchedAt: Date.now(),
    };
  }

  async fetchTafsirResources(accessToken: string): Promise<Array<{ id: number; name: string; languageName?: string }>> {
    const response = await this.fetchImpl(new URL('/content/api/v4/resources/tafsirs', this.apiBaseUrl).toString(), {
      method: 'GET',
      headers: this.getApiHeaders(accessToken),
    });

    if (!response.ok) {
      throw sanitizeApiError(response.status);
    }

    const payload = await response.json() as {
      tafsirs?: Array<{ id?: number; resource_id?: number; name?: string; resource_name?: string; language_name?: string; translated_name?: { name?: string; language_name?: string } }>;
    };

    return (payload.tafsirs ?? [])
      .map((resource) => ({
        id: resource.id ?? resource.resource_id ?? 0,
        name: resource.name ?? resource.resource_name ?? resource.translated_name?.name ?? '',
        languageName: resource.language_name ?? resource.translated_name?.language_name,
      }))
      .filter((resource) => Number.isInteger(resource.id) && resource.id > 0 && resource.name);
  }

  async fetchRecitationResources(accessToken: string): Promise<Array<{ id: number; name: string }>> {
    const response = await this.fetchImpl(new URL('/content/api/v4/resources/recitations', this.apiBaseUrl).toString(), {
      method: 'GET',
      headers: this.getApiHeaders(accessToken),
    });

    if (!response.ok) {
      throw sanitizeApiError(response.status);
    }

    const payload = await response.json() as {
      recitations?: Array<{ id?: number; reciter_name?: string; name?: string; translated_name?: { name?: string } }>;
    };

    return (payload.recitations ?? [])
      .map((resource) => ({
        id: resource.id ?? 0,
        name: resource.reciter_name ?? resource.name ?? resource.translated_name?.name ?? '',
      }))
      .filter((resource) => Number.isInteger(resource.id) && resource.id > 0 && resource.name);
  }

  async createCollection(accessToken: string, name: string): Promise<AyahCollection> {
    const response = await this.fetchImpl(new URL('/auth/v1/collections', this.apiBaseUrl).toString(), {
      method: 'POST',
      headers: {
        ...this.getApiHeaders(accessToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      throw sanitizeApiError(response.status);
    }

    const payload = await response.json() as { data?: { id?: string; name?: string; slug?: string } };
    if (!payload.data?.id || !payload.data.name) {
      throw new QuranFoundationError('invalid_response', 'Quran Foundation returned an unexpected collection response.');
    }

    return {
      id: payload.data.id,
      name: payload.data.name,
      slug: payload.data.slug,
      syncState: 'synced',
    };
  }

  async listCollections(accessToken: string): Promise<AyahCollection[]> {
    const response = await this.fetchImpl(new URL('/auth/v1/collections', this.apiBaseUrl).toString(), {
      method: 'GET',
      headers: this.getApiHeaders(accessToken),
    });

    if (!response.ok) {
      throw sanitizeApiError(response.status);
    }

    const payload = await response.json() as { data?: Array<{ id?: string; name?: string; slug?: string }> };
    return (payload.data ?? [])
      .filter((collection) => collection.id && collection.name)
      .map((collection) => ({
        id: String(collection.id),
        name: String(collection.name),
        slug: collection.slug,
        syncState: 'synced',
      }));
  }

  async addCollectionBookmark(
    accessToken: string,
    collectionId: string,
    verseKey: string,
    mushafId: number,
  ): Promise<boolean> {
    const { surah, ayah } = parseVerseKey(verseKey);
    const response = await this.fetchImpl(
      new URL(`/auth/v1/collections/${encodeURIComponent(collectionId)}/bookmarks`, this.apiBaseUrl).toString(),
      {
        method: 'POST',
        headers: {
          ...this.getApiHeaders(accessToken),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key: surah,
          verseNumber: ayah,
          type: 'ayah',
          mushafId,
          mushaf: mushafId,
        }),
      },
    );

    if (!response.ok) {
      throw sanitizeApiError(response.status);
    }

    return true;
  }

  async createNote(
    accessToken: string,
    params: { reflectionId: string; verseKey: string; body: string },
  ): Promise<string | null> {
    parseVerseKey(params.verseKey);
    const response = await this.fetchImpl(new URL('/auth/v1/notes', this.apiBaseUrl).toString(), {
      method: 'POST',
      headers: {
        ...this.getApiHeaders(accessToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        body: params.body,
        saveToQR: false,
        attachedEntity: {
          entityId: params.reflectionId,
          entityType: 'reflection',
          entityMetadata: { verseKey: params.verseKey },
        },
        ranges: [getSingleAyahRange(params.verseKey)],
      }),
    });

    if (!response.ok) {
      throw sanitizeApiError(response.status);
    }

    const payload = await response.json() as { data?: { id?: string } };
    return payload.data?.id ?? null;
  }

  async recordActivityDay(
    accessToken: string,
    params: { verseKey: string; mushafId: number; seconds?: number; timezone?: string },
  ): Promise<boolean> {
    parseVerseKey(params.verseKey);
    const headers: Record<string, string> = {
      ...this.getApiHeaders(accessToken),
      'Content-Type': 'application/json',
    };
    if (params.timezone) {
      headers['x-timezone'] = params.timezone;
    }

    const response = await this.fetchImpl(new URL('/auth/v1/activity-days', this.apiBaseUrl).toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'QURAN',
        seconds: params.seconds ?? 30,
        ranges: [getSingleAyahRange(params.verseKey)],
        mushafId: params.mushafId,
      }),
    });

    if (!response.ok) {
      throw sanitizeApiError(response.status);
    }

    return true;
  }

  async getCurrentStreakDays(accessToken: string, timezone?: string): Promise<number | null> {
    const url = new URL('/auth/v1/streaks/current-streak-days', this.apiBaseUrl);
    url.searchParams.set('type', 'QURAN');
    const headers = this.getApiHeaders(accessToken);
    if (timezone) {
      headers['x-timezone'] = timezone;
    }

    const response = await this.fetchImpl(url.toString(), {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw sanitizeApiError(response.status);
    }

    const payload = await response.json() as { data?: { count?: number; days?: number; currentStreakDays?: number } };
    const value = payload.data?.count ?? payload.data?.days ?? payload.data?.currentStreakDays;
    return typeof value === 'number' ? value : null;
  }

  private async requestToken(
    body: URLSearchParams,
    headers?: Record<string, string>,
    expectedNonce?: string,
  ): Promise<StoredTokenSet> {
    const response = await this.fetchImpl(new URL('/oauth2/token', this.authBaseUrl).toString(), {
      method: 'POST',
      headers: headers ?? { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      throw sanitizeApiError(response.status);
    }

    const tokenResponse = await response.json() as Partial<TokenResponse>;
    if (!tokenResponse.access_token) {
      throw new QuranFoundationError(
        'invalid_response',
        'Quran Foundation returned an unexpected token response.',
      );
    }
    assertIdTokenNonce(tokenResponse.id_token, expectedNonce);

    const expiresAt = tokenResponse.expires_at
      ? Date.parse(tokenResponse.expires_at)
      : Date.now() + (tokenResponse.expires_in ?? 3600) * 1000;

    return {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      idToken: tokenResponse.id_token,
      scopes: parseScopes(tokenResponse.scope),
      expiresAt,
      userName: getUserNameFromIdToken(tokenResponse.id_token),
    };
  }

  private async requestTokenWithClientAuthentication(
    body: URLSearchParams,
    expectedNonce?: string,
  ): Promise<StoredTokenSet> {
    if (!this.clientSecret) {
      body.set('client_id', this.clientId);
      return this.requestToken(body, undefined, expectedNonce);
    }

    return this.requestToken(body, {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
    }, expectedNonce);
  }

  private getApiHeaders(accessToken: string): Record<string, string> {
    return {
      'x-auth-token': accessToken,
      'x-client-id': this.clientId,
    };
  }
}

const SURAH_NAMES: Record<number, string> = {
  1: 'Al-Fatihah',
  2: 'Al-Baqarah',
  3: 'Ali Imran',
  13: "Ar-Ra'd",
  14: 'Ibrahim',
  18: 'Al-Kahf',
  23: "Al-Mu'minun",
  49: 'Al-Hujurat',
  57: 'Al-Hadid',
  65: 'At-Talaq',
  67: 'Al-Mulk',
  94: 'Ash-Sharh',
  96: 'Al-Alaq',
};

function getSurahName(chapterId?: number): string {
  if (!chapterId) return 'Quran';
  return SURAH_NAMES[chapterId] ?? `Surah ${chapterId}`;
}
