export type AyahTheme =
  | 'stress'
  | 'focus'
  | 'gratitude'
  | 'beauty'
  | 'patience'
  | 'risk'
  | 'excess'
  | 'conflict'
  | 'study'
  | 'planning'
  | 'work'
  | 'distraction'
  | 'unclear';

export interface AyahThemeScore {
  id: AyahTheme;
  confidence: number;
}

export interface ScreenInsight {
  summary: string;
  category: string;
  themes: AyahThemeScore[];
  overallConfidence: number;
  isSensitive: boolean;
  fallbackReason?: string;
}

export interface RankedAyahCandidate {
  verseKey: string;
  themeId: AyahTheme;
  score: number;
  reflection: string;
  whyThisVerse: string;
  isFallback: boolean;
}

export interface QuranTafsirSnippet {
  resourceId: number;
  resourceName: string;
  languageName?: string;
  text: string;
  fetchedAt: number;
}

export interface QuranAudioFile {
  recitationId: number;
  reciterName?: string;
  url: string;
  duration?: number;
  fetchedAt: number;
}

export interface AyahReflectionNote {
  localId: string;
  quranNoteId?: string;
  body: string;
  syncState: 'local' | 'synced' | 'pending' | 'failed';
  createdAt: number;
  updatedAt: number;
}

export interface AyahCollection {
  id: string;
  name: string;
  slug?: string;
  syncState: 'synced' | 'pending' | 'failed';
}

export interface ReflectionFeedback {
  value: 'relevant' | 'not_relevant';
  createdAt: number;
}

export interface AyahReflection {
  id: string;
  verseKey: string;
  surahName: string;
  ayahNumber: number;
  arabicText: string;
  translation: string;
  translatorId: number;
  reflection: string;
  whyThisVerse: string;
  screenSummary: string;
  themes: AyahThemeScore[];
  createdAt: number;
  savedAt?: number;
  quranBookmarkId?: string;
  syncState: 'local' | 'synced' | 'pending' | 'failed';
  tafsir?: QuranTafsirSnippet;
  audio?: QuranAudioFile;
  note?: AyahReflectionNote;
  collectionIds?: string[];
  feedback?: ReflectionFeedback;
  alternateGroupId?: string;
  sourceCandidateIndex?: number;
  rankedCandidateVerseKeys?: string[];
}

export interface QuranAuthStatus {
  isConnected: boolean;
  userName?: string;
  scopes: string[];
  expiresAt?: number;
  error?: string;
}

export interface AyahLensSettings {
  translationId: number;
  mushafId: number;
  captureMode: 'fullScreen';
  saveScreenshots: false;
  defaultSave: boolean;
  contextualNudges: boolean;
  nudgeCooldownMinutes: number;
  maxNudgesPerDay: number;
  timedReminders: boolean;
  timedReminderMinutes: number;
  tafsirResourceId: number | null;
  tafsirResourceName: string | null;
  recitationId: number | null;
  reciterName: string | null;
}

export interface AyahNudgeState {
  lastShownAt: number | null;
  lastTimedReminderAt: number | null;
  shownToday: number;
  shownTodayDate: string | null;
  recentAppThemeKeys: Array<{ key: string; shownAt: number }>;
}

export interface QuranSetupConfig {
  clientId: string;
  encryptedClientSecret: string | null;
  redirectUri: string;
  environment: 'prelive' | 'production';
}

export interface AyahLensState {
  quranConfig: QuranSetupConfig;
  quranAuth: {
    encryptedAccessToken: string | null;
    encryptedRefreshToken: string | null;
    expiresAt: number | null;
    scopes: string[];
    userName?: string;
  };
  contentAuth: {
    encryptedAccessToken: string | null;
    expiresAt: number | null;
  };
  preferences: AyahLensSettings;
  nudgeState: AyahNudgeState;
  reflections: AyahReflection[];
  collections: AyahCollection[];
  pendingSync: Array<{ reflectionId: string; action: 'bookmark' | 'note' | 'collection' | 'activity'; attempts: number }>;
  recentVerseKeys: string[];
  verseCache: Record<string, QuranVerseContent>;
}

export interface QuranVerseContent {
  verseKey: string;
  surahName: string;
  ayahNumber: number;
  arabicText: string;
  translation: string;
  translatorId: number;
}

export interface QuranBookmarkResult {
  bookmarkId: string | null;
}

export interface AyahDaySummary {
  date: string;
  reflectionCount: number;
  savedCount: number;
  noteCount: number;
  themes: Array<{ id: AyahTheme; count: number }>;
  reflections: Array<{
    id: string;
    verseKey: string;
    surahName: string;
    reflection: string;
    note?: string;
  }>;
}

export interface QuranStreakSummary {
  currentDays: number | null;
  recordedToday: boolean;
  syncState: 'synced' | 'pending' | 'unavailable';
  error?: string;
}
