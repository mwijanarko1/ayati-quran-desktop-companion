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
  footnotes?: Footnote[];
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
  /** When true, bundled QUL script/font is used for Arabic where assets exist (falls back to Quran Foundation text). */
  qulArabicEnabled?: boolean;
  /** Must match a row in `verse_scripts` for the shipped qul_rendering.sqlite bundle. */
  qulMushafKey?: string;
  /** Render tajweed color markup for mushafs that support it in QUL. */
  qulTajweedEnabled?: boolean;
  captureMode: 'fullScreen';
  saveScreenshots: false;
  defaultSave: boolean;
  contextualNudges: boolean;
  nudgeCooldownMinutes: number;
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

export type PrayerName = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

export interface PrayerTimeEntry {
  name: PrayerName;
  label: string;
  time: string;
  at: number;
  isReminderEnabled: boolean;
  iqamahTime?: string;
}

export interface PrayerSettings {
  enabled: boolean;
  source: 'calculation' | 'masjidly';
  mosqueSlug: string;
  showIqamah: boolean;
  /** Last calculation-source location; preserved while Masjidly is selected. */
  calculationCity: string;
  calculationCountry: string;
  city: string;
  country: string;
  method: number;
  school: 0 | 1;
  reminderLeadMinutes: number;
  quietMinutesAfterPrayer: number;
  hasSavedSettings: boolean;
  use24h: boolean;
}

export interface PrayerDay {
  date: string;
  city: string;
  country: string;
  method: number;
  school: 0 | 1;
  timezone: string;
  source: 'aladhan' | 'masjidly';
  mosqueSlug?: string;
  mosqueName?: string;
  fetchedAt: number;
  prayers: PrayerTimeEntry[];
  error?: string;
}

/** Today plus the following calendar day, used after the last prayer of the day (Isha) to show the next Fajr. */
export interface PrayerTimesBundle {
  today: PrayerDay | null;
  tomorrow: PrayerDay | null;
}

export interface PrayerAwarenessState {
  settings: PrayerSettings;
  today: PrayerDay | null;
  tomorrow: PrayerDay | null;
  sentReminderKeys: string[];
}

export type TodoPriority = 'none' | 'low' | 'medium' | 'high';

export interface TodoSettings {
  petRemindersEnabled: boolean;
}

export interface TodoItem {
  id: string;
  title: string;
  notes: string;
  priority: TodoPriority;
  createdAt: number;
  updatedAt: number;
  dueAt: number | null;
  reminderAt: number | null;
  completedAt: number | null;
}

export interface TodoState {
  settings: TodoSettings;
  items: TodoItem[];
  sentReminderIds: string[];
}

export type PomodoroSessionKind = 'focus' | 'break';
export type PomodoroSessionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'cancelled';

export interface PomodoroSettings {
  focusMinutes: number;
  breakMinutes: number;
  petRemindersEnabled: boolean;
}

export interface PomodoroActiveSession {
  id: string;
  kind: PomodoroSessionKind;
  status: Exclude<PomodoroSessionStatus, 'idle'>;
  startedAt: number;
  pausedAt: number | null;
  accumulatedPausedMs: number;
  durationMinutes: number;
  todoId: string | null;
  completedAt: number | null;
}

export interface PomodoroSessionLog {
  id: string;
  kind: PomodoroSessionKind;
  startedAt: number;
  completedAt: number;
  durationMinutes: number;
  todoId: string | null;
}

export interface PomodoroState {
  settings: PomodoroSettings;
  activeSession: PomodoroActiveSession | null;
  completedFocusCount: number;
  history: PomodoroSessionLog[];
  sentCompletionIds: string[];
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
  prayer: PrayerAwarenessState;
  todos: TodoState;
  pomodoro: PomodoroState;
}

export interface Footnote {
  id: number;
  number: number;
  text: string;
  languageName?: string;
}

export interface QuranVerseContent {
  verseKey: string;
  surahName: string;
  ayahNumber: number;
  arabicText: string;
  translation: string;
  translatorId: number;
  footnotes?: Footnote[];
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
