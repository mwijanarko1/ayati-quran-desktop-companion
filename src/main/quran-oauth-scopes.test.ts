import { describe, expect, it } from 'vitest';

import { QURAN_OAUTH_SCOPES } from './quran-oauth-scopes';

describe('QURAN_OAUTH_SCOPES', () => {
  it('requests only the scopes needed to sign in and create bookmarks', () => {
    expect(QURAN_OAUTH_SCOPES).toEqual([
      'openid',
      'offline_access',
      'bookmark',
      'bookmark.create',
    ]);
    expect(QURAN_OAUTH_SCOPES).not.toContain('content');
    expect(QURAN_OAUTH_SCOPES).not.toContain('collection');
    expect(QURAN_OAUTH_SCOPES).not.toContain('collection.read');
    expect(QURAN_OAUTH_SCOPES).not.toContain('collection.create');
    expect(QURAN_OAUTH_SCOPES).not.toContain('user');
  });
});
