import sentenceVerseKeys from './quran-sentence-refs.json';

export function getRandomQuranVerseKey(): string {
  return sentenceVerseKeys[Math.floor(Math.random() * sentenceVerseKeys.length)]!;
}
