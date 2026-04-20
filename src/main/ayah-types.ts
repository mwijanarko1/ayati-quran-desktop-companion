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
}

export interface AyahNudgeState {
  lastShownAt: number | null;
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
  pendingSync: Array<{ reflectionId: string; action: 'bookmark'; attempts: number }>;
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
