import { describe, expect, it } from 'vitest';

import { QURAN_OAUTH_SCOPES } from './quran-oauth-scopes';

describe('QURAN_OAUTH_SCOPES', () => {
  it('requests scopes needed for the hackathon demo pack', () => {
    expect(QURAN_OAUTH_SCOPES).toEqual([
      'openid',
      'offline_access',
      'bookmark',
      'bookmark.create',
      'collection',
      'collection.create',
      'note',
      'note.create',
      'activity_day',
      'activity_day.create',
      'streak',
      'streak.read',
    ]);
    expect(QURAN_OAUTH_SCOPES).not.toContain('content');
    expect(QURAN_OAUTH_SCOPES).not.toContain('collection.read');
    expect(QURAN_OAUTH_SCOPES).not.toContain('user');
  });
});
