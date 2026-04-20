import { describe, expect, it } from 'vitest';

import {
  createDefaultAyahLensState,
  addReflectionToCollectionLocal,
  saveReflectionLocally,
  saveReflectionNoteLocal,
  setReflectionFeedbackLocal,
  markReflectionPendingSync,
} from './ayah-reflection-store';
import type { AyahReflection } from './ayah-types';

function createReflection(overrides: Partial<AyahReflection> = {}): AyahReflection {
  return {
    id: 'reflection-1',
    verseKey: '2:286',
    surahName: 'Al-Baqarah',
    ayahNumber: 286,
    arabicText: 'لَا يُكَلِّفُ ٱللَّهُ نَفْسًا إِلَّا وُسْعَهَا',
    translation: 'Allah does not require of any soul more than what it can afford.',
    translatorId: 20,
    reflection: 'A reminder to meet pressure with trust and measured effort.',
    whyThisVerse: 'The screen suggested pressure and overload.',
    screenSummary: 'A crowded work screen with several tasks open.',
    themes: [{ id: 'stress', confidence: 0.9 }],
    createdAt: 1710000000000,
    syncState: 'local',
    ...overrides,
  };
}

describe('ayah reflection store helpers', () => {
  it('stores text-only reflection history and drops screenshot-like fields', () => {
    const state = createDefaultAyahLensState();
    const reflection = {
      ...createReflection(),
      screenshotImage: 'data:image/png;base64,unsafe',
    } as AyahReflection & { screenshotImage: string };

    const nextState = saveReflectionLocally(state, reflection);

    expect(nextState.reflections).toHaveLength(1);
    expect(JSON.stringify(nextState.reflections[0])).not.toContain('data:image');
    expect(nextState.reflections[0]).not.toHaveProperty('screenshotImage');
  });

  it('marks failed bookmark sync as pending and increments attempts', () => {
    const state = saveReflectionLocally(createDefaultAyahLensState(), createReflection());

    const nextState = markReflectionPendingSync(state, 'reflection-1', 'bookmark');

    expect(nextState.reflections[0].syncState).toBe('pending');
    expect(nextState.pendingSync).toEqual([
      { reflectionId: 'reflection-1', action: 'bookmark', attempts: 1 },
    ]);
  });

  it('persists notes as text-only reflection metadata', () => {
    const state = saveReflectionLocally(createDefaultAyahLensState(), createReflection());

    const nextState = saveReflectionNoteLocal(state, 'reflection-1', {
      body: 'This helped me slow down.',
      quranNoteId: 'note-1',
      syncState: 'synced',
      now: 1710000001000,
    });

    expect(nextState.reflections[0].note).toMatchObject({
      body: 'This helped me slow down.',
      quranNoteId: 'note-1',
      syncState: 'synced',
      createdAt: 1710000001000,
      updatedAt: 1710000001000,
    });
    expect(JSON.stringify(nextState.reflections[0])).not.toContain('data:image');
  });

  it('tracks collection membership locally when Quran Foundation sync succeeds', () => {
    const state = saveReflectionLocally(createDefaultAyahLensState(), createReflection());

    const nextState = addReflectionToCollectionLocal(state, 'reflection-1', 'collection-1');

    expect(nextState.reflections[0].collectionIds).toEqual(['collection-1']);
  });

  it('stores relevance feedback on a reflection', () => {
    const state = saveReflectionLocally(createDefaultAyahLensState(), createReflection());

    const nextState = setReflectionFeedbackLocal(state, 'reflection-1', 'not_relevant', 1710000002000);

    expect(nextState.reflections[0].feedback).toEqual({
      value: 'not_relevant',
      createdAt: 1710000002000,
    });
  });
});
