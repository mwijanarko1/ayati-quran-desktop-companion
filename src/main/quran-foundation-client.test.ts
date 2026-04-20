import { describe, expect, it, vi } from 'vitest';

import { QuranFoundationClient, QuranFoundationError } from './quran-foundation-client';

function createUnsignedJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.`;
}

describe('QuranFoundationClient', () => {
  it('includes nonce in the authorization URL for OpenID requests', () => {
    const client = new QuranFoundationClient({
      clientId: 'client-id',
      redirectUri: 'ayati://oauth/callback',
    });

    const authorizeUrl = new URL(client.buildAuthorizeUrl({
      state: 'state-123',
      nonce: 'nonce-123',
      codeChallenge: 'challenge-123',
      scopes: ['openid', 'offline_access', 'user', 'bookmark'],
    }));

    expect(authorizeUrl.searchParams.get('nonce')).toBe('nonce-123');
  });

  it('uses HTTP Basic client authentication when exchanging a code for a confidential client', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        access_token: 'access-token',
        expires_in: 3600,
        scope: 'openid offline_access user bookmark',
      }), { status: 200 }),
    );

    const client = new QuranFoundationClient({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'ayati://oauth/callback',
      fetchImpl: fetchMock,
    });

    await client.exchangeAuthorizationCode('code-123', 'verifier-123');

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`,
    });
    expect(String(init?.body)).not.toContain('client_id=');
  });

  it('rejects authorization tokens when the returned OpenID nonce does not match', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        access_token: 'access-token',
        id_token: createUnsignedJwt({ nonce: 'wrong-nonce' }),
        expires_in: 3600,
        scope: 'openid offline_access bookmark bookmark.create',
      }), { status: 200 }),
    );

    const client = new QuranFoundationClient({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'ayati://oauth/callback',
      fetchImpl: fetchMock,
    });

    await expect(client.exchangeAuthorizationCode(
      'code-123',
      'verifier-123',
      'expected-nonce',
    )).rejects.toMatchObject({
      code: 'auth_failed',
      safeMessage: 'Quran Foundation sign-in callback could not be verified.',
    });
  });

  it('maps token errors into safe app errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        error: 'invalid_client',
        error_description: 'Client authentication failed with secret abc123',
      }), { status: 401 }),
    );

    const client = new QuranFoundationClient({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'ayati://oauth/callback',
      fetchImpl: fetchMock,
    });

    await expect(client.exchangeAuthorizationCode('bad-code', 'verifier')).rejects.toMatchObject({
      code: 'auth_failed',
      safeMessage: 'Quran Foundation sign-in failed. Check your credentials and try again.',
    });
  });

  it('returns a typed bookmark response when the User API succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        data: {
          id: 'bookmark-1',
          type: 'ayah',
          key: 2,
          verseNumber: 286,
          isInDefaultCollection: true,
        },
      }), { status: 200 }),
    );

    const client = new QuranFoundationClient({
      clientId: 'client-id',
      redirectUri: 'ayati://oauth/callback',
      fetchImpl: fetchMock,
    });

    await expect(client.createBookmark('access-token', {
      verseKey: '2:286',
      mushafId: 4,
    })).resolves.toEqual({ bookmarkId: 'bookmark-1' });
  });

  it('omits the reading bookmark flag when creating a regular saved ayah bookmark', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        data: { id: 'bookmark-1' },
      }), { status: 200 }),
    );

    const client = new QuranFoundationClient({
      clientId: 'client-id',
      redirectUri: 'ayati://oauth/callback',
      fetchImpl: fetchMock,
    });

    await client.createBookmark('access-token', {
      verseKey: '2:286',
      mushafId: 4,
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      key: 2,
      verseNumber: 286,
      type: 'ayah',
      mushaf: 4,
    });
  });

  it('normalizes User API failures without leaking raw bodies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        message: 'The server exploded with token access-token',
        type: 'internal_server_error',
        success: false,
      }), { status: 500 }),
    );

    const client = new QuranFoundationClient({
      clientId: 'client-id',
      redirectUri: 'ayati://oauth/callback',
      fetchImpl: fetchMock,
    });

    await expect(client.createBookmark('access-token', {
      verseKey: '2:286',
      mushafId: 4,
    })).rejects.toBeInstanceOf(QuranFoundationError);
  });
});
