import type { AyahLensState, AyahReflection } from './ayah-types';

const MAX_REFLECTION_HISTORY = 50;
const MAX_RECENT_VERSE_KEYS = 12;

export function createDefaultAyahLensState(): AyahLensState {
  return {
    quranConfig: {
      clientId: '',
      encryptedClientSecret: null,
      redirectUri: 'ayati://oauth/callback',
      environment: 'prelive',
    },
    quranAuth: {
      encryptedAccessToken: null,
      encryptedRefreshToken: null,
      expiresAt: null,
      scopes: [],
    },
    contentAuth: {
      encryptedAccessToken: null,
      expiresAt: null,
    },
    preferences: {
      translationId: 20,
      mushafId: 4,
      captureMode: 'fullScreen',
      saveScreenshots: false,
      defaultSave: false,
      contextualNudges: true,
      nudgeCooldownMinutes: 15,
      maxNudgesPerDay: 8,
    },
    nudgeState: {
      lastShownAt: null,
      shownToday: 0,
      shownTodayDate: null,
      recentAppThemeKeys: [],
    },
    reflections: [],
    pendingSync: [],
    recentVerseKeys: [],
    verseCache: {},
  };
}

function sanitizeReflection(reflection: AyahReflection): AyahReflection {
  return {
    id: reflection.id,
    verseKey: reflection.verseKey,
    surahName: reflection.surahName,
    ayahNumber: reflection.ayahNumber,
    arabicText: reflection.arabicText,
    translation: reflection.translation,
    translatorId: reflection.translatorId,
    reflection: reflection.reflection,
    whyThisVerse: reflection.whyThisVerse,
    screenSummary: reflection.screenSummary,
    themes: reflection.themes.map((theme) => ({
      id: theme.id,
      confidence: theme.confidence,
    })),
    createdAt: reflection.createdAt,
    savedAt: reflection.savedAt,
    quranBookmarkId: reflection.quranBookmarkId,
    syncState: reflection.syncState,
  };
}

export function saveReflectionLocally(state: AyahLensState, reflection: AyahReflection): AyahLensState {
  const sanitizedReflection = sanitizeReflection(reflection);
  const reflections = [
    sanitizedReflection,
    ...state.reflections.filter((item) => item.id !== sanitizedReflection.id),
  ].slice(0, MAX_REFLECTION_HISTORY);

  const recentVerseKeys = [
    sanitizedReflection.verseKey,
    ...state.recentVerseKeys.filter((verseKey) => verseKey !== sanitizedReflection.verseKey),
  ].slice(0, MAX_RECENT_VERSE_KEYS);

  return {
    ...state,
    reflections,
    recentVerseKeys,
  };
}

export function updateReflection(state: AyahLensState, reflection: AyahReflection): AyahLensState {
  const sanitizedReflection = sanitizeReflection(reflection);
  return {
    ...state,
    reflections: state.reflections.map((item) => (
      item.id === sanitizedReflection.id ? sanitizedReflection : item
    )),
  };
}

export function deleteReflection(state: AyahLensState, reflectionId: string): AyahLensState {
  return {
    ...state,
    reflections: state.reflections.filter((reflection) => reflection.id !== reflectionId),
    pendingSync: state.pendingSync.filter((item) => item.reflectionId !== reflectionId),
  };
}

export function markReflectionPendingSync(
  state: AyahLensState,
  reflectionId: string,
  action: 'bookmark',
): AyahLensState {
  const existing = state.pendingSync.find((item) => item.reflectionId === reflectionId && item.action === action);
  const pendingSync = existing
    ? state.pendingSync.map((item) => (
      item.reflectionId === reflectionId && item.action === action
        ? { ...item, attempts: item.attempts + 1 }
        : item
    ))
    : [...state.pendingSync, { reflectionId, action, attempts: 1 }];

  return {
    ...state,
    reflections: state.reflections.map((reflection) => (
      reflection.id === reflectionId ? { ...reflection, syncState: 'pending' } : reflection
    )),
    pendingSync,
  };
}

export function markReflectionSynced(
  state: AyahLensState,
  reflectionId: string,
  quranBookmarkId: string | null,
): AyahLensState {
  return {
    ...state,
    reflections: state.reflections.map((reflection) => (
      reflection.id === reflectionId
        ? {
          ...reflection,
          savedAt: reflection.savedAt ?? Date.now(),
          quranBookmarkId: quranBookmarkId ?? reflection.quranBookmarkId,
          syncState: quranBookmarkId ? 'synced' : 'local',
        }
        : reflection
    )),
    pendingSync: state.pendingSync.filter((item) => item.reflectionId !== reflectionId),
  };
}
