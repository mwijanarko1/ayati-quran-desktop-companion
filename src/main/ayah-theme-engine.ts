import { CURATED_AYAH_CANDIDATES, FALLBACK_VERSE_KEY } from './ayah-fallbacks';
import type { AyahTheme, RankedAyahCandidate, ScreenInsight } from './ayah-types';

const LOW_CONFIDENCE_THRESHOLD = 0.45;
const ACTIONABLE_THEME_THRESHOLD = 0.3;
const RECENCY_PENALTY = 45;
const RELEVANT_THEME_BOOST = 18;
const NOT_RELEVANT_PAIR_PENALTY = 60;
const NOT_RELEVANT_THEME_PENALTY = 16;

export interface AyahFeedbackSignal {
  verseKey: string;
  themeId: AyahTheme;
  value: 'relevant' | 'not_relevant';
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function getThemeConfidence(insight: ScreenInsight, themeId: AyahTheme): number {
  const matchingTheme = insight.themes.find((theme) => theme.id === themeId);
  return clampConfidence(matchingTheme?.confidence ?? 0);
}

function shouldUseFallback(insight: ScreenInsight): boolean {
  const strongestActionableThemeConfidence = insight.themes
    .filter((theme) => theme.id !== 'unclear')
    .reduce((maxConfidence, theme) => Math.max(maxConfidence, clampConfidence(theme.confidence)), 0);
  const hasActionableTheme = strongestActionableThemeConfidence >= ACTIONABLE_THEME_THRESHOLD;

  return insight.isSensitive
    || (!hasActionableTheme && (
      insight.category === 'unclear'
      || insight.themes.every((theme) => theme.id === 'unclear')
      || clampConfidence(insight.overallConfidence) < LOW_CONFIDENCE_THRESHOLD
    ));
}

function getFeedbackAdjustment(candidate: { verseKey: string; themeId: AyahTheme }, feedbackSignals: AyahFeedbackSignal[]): number {
  return feedbackSignals.reduce((adjustment, signal) => {
    if (signal.value === 'relevant' && signal.themeId === candidate.themeId) {
      return adjustment + RELEVANT_THEME_BOOST;
    }

    if (signal.value === 'not_relevant' && signal.themeId === candidate.themeId && signal.verseKey === candidate.verseKey) {
      return adjustment - NOT_RELEVANT_PAIR_PENALTY;
    }

    if (signal.value === 'not_relevant' && signal.themeId === candidate.themeId) {
      return adjustment - NOT_RELEVANT_THEME_PENALTY;
    }

    return adjustment;
  }, 0);
}

export function rankAyahCandidates(
  insight: ScreenInsight,
  recentVerseKeys: string[],
  feedbackSignals: AyahFeedbackSignal[] = [],
): RankedAyahCandidate[] {
  const fallback = CURATED_AYAH_CANDIDATES.find((candidate) => candidate.verseKey === FALLBACK_VERSE_KEY);
  if (!fallback) {
    throw new Error('Ayati - Quran Desktop Companion fallback verse is not configured.');
  }

  if (shouldUseFallback(insight)) {
    return [{
      verseKey: fallback.verseKey,
      themeId: 'unclear',
      score: Number.MAX_SAFE_INTEGER,
      reflection: fallback.reflection,
      whyThisVerse: insight.isSensitive
        ? 'The screen may contain sensitive information, so Ayati - Quran Desktop Companion chose a general remembrance instead of inferring details.'
        : fallback.whyThisVerse,
      isFallback: true,
    }];
  }

  return CURATED_AYAH_CANDIDATES
    .filter((candidate) => candidate.verseKey !== FALLBACK_VERSE_KEY)
    .map((candidate) => {
      const confidence = getThemeConfidence(insight, candidate.themeId);
      const categoryBoost = insight.category === candidate.themeId ? 8 : 0;
      const recencyPenalty = recentVerseKeys.includes(candidate.verseKey) ? RECENCY_PENALTY : 0;
      const feedbackAdjustment = getFeedbackAdjustment(candidate, feedbackSignals);
      const score = candidate.priority + confidence * 100 + categoryBoost - recencyPenalty + feedbackAdjustment;

      return {
        verseKey: candidate.verseKey,
        themeId: candidate.themeId,
        score,
        reflection: candidate.reflection,
        whyThisVerse: candidate.whyThisVerse,
        isFallback: false,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.verseKey.localeCompare(right.verseKey);
    });
}
