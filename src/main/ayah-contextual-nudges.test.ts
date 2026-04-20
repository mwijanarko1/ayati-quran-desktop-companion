import { describe, expect, it, vi } from 'vitest';

import { buildContextualQuranNudge } from './ayah-contextual-nudges';
import { createDefaultAyahLensState } from './ayah-reflection-store';
import type { AyahLensSettings, QuranVerseContent } from './ayah-types';

const NOW = new Date('2026-04-20T12:00:00Z').getTime();

const verseContent: QuranVerseContent = {
  verseKey: '96:1',
  surahName: 'Al-Alaq',
  ayahNumber: 1,
  arabicText: 'ٱقْرَأْ بِٱسْمِ رَبِّكَ ٱلَّذِي خَلَقَ',
  translation: 'Read, in the Name of your Lord Who created.',
  translatorId: 20,
};

function defaultSettings(overrides: Partial<AyahLensSettings> = {}): AyahLensSettings {
  return {
    ...createDefaultAyahLensState().preferences,
    ...overrides,
  };
}

function defaultInput(overrides: Partial<Parameters<typeof buildContextualQuranNudge>[0]> = {}) {
  const state = createDefaultAyahLensState();
  return {
    app: 'Safari',
    title: 'Quran Foundation API documentation',
    now: NOW,
    settings: defaultSettings(),
    nudgeState: state.nudgeState,
    recentVerseKeys: [],
    fetchVerseContent: vi.fn(async () => verseContent),
    ...overrides,
  };
}

describe('buildContextualQuranNudge', () => {
  it('returns a Quran nudge for a clear study context', async () => {
    const result = await buildContextualQuranNudge(defaultInput());

    expect(result?.message).toMatchObject({
      trigger: 'app_switch',
      quickReplies: ['Reflect', 'Save', 'Not now'],
    });
    expect(result?.message.text).toContain('A fitting reminder');
    expect(result?.message.text).toContain('96:1');
    expect(result?.reflection).toMatchObject({
      verseKey: '96:1',
      screenSummary: expect.stringMatching(/study.*window/i),
      syncState: 'local',
    });
    expect(result?.nextState.shownToday).toBe(1);
    expect(result?.nextState.lastShownAt).toBe(NOW);
  });

  it('returns null when contextual nudges are disabled', async () => {
    const result = await buildContextualQuranNudge(defaultInput({
      settings: defaultSettings({ contextualNudges: false }),
    }));

    expect(result).toBeNull();
  });

  it('returns null inside the cooldown window', async () => {
    const result = await buildContextualQuranNudge(defaultInput({
      nudgeState: {
        lastShownAt: NOW - 5 * 60 * 1000,
        shownToday: 1,
        shownTodayDate: '2026-04-20',
        recentAppThemeKeys: [],
      },
    }));

    expect(result).toBeNull();
  });

  it('returns null after the daily maximum is reached', async () => {
    const result = await buildContextualQuranNudge(defaultInput({
      nudgeState: {
        lastShownAt: NOW - 20 * 60 * 1000,
        shownToday: 8,
        shownTodayDate: '2026-04-20',
        recentAppThemeKeys: [],
      },
    }));

    expect(result).toBeNull();
  });

  it('suppresses sensitive app and title contexts', async () => {
    await expect(buildContextualQuranNudge(defaultInput({
      app: '1Password',
      title: 'Bank password',
    }))).resolves.toBeNull();

    await expect(buildContextualQuranNudge(defaultInput({
      app: 'Safari',
      title: 'Online banking account details',
    }))).resolves.toBeNull();
  });

  it('does not repeat the same app and theme key inside the repeat window', async () => {
    const result = await buildContextualQuranNudge(defaultInput({
      nudgeState: {
        lastShownAt: NOW - 20 * 60 * 1000,
        shownToday: 1,
        shownTodayDate: '2026-04-20',
        recentAppThemeKeys: [{ key: 'safari:study', shownAt: NOW - 60 * 60 * 1000 }],
      },
    }));

    expect(result).toBeNull();
  });

  it('uses bundled verse content when Quran Foundation content fetch fails', async () => {
    const result = await buildContextualQuranNudge(defaultInput({
      fetchVerseContent: vi.fn(async () => {
        throw new Error('Quran Foundation unavailable');
      }),
    }));

    expect(result?.message.text).toContain('Read, in the Name of your Lord Who created.');
    expect(result?.reflection).toMatchObject({
      verseKey: '96:1',
      surahName: 'Al-Alaq',
      translation: 'Read, in the Name of your Lord Who created.',
    });
  });

  it('keeps nudge state unchanged when no popup is shown', async () => {
    const nudgeState = {
      lastShownAt: NOW - 20 * 60 * 1000,
      shownToday: 1,
      shownTodayDate: '2026-04-20',
      recentAppThemeKeys: [],
    };

    const result = await buildContextualQuranNudge(defaultInput({
      title: '[unavailable]',
      nudgeState,
    }));

    expect(result).toBeNull();
    expect(nudgeState.shownToday).toBe(1);
  });
});
