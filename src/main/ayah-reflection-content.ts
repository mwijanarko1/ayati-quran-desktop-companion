import { getFallbackVerseContent } from './ayah-fallbacks';
import type { QuranVerseContent } from './ayah-types';

export async function fetchVerseContentForReflection(
  verseKey: string,
  fetchLiveVerseContent: () => Promise<QuranVerseContent>,
): Promise<QuranVerseContent> {
  try {
    return await fetchLiveVerseContent();
  } catch {
    return getFallbackVerseContent(verseKey);
  }
}
