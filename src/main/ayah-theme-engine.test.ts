import { describe, expect, it } from 'vitest';

import { rankAyahCandidates } from './ayah-theme-engine';
import type { ScreenInsight } from './ayah-types';

describe('rankAyahCandidates', () => {
  it('selects a stress or patience ayah candidate for a stressed screen insight', () => {
    const insight: ScreenInsight = {
      summary: 'The user is juggling deadline-heavy work with many urgent tasks.',
      category: 'work',
      themes: [
        { id: 'stress', confidence: 0.92 },
        { id: 'patience', confidence: 0.63 },
      ],
      overallConfidence: 0.88,
      isSensitive: false,
    };

    const ranked = rankAyahCandidates(insight, []);

    expect(ranked[0]).toMatchObject({
      themeId: expect.stringMatching(/stress|patience/),
    });
    expect(['2:286', '94:5', '94:6', '13:28']).toContain(ranked[0].verseKey);
  });

  it('uses a general fallback for unclear or low-confidence insight', () => {
    const insight: ScreenInsight = {
      summary: 'The scene could not be interpreted reliably.',
      category: 'unclear',
      themes: [{ id: 'unclear', confidence: 0.3 }],
      overallConfidence: 0.35,
      isSensitive: false,
    };

    const ranked = rankAyahCandidates(insight, ['2:286']);

    expect(ranked[0]).toMatchObject({
      verseKey: '13:28',
      themeId: 'unclear',
      isFallback: true,
    });
  });

  it('does not force fallback when a clear actionable theme is present with unclear as a secondary theme', () => {
    const insight: ScreenInsight = {
      summary: 'The user is studying with notes open, but part of the screen is hard to classify.',
      category: 'study',
      themes: [
        { id: 'study', confidence: 0.72 },
        { id: 'unclear', confidence: 0.2 },
      ],
      overallConfidence: 0.7,
      isSensitive: false,
    };

    const ranked = rankAyahCandidates(insight, []);

    expect(ranked[0]).toMatchObject({
      verseKey: '96:1',
      themeId: 'study',
      isFallback: false,
    });
  });

  it('ranks an app-derived work insight without needing screenshot details', () => {
    const insight: ScreenInsight = {
      summary: 'A focused work app is active.',
      category: 'work',
      themes: [{ id: 'work', confidence: 0.68 }],
      overallConfidence: 0.68,
      isSensitive: false,
    };

    const ranked = rankAyahCandidates(insight, []);

    expect(ranked[0]).toMatchObject({
      verseKey: '3:159',
      themeId: 'work',
      isFallback: false,
    });
  });
});
