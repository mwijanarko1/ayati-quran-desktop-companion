/// <reference types="vite/client" />

// Iconify icon web component
declare namespace JSX {
  interface IntrinsicElements {
    'iconify-icon': React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        icon: string;
        width?: string;
        height?: string;
        flip?: string;
        rotate?: string;
      },
      HTMLElement
    >;
  }
}

interface ScreenContext {
  image: string;
  cursor: { x: number; y: number };
  screenSize: { width: number; height: number };
}

type AyahTheme =
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

type ClawBotProvider =
  | 'openrouter'
  | 'openai'
  | 'gemini'
  | 'deepseek'
  | 'anthropic'
  | 'xai'
  | 'moonshot'
  | 'zai'
  | 'openai-compatible';

interface AyahReflection {
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
  themes: Array<{ id: AyahTheme; confidence: number }>;
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

interface Footnote {
  id: number;
  number: number;
  text: string;
}

interface QuranTafsirSnippet {
  resourceId: number;
  resourceName: string;
  languageName?: string;
  text: string;
  fetchedAt: number;
}

interface QuranAudioFile {
  recitationId: number;
  reciterName?: string;
  url: string;
  duration?: number;
  fetchedAt: number;
}

interface AyahReflectionNote {
  localId: string;
  quranNoteId?: string;
  body: string;
  syncState: 'local' | 'synced' | 'pending' | 'failed';
  createdAt: number;
  updatedAt: number;
}

interface AyahCollection {
  id: string;
  name: string;
  slug?: string;
  syncState: 'synced' | 'pending' | 'failed';
}

interface ReflectionFeedback {
  value: 'relevant' | 'not_relevant';
  createdAt: number;
}

interface PendingAyahReflectionResult {
  reflection?: AyahReflection;
  error?: string;
}

interface AyahDaySummary {
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

interface QuranStreakSummary {
  currentDays: number | null;
  recordedToday: boolean;
  syncState: 'synced' | 'pending' | 'unavailable';
  error?: string;
}

interface QuranAuthStatus {
  isConnected: boolean;
  userName?: string;
  scopes: string[];
  expiresAt?: number;
  error?: string;
}

interface KeychainConsentStatus {
  required: boolean;
  acknowledged: boolean;
  hasStoredSecrets: boolean;
}

interface AyahLensSettings {
  translationId: number;
  mushafId: number;
  qulArabicEnabled?: boolean;
  qulMushafKey?: string;
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

interface QuranRecitationResource {
  id: number;
  name: string;
}

interface QulRenderedVersePayload {
  surahId: number;
  ayahNumber: number;
  displayText: string;
  markupText: string | null;
  rendererKind: 'pageGlyph' | 'unicodeFont';
  pageNumber: number | null;
  fontPostScriptName: string;
  fontAbsolutePath: string;
}

type PrayerName = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
interface PrayerTimeEntry {
  name: PrayerName;
  label: string;
  time: string;
  at: number;
  isReminderEnabled: boolean;
  iqamahTime?: string;
}
interface MasjidlyMosqueSummary {
  slug: string;
  name: string;
  cityName: string;
  countryName: string;
  timezone: string;
}
interface PrayerSettings {
  enabled: boolean;
  source: 'calculation' | 'masjidly';
  mosqueSlug: string;
  showIqamah: boolean;
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
interface PrayerDay {
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
interface PrayerTimesBundle {
  today: PrayerDay | null;
  tomorrow: PrayerDay | null;
}
type TodoPriority = 'none' | 'low' | 'medium' | 'high';
interface TodoSettings {
  petRemindersEnabled: boolean;
}
interface TodoItem {
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
type CreateTodoInput = Pick<TodoItem, 'title'> & Partial<Pick<TodoItem, 'notes' | 'priority' | 'dueAt' | 'reminderAt'>>;
type UpdateTodoInput = Partial<Pick<TodoItem, 'title' | 'notes' | 'priority' | 'dueAt' | 'reminderAt'>>;
type PomodoroSessionKind = 'focus' | 'break';
interface PomodoroSettings {
  focusMinutes: number;
  breakMinutes: number;
  petRemindersEnabled: boolean;
}
interface PomodoroActiveSession {
  id: string;
  kind: PomodoroSessionKind;
  status: 'running' | 'paused' | 'completed' | 'cancelled';
  startedAt: number;
  pausedAt: number | null;
  accumulatedPausedMs: number;
  durationMinutes: number;
  todoId: string | null;
  completedAt: number | null;
}
interface PomodoroState {
  settings: PomodoroSettings;
  activeSession: PomodoroActiveSession | null;
  completedFocusCount: number;
  history: Array<{
    id: string;
    kind: PomodoroSessionKind;
    startedAt: number;
    completedAt: number;
    durationMinutes: number;
    todoId: string | null;
  }>;
  sentCompletionIds: string[];
  remainingMs?: number | null;
}
interface StartPomodoroInput {
  kind: PomodoroSessionKind;
  durationMinutes?: number;
  todoId?: string | null;
}

interface OnboardingData {
  workspaceType: 'ayati';
  launchOnStartup: boolean;
  watchFolders: string[];
  watchActiveApp: boolean;
  watchWindowTitles: boolean;
  hotkeyOpenAssistant: string;
  hotkeyHideApp: string;
}

interface CurrentWorkspaceInfo {
  workspaceType: 'ayati' | null;
  workspacePath: string | null;
  exists: boolean;
}

interface WorkspaceEntry {
  name: string;
  path: string;
  kind: 'file' | 'directory';
  createdAt: number;
  modifiedAt: number;
  accessedAt: number;
}

interface WorkspaceDirectoryResult {
  success: boolean;
  currentPath: string;
  entries: WorkspaceEntry[];
  error?: 'missing_workspace' | 'path_not_found' | 'outside_workspace' | 'not_directory' | 'open_failed';
}

interface WorkspaceOpenResult {
  success: boolean;
  error?: 'missing_workspace' | 'path_not_found' | 'outside_workspace' | 'not_directory' | 'open_failed';
  message?: string;
}

interface WorkspacePreviewResult {
  success: boolean;
  path: string;
  previewKind?: 'markdown' | 'image' | 'json';
  content?: string;
  error?: 'missing_workspace' | 'path_not_found' | 'outside_workspace' | 'not_directory' | 'open_failed' | 'not_file' | 'unsupported_preview' | 'file_too_large' | 'read_failed';
  message?: string;
}

type DesktopUpdateStatus =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error';

type DesktopRuntimeArch = 'arm64' | 'x64' | 'other';

interface DesktopUpdateState {
  enabled: boolean;
  status: DesktopUpdateStatus;
  currentVersion: string;
  hostArch: DesktopRuntimeArch;
  appArch: DesktopRuntimeArch;
  runningUnderArm64Translation: boolean;
  availableVersion: string | null;
  downloadedVersion: string | null;
  downloadPercent: number | null;
  checkedAt: string | null;
  message: string | null;
  errorContext: 'check' | 'download' | 'install' | null;
  canRetry: boolean;
}

interface DesktopUpdateActionResult {
  accepted: boolean;
  completed: boolean;
  state: DesktopUpdateState;
}

interface DesktopUpdateCheckResult {
  checked: boolean;
  state: DesktopUpdateState;
}

interface AyatiAPI {
  toggleAssistant: () => void;
  openAssistant: () => void;
  closeAssistant: () => void;
  openWorkspaceBrowser: () => void;
  closeWorkspaceBrowser: () => void;
  forcePetSleep: () => void;
  forceActiveAppComment: () => Promise<boolean>;
  forceTimedReminderComment: () => Promise<boolean>;
  forceWelcomeChatBubble: () => Promise<boolean>;
  forcePrayerReminderComment: () => Promise<boolean>;
  forceTodoReminderComment: () => Promise<boolean>;
  toggleChatbar: () => void;
  closeChatbar: () => void;
  setChatbarIgnoreMouse: (ignore: boolean) => void;
  toggleScreenshotQuestion: () => void;
  closeScreenshotQuestion: () => void;
  dragPet: (deltaX: number, deltaY: number) => void;
  showPetChat: (message: {
    id: string;
    text: string;
    quickReplies?: string[];
    reflectionId?: string;
    verseKey?: string;
    arabicText?: string;
    footerText?: string;
  }) => void;
  hidePetChat: () => void;
  resizePetChat: (width: number, height: number) => void;
  petChatInteracted: () => void;
  setPetChatAudioPlaying: (isPlaying: boolean) => void;
  onPetChatMessage: (callback: (message: {
    id: string;
    text: string;
    quickReplies?: string[];
    reflectionId?: string;
    verseKey?: string;
    arabicText?: string;
    footerText?: string;
  }) => void) => void;
  petChatReply: (reply: string) => void;
  onPetChatReply: (callback: (reply: string) => void) => void;
  openExternal: (url: string) => void;
  openPath: (path: string) => void;
  getCurrentWorkspaceInfo: () => Promise<CurrentWorkspaceInfo>;
  listWorkspaceDirectory: (relativePath?: string) => Promise<WorkspaceDirectoryResult>;
  openWorkspacePath: (relativePath?: string) => Promise<WorkspaceOpenResult>;
  revealWorkspacePath: (relativePath?: string) => Promise<WorkspaceOpenResult>;
  previewWorkspaceFile: (relativePath?: string) => Promise<WorkspacePreviewResult>;
  getSettings: () => Promise<unknown>;
  updateSettings: (key: string, value: unknown) => Promise<unknown>;
  beginHotkeyCapture: () => Promise<void>;
  endHotkeyCapture: () => Promise<void>;
  getUpdateState: () => Promise<DesktopUpdateState>;
  checkForUpdate: () => Promise<DesktopUpdateCheckResult>;
  downloadUpdate: () => Promise<DesktopUpdateActionResult>;
  installUpdate: () => Promise<DesktopUpdateActionResult>;
  onUpdateState: (callback: (state: DesktopUpdateState) => void) => void;
  startQuranOAuth: () => Promise<{ authorizeUrl: string }>;
  completeQuranOAuthCallback: (callbackUrl: string) => Promise<QuranAuthStatus>;
  getQuranAuthStatus: () => Promise<QuranAuthStatus>;
  disconnectQuranAccount: () => Promise<boolean>;
  getKeychainConsentStatus: () => Promise<KeychainConsentStatus>;
  acknowledgeKeychainConsent: () => Promise<boolean>;
  ensureKeychainConsent: () => Promise<{ granted: boolean }>;
  captureAyahReflection: (theme?: AyahTheme) => Promise<AyahReflection>;
  getPendingAyahReflectionResult: () => Promise<PendingAyahReflectionResult | null>;
  saveAyahReflection: (reflectionId: string) => Promise<AyahReflection | null>;
  getAyahReflectionHistory: () => Promise<AyahReflection[]>;
  deleteAyahReflection: (reflectionId: string) => Promise<boolean>;
  getAyahTafsir: (reflectionId: string, resourceId?: number) => Promise<AyahReflection | null>;
  getAyahTafsirResources: () => Promise<Array<{ id: number; name: string; languageName?: string }>>;
  getAyahTranslationResources: () => Promise<Array<{ id: number; name: string; languageName?: string }>>;
  getAyahAudio: (reflectionId: string) => Promise<AyahReflection | null>;
  saveAyahReflectionNote: (reflectionId: string, body: string) => Promise<AyahReflection | null>;
  getAyahCollections: () => Promise<AyahCollection[]>;
  createAyahCollection: (name: string) => Promise<AyahCollection>;
  addReflectionToCollection: (reflectionId: string, collectionId: string) => Promise<AyahReflection | null>;
  setReflectionFeedback: (reflectionId: string, value: 'relevant' | 'not_relevant') => Promise<AyahReflection | null>;
  showAlternateAyah: (reflectionId: string) => Promise<AyahReflection | null>;
  getAyahDaySummary: () => Promise<AyahDaySummary>;
  getQuranStreakSummary: () => Promise<QuranStreakSummary>;
  copyReflectionShareCard: (reflectionId: string) => Promise<boolean>;
  getAyahLensSettings: () => Promise<AyahLensSettings>;
  getAyahRecitationResources: () => Promise<QuranRecitationResource[]>;
  updateAyahLensSetting: (key: string, value: unknown) => Promise<AyahLensSettings>;
  qulIsAvailable: () => Promise<boolean>;
  getQulFontPacks: () => Promise<Record<string, boolean>>;
  getQulRenderedVerse: (params: {
    verseKey: string;
    mushafKey: string;
    includeTajweed: boolean;
  }) => Promise<QulRenderedVersePayload | null>;
  readQulFontFile: (fontAbsolutePath: string) => Promise<Uint8Array | null>;
  getPrayerSettings: () => Promise<PrayerSettings>;
  updatePrayerSettings: (patch: Partial<PrayerSettings>) => Promise<PrayerSettings>;
  listMasjidlyMosques: () => Promise<MasjidlyMosqueSummary[]>;
  getPrayerTimes: () => Promise<PrayerTimesBundle | null>;
  refreshPrayerTimes: () => Promise<PrayerTimesBundle | null>;
  getTodos: () => Promise<TodoItem[]>;
  onTodosUpdated: (callback: (todos: TodoItem[]) => void) => void;
  onReflectionsUpdated: (callback: () => void) => void;
  updateTodoSettings: (patch: Partial<TodoSettings>) => Promise<TodoSettings>;
  createTodo: (input: CreateTodoInput) => Promise<TodoItem[]>;
  updateTodo: (todoId: string, patch: UpdateTodoInput) => Promise<TodoItem[]>;
  completeTodo: (todoId: string, completed: boolean) => Promise<TodoItem[]>;
  deleteTodo: (todoId: string) => Promise<TodoItem[]>;
  getPomodoroState: () => Promise<PomodoroState>;
  updatePomodoroSettings: (patch: Partial<PomodoroSettings>) => Promise<PomodoroState>;
  startPomodoro: (input: StartPomodoroInput) => Promise<PomodoroState>;
  pausePomodoro: () => Promise<PomodoroState>;
  resumePomodoro: () => Promise<PomodoroState>;
  cancelPomodoro: () => Promise<PomodoroState>;
  completePomodoro: () => Promise<PomodoroState>;
  onPomodoroOverlayUpdate: (
    callback: (payload: {
      remainingMs: number;
      kind: PomodoroSessionKind;
      status: 'running' | 'paused';
    } | null) => void,
  ) => void;
  offPomodoroOverlayUpdate: () => void;
  onAyahOAuthCallback: (callback: (callbackUrl: string) => void) => void;
  getChatHistory: () => Promise<unknown[]>;
  saveChatHistory: (messages: unknown[]) => Promise<boolean>;
  clearChatHistory: () => Promise<boolean>;
  notifyChatSync: () => void;
  captureScreen: () => Promise<string | null>;
  captureScreenWithContext: () => Promise<ScreenContext | null>;
  getScreenContext: () => Promise<unknown>;
  getScreenCapturePermission: () => Promise<'granted' | 'denied' | 'not-determined' | 'restricted'>;
  checkAccessibilityPermission: (prompt?: boolean) => Promise<boolean>;
  sendToClawbot: (message: string, includeScreen?: boolean) => Promise<unknown>;
  startClawbotStream: (message: string, includeScreen?: boolean) => Promise<{ requestId?: string; error?: string }>;
  askAboutScreen: (question: string, imageDataUrl: string) => Promise<unknown>;
  getClawbotStatus: () => Promise<{ connected: boolean; error: string | null; gatewayUrl: string }>;
  onConnectionStatusChange: (callback: (status: { connected: boolean; error: string | null; gatewayUrl: string }) => void) => void;
  onClawbotStreamChunk: (callback: (data: { requestId: string; delta: string; text: string }) => void) => void;
  onClawbotStreamEnd: (callback: (data: { requestId: string; response: unknown }) => void) => void;
  onClawbotStreamError: (callback: (data: { requestId: string; error: string }) => void) => void;
  copyToClipboard: (text: string) => Promise<boolean>;
  executePetAction: (action: unknown) => Promise<void>;
  movePetTo: (x: number, y: number, duration?: number) => Promise<void>;
  movePetToCursor: () => Promise<void>;
  playPetWakeFlight: () => Promise<void>;
  getCursorPosition: () => Promise<{ x: number; y: number }>;
  getPetPosition: () => Promise<[number, number]>;
  onActivityEvent: (callback: (event: unknown) => void) => void;
  onClawbotSuggestion: (callback: (data: unknown) => void) => void;
  onClawbotMood: (callback: (data: unknown) => void) => void;
  onCronResult: (callback: (data: { jobId: string; jobName: string; status: string; summary: string; timestamp: number }) => void) => void;
  onCronError: (callback: (data: { jobId: string; jobName: string; error: string; timestamp: number }) => void) => void;
  onChatPopup: (callback: (data: unknown) => void) => void;
  onPetMoving: (callback: (data: { moving: boolean; direction?: 'left' | 'right' }) => void) => void;
  onPetCameraSnap: (callback: (data: { captureAtMs: number; durationMs: number; flashDurationMs: number }) => void) => void;
  onPetTransparentSleepChanged: (callback: (enabled: boolean) => void) => void;
  onDevShowPetModeOverlayChanged: (callback: (enabled: boolean) => void) => void;
  onPetAppearanceChanged: (callback: (appearanceId: string) => void) => void;
  onIdleBehavior: (callback: (data: { type: string; direction?: string }) => void) => void;
  onChatSync: (callback: () => void) => void;
  onSwitchToChat: (callback: () => void) => void;
  onSwitchToSettings: (callback: () => void) => void;
  onSwitchToPrayers: (callback: () => void) => void;
  onSwitchToTodos: (callback: () => void) => void;
  onSwitchToFocus: (callback: () => void) => void;
  onSwitchToReflections: (callback: () => void) => void;
  petClicked: () => void;
  showPetContextMenu: (x: number, y: number) => void;
  hidePetContextMenu: () => void;
  petContextMenuAction: (action: 'chat' | 'settings' | 'workspace' | 'quit') => void;
  removeAllListeners: () => void;
  // Onboarding
  onboardingSkip: () => Promise<boolean>;
  onboardingComplete: (data: OnboardingData) => Promise<boolean>;
  validateGateway: (
    url: string,
    token: string,
    provider?: ClawBotProvider,
    model?: string
  ) => Promise<{ success: boolean; error?: string }>;
  getOnboardingStatus: () => Promise<{ completed: boolean; skipped: boolean }>;
  resetOnboarding: () => Promise<boolean>;
}

interface Window {
  ayati: AyatiAPI;
}
