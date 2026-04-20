import { describe, expect, it, vi } from 'vitest';

import { fetchVerseContentForReflection } from './ayah-reflection-content';
import type { QuranVerseContent } from './ayah-types';

describe('fetchVerseContentForReflection', () => {
  it('uses bundled verse content when Quran Foundation content fetch fails', async () => {
    const fetchLiveVerse = vi.fn<[], Promise<QuranVerseContent>>()
      .mockRejectedValue(new Error('Quran Foundation unavailable'));

    await expect(fetchVerseContentForReflection('13:28', fetchLiveVerse)).resolves.toMatchObject({
      verseKey: '13:28',
      surahName: "Ar-Ra'd",
      translation: expect.stringMatching(/remembrance of Allah/i),
    });
    expect(fetchLiveVerse).toHaveBeenCalledOnce();
  });
});
