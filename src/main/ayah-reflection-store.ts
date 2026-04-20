import { randomUUID } from 'crypto';

import type { AyahLensState, AyahReflection, AyahCollection, ReflectionFeedback } from './ayah-types';

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
      timedReminders: false,
      timedReminderMinutes: 15,
      tafsirResourceId: null,
      tafsirResourceName: null,
      recitationId: null,
      reciterName: null,
    },
    nudgeState: {
      lastShownAt: null,
      lastTimedReminderAt: null,
      shownToday: 0,
      shownTodayDate: null,
      recentAppThemeKeys: [],
    },
    reflections: [],
    collections: [],
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
    tafsir: reflection.tafsir
      ? {
        resourceId: reflection.tafsir.resourceId,
        resourceName: reflection.tafsir.resourceName,
        languageName: reflection.tafsir.languageName,
        text: reflection.tafsir.text,
        fetchedAt: reflection.tafsir.fetchedAt,
      }
      : undefined,
    audio: reflection.audio
      ? {
        recitationId: reflection.audio.recitationId,
        reciterName: reflection.audio.reciterName,
        url: reflection.audio.url,
        duration: reflection.audio.duration,
        fetchedAt: reflection.audio.fetchedAt,
      }
      : undefined,
    note: reflection.note
      ? {
        localId: reflection.note.localId,
        quranNoteId: reflection.note.quranNoteId,
        body: reflection.note.body,
        syncState: reflection.note.syncState,
        createdAt: reflection.note.createdAt,
        updatedAt: reflection.note.updatedAt,
      }
      : undefined,
    collectionIds: reflection.collectionIds ? [...reflection.collectionIds] : undefined,
    feedback: reflection.feedback
      ? {
        value: reflection.feedback.value,
        createdAt: reflection.feedback.createdAt,
      }
      : undefined,
    alternateGroupId: reflection.alternateGroupId,
    sourceCandidateIndex: reflection.sourceCandidateIndex,
    rankedCandidateVerseKeys: reflection.rankedCandidateVerseKeys ? [...reflection.rankedCandidateVerseKeys] : undefined,
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

export function upsertCollectionLocal(state: AyahLensState, collection: AyahCollection): AyahLensState {
  const sanitizedCollection = {
    id: collection.id,
    name: collection.name,
    slug: collection.slug,
    syncState: collection.syncState,
  };

  return {
    ...state,
    collections: [
      sanitizedCollection,
      ...state.collections.filter((item) => item.id !== sanitizedCollection.id),
    ],
  };
}

export function saveReflectionNoteLocal(
  state: AyahLensState,
  reflectionId: string,
  params: {
    body: string;
    quranNoteId?: string;
    syncState: 'local' | 'synced' | 'pending' | 'failed';
    now?: number;
  },
): AyahLensState {
  const now = params.now ?? Date.now();

  return {
    ...state,
    reflections: state.reflections.map((reflection) => {
      if (reflection.id !== reflectionId) return reflection;
      const existingNote = reflection.note;
      return sanitizeReflection({
        ...reflection,
        note: {
          localId: existingNote?.localId ?? randomUUID(),
          quranNoteId: params.quranNoteId ?? existingNote?.quranNoteId,
          body: params.body,
          syncState: params.syncState,
          createdAt: existingNote?.createdAt ?? now,
          updatedAt: now,
        },
      });
    }),
  };
}

export function addReflectionToCollectionLocal(
  state: AyahLensState,
  reflectionId: string,
  collectionId: string,
): AyahLensState {
  return {
    ...state,
    reflections: state.reflections.map((reflection) => {
      if (reflection.id !== reflectionId) return reflection;
      const collectionIds = new Set(reflection.collectionIds ?? []);
      collectionIds.add(collectionId);
      return sanitizeReflection({
        ...reflection,
        collectionIds: [...collectionIds],
      });
    }),
  };
}

export function setReflectionFeedbackLocal(
  state: AyahLensState,
  reflectionId: string,
  value: ReflectionFeedback['value'],
  now: number = Date.now(),
): AyahLensState {
  return {
    ...state,
    reflections: state.reflections.map((reflection) => (
      reflection.id === reflectionId
        ? sanitizeReflection({
          ...reflection,
          feedback: { value, createdAt: now },
        })
        : reflection
    )),
  };
}

export function markReflectionPendingSync(
  state: AyahLensState,
  reflectionId: string,
  action: 'bookmark' | 'note' | 'collection' | 'activity',
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
      reflection.id === reflectionId
        ? sanitizeReflection({
          ...reflection,
          syncState: action === 'bookmark' ? 'pending' : reflection.syncState,
          note: action === 'note' && reflection.note
            ? { ...reflection.note, syncState: 'pending' }
            : reflection.note,
        })
        : reflection
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
