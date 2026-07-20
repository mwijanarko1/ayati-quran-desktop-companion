import { readFile, stat } from 'fs/promises';
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  desktopCapturer,
  shell,
  screen,
  nativeImage,
  dialog,
  Tray,
  Menu,
  systemPreferences,
  safeStorage,
  clipboard,
  protocol,
} from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import https from 'https';
import { execFile, execSync } from 'child_process';
import { promisify } from 'util';
import { createHash, randomUUID } from 'crypto';
import { config } from 'dotenv';
import { autoUpdater } from 'electron-updater';
import sharp from 'sharp';
import { Watchers } from './watchers';
import {
  buildChatCompletionsUrl,
  ClawBotClient,
  normalizeClawBotProvider,
  type ClawBotProvider,
} from './clawbot-client';
import { createStore } from './store';
import { getFrontmostWindowTitleFromSystemEvents } from './window-title';
import { buildContextualQuranNudge, buildTimedQuranReminder } from './ayah-contextual-nudges';
import { createManualReflectionInsight } from './ayah-manual-reflection';
import { fetchVerseContentForReflection as fetchVerseContentWithFallback } from './ayah-reflection-content';
import {
  createDefaultAyahLensState,
  addReflectionToCollectionLocal,
  clearPendingSyncAction,
  deleteReflection,
  listReflectionIdsNeedingBookmarkSync,
  markReflectionPendingSync,
  markReflectionSynced,
  saveReflectionLocally,
  saveReflectionNoteLocal,
  setReflectionFeedbackLocal,
  upsertCollectionLocal,
  updateReflection,
} from './ayah-reflection-store';
import { rankAyahCandidates, type AyahFeedbackSignal } from './ayah-theme-engine';
import type {
  AyahCollection,
  AyahDaySummary,
  AyahLensSettings,
  AyahLensState,
  AyahReflection,
  PomodoroSettings,
  PomodoroSessionKind,
  PrayerSettings,
  QuranAuthStatus,
  QuranStreakSummary,
  QuranVerseContent,
  ScreenInsight,
  TodoSettings,
} from './ayah-types';
import { createPkcePair, QuranFoundationClient, QuranFoundationError, type StoredTokenSet } from './quran-foundation-client';
import { QURAN_OAUTH_SCOPES } from './quran-oauth-scopes';
import { DEFAULT_PUBLIC_QURAN_CLIENT_ID, resolveQuranClientConfig } from './quran-runtime-config';
import {
  acknowledgeKeychainConsent,
  ensureKeychainConsent,
  getKeychainConsentStatus,
  isMacKeychainEncryptionAvailable,
  KEYCHAIN_CONSENT_DENIED_MESSAGE,
} from './keychain-consent';
import {
  coerceQulVerseScriptMushafKey,
  getQulRenderedVerse,
  isQulBundleAvailable,
  parseVerseKeyToSurahAyah,
  QUL_VERSE_SCRIPT_KEYS,
} from './qul/bundled-qul-repository';
import { resolveQulRoot, isFontPathWithinQulRoot } from './qul/qul-paths';
import { getQulFontPackPresence } from './qul/qul-font-packs';
import { getDefaultClawBotModel } from './ai-provider-defaults';
import { DEFAULT_HOTKEYS, sanitizeAccelerator } from './hotkeys';
import { getAiProviderConfig } from './ai-providers';
import { getWindowPositionNearAnchor } from './window-positioning';
import { APP_DISPLAY_NAME, APP_FULL_NAME } from '../shared/app-branding';
import { PET_WINDOW_HEIGHT, PET_WINDOW_WIDTH } from '../shared/pet-window-size';
import { getAssistantWindowStackingPolicy } from './window-stacking-policy';
import { enforceSingleInstanceApp } from './single-instance';
import { selectPreferredWindow } from './window-selection';
import { shouldHideWindowOnBlur, shouldRevealWindowInactive } from './window-visibility-policy';
import {
  createConfiguredUpdateState,
  createInitialUpdateState,
  getAutoUpdateDisabledReason,
  isArm64HostRunningIntelBuild,
  reduceUpdateStateOnCheckFailure,
  reduceUpdateStateOnCheckStart,
  reduceUpdateStateOnDownloadComplete,
  reduceUpdateStateOnDownloadFailure,
  reduceUpdateStateOnDownloadProgress,
  reduceUpdateStateOnDownloadStart,
  reduceUpdateStateOnInstallFailure,
  reduceUpdateStateOnNoUpdate,
  reduceUpdateStateOnUpdateAvailable,
  resolveDesktopRuntimeInfo,
  shouldBroadcastDownloadProgress,
  type DesktopUpdateActionResult,
  type DesktopUpdateCheckResult,
  type DesktopUpdateState,
} from './updates';
import {
  getUpdateMetadataPlatformKey,
  isVersionGreater,
  parseUpdateMetadata,
  selectUpdateFromMetadata,
  type SelectedUpdateMetadata,
} from './update-metadata';
import { fetchMasjidlyPrayerTimes, fetchPrayerTimesByCity, listMasjidlyMosques } from './prayer-times-client';
import {
  isInsidePrayerQuietWindow,
  mergePrayerSettings,
  shouldRefreshPrayerDay,
  shouldSendPrayerReminder,
} from './prayer-awareness';
import {
  createTodo,
  deleteTodo as deleteTodoItem,
  getDueTodoReminder,
  listTodos,
  purgeCompletedTodos,
  setTodoCompleted,
  updateTodo,
} from './todo-store';
import {
  cancelPomodoroSession,
  completePomodoroSession,
  getDuePomodoroCompletion,
  getNextPomodoroKind,
  getPomodoroRemainingMs,
  pausePomodoroSession,
  resumePomodoroSession,
  startPomodoroSession,
} from './pomodoro-store';
import { formatPomodoroClock, type PomodoroPetOverlayPayload } from '../shared/pomodoro-client';
import {
  filterAvailableRecitationResources,
  selectDefaultRecitationResource,
} from '../shared/quran-reciter-preferences';

const execFileAsync = promisify(execFile);

// Load local env files for development only. Packaged release builds use baked-in
// production defaults and the Vercel OAuth proxy — never ship or load secrets from disk.
if (!app.isPackaged) {
  const repoRoot = process.cwd();
  config({ path: path.join(repoRoot, '.env') });
  config({ path: path.join(repoRoot, '.env.local'), override: true });
}

// Fix transparent window rendering on some Mac hardware (e.g. Mac Mini)
// Electron has a bug where transparent windows < 162px become opaque on external/4K displays
// See: https://github.com/electron/electron/issues/44884
app.disableHardwareAcceleration();

// Windows
let petWindow: BrowserWindow | null = null;
let petChatWindow: BrowserWindow | null = null;
let petPomodoroTimerWindow: BrowserWindow | null = null;
let pendingPomodoroTimerLoadHandler: (() => void) | null = null;
let assistantWindow: BrowserWindow | null = null;
let chatbarWindow: BrowserWindow | null = null;
let screenshotQuestionWindow: BrowserWindow | null = null;
let onboardingWindow: BrowserWindow | null = null;
let petContextMenuWindow: BrowserWindow | null = null;
let workspaceBrowserWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const DEFAULT_TRAY_TOOLTIP = APP_DISPLAY_NAME;
let isChatbarWindowReady = false;
let shouldRevealChatbarWhenReady = false;
let shouldRevealAssistantWhenReady = false;

/** Main surfaces only — used to restore after global "hide app" shortcut; transients (screenshot modal, pet chat) are not re-shown. */
type CompanionHideSnapshot = {
  pet: boolean;
  assistant: boolean;
  chatbar: boolean;
  workspaceBrowser: boolean;
};

let companionSnapshotForRestore: CompanionHideSnapshot | null = null;
let pendingPetChatReveal = false;
let petChatRevealTimeout: NodeJS.Timeout | null = null;
let petChatAutoHideTimeout: NodeJS.Timeout | null = null;
let isPetChatAudioPlaying = false;
let pendingAyahReflectionResult: { reflection?: AyahReflection; error?: string } | null = null;
/** When set, screenshot modal opened before prepare finished; IPC waits on this so the renderer does not start a second capture. */
let ayahReflectionPrepareInFlight: Promise<void> | null = null;
/** Brief echo so a second `getPending` (e.g. React Strict Mode remount) still receives the same result instead of starting another capture. */
let ayahPendingReflectionEcho: { reflection?: AyahReflection; error?: string } | null = null;
let ayahPendingReflectionEchoUntil = 0;

// Services
let watchers: Watchers | null = null;
let clawbot: ClawBotClient | null = null;
const store = createStore();
type QuranOAuthSession = { state: string; nonce: string; verifier: string; createdAt: number };
type StoredQuranOAuthSession = { state: string; nonce: string; encryptedVerifier: string; createdAt: number };
const QURAN_OAUTH_PENDING_SESSION_STORE_KEY = 'quranOAuth.pendingSession';
let quranOAuthSession: QuranOAuthSession | null = null;
const desktopRuntimeInfo = resolveDesktopRuntimeInfo({
  platform: process.platform,
  processArch: process.arch,
  runningUnderArm64Translation: Boolean(
    (app as { runningUnderARM64Translation?: boolean }).runningUnderARM64Translation,
  ),
});
let updateState: DesktopUpdateState = createInitialUpdateState(app.getVersion(), desktopRuntimeInfo);
let updaterConfigured = false;
let updateCheckInFlight = false;
let updateDownloadInFlight = false;
let updateInstallInFlight = false;
let updateStartupTimer: NodeJS.Timeout | null = null;
let updatePollTimer: NodeJS.Timeout | null = null;
let pendingWebsiteUpdate: SelectedUpdateMetadata | null = null;
let downloadedWebsiteUpdatePath: string | null = null;

const isDev = !app.isPackaged;
const DEV_PORT = process.env.VITE_DEV_PORT || '5173';
const UPDATE_STATE_CHANNEL = 'update-state';
const UPDATE_GET_STATE_CHANNEL = 'update-get-state';
const UPDATE_CHECK_CHANNEL = 'update-check';
const UPDATE_DOWNLOAD_CHANNEL = 'update-download';
const UPDATE_INSTALL_CHANNEL = 'update-install';
const AUTO_UPDATE_STARTUP_DELAY_MS = 10_000;
/** Background check interval when auto-updates are enabled. */
const AUTO_UPDATE_POLL_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_UPDATE_METADATA_URL = 'https://ayati-website.vercel.app/update/latest.json';
const DEFAULT_ELECTRON_UPDATE_FEED_URL = 'https://ayati-website.vercel.app/update/electron';
const UPDATE_METADATA_URL = process.env.AYATI_UPDATE_METADATA_URL || DEFAULT_UPDATE_METADATA_URL;
const ELECTRON_UPDATE_FEED_URL = process.env.AYATI_ELECTRON_UPDATE_FEED_URL || DEFAULT_ELECTRON_UPDATE_FEED_URL;
const USE_WEBSITE_UPDATE_METADATA = process.env.AYATI_USE_WEBSITE_UPDATE_METADATA === 'true';
const REQUIRED_QURAN_DEMO_SCOPES = [
  'collection',
  'collection.create',
  'note',
  'note.create',
  'activity_day',
  'activity_day.create',
  'streak',
  'streak.read',
] as const;
const DEFAULT_ACTIVITY_SECONDS = 30;
const QURAN_OAUTH_SESSION_TTL_MS = 10 * 60 * 1000;
const DEV_WINDOW_BORDER_CSS = `
  html, body {
    box-sizing: border-box !important;
    border: 1px dashed rgba(255, 120, 120, 0.95) !important;
  }
`;
const debugBorderStyleKeys = new WeakMap<BrowserWindow, string>();

const shouldStartApp = enforceSingleInstanceApp(app, getSingleInstanceFocusWindow, handleSecondInstanceArgs);

if (shouldStartApp) {
  app.setName(APP_DISPLAY_NAME);
}

function getAssetPath(fileName: string): string {
  return isDev
    ? path.join(__dirname, '../../assets', fileName)
    : path.join(process.resourcesPath, 'assets', fileName);
}

function getAppIconPath(): string {
  return getAssetPath('icon.png');
}

function createAppIconImage(): Electron.NativeImage {
  return nativeImage.createFromPath(getAppIconPath());
}

function applyDockIcon(): void {
  if (process.platform !== 'darwin') return;
  app.dock?.setIcon(getAppIconPath());
}

function getStoredClawBotProvider(): ClawBotProvider {
  return normalizeClawBotProvider(store.get('clawbot.provider'));
}

function getStoredClawBotModel(provider: ClawBotProvider): string {
  const model = store.get('clawbot.model') as string | undefined;
  if (model && model.trim().length > 0) {
    return model;
  }
  return getDefaultClawBotModel(provider);
}

function buildProviderHeaders(url: string, token: string, provider: ClawBotProvider): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (getAiProviderConfig(provider).protocol === 'anthropic-messages') {
    if (token) {
      headers['x-api-key'] = token;
    }
    headers['anthropic-version'] = '2023-06-01';
    return headers;
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  try {
    if (new URL(url).hostname.endsWith('openrouter.ai')) {
      headers['X-OpenRouter-Title'] = APP_FULL_NAME;
    }
  } catch {
    if (url.includes('openrouter.ai')) {
      headers['X-OpenRouter-Title'] = APP_FULL_NAME;
    }
  }
  return headers;
}

function shouldShowDebugWindowBorders(): boolean {
  return isDev && Boolean(store.get('dev.windowBorders'));
}

async function applyDebugWindowBorder(window: BrowserWindow): Promise<void> {
  if (window.isDestroyed() || window.webContents.isDestroyed()) return;

  const previousKey = debugBorderStyleKeys.get(window);
  if (previousKey) {
    try {
      await window.webContents.removeInsertedCSS(previousKey);
    } catch (error) {
      console.warn('[Dev] Failed to remove debug window border CSS:', error);
    }
    debugBorderStyleKeys.delete(window);
  }

  if (!shouldShowDebugWindowBorders()) return;

  try {
    const key = await window.webContents.insertCSS(DEV_WINDOW_BORDER_CSS);
    debugBorderStyleKeys.set(window, key);
  } catch (error) {
    console.warn('[Dev] Failed to apply debug window border CSS:', error);
  }
}

function wireDebugWindowBorder(window: BrowserWindow): void {
  window.webContents.on('did-finish-load', () => {
    void applyDebugWindowBorder(window);
  });
}

function applyDebugWindowBordersToAllWindows(): void {
  const windows = [petWindow, petChatWindow, petPomodoroTimerWindow, assistantWindow, chatbarWindow, screenshotQuestionWindow, onboardingWindow, petContextMenuWindow, workspaceBrowserWindow];
  for (const window of windows) {
    if (!window || window.isDestroyed()) continue;
    void applyDebugWindowBorder(window);
  }
}

function getSingleInstanceFocusWindow(): BrowserWindow | null {
  return selectPreferredWindow([
    assistantWindow,
    chatbarWindow,
    screenshotQuestionWindow,
    workspaceBrowserWindow,
    onboardingWindow,
    petWindow,
  ]);
}

function getAyahLensState(): AyahLensState {
  const stored = store.get('ayahLens') as AyahLensState | undefined;
  if (!stored) {
    const defaultState = createDefaultAyahLensState();
    store.set('ayahLens', defaultState);
    return defaultState;
  }

  const defaultState = createDefaultAyahLensState();
  const mergedPreferences = { ...defaultState.preferences, ...stored.preferences } as AyahLensSettings & { maxNudgesPerDay?: number };
  const { maxNudgesPerDay: _legacyMaxNudgesPerDay, ...preferences } = mergedPreferences;
  if (
    preferences.qulMushafKey === 'madaniTajweed' ||
    preferences.qulMushafKey === 'madani1405' ||
    preferences.qulMushafKey === 'madaniV4Tajweed'
  ) {
    preferences.qulMushafKey = 'madani1421';
  } else if (preferences.qulMushafKey === 'qpcNastaleeq') {
    preferences.qulMushafKey = 'indoPakNastaleeq';
  }

  return {
    ...defaultState,
    ...stored,
    quranConfig: { ...defaultState.quranConfig, ...stored.quranConfig },
    quranAuth: { ...defaultState.quranAuth, ...stored.quranAuth },
    contentAuth: { ...defaultState.contentAuth, ...stored.contentAuth },
    preferences,
    reflections: stored.reflections ?? [],
    collections: stored.collections ?? [],
    pendingSync: stored.pendingSync ?? [],
    recentVerseKeys: stored.recentVerseKeys ?? [],
    nudgeState: { ...defaultState.nudgeState, ...stored.nudgeState },
    verseCache: stored.verseCache ?? {},
    prayer: {
      ...defaultState.prayer,
      ...stored.prayer,
      settings: (() => {
        const merged = { ...defaultState.prayer.settings, ...stored.prayer?.settings };
        // Backfill preserved calculation location from legacy city/country when missing.
        if (!merged.calculationCity && merged.source !== 'masjidly') merged.calculationCity = merged.city ?? '';
        if (!merged.calculationCountry && merged.source !== 'masjidly') merged.calculationCountry = merged.country ?? '';
        return merged;
      })(),
      sentReminderKeys: stored.prayer?.sentReminderKeys ?? [],
    },
    todos: {
      ...defaultState.todos,
      ...stored.todos,
      settings: { ...defaultState.todos.settings, ...stored.todos?.settings },
      items: stored.todos?.items ?? [],
      sentReminderIds: stored.todos?.sentReminderIds ?? [],
    },
    pomodoro: {
      ...defaultState.pomodoro,
      ...stored.pomodoro,
      settings: { ...defaultState.pomodoro.settings, ...stored.pomodoro?.settings },
      history: stored.pomodoro?.history ?? [],
      sentCompletionIds: stored.pomodoro?.sentCompletionIds ?? [],
    },
  };
}

function setAyahLensState(nextState: AyahLensState): void {
  store.set('ayahLens', nextState);
}

function getQuranClient(): QuranFoundationClient {
  return new QuranFoundationClient(resolveQuranClientConfig({
    state: getAyahLensState(),
    env: process.env,
    decryptSecret,
  }));
}

function encryptSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString('base64');
  }
  return Buffer.from(value, 'utf8').toString('base64');
}

function decryptSecret(value: string | null | undefined): string | null {
  if (!value) return null;

  try {
    const buffer = Buffer.from(value, 'base64');
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buffer);
    }
    return buffer.toString('utf8');
  } catch {
    return null;
  }
}

async function persistQuranUserTokens(tokens: StoredTokenSet): Promise<QuranAuthStatus> {
  const granted = await ensureKeychainConsent(store, dialog);
  if (!granted) {
    return {
      isConnected: false,
      scopes: [],
      error: KEYCHAIN_CONSENT_DENIED_MESSAGE,
    };
  }

  const state = getAyahLensState();
  const nextState: AyahLensState = {
    ...state,
    quranAuth: {
      encryptedAccessToken: encryptSecret(tokens.accessToken),
      encryptedRefreshToken: encryptSecret(tokens.refreshToken),
      expiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
      userName: tokens.userName,
    },
  };
  setAyahLensState(nextState);
  const status = getQuranAuthStatusFromState(nextState);
  if (status.isConnected) {
    void syncPendingAyahReflections();
  }
  return status;
}

function getQuranAuthStatusFromState(state: AyahLensState): QuranAuthStatus {
  const hasToken = Boolean(state.quranAuth.encryptedAccessToken || state.quranAuth.encryptedRefreshToken);
  const missingDemoScopes = REQUIRED_QURAN_DEMO_SCOPES.filter((scope) => !state.quranAuth.scopes.includes(scope));
  return {
    isConnected: hasToken && Boolean(state.quranAuth.expiresAt),
    userName: state.quranAuth.userName,
    scopes: state.quranAuth.scopes,
    expiresAt: state.quranAuth.expiresAt ?? undefined,
    error: hasToken && missingDemoScopes.length > 0
      ? 'Reconnect Quran Foundation to enable notes, collections, and streaks.'
      : undefined,
  };
}

function getQuranAuthStatus(): QuranAuthStatus {
  return getQuranAuthStatusFromState(getAyahLensState());
}

function isQuranOAuthCallbackUrl(value: string): boolean {
  return value.startsWith('ayati://oauth/callback')
    && (value.includes('code=') || value.includes('error='));
}

function isStoredQuranOAuthSession(value: unknown): value is StoredQuranOAuthSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<StoredQuranOAuthSession>;
  return typeof session.state === 'string'
    && session.state.length > 0
    && typeof session.nonce === 'string'
    && session.nonce.length > 0
    && typeof session.encryptedVerifier === 'string'
    && session.encryptedVerifier.length > 0
    && typeof session.createdAt === 'number';
}

function persistPendingQuranOAuthSession(session: QuranOAuthSession): void {
  quranOAuthSession = session;
  const encryptedVerifier = encryptSecret(session.verifier);
  if (!encryptedVerifier) return;
  store.set(QURAN_OAUTH_PENDING_SESSION_STORE_KEY, {
    state: session.state,
    nonce: session.nonce,
    encryptedVerifier,
    createdAt: session.createdAt,
  } satisfies StoredQuranOAuthSession);
}

function getPendingQuranOAuthSession(): QuranOAuthSession | null {
  if (quranOAuthSession) return quranOAuthSession;
  const storedSession = store.get(QURAN_OAUTH_PENDING_SESSION_STORE_KEY);
  if (!isStoredQuranOAuthSession(storedSession)) return null;
  const verifier = decryptSecret(storedSession.encryptedVerifier);
  if (!verifier) return null;
  return {
    state: storedSession.state,
    nonce: storedSession.nonce,
    verifier,
    createdAt: storedSession.createdAt,
  };
}

function clearPendingQuranOAuthSession(): void {
  quranOAuthSession = null;
  (store as { delete: (key: string) => void }).delete(QURAN_OAUTH_PENDING_SESSION_STORE_KEY);
}

function findQuranOAuthCallbackUrl(values: readonly string[]): string | null {
  return values.find(isQuranOAuthCallbackUrl) ?? null;
}

function handleSecondInstanceArgs(argv: string[]): void {
  const callbackUrl = findQuranOAuthCallbackUrl(argv);
  if (callbackUrl) {
    deliverQuranOAuthCallback(callbackUrl);
  }
}

function deliverQuranOAuthCallback(callbackUrl: string): void {
  openAssistantOnTab('settings');
  const targetWindow = assistantWindow && !assistantWindow.isDestroyed() ? assistantWindow : null;
  if (!targetWindow) return;

  const sendCallback = () => {
    if (targetWindow.isDestroyed()) return;
    targetWindow.webContents.send('ayah-oauth-callback', callbackUrl);
  };

  if (targetWindow.webContents.isLoading()) {
    targetWindow.webContents.once('did-finish-load', () => {
      setTimeout(sendCallback, 100);
    });
  } else {
    sendCallback();
  }
}

async function getQuranUserAccessToken(): Promise<string | null> {
  const state = getAyahLensState();
  const hasEncryptedSecrets = Boolean(
    state.quranAuth.encryptedAccessToken || state.quranAuth.encryptedRefreshToken,
  );
  if (hasEncryptedSecrets && isMacKeychainEncryptionAvailable()) {
    const granted = await ensureKeychainConsent(store, dialog);
    if (!granted) {
      return null;
    }
  }

  const accessToken = decryptSecret(state.quranAuth.encryptedAccessToken);
  const expiresAt = state.quranAuth.expiresAt ?? 0;

  if (accessToken && expiresAt > Date.now() + 60_000) {
    return accessToken;
  }

  const refreshToken = decryptSecret(state.quranAuth.encryptedRefreshToken);
  if (!refreshToken) {
    return accessToken;
  }

  try {
    const tokens = await getQuranClient().refreshToken(refreshToken);
    await persistQuranUserTokens({
      ...tokens,
      refreshToken: tokens.refreshToken ?? refreshToken,
      userName: tokens.userName ?? state.quranAuth.userName,
    });
    return tokens.accessToken;
  } catch {
    const nextState: AyahLensState = {
      ...state,
      quranAuth: {
        encryptedAccessToken: null,
        encryptedRefreshToken: null,
        expiresAt: null,
        scopes: [],
      },
    };
    setAyahLensState(nextState);
    return null;
  }
}

function getSafeErrorMessage(error: unknown): string {
  if (error instanceof QuranFoundationError) {
    return error.safeMessage;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'Quran Foundation content API failed. Try again later.';
}

function getReflectionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return `${APP_DISPLAY_NAME} could not create a reflection right now.`;
}

async function getQuranContentAccessToken(): Promise<string | null> {
  const userToken = await getQuranUserAccessToken();
  if (userToken) return userToken;

  if (isMacKeychainEncryptionAvailable()) {
    const granted = await ensureKeychainConsent(store, dialog);
    if (!granted) {
      return null;
    }
  }

  const state = getAyahLensState();
  const contentToken = decryptSecret(state.contentAuth.encryptedAccessToken);
  if (contentToken && (state.contentAuth.expiresAt ?? 0) > Date.now() + 60_000) {
    return contentToken;
  }

  try {
    const tokens = await getQuranClient().requestContentToken();
    setAyahLensState({
      ...state,
      contentAuth: {
        encryptedAccessToken: encryptSecret(tokens.accessToken),
        expiresAt: tokens.expiresAt,
      },
    });
    return tokens.accessToken;
  } catch (error) {
    if (error instanceof QuranFoundationError && error.code === 'missing_config') {
      return null;
    }
    throw error;
  }
}

async function fetchVerseContentForReflection(verseKey: string): Promise<QuranVerseContent> {
  const state = getAyahLensState();
  const cacheKey = `${verseKey}:${state.preferences.translationId}`;
  const cached = state.verseCache[cacheKey];
  if (cached) return cached;

  return fetchVerseContentWithFallback(verseKey, async () => {
    const accessToken = await getQuranContentAccessToken();
    const verse = await getQuranClient().fetchVerseContent(
      accessToken,
      verseKey,
      state.preferences.translationId,
    );
    setAyahLensState({
      ...getAyahLensState(),
      verseCache: {
        ...getAyahLensState().verseCache,
        [cacheKey]: verse,
      },
    });
    return verse;
  });
}

function getFeedbackSignals(state: AyahLensState): AyahFeedbackSignal[] {
  return state.reflections
    .filter((reflection) => reflection.feedback)
    .map((reflection) => ({
      verseKey: reflection.verseKey,
      themeId: reflection.themes[0]?.id ?? 'unclear',
      value: reflection.feedback?.value ?? 'relevant',
    }));
}

function getUserTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

function getTodayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getVerseRange(verseKey: string): string {
  return `${verseKey}-${verseKey}`;
}

async function resolveTafsirResource(): Promise<{ id: number; name?: string } | null> {
  const state = getAyahLensState();
  if (state.preferences.tafsirResourceId) {
    return {
      id: state.preferences.tafsirResourceId,
      name: state.preferences.tafsirResourceName ?? undefined,
    };
  }

  const accessToken = await getQuranContentAccessToken();
  const resources = await getQuranClient().fetchTafsirResources(accessToken);
  const preferred = resources.find((resource) => (
    /english/i.test(resource.languageName ?? '')
    && /maarif|ibn kathir|saadi|tafheem/i.test(resource.name)
  )) ?? resources.find((resource) => /english/i.test(resource.languageName ?? '')) ?? resources[0];
  if (!preferred) return null;

  setAyahLensState({
    ...getAyahLensState(),
    preferences: {
      ...getAyahLensState().preferences,
      tafsirResourceId: preferred.id,
      tafsirResourceName: preferred.name,
    },
  });
  return { id: preferred.id, name: preferred.name };
}

async function resolveRecitationResource(): Promise<{ id: number; name?: string } | null> {
  const state = getAyahLensState();
  if (state.preferences.recitationId) {
    return {
      id: state.preferences.recitationId,
      name: state.preferences.reciterName ?? undefined,
    };
  }

  const accessToken = await getQuranContentAccessToken();
  const resources = await getQuranClient().fetchRecitationResources(accessToken);
  const preferred = selectDefaultRecitationResource(resources);
  if (!preferred) return null;

  setAyahLensState({
    ...getAyahLensState(),
    preferences: {
      ...getAyahLensState().preferences,
      recitationId: preferred.id,
      reciterName: preferred.name,
    },
  });
  return { id: preferred.id, name: preferred.name };
}

async function getAyahTafsirById(reflectionId: string, resourceId?: number): Promise<AyahReflection | null> {
  const reflection = getAyahLensState().reflections.find((item) => item.id === reflectionId);
  if (!reflection) return null;

  const forcedResourceId = typeof resourceId === 'number' && Number.isInteger(resourceId) && resourceId > 0
    ? resourceId
    : undefined;

  if (!forcedResourceId && reflection.tafsir) return reflection;

  const resource = forcedResourceId
    ? { id: forcedResourceId, name: undefined as string | undefined }
    : await resolveTafsirResource();
  if (!resource) return reflection;

  const accessToken = await getQuranContentAccessToken();
  const tafsir = await getQuranClient().fetchTafsir(accessToken, reflection.verseKey, resource.id);
  const nextReflection: AyahReflection = { ...reflection, tafsir };
  const nextState = updateReflection(getAyahLensState(), nextReflection);
  setAyahLensState(nextState);
  return nextState.reflections.find((item) => item.id === reflectionId) ?? nextReflection;
}

async function getAyahAudioById(reflectionId: string): Promise<AyahReflection | null> {
  const reflection = getAyahLensState().reflections.find((item) => item.id === reflectionId);
  if (!reflection) return null;

  const resource = await resolveRecitationResource();
  if (!resource) return reflection;
  if (reflection.audio?.recitationId === resource.id) return reflection;

  const accessToken = await getQuranContentAccessToken();
  const audio = await getQuranClient().fetchAyahAudio(accessToken, reflection.verseKey, resource.id, resource.name);
  const nextReflection: AyahReflection = { ...reflection, audio };
  const nextState = updateReflection(getAyahLensState(), nextReflection);
  setAyahLensState(nextState);
  return nextState.reflections.find((item) => item.id === reflectionId) ?? nextReflection;
}

async function captureAyahReflection(theme?: unknown): Promise<AyahReflection> {
  const insight = createManualReflectionInsight(theme);
  const state = getAyahLensState();
  const candidates = rankAyahCandidates(insight, state.recentVerseKeys, getFeedbackSignals(state));
  const candidate = candidates[0];
  const verse = await fetchVerseContentForReflection(candidate.verseKey);
  const reflection = buildAyahReflection(verse, candidate, insight, candidates.map((item) => item.verseKey), 0);
  setAyahLensState(saveReflectionLocally(getAyahLensState(), reflection));
  return reflection;
}

async function preparePendingAyahReflectionResult(): Promise<void> {
  ayahPendingReflectionEcho = null;
  ayahPendingReflectionEchoUntil = 0;
  try {
    pendingAyahReflectionResult = { reflection: await captureAyahReflection() };
  } catch (error) {
    pendingAyahReflectionResult = { error: getReflectionErrorMessage(error) };
  }
}

function buildAyahReflection(
  verse: QuranVerseContent,
  candidate: ReturnType<typeof rankAyahCandidates>[number],
  insight: ScreenInsight,
  rankedCandidateVerseKeys: string[] = [candidate.verseKey],
  sourceCandidateIndex = 0,
  alternateGroupId: string = randomUUID(),
): AyahReflection {
  return {
    id: randomUUID(),
    verseKey: verse.verseKey,
    surahName: verse.surahName,
    ayahNumber: verse.ayahNumber,
    arabicText: verse.arabicText,
    translation: verse.translation,
    translatorId: verse.translatorId,
    reflection: candidate.reflection,
    whyThisVerse: insight.fallbackReason
      ? `${candidate.whyThisVerse} ${insight.fallbackReason}`
      : candidate.whyThisVerse,
    screenSummary: insight.summary,
    themes: insight.themes,
    createdAt: Date.now(),
    syncState: 'local',
    rankedCandidateVerseKeys,
    sourceCandidateIndex,
    alternateGroupId,
    footnotes: verse.footnotes,
  };
}

async function syncBookmarkForReflection(reflectionId: string, accessToken: string): Promise<boolean> {
  const reflection = getAyahLensState().reflections.find((item) => item.id === reflectionId);
  if (!reflection?.savedAt || reflection.quranBookmarkId) {
    return true;
  }

  try {
    const result = await getQuranClient().createBookmark(accessToken, {
      verseKey: reflection.verseKey,
      mushafId: getAyahLensState().preferences.mushafId,
    });
    setAyahLensState(markReflectionSynced(getAyahLensState(), reflectionId, result.bookmarkId));
    const syncedReflection = getAyahLensState().reflections.find((item) => item.id === reflectionId);
    if (syncedReflection) {
      await recordReflectionActivity(syncedReflection);
    }
    return true;
  } catch {
    setAyahLensState(markReflectionPendingSync(getAyahLensState(), reflectionId, 'bookmark'));
    return false;
  }
}

async function syncNoteForReflection(reflectionId: string, accessToken: string): Promise<boolean> {
  const reflection = getAyahLensState().reflections.find((item) => item.id === reflectionId);
  const body = reflection?.note?.body?.trim();
  if (!reflection || !body || reflection.note?.quranNoteId) {
    return true;
  }

  try {
    const quranNoteId = await getQuranClient().createNote(accessToken, {
      reflectionId,
      verseKey: reflection.verseKey,
      body,
    });
    const nextState = clearPendingSyncAction(
      saveReflectionNoteLocal(getAyahLensState(), reflectionId, {
        body,
        quranNoteId: quranNoteId ?? undefined,
        syncState: quranNoteId ? 'synced' : 'local',
      }),
      reflectionId,
      'note',
    );
    setAyahLensState(nextState);
    return true;
  } catch {
    const noteState = saveReflectionNoteLocal(getAyahLensState(), reflectionId, {
      body,
      syncState: 'pending',
    });
    setAyahLensState(markReflectionPendingSync(noteState, reflectionId, 'note'));
    return false;
  }
}

async function syncPendingAyahReflections(): Promise<void> {
  const accessToken = await getQuranUserAccessToken();
  if (!accessToken) return;

  const bookmarkIds = listReflectionIdsNeedingBookmarkSync(getAyahLensState());
  for (const reflectionId of bookmarkIds) {
    await syncBookmarkForReflection(reflectionId, accessToken);
  }

  const noteIds = [...new Set(
    getAyahLensState().pendingSync
      .filter((item) => item.action === 'note')
      .map((item) => item.reflectionId),
  )];
  for (const reflectionId of noteIds) {
    await syncNoteForReflection(reflectionId, accessToken);
  }

  broadcastReflectionsUpdated();
}

async function recordReflectionActivity(reflection: AyahReflection): Promise<void> {
  const accessToken = await getQuranUserAccessToken();
  if (!accessToken) return;

  try {
    await getQuranClient().recordActivityDay(accessToken, {
      verseKey: reflection.verseKey,
      mushafId: getAyahLensState().preferences.mushafId,
      seconds: DEFAULT_ACTIVITY_SECONDS,
      timezone: getUserTimezone(),
    });
  } catch {
    setAyahLensState(markReflectionPendingSync(getAyahLensState(), reflection.id, 'activity'));
  }
}

async function saveAyahReflectionById(reflectionId: string): Promise<AyahReflection | null> {
  const state = getAyahLensState();
  const reflection = state.reflections.find((item) => item.id === reflectionId);
  if (!reflection) return null;

  const savedReflection: AyahReflection = {
    ...reflection,
    savedAt: reflection.savedAt ?? Date.now(),
  };
  setAyahLensState(updateReflection(getAyahLensState(), savedReflection));

  const accessToken = await getQuranUserAccessToken();
  if (!accessToken) {
    const pendingState = markReflectionPendingSync(getAyahLensState(), reflectionId, 'bookmark');
    setAyahLensState(pendingState);
    broadcastReflectionsUpdated();
    return pendingState.reflections.find((item) => item.id === reflectionId) ?? savedReflection;
  }

  const synced = await syncBookmarkForReflection(reflectionId, accessToken);
  broadcastReflectionsUpdated();
  if (!synced) {
    return getAyahLensState().reflections.find((item) => item.id === reflectionId) ?? savedReflection;
  }
  return getAyahLensState().reflections.find((item) => item.id === reflectionId) ?? savedReflection;
}

async function saveAyahReflectionNoteById(reflectionId: string, body: string): Promise<AyahReflection | null> {
  const trimmedBody = body.trim();
  if (trimmedBody.length < 6 || trimmedBody.length > 10_000) return null;

  const reflection = getAyahLensState().reflections.find((item) => item.id === reflectionId);
  if (!reflection) return null;

  const accessToken = await getQuranUserAccessToken();
  if (!accessToken) {
    const nextState = saveReflectionNoteLocal(getAyahLensState(), reflectionId, {
      body: trimmedBody,
      syncState: 'pending',
    });
    setAyahLensState(markReflectionPendingSync(nextState, reflectionId, 'note'));
    return getAyahLensState().reflections.find((item) => item.id === reflectionId) ?? null;
  }

  try {
    const quranNoteId = await getQuranClient().createNote(accessToken, {
      reflectionId,
      verseKey: reflection.verseKey,
      body: trimmedBody,
    });
    const nextState = saveReflectionNoteLocal(getAyahLensState(), reflectionId, {
      body: trimmedBody,
      quranNoteId: quranNoteId ?? undefined,
      syncState: quranNoteId ? 'synced' : 'local',
    });
    setAyahLensState(nextState);
    return nextState.reflections.find((item) => item.id === reflectionId) ?? null;
  } catch {
    const noteState = saveReflectionNoteLocal(getAyahLensState(), reflectionId, {
      body: trimmedBody,
      syncState: 'pending',
    });
    setAyahLensState(markReflectionPendingSync(noteState, reflectionId, 'note'));
    return getAyahLensState().reflections.find((item) => item.id === reflectionId) ?? null;
  }
}

async function getAyahCollections(): Promise<AyahCollection[]> {
  const accessToken = await getQuranUserAccessToken();
  if (!accessToken) return getAyahLensState().collections;

  try {
    const collections = await getQuranClient().listCollections(accessToken);
    setAyahLensState({
      ...getAyahLensState(),
      collections,
    });
    return collections;
  } catch {
    return getAyahLensState().collections;
  }
}

async function createAyahCollection(name: string): Promise<AyahCollection> {
  const safeName = name.trim().slice(0, 80);
  if (!safeName) throw new Error('Collection name is required.');

  const accessToken = await getQuranUserAccessToken();
  if (!accessToken) {
    const localCollection: AyahCollection = {
      id: `local-${randomUUID()}`,
      name: safeName,
      syncState: 'pending',
    };
    setAyahLensState(upsertCollectionLocal(getAyahLensState(), localCollection));
    return localCollection;
  }

  try {
    const collection = await getQuranClient().createCollection(accessToken, safeName);
    setAyahLensState(upsertCollectionLocal(getAyahLensState(), collection));
    return collection;
  } catch {
    const localCollection: AyahCollection = {
      id: `local-${randomUUID()}`,
      name: safeName,
      syncState: 'pending',
    };
    setAyahLensState(upsertCollectionLocal(getAyahLensState(), localCollection));
    return localCollection;
  }
}

async function addReflectionToCollectionById(reflectionId: string, collectionId: string): Promise<AyahReflection | null> {
  const reflection = getAyahLensState().reflections.find((item) => item.id === reflectionId);
  if (!reflection || !collectionId.trim()) return null;

  const accessToken = await getQuranUserAccessToken();
  if (!accessToken || collectionId.startsWith('local-')) {
    const nextState = addReflectionToCollectionLocal(getAyahLensState(), reflectionId, collectionId);
    setAyahLensState(markReflectionPendingSync(nextState, reflectionId, 'collection'));
    return getAyahLensState().reflections.find((item) => item.id === reflectionId) ?? null;
  }

  try {
    await getQuranClient().addCollectionBookmark(
      accessToken,
      collectionId,
      reflection.verseKey,
      getAyahLensState().preferences.mushafId,
    );
    const nextState = addReflectionToCollectionLocal(getAyahLensState(), reflectionId, collectionId);
    setAyahLensState(nextState);
    return nextState.reflections.find((item) => item.id === reflectionId) ?? null;
  } catch {
    const nextState = addReflectionToCollectionLocal(getAyahLensState(), reflectionId, collectionId);
    setAyahLensState(markReflectionPendingSync(nextState, reflectionId, 'collection'));
    return getAyahLensState().reflections.find((item) => item.id === reflectionId) ?? null;
  }
}

function setReflectionFeedbackById(reflectionId: string, value: 'relevant' | 'not_relevant'): AyahReflection | null {
  const nextState = setReflectionFeedbackLocal(getAyahLensState(), reflectionId, value);
  setAyahLensState(nextState);
  return nextState.reflections.find((item) => item.id === reflectionId) ?? null;
}

async function showAlternateAyahById(reflectionId: string): Promise<AyahReflection | null> {
  const state = getAyahLensState();
  const original = state.reflections.find((item) => item.id === reflectionId);
  if (!original?.rankedCandidateVerseKeys?.length) return null;

  const groupId = original.alternateGroupId ?? original.id;
  const usedVerseKeys = new Set(
    state.reflections
      .filter((item) => item.alternateGroupId === groupId || item.id === reflectionId)
      .map((item) => item.verseKey),
  );
  const nextVerseKey = original.rankedCandidateVerseKeys.find((verseKey) => !usedVerseKeys.has(verseKey));
  if (!nextVerseKey) return null;

  const candidateIndex = original.rankedCandidateVerseKeys.indexOf(nextVerseKey);
  const candidate = rankAyahCandidates({
    summary: original.screenSummary,
    category: original.themes[0]?.id ?? 'unclear',
    themes: original.themes,
    overallConfidence: Math.max(...original.themes.map((theme) => theme.confidence), 0.5),
    isSensitive: false,
  }, [], getFeedbackSignals(state)).find((item) => item.verseKey === nextVerseKey);
  if (!candidate) return null;

  const verse = await fetchVerseContentForReflection(nextVerseKey);
  const alternateReflection = buildAyahReflection(
    verse,
    candidate,
    {
      summary: original.screenSummary,
      category: original.themes[0]?.id ?? 'unclear',
      themes: original.themes,
      overallConfidence: Math.max(...original.themes.map((theme) => theme.confidence), 0.5),
      isSensitive: false,
    },
    original.rankedCandidateVerseKeys,
    candidateIndex,
    groupId,
  );
  const nextState = saveReflectionLocally(getAyahLensState(), alternateReflection);
  setAyahLensState(nextState);
  return alternateReflection;
}

function getAyahDaySummary(): AyahDaySummary {
  const date = getTodayDateKey();
  const start = new Date(`${date}T00:00:00.000Z`).getTime();
  const end = start + 24 * 60 * 60 * 1000;
  const reflections = getAyahLensState().reflections.filter((reflection) => (
    reflection.createdAt >= start && reflection.createdAt < end
  ));
  const themeCounts = new Map<string, number>();
  for (const reflection of reflections) {
    for (const theme of reflection.themes) {
      themeCounts.set(theme.id, (themeCounts.get(theme.id) ?? 0) + 1);
    }
  }

  return {
    date,
    reflectionCount: reflections.length,
    savedCount: reflections.filter((reflection) => reflection.savedAt).length,
    noteCount: reflections.filter((reflection) => reflection.note?.body).length,
    themes: [...themeCounts.entries()].map(([id, count]) => ({ id: id as AyahDaySummary['themes'][number]['id'], count })),
    reflections: reflections.map((reflection) => ({
      id: reflection.id,
      verseKey: reflection.verseKey,
      surahName: reflection.surahName,
      reflection: reflection.reflection,
      note: reflection.note?.body,
    })),
  };
}

async function getQuranStreakSummary(): Promise<QuranStreakSummary> {
  const accessToken = await getQuranUserAccessToken();
  if (!accessToken) {
    return { currentDays: null, recordedToday: false, syncState: 'unavailable' };
  }

  try {
    const currentDays = await getQuranClient().getCurrentStreakDays(accessToken, getUserTimezone());
    return {
      currentDays,
      recordedToday: getAyahLensState().pendingSync.every((item) => item.action !== 'activity'),
      syncState: 'synced',
    };
  } catch {
    return {
      currentDays: null,
      recordedToday: false,
      syncState: 'pending',
      error: 'Quran Foundation streaks are unavailable right now.',
    };
  }
}

function copyReflectionShareCard(reflectionId: string): boolean {
  const reflection = getAyahLensState().reflections.find((item) => item.id === reflectionId);
  if (!reflection) return false;

  const lines = [
    `${reflection.surahName} ${reflection.verseKey}`,
    reflection.arabicText,
    reflection.translation,
    reflection.note?.body ? `Note: ${reflection.note.body}` : null,
    `Shared from ${APP_DISPLAY_NAME}`,
  ].filter(Boolean);
  clipboard.writeText(lines.join('\n\n'));
  return true;
}

function updateAyahLensSetting(key: string, value: unknown): AyahLensSettings {
  const state = getAyahLensState();
  const preferences = { ...state.preferences };

  if (key === 'translationId' && typeof value === 'number' && Number.isInteger(value) && value > 0) {
    preferences.translationId = value;
  } else if (key === 'mushafId' && typeof value === 'number' && [1, 2, 3, 4, 5, 6, 7, 11, 19].includes(value)) {
    preferences.mushafId = value;
  } else if (key === 'defaultSave' && typeof value === 'boolean') {
    preferences.defaultSave = value;
  } else if (key === 'contextualNudges' && typeof value === 'boolean') {
    preferences.contextualNudges = value;
  } else if (key === 'nudgeCooldownMinutes' && typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 240) {
    preferences.nudgeCooldownMinutes = value;
  } else if (key === 'timedReminders' && typeof value === 'boolean') {
    preferences.timedReminders = value;
  } else if (key === 'timedReminderMinutes' && typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1440) {
    preferences.timedReminderMinutes = Math.max(1, value);
  } else if (key === 'tafsirResourceId' && (value === null || (typeof value === 'number' && Number.isInteger(value) && value > 0))) {
    preferences.tafsirResourceId = value;
  } else if (key === 'tafsirResourceName' && (value === null || typeof value === 'string')) {
    preferences.tafsirResourceName = value;
  } else if (key === 'recitationId' && (value === null || (typeof value === 'number' && Number.isInteger(value) && value > 0))) {
    preferences.recitationId = value;
  } else if (key === 'reciterName' && (value === null || typeof value === 'string')) {
    preferences.reciterName = value;
  } else if (key === 'qulArabicEnabled' && typeof value === 'boolean') {
    preferences.qulArabicEnabled = value;
  } else if (key === 'qulTajweedEnabled' && typeof value === 'boolean') {
    preferences.qulTajweedEnabled = value;
  } else if (key === 'qulMushafKey' && typeof value === 'string' && new Set(QUL_VERSE_SCRIPT_KEYS).has(value as (typeof QUL_VERSE_SCRIPT_KEYS)[number])) {
    preferences.qulMushafKey = value;
  } else {
    throw new Error(`Unknown or invalid ${APP_DISPLAY_NAME} setting.`);
  }

  setAyahLensState({ ...state, preferences });
  return preferences;
}

function sanitizeNumberSetting(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

function updatePrayerSettings(patch: Partial<PrayerSettings>): PrayerSettings {
  const state = getAyahLensState();
  const current = state.prayer.settings;
  const nextSettings = mergePrayerSettings(current, patch);
  const shouldClearToday =
    nextSettings.source !== current.source
    || nextSettings.mosqueSlug !== current.mosqueSlug
    || nextSettings.city !== current.city
    || nextSettings.country !== current.country
    || nextSettings.method !== current.method
    || nextSettings.school !== current.school;
  const nextState = {
    ...state,
    prayer: {
      ...state.prayer,
      settings: nextSettings,
      today: shouldClearToday ? null : state.prayer.today,
      tomorrow: shouldClearToday ? null : state.prayer.tomorrow,
    },
  };
  setAyahLensState(nextState);
  return nextSettings;
}

function updateTodoSettings(patch: Partial<TodoSettings>): TodoSettings {
  const state = getAyahLensState();
  const settings = {
    ...state.todos.settings,
    petRemindersEnabled: typeof patch.petRemindersEnabled === 'boolean'
      ? patch.petRemindersEnabled
      : state.todos.settings.petRemindersEnabled,
  };
  setAyahLensState({ ...state, todos: { ...state.todos, settings } });
  return settings;
}

function updatePomodoroSettings(patch: Partial<PomodoroSettings>): PomodoroSettings {
  const state = getAyahLensState();
  const current = state.pomodoro.settings;
  const settings: PomodoroSettings = {
    focusMinutes: sanitizeNumberSetting(patch.focusMinutes, current.focusMinutes, 1, 240),
    breakMinutes: sanitizeNumberSetting(patch.breakMinutes, current.breakMinutes, 1, 120),
    petRemindersEnabled: typeof patch.petRemindersEnabled === 'boolean' ? patch.petRemindersEnabled : current.petRemindersEnabled,
  };
  setAyahLensState({ ...state, pomodoro: { ...state.pomodoro, settings } });
  updateTrayPomodoroTooltip();
  return settings;
}

async function refreshPrayerTimes(): Promise<AyahLensState['prayer']['today']> {
  const state = getAyahLensState();
  const { settings, today, tomorrow: previousTomorrow } = state.prayer;
  if (settings.source === 'masjidly' ? !settings.mosqueSlug.trim() : (!settings.city.trim() || !settings.country.trim())) return today;

  const timezone = getUserTimezone() ?? 'UTC';
  const todayDate = new Date();
  const tomorrowDate = new Date(
    todayDate.getFullYear(),
    todayDate.getMonth(),
    todayDate.getDate() + 1,
  );

  try {
    const fetchDay = settings.source === 'masjidly'
      ? (date: Date) => fetchMasjidlyPrayerTimes({ mosqueSlug: settings.mosqueSlug, date })
      : (date: Date) => fetchPrayerTimesByCity({
        city: settings.city,
        country: settings.country,
        method: settings.method,
        school: settings.school,
        date,
        timezone,
      });
    const [fetchedToday, fetchedTomorrow] = await Promise.all([
      fetchDay(todayDate),
      fetchDay(tomorrowDate),
    ]);
    setAyahLensState({
      ...getAyahLensState(),
      prayer: { ...getAyahLensState().prayer, today: fetchedToday, tomorrow: fetchedTomorrow },
    });
    return fetchedToday;
  } catch (error) {
    const staleDay = today ? { ...today, error: getSafeErrorMessage(error) } : null;
    setAyahLensState({
      ...state,
      prayer: { ...state.prayer, today: staleDay, tomorrow: previousTomorrow },
    });
    if (staleDay) return staleDay;
    throw error;
  }
}

// Idle detection state
let lastActivityTime = Date.now();
let idleCheckInterval: NodeJS.Timeout | null = null;
let timedQuranReminderInterval: NodeJS.Timeout | null = null;
let prayerAwarenessInterval: NodeJS.Timeout | null = null;
let todoReminderInterval: NodeJS.Timeout | null = null;
let pomodoroInterval: NodeJS.Timeout | null = null;
let isCapturingAyahReflection = false;
const IDLE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

// Pet movement animation state
let moveAnimation: NodeJS.Timeout | null = null;
let workspaceRestackTimeout: NodeJS.Timeout | null = null;

// Pet window size: shared constants (minimum safe size for transparent windows)
const PET_WAKE_FLIGHT_DURATION_MS = 1100;
const PET_CHAT_MIN_WIDTH = 280;
const PET_CHAT_MAX_WIDTH = 420;
const PET_CHAT_MIN_HEIGHT = 90;
const PET_CHAT_MAX_HEIGHT = 420;
const PET_CHAT_AUTO_HIDE_MS = 10000;
const PET_CHAT_VERTICAL_GAP = -2;
const POMODORO_TIMER_WINDOW_WIDTH = 108;
const POMODORO_TIMER_WINDOW_HEIGHT = 54;
const POMODORO_TIMER_VERTICAL_GAP = 8;
/** Space between Pomodoro timer top and bottom edge of pet-anchored panels when the timer is visible. */
const ASSISTANT_CLEAR_ABOVE_TIMER_PX = 4;

/**
 * macOS `setAlwaysOnTop` levels: assistant/chat/screenshot/chatbar at `pop-up-menu`. Workspace uses `screen-saver` (0)
 * so it stays above `pop-up-menu` windows. Pet (20), Pomodoro (25, 2nd-highest), and pet context (30) use higher
 * `screen-saver` relatives. Pet-anchored panels use a larger vertical gap when the Pomodoro timer strip is visible
 * (no vertical overlap). Non-macOS: `moveTop` chains pet → pomodoro → context after workspace/pet restacks so ordering
 * matches macOS relatives among equal `alwaysOnTop` peers.
 */
const MAC_AOT_COMPANION_POPUP_LEVEL = 'pop-up-menu' as const;
/** Same Electron `pop-up-menu` tier: assistant, pet chat, screenshot, chatbar (macOS relative ordering). */
const MAC_AOT_COMPANION_PANEL_RELATIVE_LEVEL = 0;
/** macOS NSWindow level above `pop-up-menu` — workspace + pet anchor windows (see setters below). */
const MAC_AOT_SCREEN_SAVER_LEVEL = 'screen-saver' as const;
const MAC_AOT_WORKSPACE_SS_RELATIVE = 0;
/** Pet sprite: above `pop-up-menu` windows and the workspace browser. */
const MAC_AOT_PET_SS_RELATIVE = 20;
/** Pomodoro timer: above pet, below the pet context menu (2nd-highest companion tier). */
const MAC_AOT_POMODORO_SS_RELATIVE = 25;
/** Pet context menu: highest — above Pomodoro and pet so it stays readable and clickable. */
const MAC_AOT_PET_CONTEXT_MENU_SS_RELATIVE = 30;

function setCompanionWindowAlwaysOnTop(
  window: BrowserWindow,
  level: typeof MAC_AOT_COMPANION_POPUP_LEVEL,
  relativeLevel?: number,
): void {
  if (process.platform !== 'darwin') {
    window.setAlwaysOnTop(true);
    return;
  }
  if (typeof relativeLevel === 'number') {
    window.setAlwaysOnTop(true, level, relativeLevel);
  } else {
    window.setAlwaysOnTop(true, level);
  }
}

/** Workspace browser: macOS `screen-saver` tier so it stays above assistant/chat (all `pop-up-menu`). */
function setWorkspaceBrowserWindowAlwaysOnTop(window: BrowserWindow): void {
  if (process.platform !== 'darwin') {
    window.setAlwaysOnTop(true);
    return;
  }
  window.setAlwaysOnTop(true, MAC_AOT_SCREEN_SAVER_LEVEL, MAC_AOT_WORKSPACE_SS_RELATIVE);
}

/** Pet sprite window: above workspace so the character stays on top of other companions. */
function setPetWindowAlwaysOnTop(window: BrowserWindow): void {
  if (process.platform !== 'darwin') {
    window.setAlwaysOnTop(true);
    return;
  }
  window.setAlwaysOnTop(true, MAC_AOT_SCREEN_SAVER_LEVEL, MAC_AOT_PET_SS_RELATIVE);
}

/** Pomodoro timer: above pet sprite, below pet context menu. */
function setPomodoroTimerWindowAlwaysOnTop(window: BrowserWindow): void {
  if (process.platform !== 'darwin') {
    window.setAlwaysOnTop(true);
    return;
  }
  window.setAlwaysOnTop(true, MAC_AOT_SCREEN_SAVER_LEVEL, MAC_AOT_POMODORO_SS_RELATIVE);
}

/** Pet context menu: same `screen-saver` tier; highest relative — above Pomodoro, pet, and workspace. */
function setPetContextMenuWindowAlwaysOnTop(window: BrowserWindow): void {
  if (process.platform !== 'darwin') {
    window.setAlwaysOnTop(true);
    return;
  }
  window.setAlwaysOnTop(true, MAC_AOT_SCREEN_SAVER_LEVEL, MAC_AOT_PET_CONTEXT_MENU_SS_RELATIVE);
}

function hasLiveWorkspaceBrowserWindow(): boolean {
  return workspaceBrowserWindow !== null && !workspaceBrowserWindow.isDestroyed();
}

function applyAssistantWindowStacking(): void {
  if (!assistantWindow || assistantWindow.isDestroyed()) return;

  const policy = getAssistantWindowStackingPolicy({
    hasWorkspaceBrowser: hasLiveWorkspaceBrowserWindow(),
  });
  if (!policy.isAlwaysOnTop) {
    assistantWindow.setAlwaysOnTop(false);
    return;
  }

  setCompanionWindowAlwaysOnTop(
    assistantWindow,
    MAC_AOT_COMPANION_POPUP_LEVEL,
    MAC_AOT_COMPANION_PANEL_RELATIVE_LEVEL,
  );
}

function shouldRepositionAssistantAfterReveal(): boolean {
  return getAssistantWindowStackingPolicy({
    hasWorkspaceBrowser: hasLiveWorkspaceBrowserWindow(),
  }).shouldRepositionAfterReveal;
}

function shouldRevealAssistantInactive(): boolean {
  const policy = getAssistantWindowStackingPolicy({
    hasWorkspaceBrowser: hasLiveWorkspaceBrowserWindow(),
  });
  return policy.shouldRevealInactive || shouldRevealWindowInactive('assistant');
}

function elevatePetAboveCompanionWindows(): void {
  if (!petWindow || petWindow.isDestroyed()) return;
  try {
    if (process.platform === 'darwin') {
      setPetWindowAlwaysOnTop(petWindow);
    } else {
      petWindow.setAlwaysOnTop(true);
    }
    petWindow.moveTop();
  } catch {
    // ignore
  }

  if (petPomodoroTimerWindow && !petPomodoroTimerWindow.isDestroyed() && petPomodoroTimerWindow.isVisible()) {
    try {
      if (process.platform === 'darwin') {
        setPomodoroTimerWindowAlwaysOnTop(petPomodoroTimerWindow);
      } else {
        petPomodoroTimerWindow.setAlwaysOnTop(true);
      }
      petPomodoroTimerWindow.moveTop();
    } catch {
      // ignore
    }
  }

  if (petContextMenuWindow && !petContextMenuWindow.isDestroyed()) {
    try {
      if (process.platform === 'darwin') {
        setPetContextMenuWindowAlwaysOnTop(petContextMenuWindow);
      } else {
        petContextMenuWindow.setAlwaysOnTop(true);
      }
      petContextMenuWindow.moveTop();
    } catch {
      // ignore
    }
  }
}

/**
 * After another companion `BrowserWindow` is shown or moved, keep the workspace browser above `pop-up-menu` peers; then
 * restack pet-anchor windows: pet → Pomodoro → pet context menu (Win/Linux: `moveTop` order; macOS: `screen-saver`
 * relatives 20 / 25 / 30).
 */
function elevateWorkspaceBrowserAboveCompanionWindows(): void {
  if (workspaceBrowserWindow && !workspaceBrowserWindow.isDestroyed()) {
    applyAssistantWindowStacking();
    try {
      if (process.platform === 'darwin') {
        setWorkspaceBrowserWindowAlwaysOnTop(workspaceBrowserWindow);
      } else {
        workspaceBrowserWindow.setAlwaysOnTop(true);
      }
      workspaceBrowserWindow.moveTop();
    } catch {
      // ignore
    }

    elevatePetAboveCompanionWindows();

    if (workspaceRestackTimeout) return;
    workspaceRestackTimeout = setTimeout(() => {
      workspaceRestackTimeout = null;
      if (!workspaceBrowserWindow || workspaceBrowserWindow.isDestroyed()) {
        elevatePetAboveCompanionWindows();
        return;
      }
      try {
        if (process.platform === 'darwin') {
          setWorkspaceBrowserWindowAlwaysOnTop(workspaceBrowserWindow);
        } else {
          workspaceBrowserWindow.setAlwaysOnTop(true);
        }
        workspaceBrowserWindow.moveTop();
      } catch {
        // ignore
      }
      elevatePetAboveCompanionWindows();
    }, 0);
    return;
  }
  elevatePetAboveCompanionWindows();
}

const ASSISTANT_VERTICAL_GAP = -3;
const WORKSPACE_BROWSER_VERTICAL_GAP = -6;
const WORKSPACE_ASSISTANT_AVOID_GAP = 12;
const PET_CONTEXT_MENU_WIDTH = 220;
const PET_CONTEXT_MENU_HEIGHT = 342;
const ASSISTANT_WINDOW_WIDTH = 400;
const ASSISTANT_WINDOW_HEIGHT = 500;
const PET_WAKE_FLIGHT_KEYFRAMES = [
  { progress: 0, x: 0, y: 0 },
  { progress: 0.24, x: -10, y: -24 },
  { progress: 0.58, x: 12, y: -56 },
  { progress: 0.8, x: 6, y: -18 },
  { progress: 1, x: 0, y: 0 },
];
const WORKSPACE_BROWSER_WIDTH = 420;
const WORKSPACE_BROWSER_HEIGHT = 520;
const SCREENSHOT_QUESTION_WIDTH = ASSISTANT_WINDOW_WIDTH;
const SCREENSHOT_QUESTION_HEIGHT = ASSISTANT_WINDOW_HEIGHT;
const PET_CAMERA_SNAP_DURATION_MS = 920;
const PET_CAMERA_SNAP_FLASH_DURATION_MS = 120;
const DEV_FORCE_ACTIVE_APP_COMMENT_DELAY_MS = 5000;
/** Dev-only global shortcuts (macOS). See `registerDevOnlyGlobalShortcuts`. */
const DEV_HOTKEY_QURAN_REMINDER = 'Cmd+Alt+Shift+M';
const DEV_HOTKEY_ATTENTION_SEEK_TOGGLE = 'Cmd+Alt+Shift+N';

// Attention seeker state
let attentionInterval: NodeJS.Timeout | null = null;

// Idle behavior system
let idleBehaviorInterval: NodeJS.Timeout | null = null;
let lastInteractionTime = Date.now();
let isPerformingIdleBehavior = false;
const IDLE_BEHAVIOR_MIN_INTERVAL = 3000; // Minimum 3 seconds between behaviors (demo mode)
const IDLE_BEHAVIOR_MAX_INTERVAL = 8000; // Maximum 8 seconds between behaviors (demo mode)
const INTERACTION_COOLDOWN = 5000; // Wait 5 seconds after interaction before idle behaviors

type IdleBehavior = 'look_around' | 'snip_claws' | 'yawn' | 'wander' | 'stretch' | 'blink' | 'wiggle' | 'wave';

const IDLE_BEHAVIORS: { type: IdleBehavior; weight: number }[] = [
  { type: 'blink', weight: 25 },        // Most common
  { type: 'look_around', weight: 20 },
  { type: 'snip_claws', weight: 15 },
  { type: 'wiggle', weight: 15 },
  { type: 'stretch', weight: 10 },
  { type: 'wave', weight: 8 },
  { type: 'yawn', weight: 10 },
  { type: 'wander', weight: 5 },        // Least common
];

function setLaunchOnStartup(enabled: boolean) {
  try {
    if (process.platform === 'darwin') {
      app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true });
      return;
    }

    if (process.platform === 'win32') {
      app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath });
      return;
    }

    app.setLoginItemSettings({ openAtLogin: enabled });
  } catch (error) {
    console.error('Failed to update launch-on-startup setting:', error);
  }
}

// Pet action types that ClawBot can trigger
interface PetAction {
  type: 'set_mood' | 'move_to' | 'move_to_cursor' | 'snip' | 'wave' | 'look_at';
  value?: string;
  x?: number;
  y?: number;
  duration?: number;
}

type WorkspaceType = 'ayati';
type WorkspaceErrorCode = 'missing_workspace' | 'path_not_found' | 'outside_workspace' | 'not_directory' | 'open_failed';
type WorkspacePreviewKind = 'markdown' | 'image' | 'json';
type WorkspacePreviewErrorCode =
  | WorkspaceErrorCode
  | 'not_file'
  | 'unsupported_preview'
  | 'file_too_large'
  | 'read_failed';

interface CurrentWorkspaceInfo {
  workspaceType: WorkspaceType | null;
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
  error?: WorkspaceErrorCode;
}

interface WorkspaceOpenResult {
  success: boolean;
  error?: WorkspaceErrorCode;
  message?: string;
}

interface WorkspacePreviewResult {
  success: boolean;
  path: string;
  previewKind?: WorkspacePreviewKind;
  content?: string;
  error?: WorkspacePreviewErrorCode;
  message?: string;
}

const MAX_MARKDOWN_PREVIEW_BYTES = 1024 * 1024 * 2;
const MAX_IMAGE_PREVIEW_BYTES = 1024 * 1024 * 12;
const MAX_JSON_PREVIEW_BYTES = 1024 * 1024 * 2;

function getCurrentWorkspaceType(): WorkspaceType | null {
  const workspaceType = store.get('onboarding.workspaceType');
  return workspaceType === 'ayati' ? workspaceType : null;
}

function getDefaultAyahLensWorkspacePath(): string {
  return path.join(app.getPath('userData'), 'workspace');
}

function resolveWorkspaceRootPath(workspaceType: WorkspaceType | null): { workspaceType: WorkspaceType; workspacePath: string } {
  const workspacePath = (store.get('onboarding.ayatiWorkspacePath') as string | null)
    ?? getDefaultAyahLensWorkspacePath();
  return {
    workspaceType: workspaceType ?? 'ayati',
    workspacePath,
  };
}

function getCurrentWorkspaceInfo(): CurrentWorkspaceInfo {
  const resolvedWorkspace = resolveWorkspaceRootPath(getCurrentWorkspaceType());

  return {
    workspaceType: resolvedWorkspace.workspaceType,
    workspacePath: resolvedWorkspace.workspacePath,
    exists: fs.existsSync(resolvedWorkspace.workspacePath),
  };
}

function normalizeWorkspaceRelativePath(relativePath: string = ''): string {
  if (!relativePath || relativePath === '.') return '';
  return path.normalize(relativePath);
}

function resolveWorkspaceTarget(relativePath: string = ''):
  | { info: CurrentWorkspaceInfo; workspacePath: string; absolutePath: string; relativePath: string }
  | { info: CurrentWorkspaceInfo; error: WorkspaceErrorCode } {
  const info = getCurrentWorkspaceInfo();
  if (!info.workspacePath || !info.exists) {
    return { info, error: 'missing_workspace' };
  }

  const normalizedPath = normalizeWorkspaceRelativePath(relativePath);
  if (path.isAbsolute(normalizedPath)) {
    return { info, error: 'outside_workspace' };
  }

  const absolutePath = path.resolve(info.workspacePath, normalizedPath || '.');
  const relativeFromRoot = path.relative(info.workspacePath, absolutePath);

  if (relativeFromRoot === '..' || relativeFromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relativeFromRoot)) {
    return { info, error: 'outside_workspace' };
  }

  const safeRelativePath = relativeFromRoot ? relativeFromRoot.split(path.sep).join('/') : '';

  return {
    info,
    workspacePath: info.workspacePath,
    absolutePath,
    relativePath: safeRelativePath,
  };
}

function listWorkspaceDirectory(relativePath: string = ''): WorkspaceDirectoryResult {
  const resolved = resolveWorkspaceTarget(relativePath);
  if ('error' in resolved) {
    return {
      success: false,
      currentPath: '',
      entries: [],
      error: resolved.error,
    };
  }

  try {
    if (!fs.existsSync(resolved.absolutePath)) {
      return { success: false, currentPath: resolved.relativePath, entries: [], error: 'path_not_found' };
    }

    const stats = fs.statSync(resolved.absolutePath);
    if (!stats.isDirectory()) {
      return { success: false, currentPath: resolved.relativePath, entries: [], error: 'not_directory' };
    }

    const entries = fs.readdirSync(resolved.absolutePath, { withFileTypes: true })
      .map((entry) => {
        const entryAbsolutePath = path.join(resolved.absolutePath, entry.name);
        const entryStats = fs.statSync(entryAbsolutePath);

        return {
          name: entry.name,
          path: [resolved.relativePath, entry.name].filter(Boolean).join('/'),
          kind: entryStats.isDirectory() ? 'directory' as const : 'file' as const,
          createdAt: entryStats.birthtimeMs,
          modifiedAt: entryStats.mtimeMs,
          accessedAt: entryStats.atimeMs,
        };
      });

    return {
      success: true,
      currentPath: resolved.relativePath,
      entries,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { success: false, currentPath: resolved.relativePath, entries: [], error: 'path_not_found' };
    }

    throw error;
  }
}

async function openWorkspacePath(relativePath: string = ''): Promise<WorkspaceOpenResult> {
  const resolved = resolveWorkspaceTarget(relativePath);
  if ('error' in resolved) {
    return { success: false, error: resolved.error };
  }

  if (!fs.existsSync(resolved.absolutePath)) {
    return { success: false, error: 'path_not_found' };
  }

  const openError = await shell.openPath(resolved.absolutePath);
  if (openError) {
    return { success: false, error: 'open_failed', message: openError };
  }

  return { success: true };
}

function getWorkspacePreviewKind(fileName: string): WorkspacePreviewKind | null {
  const extension = path.extname(fileName).toLowerCase();

  if (extension === '.md' || extension === '.mdx') {
    return 'markdown';
  }

  if (['.json', '.jsonc', '.geojson'].includes(extension)) {
    return 'json';
  }

  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.heic', '.bmp', '.tiff'].includes(extension)) {
    return 'image';
  }

  return null;
}

function getImageMimeType(fileName: string): string {
  switch (path.extname(fileName).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    case '.heic':
      return 'image/heic';
    case '.bmp':
      return 'image/bmp';
    case '.tiff':
      return 'image/tiff';
    default:
      return 'application/octet-stream';
  }
}

function shouldTranscodeImagePreview(fileName: string): boolean {
  return ['.heic', '.heif'].includes(path.extname(fileName).toLowerCase());
}

async function transcodeImagePreviewToPngBuffer(filePath: string, sourceBuffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(sourceBuffer).png().toBuffer();
  } catch (error) {
    if (process.platform !== 'darwin') {
      throw error;
    }

    const outputPath = path.join(os.tmpdir(), `ayati-workspace-preview-${randomUUID()}.png`);

    try {
      await execFileAsync('/usr/bin/sips', ['-s', 'format', 'png', filePath, '--out', outputPath]);
      return fs.readFileSync(outputPath);
    } finally {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    }
  }
}

async function revealWorkspacePath(relativePath: string = ''): Promise<WorkspaceOpenResult> {
  const resolved = resolveWorkspaceTarget(relativePath);
  if ('error' in resolved) {
    return { success: false, error: resolved.error };
  }

  if (!fs.existsSync(resolved.absolutePath)) {
    return { success: false, error: 'path_not_found' };
  }

  shell.showItemInFolder(resolved.absolutePath);
  return { success: true };
}

async function previewWorkspaceFile(relativePath: string = ''): Promise<WorkspacePreviewResult> {
  const resolved = resolveWorkspaceTarget(relativePath);
  if ('error' in resolved) {
    return { success: false, path: relativePath, error: resolved.error };
  }

  try {
    if (!fs.existsSync(resolved.absolutePath)) {
      return { success: false, path: resolved.relativePath, error: 'path_not_found' };
    }

    const stats = fs.statSync(resolved.absolutePath);
    if (!stats.isFile()) {
      return { success: false, path: resolved.relativePath, error: 'not_file' };
    }

    const previewKind = getWorkspacePreviewKind(resolved.absolutePath);
    if (!previewKind) {
      return { success: false, path: resolved.relativePath, error: 'unsupported_preview' };
    }

    const maxBytes = previewKind === 'markdown'
      ? MAX_MARKDOWN_PREVIEW_BYTES
      : previewKind === 'json'
        ? MAX_JSON_PREVIEW_BYTES
        : MAX_IMAGE_PREVIEW_BYTES;
    if (stats.size > maxBytes) {
      return {
        success: false,
        path: resolved.relativePath,
        error: 'file_too_large',
        message: previewKind === 'markdown'
          ? 'This markdown file is too large to preview in the workspace window.'
          : previewKind === 'json'
            ? 'This JSON file is too large to preview in the workspace window.'
            : 'This image is too large to preview in the workspace window.',
      };
    }

    if (previewKind === 'markdown' || previewKind === 'json') {
      const content = fs.readFileSync(resolved.absolutePath, 'utf8');
      let previewContent = content;

      if (previewKind === 'json') {
        try {
          previewContent = `${JSON.stringify(JSON.parse(content), null, 2)}\n`;
        } catch {
          previewContent = content;
        }
      }

      return {
        success: true,
        path: resolved.relativePath,
        previewKind,
        content: previewContent,
      };
    }

    const buffer = fs.readFileSync(resolved.absolutePath);
    if (shouldTranscodeImagePreview(resolved.absolutePath)) {
      return {
        success: true,
        path: resolved.relativePath,
        previewKind,
        content: `data:image/png;base64,${(await transcodeImagePreviewToPngBuffer(resolved.absolutePath, buffer)).toString('base64')}`,
      };
    }

    return {
      success: true,
      path: resolved.relativePath,
      previewKind,
      content: `data:${getImageMimeType(resolved.absolutePath)};base64,${buffer.toString('base64')}`,
    };
  } catch (error) {
    return {
      success: false,
      path: resolved.relativePath,
      error: 'read_failed',
      message: shouldTranscodeImagePreview(resolved.absolutePath)
        ? 'Failed to generate a preview for this HEIC image.'
        : error instanceof Error
          ? error.message
          : 'Failed to read file preview.',
    };
  }
}

function resetOnboardingState(): void {
  store.set('onboarding.completed', false);
  store.set('onboarding.skipped', false);
  store.set('onboarding.workspaceType', null);
  store.set('onboarding.ayatiWorkspacePath', null);
  store.set('onboarding.memoryMigrated', false);
}

// Smooth animation to move pet to target position
function animateMoveTo(targetX: number, targetY: number, duration: number = 1000): Promise<void> {
  return new Promise((resolve) => {
    if (!petWindow) {
      resolve();
      return;
    }
    if (moveAnimation) clearInterval(moveAnimation);

    const [startX, startY] = petWindow.getPosition();
    const startTime = Date.now();
    const walkDirection: 'left' | 'right' = targetX < startX ? 'left' : 'right';

    // Notify renderer that movement started
    petWindow.webContents.send('pet-moving', { moving: true, direction: walkDirection });

    moveAnimation = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out curve for natural movement
      const eased = 1 - Math.pow(1 - progress, 3);

      const currentX = Math.round(startX + (targetX - startX) * eased);
      const currentY = Math.round(startY + (targetY - startY) * eased);

      petWindow?.setPosition(currentX, currentY);
      updatePetChatPosition();
      updatePetPomodoroTimerPosition();
      updateWorkspaceBrowserPosition();
      updateAssistantPosition();
      updateScreenshotQuestionPosition();

      if (progress >= 1) {
        clearInterval(moveAnimation!);
        moveAnimation = null;
        store.set('pet.position', { x: targetX, y: targetY });
        petWindow?.webContents.send('pet-moving', { moving: false });
        updateScreenshotQuestionPosition();
        updateWorkspaceBrowserPosition();
        updatePetPomodoroTimerPosition();
        resolve();
      }
    }, 16); // ~60fps
  });
}

function getPetWakeFlightOffset(progress: number): { x: number; y: number } {
  for (let i = 1; i < PET_WAKE_FLIGHT_KEYFRAMES.length; i += 1) {
    const previous = PET_WAKE_FLIGHT_KEYFRAMES[i - 1];
    const next = PET_WAKE_FLIGHT_KEYFRAMES[i];
    if (progress > next.progress) continue;

    const segmentProgress = (progress - previous.progress) / (next.progress - previous.progress);
    const eased = 1 - Math.pow(1 - segmentProgress, 3);
    return {
      x: previous.x + (next.x - previous.x) * eased,
      y: previous.y + (next.y - previous.y) * eased,
    };
  }

  return { x: 0, y: 0 };
}

/** Keep a pet-sized frame fully inside the nearest display work area (e.g. after monitor layout changes). */
function clampPetFrameToVisibleWorkArea(x: number, y: number, width: number, height: number): { x: number; y: number } {
  const display = screen.getDisplayNearestPoint({
    x: Math.round(x + width / 2),
    y: Math.round(y + height / 2),
  });
  const maxX = display.workArea.x + display.workArea.width - width;
  const maxY = display.workArea.y + display.workArea.height - height;

  return {
    x: Math.max(display.workArea.x, Math.min(Math.round(x), maxX)),
    y: Math.max(display.workArea.y, Math.min(Math.round(y), maxY)),
  };
}

function clampPetWindowPosition(x: number, y: number): { x: number; y: number } {
  if (!petWindow || petWindow.isDestroyed()) return { x, y };

  const bounds = petWindow.getBounds();
  return clampPetFrameToVisibleWorkArea(x, y, bounds.width, bounds.height);
}

function animatePetWindowWakeFlight(): Promise<void> {
  return new Promise((resolve) => {
    if (!petWindow || petWindow.isDestroyed()) {
      resolve();
      return;
    }

    if (moveAnimation) {
      clearInterval(moveAnimation);
      moveAnimation = null;
      petWindow.webContents.send('pet-moving', { moving: false });
    }

    const [startX, startY] = petWindow.getPosition();
    const startTime = Date.now();

    moveAnimation = setInterval(() => {
      if (!petWindow || petWindow.isDestroyed()) {
        if (moveAnimation) {
          clearInterval(moveAnimation);
          moveAnimation = null;
        }
        resolve();
        return;
      }

      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / PET_WAKE_FLIGHT_DURATION_MS, 1);
      const offset = getPetWakeFlightOffset(progress);
      const nextPosition = progress >= 1
        ? { x: startX, y: startY }
        : clampPetWindowPosition(startX + offset.x, startY + offset.y);

      petWindow.setPosition(nextPosition.x, nextPosition.y);
      updatePetChatPosition();
      updatePetPomodoroTimerPosition();
      updateWorkspaceBrowserPosition();
      updateAssistantPosition();
      updateScreenshotQuestionPosition();

      if (progress >= 1) {
        clearInterval(moveAnimation!);
        moveAnimation = null;
        store.set('pet.position', { x: startX, y: startY });
        updatePetChatPosition();
        updatePetPomodoroTimerPosition();
        updateWorkspaceBrowserPosition();
        updateAssistantPosition();
        updateScreenshotQuestionPosition();
        resolve();
      }
    }, 16);
  });
}

// Attention seeker behavior - periodically moves pet toward cursor
function seekAttention() {
  const enabled = store.get('pet.attentionSeeker') ?? true; // Default to true
  if (!enabled || !petWindow || isSleeping) {
    console.log(`[AttentionSeeker] Skipped: enabled=${enabled}, petWindow=${!!petWindow}, isSleeping=${isSleeping}`);
    return;
  }

  const cursor = screen.getCursorScreenPoint();
  const [petX, petY] = petWindow.getPosition();
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  // Calculate position near cursor (offset so pet doesn't cover cursor)
  const offset = 80;
  let targetX = cursor.x + offset;
  let targetY = cursor.y + offset;

  // Keep within screen bounds
  targetX = Math.max(0, Math.min(targetX, width - 300));
  targetY = Math.max(0, Math.min(targetY, height - 300));

  // Only move if far enough away (> 200px)
  const distance = Math.sqrt(Math.pow(cursor.x - petX, 2) + Math.pow(cursor.y - petY, 2));
  console.log(`[AttentionSeeker] Distance: ${Math.round(distance)}px, cursor: (${cursor.x}, ${cursor.y}), pet: (${petX}, ${petY})`);

  if (distance > 600) {
    console.log(`[AttentionSeeker] Moving to (${targetX}, ${targetY})`);
    // Set excited mood before moving
    petWindow.webContents.send('clawbot-mood', { state: 'excited', reason: 'wants attention' });
    animateMoveTo(targetX, targetY, 1500);
  } else {
    console.log('[AttentionSeeker] Too close, not moving');
  }
}

function startAttentionSeeker() {
  const minDelay = isDev ? 5000 : 30000;   // 5s in dev, 30s in prod
  const maxDelay = isDev ? 15000 : 120000; // 15s in dev, 2min in prod

  function scheduleNext() {
    const delay = minDelay + Math.random() * (maxDelay - minDelay);
    console.log(`[AttentionSeeker] Next seek in ${Math.round(delay / 1000)}s`);

    attentionInterval = setTimeout(() => {
      console.log('[AttentionSeeker] Seeking attention...');
      seekAttention();
      scheduleNext();
    }, delay);
  }

  console.log('[AttentionSeeker] Started');
  scheduleNext();
}

function stopAttentionSeeker() {
  if (attentionInterval) {
    clearTimeout(attentionInterval);
    attentionInterval = null;
  }
}

// Pick a random idle behavior based on weights
function pickRandomIdleBehavior(): IdleBehavior {
  const totalWeight = IDLE_BEHAVIORS.reduce((sum, b) => sum + b.weight, 0);
  let random = Math.random() * totalWeight;

  for (const behavior of IDLE_BEHAVIORS) {
    random -= behavior.weight;
    if (random <= 0) return behavior.type;
  }
  return 'blink';
}

// Execute an idle behavior
async function performIdleBehavior(behavior: IdleBehavior): Promise<void> {
  if (!petWindow || isPerformingIdleBehavior || isSleeping) return;

  isPerformingIdleBehavior = true;

  try {
    switch (behavior) {
      case 'blink':
        // Quick blink animation
        petWindow.webContents.send('idle-behavior', { type: 'blink' });
        break;

      case 'look_around':
        // Look left, then right
        petWindow.webContents.send('idle-behavior', { type: 'look_around' });
        break;

      case 'snip_claws':
        // Snip claws a couple times
        petWindow.webContents.send('idle-behavior', { type: 'snip_claws' });
        break;

      case 'yawn':
        // Yawn and look sleepy
        petWindow.webContents.send('idle-behavior', { type: 'yawn' });
        break;

      case 'stretch':
        // Stretch animation
        petWindow.webContents.send('idle-behavior', { type: 'stretch' });
        break;

      case 'wiggle':
        // Happy little wiggle
        petWindow.webContents.send('idle-behavior', { type: 'wiggle' });
        break;

      case 'wave':
        petWindow.webContents.send('idle-behavior', { type: 'wave' });
        break;

      case 'wander':
        // Move to a random nearby position
        const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
        const [currentX, currentY] = petWindow.getPosition();

        // Wander within 200px of current position
        const wanderX = Math.max(0, Math.min(
          currentX + (Math.random() - 0.5) * 400,
          screenWidth - 300
        ));
        const wanderY = Math.max(0, Math.min(
          currentY + (Math.random() - 0.5) * 200,
          screenHeight - 300
        ));

        petWindow.webContents.send('idle-behavior', { type: 'wander', direction: wanderX > currentX ? 'right' : 'left' });
        await animateMoveTo(wanderX, wanderY, 2000);
        break;
    }
  } finally {
    // Reset after behavior completes
    setTimeout(() => {
      isPerformingIdleBehavior = false;
    }, 2000);
  }
}

// Schedule next idle behavior
function scheduleNextIdleBehavior(): void {
  const delay = IDLE_BEHAVIOR_MIN_INTERVAL + Math.random() * (IDLE_BEHAVIOR_MAX_INTERVAL - IDLE_BEHAVIOR_MIN_INTERVAL);

  idleBehaviorInterval = setTimeout(async () => {
    // Only perform if not recently interacted
    const timeSinceInteraction = Date.now() - lastInteractionTime;
    if (timeSinceInteraction > INTERACTION_COOLDOWN && !isPerformingIdleBehavior && !isSleeping) {
      const behavior = pickRandomIdleBehavior();
      await performIdleBehavior(behavior);
    }

    // Schedule next one
    scheduleNextIdleBehavior();
  }, delay);
}

// Start idle behavior system
function startIdleBehaviors(): void {
  scheduleNextIdleBehavior();
}

// Stop idle behavior system
function stopIdleBehaviors(): void {
  if (idleBehaviorInterval) {
    clearTimeout(idleBehaviorInterval);
    idleBehaviorInterval = null;
  }
}

// Sleep system
let isSleeping = false;
let sleepCheckInterval: NodeJS.Timeout | null = null;
const SLEEP_AFTER_IDLE = 60000; // Fall asleep after 1 minute of no interaction
const isSleepMoodState = (state?: string): boolean => state === 'sleeping' || state === 'doze';

function isWorkspaceBrowserActive(): boolean {
  return Boolean(
    workspaceBrowserWindow
    && !workspaceBrowserWindow.isDestroyed()
    && workspaceBrowserWindow.isVisible()
    && workspaceBrowserWindow.isFocused(),
  );
}

function fallAsleep(): void {
  if (isSleeping || !petWindow) return;
  isSleeping = true;
  console.log('[Sleep] Falling asleep - showing doze state');
  petWindow.webContents.send('clawbot-mood', { state: 'doze' });

  // After 5 seconds of dozing, go to full sleep
  setTimeout(() => {
    if (isSleeping && petWindow) {
      console.log('[Sleep] Now fully asleep');
      petWindow.webContents.send('clawbot-mood', { state: 'sleeping' });
    }
  }, 5000);
}

function wakeUp(): void {
  if (!isSleeping || !petWindow) return;
  isSleeping = false;
  console.log('[Sleep] Waking up - showing startle state');
  petWindow.webContents.send('clawbot-mood', { state: 'startle' });

  // After startle animation, return to idle
  setTimeout(() => {
    if (!isSleeping && petWindow) {
      console.log('[Sleep] Now idle');
      petWindow.webContents.send('clawbot-mood', { state: 'idle' });
    }
  }, 1000);
}

function startSleepCheck(): void {
  if (sleepCheckInterval) return;
  sleepCheckInterval = setInterval(() => {
    if (isWorkspaceBrowserActive()) {
      if (isSleeping) {
        wakeUp();
      }
      return;
    }

    const timeSinceInteraction = Date.now() - lastInteractionTime;
    if (!isSleeping && timeSinceInteraction >= SLEEP_AFTER_IDLE) {
      fallAsleep();
    }
  }, 10000); // Check every 10 seconds
}

function stopSleepCheck(): void {
  if (sleepCheckInterval) {
    clearInterval(sleepCheckInterval);
    sleepCheckInterval = null;
  }
}

// Reset interaction timer (call this when user interacts)
function resetInteractionTimer(): void {
  lastInteractionTime = Date.now();
  if (isSleeping) {
    wakeUp();
  }
}


// Get current screen context for ClawBot
async function getScreenContext(): Promise<{
  cursor: { x: number; y: number };
  petPosition: { x: number; y: number };
  screenSize: { width: number; height: number };
  screenshot?: string;
}> {
  const cursor = screen.getCursorScreenPoint();
  const [petX, petY] = petWindow?.getPosition() ?? [0, 0];
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  return {
    cursor,
    petPosition: { x: petX, y: petY },
    screenSize: { width, height },
  };
}

// Get screen recording permission status on macOS
// Returns: 'granted', 'denied', 'not-determined', 'restricted', or 'granted' for non-macOS
function getScreenCapturePermissionStatus(): string {
  if (process.platform !== 'darwin') {
    return 'granted'; // Non-macOS platforms don't need this check
  }
  return systemPreferences.getMediaAccessStatus('screen');
}

/**
 * Visual feedback after a screenshot is taken. Runs immediately (no delay) so it does not
 * shift what appears in the capture relative to when the user triggered it.
 */
function triggerPetCameraSnapFeedback(): void {
  if (!petWindow || petWindow.isDestroyed() || isSleeping) return;

  petWindow.webContents.send('pet-camera-snap', {
    captureAtMs: 0,
    durationMs: PET_CAMERA_SNAP_DURATION_MS,
    flashDurationMs: PET_CAMERA_SNAP_FLASH_DURATION_MS,
  });
}

// Native macOS screen capture using screencapture command (much faster than desktopCapturer)
async function captureScreenNative(): Promise<string | null> {
  if (process.platform !== 'darwin') {
    // Fall back to desktopCapturer on non-macOS platforms
    return captureScreenFallback();
  }

  // Check permission first
  const permissionStatus = getScreenCapturePermissionStatus();
  if (permissionStatus === 'denied' || permissionStatus === 'restricted') {
    console.log('Screen capture permission denied. Please enable in System Preferences > Privacy & Security > Screen Recording');
    return null;
  }

  const tempPath = path.join(os.tmpdir(), `ayati-screenshot-${Date.now()}.png`);

  try {
    // Use macOS screencapture command - much faster than desktopCapturer
    // -x: no sound, -C: capture cursor, -t png: format
    execSync(`screencapture -x -C -t png "${tempPath}"`, {
      timeout: 5000,
      windowsHide: true,
    });

    // Read the captured image
    const imageBuffer = fs.readFileSync(tempPath);
    const base64 = imageBuffer.toString('base64');

    // Clean up temp file
    fs.unlinkSync(tempPath);

    return `data:image/png;base64,${base64}`;
  } catch (error) {
    console.error('Native screen capture failed:', error);
    // Clean up temp file if it exists
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {}
    // Fall back to desktopCapturer
    return captureScreenFallback();
  }
}

// Fallback capture using desktopCapturer (slower, used on non-macOS)
async function captureScreenFallback(): Promise<string | null> {
  try {
    const permissionStatus = getScreenCapturePermissionStatus();

    // If explicitly denied or restricted, don't prompt again
    if (permissionStatus === 'denied' || permissionStatus === 'restricted') {
      console.log('Screen capture permission denied. Please enable in System Preferences > Privacy & Security > Screen Recording');
      return null;
    }

    // If 'not-determined' or 'granted', proceed (this will trigger prompt if not-determined)
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    });

    if (sources.length > 0) {
      const screenshot = sources[0].thumbnail;
      return screenshot.toDataURL();
    }
    return null;
  } catch (error) {
    console.error('Fallback screen capture failed:', error);
    return null;
  }
}

// Capture screen with cursor position overlay info
async function captureScreenWithContext(): Promise<{
  image: string;
  cursor: { x: number; y: number };
  screenSize: { width: number; height: number };
  } | null> {
  try {
    // Use native capture for speed
    const image = await captureScreenNative();

    if (image) {
      const cursor = screen.getCursorScreenPoint();
      const { width, height } = screen.getPrimaryDisplay().workAreaSize;

      return {
        image,
        cursor,
        screenSize: { width, height },
      };
    }
    return null;
  } catch (error) {
    console.error('Screen capture failed:', error);
    return null;
  }
}

// Execute a pet action from ClawBot
async function executePetAction(action: PetAction): Promise<void> {
  if (!petWindow) return;
  if (isSleeping) {
    console.log(`[Sleep] Ignoring pet action while sleeping: ${action.type}`);
    return;
  }

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  switch (action.type) {
    case 'set_mood':
      if (action.value) {
        if (isSleepMoodState(action.value)) {
          isSleeping = true;
          console.log(`[Sleep] Entered sleep state via set_mood: ${action.value}`);
        }
        petWindow.webContents.send('clawbot-mood', { state: action.value });
      }
      break;

    case 'move_to':
      if (typeof action.x === 'number' && typeof action.y === 'number') {
        // Clamp to screen bounds
        const targetX = Math.max(0, Math.min(action.x, screenWidth - 300));
        const targetY = Math.max(0, Math.min(action.y, screenHeight - 300));
        await animateMoveTo(targetX, targetY, action.duration || 1000);
      }
      break;

    case 'move_to_cursor':
      const cursor = screen.getCursorScreenPoint();
      const offset = 100; // Don't cover the cursor
      let targetX = cursor.x + offset;
      let targetY = cursor.y - 150; // Above cursor
      // Clamp to screen bounds
      targetX = Math.max(0, Math.min(targetX, screenWidth - 300));
      targetY = Math.max(0, Math.min(targetY, screenHeight - 300));
      await animateMoveTo(targetX, targetY, action.duration || 1500);
      break;

    case 'snip':
      petWindow.webContents.send('clawbot-mood', { state: 'curious' });
      setTimeout(() => {
        petWindow?.webContents.send('clawbot-mood', { state: 'idle' });
      }, 2000);
      break;

    case 'wave':
      petWindow.webContents.send('idle-behavior', { type: 'wave' });
      break;

    case 'look_at':
      // Move pet to look at a screen position
      if (typeof action.x === 'number' && typeof action.y === 'number') {
        const lookX = Math.max(0, Math.min(action.x - 150, screenWidth - 300));
        const lookY = Math.max(0, Math.min(action.y - 150, screenHeight - 300));
        petWindow.webContents.send('clawbot-mood', { state: 'curious' });
        await animateMoveTo(lookX, lookY, action.duration || 1200);
      }
      break;
  }
}

// Send chat popup to pet window
async function sendChatPopup(
  trigger: 'app_switch' | 'idle' | 'proactive',
  context?: string,
  windowTitle?: string
) {
  void trigger;
  void context;
  void windowTitle;
  return;
}


function hasActiveConversationSurface(): boolean {
  return Boolean(
    (petChatWindow && !petChatWindow.isDestroyed() && petChatWindow.isVisible())
    || (chatbarWindow && !chatbarWindow.isDestroyed() && chatbarWindow.isVisible())
    || (assistantWindow && !assistantWindow.isDestroyed() && assistantWindow.isVisible())
    || (screenshotQuestionWindow && !screenshotQuestionWindow.isDestroyed() && screenshotQuestionWindow.isVisible())
  );
}

async function maybeSendContextualQuranNudge(
  appName: string,
  windowTitle?: string,
  options: { force?: boolean } = {},
): Promise<boolean> {
  if (
    !petWindow
    || isCapturingAyahReflection
    || (!options.force && hasActiveConversationSurface())
  ) {
    return false;
  }

  const state = getAyahLensState();
  if (!options.force && isInsidePrayerQuietWindow({
    day: state.prayer.today,
    settings: state.prayer.settings,
    now: Date.now(),
  })) {
    return false;
  }
  let result: Awaited<ReturnType<typeof buildContextualQuranNudge>>;
  try {
    result = await buildContextualQuranNudge({
      app: appName,
      title: windowTitle,
      now: Date.now(),
      settings: state.preferences,
      nudgeState: state.nudgeState,
      recentVerseKeys: state.recentVerseKeys,
      fetchVerseContent: fetchVerseContentForReflection,
      ignoreLimits: options.force,
    });
  } catch (error) {
    const message = getSafeErrorMessage(error);
    console.error(`[${APP_DISPLAY_NAME}] Failed to build contextual Quran nudge:`, error);
    petWindow.webContents.send('chat-popup', {
      id: randomUUID(),
      text: `Quran Foundation error: ${message}`,
      trigger: 'app_switch',
      quickReplies: ['Got it', 'Not now'],
    });
    return false;
  }

  if (!result) return false;

  const nextState = saveReflectionLocally({
    ...getAyahLensState(),
    nudgeState: result.nextState,
  }, result.reflection);
  setAyahLensState(nextState);
  resetInteractionTimer();
  petWindow.webContents.send('chat-popup', result.message);
  return true;
}

async function maybeSendTimedQuranReminder(options: { force?: boolean } = {}): Promise<boolean> {
  if (
    !petWindow
    || (!options.force && isCapturingAyahReflection)
    || (!options.force && hasActiveConversationSurface())
  ) {
    return false;
  }

  const state = getAyahLensState();
  if (!options.force && isInsidePrayerQuietWindow({
    day: state.prayer.today,
    settings: state.prayer.settings,
    now: Date.now(),
  })) {
    return false;
  }
  const reminderSettings = options.force
    ? { ...state.preferences, timedReminders: true }
    : state.preferences;
  const reminderNudgeState = options.force
    ? { ...state.nudgeState, lastShownAt: null, lastTimedReminderAt: null }
    : state.nudgeState;
  let result: Awaited<ReturnType<typeof buildTimedQuranReminder>>;
  try {
    result = await buildTimedQuranReminder({
      now: Date.now(),
      settings: reminderSettings,
      nudgeState: reminderNudgeState,
      recentVerseKeys: state.recentVerseKeys,
      fetchVerseContent: fetchVerseContentForReflection,
    });
  } catch (error) {
    const message = getSafeErrorMessage(error);
    console.error(`[${APP_DISPLAY_NAME}] Failed to build timed Quran reminder:`, error);
    showPetChat(
      {
        id: randomUUID(),
        text: `Quran Foundation error: ${message}`,
        quickReplies: ['Got it', 'Not now'],
      },
    );
    return false;
  }

  if (!result) return false;

  const nextState = saveReflectionLocally({
    ...getAyahLensState(),
    nudgeState: result.nextState,
  }, result.reflection);
  setAyahLensState(nextState);
  resetInteractionTimer();
  showPetChat(result.message);
  if (!isSleeping) {
    petWindow.webContents.send('clawbot-mood', { state: 'curious', reason: 'timer reminder' });
  }
  return true;
}

function stopTimedQuranReminders(): void {
  if (!timedQuranReminderInterval) return;
  clearInterval(timedQuranReminderInterval);
  timedQuranReminderInterval = null;
}

function scheduleTimedQuranReminders(): void {
  stopTimedQuranReminders();

  const { timedReminders } = getAyahLensState().preferences;
  if (!timedReminders) return;

  // Poll once per minute instead of recreating native timers whenever the user edits
  // the reminder interval. The per-user interval is still enforced in
  // buildTimedQuranReminder/canShowTimedReminder via lastTimedReminderAt.
  timedQuranReminderInterval = setInterval(() => {
    void maybeSendTimedQuranReminder();
  }, 60 * 1000);
}

async function maybeSendPrayerReminder(): Promise<boolean> {
  if (!petWindow || isCapturingAyahReflection || hasActiveConversationSurface()) {
    return false;
  }

  const now = Date.now();
  let state = getAyahLensState();
  if (shouldRefreshPrayerDay(state.prayer.today, state.prayer.tomorrow, state.prayer.settings, now)) {
    try {
      await refreshPrayerTimes();
      state = getAyahLensState();
    } catch {
      return false;
    }
  }

  if (!state.prayer.today) return false;
  const reminder = shouldSendPrayerReminder({
    day: state.prayer.today,
    tomorrow: state.prayer.tomorrow,
    settings: state.prayer.settings,
    sentReminderKeys: state.prayer.sentReminderKeys,
    now,
  });
  if (!reminder.shouldSend || !reminder.prayer || !reminder.reminderKey) return false;

  setAyahLensState({
    ...state,
    prayer: {
      ...state.prayer,
      sentReminderKeys: [...state.prayer.sentReminderKeys, reminder.reminderKey].slice(-80),
    },
  });
  showPetChat({
    id: randomUUID(),
    text: `${reminder.prayer.label} is coming up at ${reminder.prayer.time}. Take a moment to prepare.`,
    quickReplies: ['Got it', 'Open Prayers', 'Not now'],
  });
  return true;
}

function broadcastTodosUpdated(): void {
  if (!assistantWindow || assistantWindow.isDestroyed()) return;
  assistantWindow.webContents.send('todos-updated', listTodos(getAyahLensState().todos));
}

function broadcastReflectionsUpdated(): void {
  if (!assistantWindow || assistantWindow.isDestroyed()) return;
  assistantWindow.webContents.send('reflections-updated');
}

function maintainStoredTodos(now: number = Date.now()): boolean {
  const state = getAyahLensState();
  const todos = purgeCompletedTodos(state.todos, now);
  if (todos === state.todos) return false;
  setAyahLensState({ ...state, todos });
  broadcastTodosUpdated();
  return true;
}

function maybeSendTodoReminder(): boolean {
  if (!petWindow || isCapturingAyahReflection || hasActiveConversationSurface()) {
    return false;
  }
  const state = getAyahLensState();
  const item = getDueTodoReminder(state.todos, Date.now());
  if (!item) return false;

  setAyahLensState({
    ...state,
    todos: {
      ...state.todos,
      sentReminderIds: [...state.todos.sentReminderIds, item.id].slice(-200),
    },
  });
  showPetChat({
    id: randomUUID(),
    text: `Task reminder: ${item.title}`,
    quickReplies: ['Done', 'Open To Do', 'Not now'],
  });
  return true;
}

function maybeCompletePomodoro(): boolean {
  const state = getAyahLensState();
  const dueSession = getDuePomodoroCompletion(state.pomodoro, Date.now());
  if (!dueSession) return false;

  const completedPomodoro = completePomodoroSession(state.pomodoro, Date.now());
  const shouldAnnounce = completedPomodoro.settings.petRemindersEnabled
    && !completedPomodoro.sentCompletionIds.includes(dueSession.id)
    && !isCapturingAyahReflection;
  setAyahLensState({
    ...state,
    pomodoro: {
      ...completedPomodoro,
      sentCompletionIds: [...completedPomodoro.sentCompletionIds, dueSession.id].slice(-200),
    },
  });
  updateTrayPomodoroTooltip();

  if (shouldAnnounce && petWindow && !(assistantWindow && !assistantWindow.isDestroyed() && assistantWindow.isVisible())) {
    showPetChat({
      id: randomUUID(),
      text: dueSession.kind === 'focus'
        ? 'Focus session complete. Log the win and take a break when you are ready.'
        : 'Break complete. Start another focus session when you are ready.',
      quickReplies: dueSession.kind === 'focus'
        ? ['Start Break', 'Open Focus', 'Not now']
        : ['Start Focus', 'Open Focus', 'Not now'],
    });
  }
  return true;
}

function pomodoroSessionKindLabel(kind: PomodoroSessionKind): string {
  if (kind === 'break') return 'Break';
  return 'Focus';
}

function buildPomodoroPetOverlayPayload(): PomodoroPetOverlayPayload | null {
  const pomodoro = getAyahLensState().pomodoro;
  const session = pomodoro.activeSession;
  const remainingMs = getPomodoroRemainingMs(pomodoro, Date.now());
  if (
    session
    && (session.status === 'running' || session.status === 'paused')
    && remainingMs !== null
  ) {
    return { remainingMs, kind: session.kind, status: session.status };
  }
  return null;
}

/**
 * `getWindowPositionNearAnchor` uses y = petY - height + gap; panel bottom = petY + gap.
 * When the Pomodoro timer strip is visible above the pet, use a gap that pulls the panel up so its bottom
 * sits above the timer (vertical layout), not overlapping the timer window.
 */
function verticalGapAbovePetClearingPomodoroTimer(baseGap: number): number {
  if (!buildPomodoroPetOverlayPayload()) return baseGap;
  const maxBottomGap = -(POMODORO_TIMER_WINDOW_HEIGHT + POMODORO_TIMER_VERTICAL_GAP + ASSISTANT_CLEAR_ABOVE_TIMER_PX);
  return Math.min(baseGap, maxBottomGap);
}

function computePetPomodoroTimerPosition(): { x: number; y: number } | null {
  if (!petWindow || petWindow.isDestroyed()) return null;
  const [petX, petY] = petWindow.getPosition();
  const [petWidth] = petWindow.getSize();
  const timerX = petX + (petWidth - POMODORO_TIMER_WINDOW_WIDTH) / 2;
  const timerY = petY - POMODORO_TIMER_WINDOW_HEIGHT - POMODORO_TIMER_VERTICAL_GAP;
  return {
    x: Math.max(0, Math.round(timerX)),
    y: Math.max(0, Math.round(timerY)),
  };
}

function updatePetPomodoroTimerPosition(): void {
  if (!petPomodoroTimerWindow || petPomodoroTimerWindow.isDestroyed()) return;
  const pos = computePetPomodoroTimerPosition();
  if (!pos) return;
  petPomodoroTimerWindow.setPosition(pos.x, pos.y);
}

function deliverPomodoroTimerPayload(w: BrowserWindow, payload: PomodoroPetOverlayPayload | null): void {
  const cancelPendingHandler = () => {
    if (pendingPomodoroTimerLoadHandler && !w.isDestroyed()) {
      w.webContents.removeListener('did-finish-load', pendingPomodoroTimerLoadHandler);
    }
    pendingPomodoroTimerLoadHandler = null;
  };

  if (!payload) {
    // Cancel any pending show-on-load handler so it cannot re-show the window after hide.
    cancelPendingHandler();
    if (!w.isDestroyed()) {
      if (!w.webContents.isLoading()) {
        w.webContents.send('pomodoro-overlay-update', null);
      }
      w.hide();
    }
    return;
  }

  const run = () => {
    pendingPomodoroTimerLoadHandler = null;
    if (w.isDestroyed()) return;
    w.webContents.send('pomodoro-overlay-update', payload);
    const wasHidden = !w.isVisible();
    w.showInactive();
    if (wasHidden) {
      elevatePetAboveCompanionWindows();
    }
  };

  cancelPendingHandler();
  if (w.webContents.isLoading()) {
    pendingPomodoroTimerLoadHandler = run;
    w.webContents.once('did-finish-load', run);
  } else {
    run();
  }
}

function ensurePetPomodoroTimerWindow(): BrowserWindow | null {
  if (!petWindow || petWindow.isDestroyed()) return null;
  if (petPomodoroTimerWindow && !petPomodoroTimerWindow.isDestroyed()) return petPomodoroTimerWindow;

  const pos = computePetPomodoroTimerPosition();
  if (!pos) return null;

  petPomodoroTimerWindow = new BrowserWindow({
    width: POMODORO_TIMER_WINDOW_WIDTH,
    height: POMODORO_TIMER_WINDOW_HEIGHT,
    x: pos.x,
    y: pos.y,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: '#14141a',
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: true,
    roundedCorners: true,
    focusable: false,
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  wireDebugWindowBorder(petPomodoroTimerWindow);
  petPomodoroTimerWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  setPomodoroTimerWindowAlwaysOnTop(petPomodoroTimerWindow);

  if (isDev) {
    petPomodoroTimerWindow.loadURL(`http://localhost:${DEV_PORT}/pomodoro-timer.html`);
  } else {
    petPomodoroTimerWindow.loadFile(path.join(__dirname, '../renderer/pomodoro-timer.html'));
  }

  petPomodoroTimerWindow.on('closed', () => {
    petPomodoroTimerWindow = null;
  });

  return petPomodoroTimerWindow;
}

function pushPomodoroOverlayToTimerWindow(): void {
  const payload = buildPomodoroPetOverlayPayload();
  if (!payload) {
    if (petPomodoroTimerWindow && !petPomodoroTimerWindow.isDestroyed()) {
      deliverPomodoroTimerPayload(petPomodoroTimerWindow, null);
    }
    refreshPetAnchoredPanelsForPomodoroLayout();
    return;
  }
  if (!petWindow || petWindow.isDestroyed()) return;
  const w = ensurePetPomodoroTimerWindow();
  if (!w) return;
  updatePetPomodoroTimerPosition();
  deliverPomodoroTimerPayload(w, payload);
  refreshPetAnchoredPanelsForPomodoroLayout();
}

/** Live Pomodoro countdown in the tray tooltip while a session is running or paused (visible when the assistant is hidden). */
function updateTrayPomodoroTooltip(): void {
  if (tray) {
    const pomodoro = getAyahLensState().pomodoro;
    const session = pomodoro.activeSession;
    const remainingMs = getPomodoroRemainingMs(pomodoro, Date.now());
    if (
      session
      && (session.status === 'running' || session.status === 'paused')
      && remainingMs !== null
    ) {
      const clock = formatPomodoroClock(remainingMs);
      const kind = pomodoroSessionKindLabel(session.kind);
      const statusText = session.status === 'paused' ? 'Paused' : 'Running';
      tray.setToolTip(`${DEFAULT_TRAY_TOOLTIP}\nPomodoro ${clock} · ${kind} · ${statusText}`);
    } else {
      tray.setToolTip(DEFAULT_TRAY_TOOLTIP);
    }
  }
  pushPomodoroOverlayToTimerWindow();
}

function schedulePrayerAwareness(): void {
  if (prayerAwarenessInterval) clearInterval(prayerAwarenessInterval);
  prayerAwarenessInterval = setInterval(() => {
    void maybeSendPrayerReminder();
  }, 60 * 1000);
  prayerAwarenessInterval.unref?.();
}

function scheduleTodoReminders(): void {
  if (todoReminderInterval) clearInterval(todoReminderInterval);
  maintainStoredTodos();
  todoReminderInterval = setInterval(() => {
    maintainStoredTodos();
    maybeSendTodoReminder();
  }, 60 * 1000);
  todoReminderInterval.unref?.();
}

function schedulePomodoroTicker(): void {
  if (pomodoroInterval) clearInterval(pomodoroInterval);
  pomodoroInterval = setInterval(() => {
    maybeCompletePomodoro();
    updateTrayPomodoroTooltip();
  }, 1000);
  pomodoroInterval.unref?.();
  updateTrayPomodoroTooltip();
}

// Start idle detection
function startIdleDetection() {
  idleCheckInterval = setInterval(() => {
    const idleTime = Date.now() - lastActivityTime;

    if (idleTime > IDLE_THRESHOLD) {
      // Only send idle message once per idle period
      if (idleTime < IDLE_THRESHOLD + 10000) {
        sendChatPopup('idle');
      }
    }
  }, 30000); // Check every 30 seconds
}

// Reset idle timer on activity
function resetIdleTimer() {
  lastActivityTime = Date.now();
}

function createPetWindow() {
  if (petWindow && !petWindow.isDestroyed()) {
    return;
  }

  const primary = screen.getPrimaryDisplay();
  const { workArea } = primary;

  // Small window just for the lobster
  const petWindowWidth = PET_WINDOW_WIDTH;
  const petWindowHeight = PET_WINDOW_HEIGHT;

  // Use saved position or default to bottom-right of primary work area; clamp so the pet is never stranded off-screen
  const savedPosition = store.get('pet.position') as { x: number; y: number } | null;
  const rawX = savedPosition ? savedPosition.x : workArea.x + workArea.width - petWindowWidth - 20;
  const rawY = savedPosition ? savedPosition.y : workArea.y + workArea.height - petWindowHeight - 20;
  const { x: startX, y: startY } = clampPetFrameToVisibleWorkArea(rawX, rawY, petWindowWidth, petWindowHeight);
  if (savedPosition && (savedPosition.x !== startX || savedPosition.y !== startY)) {
    store.set('pet.position', { x: startX, y: startY });
  }

  petWindow = new BrowserWindow({
    width: petWindowWidth,
    height: petWindowHeight,
    x: startX,
    y: startY,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    roundedCorners: false,
    /** Avoid activating Ayati / switching Spaces on startup (Electron default is `show: true`). */
    show: false,
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  wireDebugWindowBorder(petWindow);

  // Allow dragging and going above menu bar; stay below Pomodoro timer and other companion popups (macOS levels).
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  setPetWindowAlwaysOnTop(petWindow);

  petWindow.once('ready-to-show', () => {
    petWindow?.showInactive();
  });

  if (isDev) {
    petWindow.loadURL(`http://localhost:${DEV_PORT}/pet.html`);
  } else {
    petWindow.loadFile(path.join(__dirname, '../renderer/pet.html'));
  }

  petWindow.on('closed', () => {
    petWindow = null;
    // Also close the chat window when pet is closed
    petChatWindow?.close();
    petPomodoroTimerWindow?.close();
    petContextMenuWindow?.close();
    workspaceBrowserWindow?.close();
  });
}

// Show chat popup above the pet
function schedulePetChatAutoHide() {
  if (isPetChatAudioPlaying) {
    if (petChatAutoHideTimeout) {
      clearTimeout(petChatAutoHideTimeout);
      petChatAutoHideTimeout = null;
    }
    return;
  }

  if (petChatAutoHideTimeout) {
    clearTimeout(petChatAutoHideTimeout);
  }

  petChatAutoHideTimeout = setTimeout(() => {
    petChatAutoHideTimeout = null;
    if (!petChatWindow || petChatWindow.isDestroyed() || !petChatWindow.isVisible()) return;
    hidePetChat();
  }, PET_CHAT_AUTO_HIDE_MS);
}

function showPetChat(
  message: {
    id: string;
    text: string;
    quickReplies?: string[];
    reflectionId?: string;
    verseKey?: string;
    arabicText?: string;
    footerText?: string;
  },
) {
  if (!petWindow) return;

  isPetChatAudioPlaying = false;
  pendingPetChatReveal = true;

  const [petX, petY] = petWindow.getPosition();
  const [petWidth] = petWindow.getSize();

  const chatWidth = PET_CHAT_MIN_WIDTH;
  const chatHeight = PET_CHAT_MIN_HEIGHT;
  const chatX = petX + (petWidth - chatWidth) / 2;
  const chatY = petY - chatHeight + verticalGapAbovePetClearingPomodoroTimer(PET_CHAT_VERTICAL_GAP);

  const scheduleFallbackReveal = (delayMs: number = 250) => {
    if (petChatRevealTimeout) clearTimeout(petChatRevealTimeout);
    petChatRevealTimeout = setTimeout(() => {
      if (!pendingPetChatReveal || !petChatWindow || petChatWindow.isDestroyed()) return;
      petChatWindow.setOpacity(1);
      petChatWindow.showInactive();
      pendingPetChatReveal = false;
      petChatRevealTimeout = null;
      elevateWorkspaceBrowserAboveCompanionWindows();
    }, delayMs);
  };

  if (!petChatWindow) {
    petChatWindow = new BrowserWindow({
      width: chatWidth,
      height: chatHeight,
      x: Math.max(0, chatX),
      y: Math.max(0, chatY),
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      hasShadow: false,
      icon: getAppIconPath(),
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    wireDebugWindowBorder(petChatWindow);

    petChatWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    setCompanionWindowAlwaysOnTop(petChatWindow, MAC_AOT_COMPANION_POPUP_LEVEL, MAC_AOT_COMPANION_PANEL_RELATIVE_LEVEL);

    if (isDev) {
      petChatWindow.loadURL(`http://localhost:${DEV_PORT}/pet-chat.html`);
    } else {
      petChatWindow.loadFile(path.join(__dirname, '../renderer/pet-chat.html'));
    }

    petChatWindow.on('closed', () => {
      petChatWindow = null;
      pendingPetChatReveal = false;
      if (petChatRevealTimeout) {
        clearTimeout(petChatRevealTimeout);
        petChatRevealTimeout = null;
      }
      if (petChatAutoHideTimeout) {
        clearTimeout(petChatAutoHideTimeout);
        petChatAutoHideTimeout = null;
      }
    });

    petChatWindow.once('ready-to-show', () => {
      petChatWindow?.setOpacity(0);
      petChatWindow?.showInactive();
      petChatWindow?.webContents.send('chat-message', message);
      scheduleFallbackReveal(250);
      schedulePetChatAutoHide();
      elevateWorkspaceBrowserAboveCompanionWindows();
    });
  } else {
    // Update position and message
    petChatWindow.setPosition(Math.max(0, Math.round(chatX)), Math.max(0, Math.round(chatY)));
    const alreadyShown =
      petChatWindow.isVisible()
      && !petChatWindow.isDestroyed()
      && petChatWindow.getOpacity() > 0.01;
    // Hiding a visible popup before swapping content causes a noticeable flicker; keep opacity while updating.
    if (!alreadyShown) {
      petChatWindow.setOpacity(0);
    }
    if (!petChatWindow.isVisible()) {
      petChatWindow.showInactive();
    }
    petChatWindow.webContents.send('chat-message', message);
    // When the chat was already visible, reveal on the next tick so layout can settle without a 250ms blank.
    scheduleFallbackReveal(alreadyShown ? 0 : 250);
    schedulePetChatAutoHide();
    elevateWorkspaceBrowserAboveCompanionWindows();
  }
}

function hidePetChat() {
  pendingPetChatReveal = false;
  isPetChatAudioPlaying = false;
  if (petChatRevealTimeout) {
    clearTimeout(petChatRevealTimeout);
    petChatRevealTimeout = null;
  }
  if (petChatAutoHideTimeout) {
    clearTimeout(petChatAutoHideTimeout);
    petChatAutoHideTimeout = null;
  }
  petChatWindow?.setOpacity(1);
  petChatWindow?.hide();
}

function resizePetChatToContent(width: number, height: number) {
  if (!petChatWindow || petChatWindow.isDestroyed()) return;

  const nextWidth = Math.max(PET_CHAT_MIN_WIDTH, Math.min(Math.round(width), PET_CHAT_MAX_WIDTH));
  const nextHeight = Math.max(PET_CHAT_MIN_HEIGHT, Math.min(Math.round(height), PET_CHAT_MAX_HEIGHT));
  const [currentWidth, currentHeight] = petChatWindow.getSize();

  if (nextWidth !== currentWidth || nextHeight !== currentHeight) {
    petChatWindow.setSize(nextWidth, nextHeight, false);
  }

  updatePetChatPosition();

  if (pendingPetChatReveal) {
    if (petChatRevealTimeout) {
      clearTimeout(petChatRevealTimeout);
      petChatRevealTimeout = null;
    }
    petChatWindow.setOpacity(1);
    petChatWindow.showInactive();
    pendingPetChatReveal = false;
  }
  elevateWorkspaceBrowserAboveCompanionWindows();
}

function updatePetChatPosition() {
  if (!petWindow || !petChatWindow) return;

  const [petX, petY] = petWindow.getPosition();
  const [petWidth] = petWindow.getSize();
  const [chatWidth] = petChatWindow.getSize();

  const [cw, ch] = petChatWindow.getSize();
  const chatX = petX + (petWidth - cw) / 2;
  const chatY = petY - ch + verticalGapAbovePetClearingPomodoroTimer(PET_CHAT_VERTICAL_GAP);

  petChatWindow.setPosition(Math.max(0, Math.round(chatX)), Math.max(0, Math.round(chatY)));
  updatePetPomodoroTimerPosition();
}

/** Recompute pet-anchored panel Y when Pomodoro timer visibility changes (layout above timer strip). */
function refreshPetAnchoredPanelsForPomodoroLayout(): void {
  if (!petWindow || petWindow.isDestroyed()) return;
  updateWorkspaceBrowserPosition();
  updateAssistantPosition();
  updateScreenshotQuestionPosition();
  updatePetChatPosition();
}

function updateAssistantPosition() {
  if (!petWindow || !assistantWindow || !assistantWindow.isVisible()) return;

  const avoidBounds = workspaceBrowserWindow && !workspaceBrowserWindow.isDestroyed()
    ? workspaceBrowserWindow.getBounds()
    : undefined;
  const [petX, petY] = petWindow.getPosition();
  const [petWidth] = petWindow.getSize();
  const [assistantWidth, assistantHeight] = assistantWindow.getSize();
  const { workArea } = screen.getPrimaryDisplay();
  const position = getWindowPositionNearAnchor({
    anchor: { x: petX, y: petY, width: petWidth, height: PET_WINDOW_HEIGHT },
    windowSize: { width: assistantWidth, height: assistantHeight },
    workArea,
    verticalGap: verticalGapAbovePetClearingPomodoroTimer(ASSISTANT_VERTICAL_GAP),
    avoidBounds,
    avoidGap: WORKSPACE_ASSISTANT_AVOID_GAP,
  });

  assistantWindow.setPosition(position.x, position.y);
  elevateWorkspaceBrowserAboveCompanionWindows();
}

function updateWorkspaceBrowserPosition() {
  if (!petWindow || !workspaceBrowserWindow || workspaceBrowserWindow.isDestroyed()) {
    return;
  }

  const [petX, petY] = petWindow.getPosition();
  const [petWidth] = petWindow.getSize();
  const [browserWidth, browserHeight] = workspaceBrowserWindow.getSize();
  const { workArea } = screen.getPrimaryDisplay();
  const position = getWindowPositionNearAnchor({
    anchor: { x: petX, y: petY, width: petWidth, height: PET_WINDOW_HEIGHT },
    windowSize: { width: browserWidth, height: browserHeight },
    workArea,
    verticalGap: verticalGapAbovePetClearingPomodoroTimer(WORKSPACE_BROWSER_VERTICAL_GAP),
  });

  workspaceBrowserWindow.setPosition(position.x, position.y);
  elevateWorkspaceBrowserAboveCompanionWindows();
}

function updateScreenshotQuestionPosition() {
  if (!petWindow || !screenshotQuestionWindow || !screenshotQuestionWindow.isVisible()) return;

  const [petX, petY] = petWindow.getPosition();
  const [petWidth] = petWindow.getSize();
  const [questionWidth, questionHeight] = screenshotQuestionWindow.getSize();
  const { workArea } = screen.getPrimaryDisplay();
  const position = getWindowPositionNearAnchor({
    anchor: { x: petX, y: petY, width: petWidth, height: PET_WINDOW_HEIGHT },
    windowSize: { width: questionWidth, height: questionHeight },
    workArea,
    verticalGap: verticalGapAbovePetClearingPomodoroTimer(ASSISTANT_VERTICAL_GAP),
  });

  screenshotQuestionWindow.setPosition(position.x, position.y);
}

function revealAssistantWindow() {
  if (!assistantWindow || assistantWindow.isDestroyed()) return;

  if (process.platform === 'darwin' || process.platform === 'linux') {
    assistantWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
    });
  }
  applyAssistantWindowStacking();

  const revealInactive = shouldRevealAssistantInactive();
  if (revealInactive) {
    assistantWindow.showInactive();
  } else {
    assistantWindow.show();
  }
  if (shouldRepositionAssistantAfterReveal()) {
    updateAssistantPosition();
  }
  elevateWorkspaceBrowserAboveCompanionWindows();
}

/**
 * Ensures a single assistant BrowserWindow: recover a stray instance (lost reference) and destroy duplicates.
 *
 * Important: while assistant.html is still loading, the title may be the package name and the URL may be empty,
 * so the window must still be recognized via the tracked `assistantWindow` reference. Otherwise we can pick
 * `candidates[0]` incorrectly, orphan the real window, and end up with two identical assistant panels.
 */
function reconcileAssistantWindowReference(): void {
  try {
    const isAssistantLikeByContent = (w: BrowserWindow): boolean => {
      try {
        const title = w.getTitle();
        const url = w.webContents.getURL();
        return title.includes('Assistant') || url.includes('assistant.html');
      } catch {
        return false;
      }
    };

    const candidates: BrowserWindow[] = [];
    const seen = new Set<number>();

    for (const w of BrowserWindow.getAllWindows()) {
      if (w.isDestroyed()) continue;

      const isTracked =
        Boolean(assistantWindow && !assistantWindow.isDestroyed() && w.id === assistantWindow.id);
      if (isTracked || isAssistantLikeByContent(w)) {
        if (!seen.has(w.id)) {
          seen.add(w.id);
          candidates.push(w);
        }
      }
    }

    if (candidates.length === 0) {
      return;
    }

    if (candidates.length === 1) {
      assistantWindow = candidates[0];
      return;
    }

    const trackedIsLive =
      Boolean(assistantWindow && !assistantWindow.isDestroyed()) &&
      candidates.some((w) => w.id === assistantWindow!.id);

    if (trackedIsLive && assistantWindow) {
      const keep = assistantWindow;
      for (const w of candidates) {
        if (w.id !== keep.id) {
          w.destroy();
        }
      }
      return;
    }

    // Multiple assistant-like windows but no trusted reference (or reference did not match): start clean.
    for (const w of candidates) {
      w.destroy();
    }
    assistantWindow = null;
  } catch {
    // ignore
  }
}

function openAssistantOnTab(tab: 'settings' | 'prayers' | 'todos' | 'focus' | 'reflections') {
  createAssistantWindow();
  if (!assistantWindow || assistantWindow.isDestroyed()) return;

  const channel = tab === 'settings'
    ? 'switch-to-settings'
    : tab === 'prayers'
      ? 'switch-to-prayers'
      : tab === 'todos'
        ? 'switch-to-todos'
        : tab === 'focus'
          ? 'switch-to-focus'
          : 'switch-to-reflections';
  const sendTabSwitch = () => {
    if (!assistantWindow || assistantWindow.isDestroyed()) return;
    assistantWindow.webContents.send(channel);
  };

  if (assistantWindow.webContents.isLoading()) {
    assistantWindow.webContents.once('did-finish-load', () => {
      setTimeout(sendTabSwitch, 0);
    });
  } else {
    sendTabSwitch();
  }
}

function createAssistantWindow(options?: { preloadOnly?: boolean }) {
  const preloadOnly = options?.preloadOnly === true;

  if (assistantWindow?.isDestroyed()) {
    assistantWindow = null;
    shouldRevealAssistantWhenReady = false;
  }
  reconcileAssistantWindowReference();

  if (preloadOnly && assistantWindow && !assistantWindow.isDestroyed()) {
    return;
  }

  if (preloadOnly) {
    shouldRevealAssistantWhenReady = false;
  } else {
    shouldRevealAssistantWhenReady = true;
  }

  if (assistantWindow) {
    if (!preloadOnly) {
      revealAssistantWindow();
      updateAssistantPosition();
    }
    return;
  }

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  // Position above pet if pet window exists, otherwise bottom-right
  let initialX = screenWidth - ASSISTANT_WINDOW_WIDTH - 20;
  let initialY = screenHeight - ASSISTANT_WINDOW_HEIGHT - 20;

  if (petWindow) {
    const [petX, petY] = petWindow.getPosition();
    const [petWidth] = petWindow.getSize();

    initialX = petX + (petWidth - ASSISTANT_WINDOW_WIDTH) / 2;
    initialY = petY - ASSISTANT_WINDOW_HEIGHT + verticalGapAbovePetClearingPomodoroTimer(ASSISTANT_VERTICAL_GAP);

    // Keep within screen bounds
    initialX = Math.max(0, Math.min(initialX, screenWidth - ASSISTANT_WINDOW_WIDTH));
    initialY = Math.max(0, initialY);
  }

  assistantWindow = new BrowserWindow({
    width: ASSISTANT_WINDOW_WIDTH,
    height: ASSISTANT_WINDOW_HEIGHT,
    x: Math.round(initialX),
    y: Math.round(initialY),
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: true,
    show: false,
    backgroundColor: '#1a1a2e',
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  wireDebugWindowBorder(assistantWindow);
  assistantWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (process.platform === 'darwin' || process.platform === 'linux') {
    assistantWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  applyAssistantWindowStacking();

  if (isDev) {
    assistantWindow.loadURL(`http://localhost:${DEV_PORT}/assistant.html`);
  } else {
    assistantWindow.loadFile(path.join(__dirname, '../renderer/assistant.html'));
  }

  assistantWindow.once('ready-to-show', () => {
    if (preloadOnly) {
      return;
    }
    if (shouldRevealAssistantWhenReady) {
      revealAssistantWindow();
    }
  });

  assistantWindow.on('closed', () => {
    assistantWindow = null;
    shouldRevealAssistantWhenReady = false;
  });
}

function createPetContextMenuWindow() {
  if (petContextMenuWindow) return;

  petContextMenuWindow = new BrowserWindow({
    width: PET_CONTEXT_MENU_WIDTH,
    height: PET_CONTEXT_MENU_HEIGHT,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: false,
    show: false,
    skipTaskbar: true,
    hasShadow: false,
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  wireDebugWindowBorder(petContextMenuWindow);
  petContextMenuWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  setPetContextMenuWindowAlwaysOnTop(petContextMenuWindow);

  if (isDev) {
    petContextMenuWindow.loadURL(`http://localhost:${DEV_PORT}/pet-context-menu.html`);
  } else {
    petContextMenuWindow.loadFile(path.join(__dirname, '../renderer/pet-context-menu.html'));
  }

  petContextMenuWindow.on('blur', () => {
    if (shouldHideWindowOnBlur('petContextMenu')) {
      petContextMenuWindow?.hide();
    }
  });

  petContextMenuWindow.on('closed', () => {
    petContextMenuWindow = null;
  });
}

function createWorkspaceBrowserWindow() {
  if (workspaceBrowserWindow) {
    setWorkspaceBrowserWindowAlwaysOnTop(workspaceBrowserWindow);
    workspaceBrowserWindow.show();
    workspaceBrowserWindow.focus();
    updateWorkspaceBrowserPosition();
    applyAssistantWindowStacking();
    updateAssistantPosition();
    elevateWorkspaceBrowserAboveCompanionWindows();
    return;
  }

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  let initialX = screenWidth - WORKSPACE_BROWSER_WIDTH - 24;
  let initialY = screenHeight - WORKSPACE_BROWSER_HEIGHT - 24;

  if (petWindow) {
    const [petX, petY] = petWindow.getPosition();
    const [petWidth] = petWindow.getSize();

    initialX = petX + (petWidth - WORKSPACE_BROWSER_WIDTH) / 2;
    initialY = petY - WORKSPACE_BROWSER_HEIGHT + verticalGapAbovePetClearingPomodoroTimer(WORKSPACE_BROWSER_VERTICAL_GAP);
    initialX = Math.max(0, Math.min(initialX, screenWidth - WORKSPACE_BROWSER_WIDTH));
    initialY = Math.max(0, initialY);
  }

  workspaceBrowserWindow = new BrowserWindow({
    width: WORKSPACE_BROWSER_WIDTH,
    height: WORKSPACE_BROWSER_HEIGHT,
    x: Math.round(initialX),
    y: Math.round(initialY),
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: true,
    show: false,
    backgroundColor: '#0f1720',
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  wireDebugWindowBorder(workspaceBrowserWindow);

  if (process.platform === 'darwin' || process.platform === 'linux') {
    workspaceBrowserWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  setWorkspaceBrowserWindowAlwaysOnTop(workspaceBrowserWindow);

  if (isDev) {
    workspaceBrowserWindow.loadURL(`http://localhost:${DEV_PORT}/workspace-browser.html`);
  } else {
    workspaceBrowserWindow.loadFile(path.join(__dirname, '../renderer/workspace-browser.html'));
  }

  workspaceBrowserWindow.once('ready-to-show', () => {
    workspaceBrowserWindow?.show();
    workspaceBrowserWindow?.focus();
    updateWorkspaceBrowserPosition();
    applyAssistantWindowStacking();
    updateAssistantPosition();
    if (workspaceBrowserWindow && !workspaceBrowserWindow.isDestroyed()) {
      setWorkspaceBrowserWindowAlwaysOnTop(workspaceBrowserWindow);
    }
    elevateWorkspaceBrowserAboveCompanionWindows();
  });

  workspaceBrowserWindow.on('focus', () => {
    resetInteractionTimer();
  });

  workspaceBrowserWindow.on('resize', () => {
    updateWorkspaceBrowserPosition();
    updateAssistantPosition();
  });

  workspaceBrowserWindow.on('closed', () => {
    workspaceBrowserWindow = null;
    applyAssistantWindowStacking();
  });
}

function showPetContextMenuAtCursor(cursorX: number, cursorY: number) {
  createPetContextMenuWindow();
  if (!petContextMenuWindow || petContextMenuWindow.isDestroyed()) return;

  const display = screen.getDisplayNearestPoint({ x: cursorX, y: cursorY });
  const { x: areaX, y: areaY, width: areaWidth, height: areaHeight } = display.workArea;

  const x = Math.max(areaX, Math.min(Math.round(cursorX), areaX + areaWidth - PET_CONTEXT_MENU_WIDTH));
  const y = Math.max(areaY, Math.min(Math.round(cursorY), areaY + areaHeight - PET_CONTEXT_MENU_HEIGHT));

  const showWindow = () => {
    if (!petContextMenuWindow || petContextMenuWindow.isDestroyed()) return;
    petContextMenuWindow.setPosition(x, y);
    petContextMenuWindow.show();
    petContextMenuWindow.focus();
    elevatePetAboveCompanionWindows();
  };

  if (petContextMenuWindow.webContents.isLoading()) {
    petContextMenuWindow.webContents.once('did-finish-load', showWindow);
  } else {
    showWindow();
  }
}

function toggleAssistantWindow() {
  if (assistantWindow?.isDestroyed()) {
    assistantWindow = null;
    shouldRevealAssistantWhenReady = false;
  }
  reconcileAssistantWindowReference();

  if (assistantWindow?.isVisible()) {
    shouldRevealAssistantWhenReady = false;
    assistantWindow.hide();
  } else {
    shouldRevealChatbarWhenReady = false;
    if (chatbarWindow && !chatbarWindow.isDestroyed()) {
      chatbarWindow.hide();
    }
    createAssistantWindow();
  }
}

function createChatbarWindow(options?: { preloadOnly?: boolean }) {
  const preloadOnly = options?.preloadOnly === true;

  if (chatbarWindow) {
    if (isChatbarWindowReady) {
      chatbarWindow.show();
      chatbarWindow.focus();
      elevateWorkspaceBrowserAboveCompanionWindows();
    } else {
      shouldRevealChatbarWhenReady = true;
    }
    return;
  }

  isChatbarWindowReady = false;
  shouldRevealChatbarWhenReady = !preloadOnly;

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const chatbarWidth = 650;
  const chatbarHeight = 300;

  chatbarWindow = new BrowserWindow({
    width: chatbarWidth,
    height: chatbarHeight,
    x: Math.round((screenWidth - chatbarWidth) / 2),
    y: Math.round(screenHeight / 3),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: false,
    show: false,
    skipTaskbar: true,
    hasShadow: false,
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  wireDebugWindowBorder(chatbarWindow);

  chatbarWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  setCompanionWindowAlwaysOnTop(chatbarWindow, MAC_AOT_COMPANION_POPUP_LEVEL, MAC_AOT_COMPANION_PANEL_RELATIVE_LEVEL);

  // Make transparent areas click-through
  chatbarWindow.setIgnoreMouseEvents(true, { forward: true });

  if (isDev) {
    chatbarWindow.loadURL(`http://localhost:${DEV_PORT}/chatbar.html`);
  } else {
    chatbarWindow.loadFile(path.join(__dirname, '../renderer/chatbar.html'));
  }

  chatbarWindow.once('ready-to-show', () => {
    isChatbarWindowReady = true;

    if (shouldRevealChatbarWhenReady) {
      shouldRevealChatbarWhenReady = false;
      chatbarWindow?.show();
      chatbarWindow?.focus();
      elevateWorkspaceBrowserAboveCompanionWindows();
    }
  });

  // Hide on blur (click outside)
  chatbarWindow.on('blur', () => {
    if (shouldHideWindowOnBlur('chatbar')) {
      chatbarWindow?.hide();
    }
  });

  chatbarWindow.on('closed', () => {
    chatbarWindow = null;
    isChatbarWindowReady = false;
    shouldRevealChatbarWhenReady = false;
  });
}

/** Load chatbar in the background after startup so the first shortcut only shows an existing window. */
function warmChatbarWindow() {
  if (chatbarWindow) {
    return;
  }
  createChatbarWindow({ preloadOnly: true });
}

function toggleChatbarWindow() {
  if (chatbarWindow && chatbarWindow.isVisible()) {
    shouldRevealChatbarWhenReady = false;
    chatbarWindow.hide();
  } else {
    shouldRevealAssistantWhenReady = false;
    if (assistantWindow && !assistantWindow.isDestroyed()) {
      assistantWindow.hide();
    }
    createChatbarWindow();
  }
}

function createScreenshotQuestionWindow() {
  console.log('[ScreenshotQuestion] Creating window...');
  if (screenshotQuestionWindow) {
    console.log('[ScreenshotQuestion] Window exists, recreating with prepared reflection');
    screenshotQuestionWindow.destroy();
    screenshotQuestionWindow = null;
  }

  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { width: screenWidth, height: screenHeight } = display.workAreaSize;

  const windowWidth = SCREENSHOT_QUESTION_WIDTH;
  const windowHeight = SCREENSHOT_QUESTION_HEIGHT;

  let x = Math.round(cursor.x - windowWidth / 2);
  let y = Math.round(cursor.y - windowHeight - 20);

  if (petWindow) {
    const [petX, petY] = petWindow.getPosition();
    const [petWidth] = petWindow.getSize();
    const { workArea } = screen.getPrimaryDisplay();
    const position = getWindowPositionNearAnchor({
      anchor: { x: petX, y: petY, width: petWidth, height: PET_WINDOW_HEIGHT },
      windowSize: { width: windowWidth, height: windowHeight },
      workArea,
      verticalGap: verticalGapAbovePetClearingPomodoroTimer(ASSISTANT_VERTICAL_GAP),
    });
    x = position.x;
    y = position.y;
  } else {
    x = Math.max(display.workArea.x, Math.min(x, display.workArea.x + screenWidth - windowWidth));
    y = Math.max(display.workArea.y, Math.min(y, display.workArea.y + screenHeight - windowHeight));
  }

  screenshotQuestionWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: false,
    show: false,
    skipTaskbar: true,
    hasShadow: false,
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  wireDebugWindowBorder(screenshotQuestionWindow);

  screenshotQuestionWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  setCompanionWindowAlwaysOnTop(screenshotQuestionWindow, MAC_AOT_COMPANION_POPUP_LEVEL, MAC_AOT_COMPANION_PANEL_RELATIVE_LEVEL);

  if (isDev) {
    screenshotQuestionWindow.loadURL(`http://localhost:${DEV_PORT}/screenshot-question.html`);
  } else {
    screenshotQuestionWindow.loadFile(path.join(__dirname, '../renderer/screenshot-question.html'));
  }

  screenshotQuestionWindow.once('ready-to-show', () => {
    console.log('[ScreenshotQuestion] Window ready, showing...');
    if (!screenshotQuestionWindow) return;
    if (shouldRevealWindowInactive('screenshotQuestion')) {
      screenshotQuestionWindow.showInactive();
    } else {
      screenshotQuestionWindow.show();
    }
    elevateWorkspaceBrowserAboveCompanionWindows();
  });

  // Keep reflection capture visible during focus changes from screen capture.
  screenshotQuestionWindow.on('blur', () => {
    if (shouldHideWindowOnBlur('screenshotQuestion')) {
      screenshotQuestionWindow?.hide();
    }
  });

  screenshotQuestionWindow.on('closed', () => {
    screenshotQuestionWindow = null;
    ayahPendingReflectionEcho = null;
    ayahPendingReflectionEchoUntil = 0;
  });
}

function toggleScreenshotQuestionWindow() {
  if (screenshotQuestionWindow && screenshotQuestionWindow.isVisible()) {
    screenshotQuestionWindow.hide();
  } else {
    const preparePromise = preparePendingAyahReflectionResult();
    ayahReflectionPrepareInFlight = preparePromise;
    void preparePromise.finally(() => {
      ayahReflectionPrepareInFlight = null;
    });
    createScreenshotQuestionWindow();
  }
}

function captureMainCompanionVisibility(): CompanionHideSnapshot {
  return {
    pet: Boolean(petWindow && !petWindow.isDestroyed() && petWindow.isVisible()),
    assistant: Boolean(assistantWindow && !assistantWindow.isDestroyed() && assistantWindow.isVisible()),
    chatbar: Boolean(chatbarWindow && !chatbarWindow.isDestroyed() && chatbarWindow.isVisible()),
    workspaceBrowser: Boolean(
      workspaceBrowserWindow && !workspaceBrowserWindow.isDestroyed() && workspaceBrowserWindow.isVisible(),
    ),
  };
}

function anyHideAllTargetWindowVisible(): boolean {
  if (petWindow && !petWindow.isDestroyed() && petWindow.isVisible()) return true;
  if (assistantWindow && !assistantWindow.isDestroyed() && assistantWindow.isVisible()) return true;
  if (chatbarWindow && !chatbarWindow.isDestroyed() && chatbarWindow.isVisible()) return true;
  if (screenshotQuestionWindow && !screenshotQuestionWindow.isDestroyed() && screenshotQuestionWindow.isVisible()) {
    return true;
  }
  if (petChatWindow && !petChatWindow.isDestroyed() && petChatWindow.isVisible()) return true;
  if (petContextMenuWindow && !petContextMenuWindow.isDestroyed() && petContextMenuWindow.isVisible()) return true;
  if (workspaceBrowserWindow && !workspaceBrowserWindow.isDestroyed() && workspaceBrowserWindow.isVisible()) {
    return true;
  }
  return false;
}

function restoreMainCompanionFromSnapshot(snapshot: CompanionHideSnapshot): void {
  if (snapshot.pet && petWindow && !petWindow.isDestroyed()) {
    petWindow.show();
    petWindow.focus();
    elevatePetAboveCompanionWindows();
  }
  if (snapshot.workspaceBrowser && workspaceBrowserWindow && !workspaceBrowserWindow.isDestroyed()) {
    workspaceBrowserWindow.show();
    workspaceBrowserWindow.focus();
    elevateWorkspaceBrowserAboveCompanionWindows();
  }
  if (snapshot.assistant && assistantWindow && !assistantWindow.isDestroyed()) {
    revealAssistantWindow();
    elevateWorkspaceBrowserAboveCompanionWindows();
  }
  if (snapshot.chatbar) {
    if (chatbarWindow && !chatbarWindow.isDestroyed()) {
      if (isChatbarWindowReady) {
        chatbarWindow.show();
        chatbarWindow.focus();
        elevateWorkspaceBrowserAboveCompanionWindows();
      } else {
        shouldRevealChatbarWhenReady = true;
      }
    } else {
      shouldRevealChatbarWhenReady = true;
      createChatbarWindow();
    }
  }
}

function toggleHideAllCompanionWindows(): void {
  const anyVisible = anyHideAllTargetWindowVisible();

  if (anyVisible) {
    companionSnapshotForRestore = captureMainCompanionVisibility();
    hideAllWindows();
    return;
  }

  const snap =
    companionSnapshotForRestore ??
    ({ pet: true, assistant: false, chatbar: false, workspaceBrowser: false } satisfies CompanionHideSnapshot);
  companionSnapshotForRestore = null;
  restoreMainCompanionFromSnapshot(snap);
}

function hideAllWindows() {
  shouldRevealAssistantWhenReady = false;
  shouldRevealChatbarWhenReady = false;

  if (assistantWindow && !assistantWindow.isDestroyed()) {
    assistantWindow.hide();
  }
  if (chatbarWindow && !chatbarWindow.isDestroyed()) {
    chatbarWindow.hide();
  }
  if (screenshotQuestionWindow && !screenshotQuestionWindow.isDestroyed()) {
    screenshotQuestionWindow.hide();
  }
  if (petChatWindow && !petChatWindow.isDestroyed()) {
    petChatWindow.hide();
  }
  if (petContextMenuWindow && !petContextMenuWindow.isDestroyed()) {
    petContextMenuWindow.hide();
  }
  if (workspaceBrowserWindow && !workspaceBrowserWindow.isDestroyed()) {
    workspaceBrowserWindow.hide();
  }
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.hide();
  }
}


function createOnboardingWindow(): Promise<void> {
  return new Promise((resolve) => {
    console.log('[Onboarding] createOnboardingWindow called');
    if (onboardingWindow) {
      console.log('[Onboarding] Window already exists, showing');
      onboardingWindow.show();
      onboardingWindow.focus();
      resolve();
      return;
    }

    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
    const windowWidth = 600;
    const windowHeight = 700;

    console.log('[Onboarding] Creating new BrowserWindow');
    onboardingWindow = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      x: Math.round((screenWidth - windowWidth) / 2),
      y: Math.round((screenHeight - windowHeight) / 2),
      frame: false,
      transparent: false,
      resizable: true,
      minWidth: 500,
      minHeight: 550,
      show: false,
      backgroundColor: '#AFF9C9',
      icon: getAppIconPath(),
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    wireDebugWindowBorder(onboardingWindow);

    const loadUrl = isDev
      ? `http://localhost:${DEV_PORT}/onboarding.html`
      : path.join(__dirname, '../renderer/onboarding.html');
    console.log('[Onboarding] Loading URL:', loadUrl);

    if (isDev) {
      onboardingWindow.loadURL(`http://localhost:${DEV_PORT}/onboarding.html`);
      // Open DevTools in dev mode for debugging
      onboardingWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
      onboardingWindow.loadFile(path.join(__dirname, '../renderer/onboarding.html'));
    }

    onboardingWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      console.error('[Onboarding] Failed to load:', errorCode, errorDescription);
    });

    onboardingWindow.once('ready-to-show', () => {
      console.log('[Onboarding] Window ready to show');
      onboardingWindow?.show();
      resolve();
    });

    onboardingWindow.on('closed', () => {
      console.log('[Onboarding] Window closed');
      onboardingWindow = null;
    });
  });
}

function closeOnboardingAndStartApp() {
  const win = onboardingWindow;
  onboardingWindow = null;
  if (win && !win.isDestroyed()) {
    // `destroy()` tears down immediately; `close()` can be delayed or feel stuck on frameless windows.
    win.destroy();
  }
  try {
    startMainApp();
  } catch (error) {
    console.error('[Onboarding] Failed to start main app after closing setup window:', error);
  }
}

function startMainApp() {
  // Register global hotkeys
  registerHotkeys();

  createPetWindow();

  setImmediate(() => {
    warmChatbarWindow();
    createAssistantWindow({ preloadOnly: true });
  });

  // Initialize ClawBot client
  const clawbotUrl = store.get('clawbot.url') as string;
  const clawbotToken = store.get('clawbot.token') as string;
  const clawbotProvider = getStoredClawBotProvider();
  const clawbotModel = getStoredClawBotModel(clawbotProvider);
  clawbot = new ClawBotClient(clawbotUrl, clawbotToken, null, {
    provider: clawbotProvider,
    model: clawbotModel,
  });

  // Forward connection status changes to all renderer windows
  clawbot.on('connection-changed', (status: { connected: boolean; error: string | null; gatewayUrl: string }) => {
    petWindow?.webContents.send('clawbot-connection-changed', status);
    assistantWindow?.webContents.send('clawbot-connection-changed', status);
    petChatWindow?.webContents.send('clawbot-connection-changed', status);
    chatbarWindow?.webContents.send('clawbot-connection-changed', status);
  });

  // Initialize watchers
  watchers = new Watchers(store, (event) => {
    // Reset idle timer on any activity
    resetIdleTimer();

    // Send events to ClawBot
    clawbot?.sendEvent(event);

    // Forward to pet window for reactions
    petWindow?.webContents.send('activity-event', event);

    // Forward to assistant window
    assistantWindow?.webContents.send('activity-event', event);

    // Trigger Quran-connected contextual nudges on app switch.
    if (event.type === 'app_focus_changed' && event.app) {
      void maybeSendContextualQuranNudge(event.app, event.title);
    }
  });

  watchers.start();
  scheduleTimedQuranReminders();
  schedulePrayerAwareness();
  scheduleTodoReminders();
  schedulePomodoroTicker();

  // Start idle detection
  startIdleDetection();

  // Start attention seeker behavior
  startAttentionSeeker();

  // Start idle behavior system (makes pet feel alive)
  startIdleBehaviors();

  // Start sleep check (pet falls asleep after 1 minute of no interaction)
  startSleepCheck();

  // Listen for ClawBot responses
  clawbot.on('suggestion', (data) => {
    petWindow?.webContents.send('clawbot-suggestion', data);
    assistantWindow?.webContents.send('clawbot-suggestion', data);
  });

  clawbot.on('mood', (data) => {
    const moodState = (data as { state?: string } | null)?.state;
    if (isSleepMoodState(moodState)) {
      isSleeping = true;
    }
    if (isSleeping && !isSleepMoodState(moodState)) {
      console.log(`[Sleep] Ignoring mood update while sleeping: ${String(moodState ?? 'unknown')}`);
      return;
    }
    petWindow?.webContents.send('clawbot-mood', data);
  });

  // Cron job processing through AI has been removed.
  clawbot.on('cronResult', async (data) => {
    assistantWindow?.webContents.send('cron-result', data);
  });

  clawbot.on('cronError', (data) => {
    console.log('[Main] Cron error received:', data.jobName, data.error);
    petWindow?.webContents.send('cron-error', data);
    assistantWindow?.webContents.send('cron-error', data);
  });

  // Show a welcome chat bubble prompting the user to open the assistant with their shortcut
  setImmediate(() => {
    const rawShortcut = store.get('hotkeys.openAssistant') as string;
    const displayShortcut = rawShortcut
      ? rawShortcut
          .replace('CommandOrControl', '⌘')
          .replace('Alt', '⌥')
          .replace('Shift', '⇧')
          .replace(/\+/g, ' + ')
      : 'your shortcut';
    showPetChat({
      id: randomUUID(),
      text: `You're all set! Press ${displayShortcut} to open the assistant.`,
      quickReplies: ['Got it', 'Open assistant'],
    });
  });

  void syncPendingAyahReflections();
}

// Screen capture - uses native capture for speed
async function captureScreen(): Promise<string | null> {
  return captureScreenNative();
}

// IPC Handlers
function setupIPC() {
  // Toggle assistant window
  ipcMain.on('toggle-assistant', () => {
    toggleAssistantWindow();
  });

  // Open assistant window on current desktop/space
  ipcMain.on('open-assistant', () => {
    createAssistantWindow();
  });

  ipcMain.on('open-workspace-browser', () => {
    createWorkspaceBrowserWindow();
  });

  ipcMain.on('close-workspace-browser', () => {
    workspaceBrowserWindow?.close();
  });

  // Close assistant window
  ipcMain.on('close-assistant', () => {
    assistantWindow?.hide();
  });

  ipcMain.on('show-pet-context-menu', (_event, position: { x: number; y: number }) => {
    if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') return;
    showPetContextMenuAtCursor(position.x, position.y);
  });

  ipcMain.on('pet-context-menu-action', (_event, action: 'chat' | 'settings' | 'workspace' | 'quit') => {
    if (action === 'quit') {
      app.quit();
    } else if (action === 'settings') {
      openAssistantOnTab('settings');
    } else if (action === 'workspace') {
      createWorkspaceBrowserWindow();
    } else {
      openAssistantOnTab('prayers');
    }
    petContextMenuWindow?.hide();
  });

  ipcMain.on('hide-pet-context-menu', () => {
    petContextMenuWindow?.hide();
  });

  // Force pet into sleep mode (dev utility)
  ipcMain.on('force-pet-sleep', () => {
    fallAsleep();
  });

  ipcMain.handle('dev-force-welcome-chat-bubble', () => {
    const rawShortcut = store.get('hotkeys.openAssistant') as string;
    const displayShortcut = rawShortcut
      ? rawShortcut
          .replace('CommandOrControl', '⌘')
          .replace('Alt', '⌥')
          .replace('Shift', '⇧')
          .replace(/\+/g, ' + ')
      : 'your shortcut';
    showPetChat({
      id: randomUUID(),
      text: `You're all set! Press ${displayShortcut} to open the assistant.`,
      quickReplies: ['Got it', 'Open assistant'],
    });
    return true;
  });

  // Force a test app-switch chat popup (dev utility)
  ipcMain.handle('dev-force-active-app-comment', async () => {
    await new Promise((resolve) => setTimeout(resolve, DEV_FORCE_ACTIVE_APP_COMMENT_DELAY_MS));

    let activeApp: string | undefined;
    let activeWindowTitle: string | undefined;
    const sendTitles = store.get('watch.sendWindowTitles') as boolean;
    let screenRecordingDenied = false;

    try {
      const activeWin = await import('active-win');
      let win: Awaited<ReturnType<typeof activeWin.default>> | undefined;
      try {
        win = await activeWin.default({
          accessibilityPermission: true,
          screenRecordingPermission: sendTitles,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const requiresScreenRecording = message.toLowerCase().includes('screen recording');
        if (requiresScreenRecording && sendTitles) {
          screenRecordingDenied = true;
          console.warn('[Dev] Screen Recording permission not granted. Testing active app comment without window title.');
          win = await activeWin.default({
            accessibilityPermission: true,
            screenRecordingPermission: false,
          });
        } else {
          throw error;
        }
      }
      activeApp = win?.owner?.name;
      activeWindowTitle = sendTitles ? win?.title : undefined;
      if (sendTitles && screenRecordingDenied && activeApp && !activeWindowTitle) {
        activeWindowTitle = await getFrontmostWindowTitleFromSystemEvents(activeApp);
      }
    } catch (error) {
      console.warn('[Dev] Failed to resolve active app for forced comment:', error);
    }

    if (activeApp) {
      await maybeSendContextualQuranNudge(activeApp, activeWindowTitle, { force: true });
    }
    return true;
  });

  ipcMain.handle('dev-force-timed-reminder-comment', async () => {
    return maybeSendTimedQuranReminder({ force: true });
  });

  ipcMain.handle('dev-force-prayer-reminder-comment', async () => {
    if (!petWindow) return false;
    const today = getAyahLensState().prayer.today;
    const maghrib = today?.prayers.find((p) => p.name === 'maghrib');
    const label = maghrib?.label ?? 'Maghrib';
    const time = maghrib?.time ?? '6:15 PM';
    showPetChat(
      {
        id: randomUUID(),
        text: `${label} is coming up at ${time}. Take a moment to prepare.`,
        quickReplies: ['Got it', 'Open Prayers', 'Not now'],
      },
    );
    if (!isSleeping) {
      petWindow.webContents.send('clawbot-mood', { state: 'curious', reason: 'prayer reminder' });
    }
    resetInteractionTimer();
    return true;
  });

  ipcMain.handle('dev-force-todo-reminder-comment', async () => {
    if (!petWindow) return false;
    showPetChat(
      {
        id: randomUUID(),
        text: 'Task reminder: Review PR 3',
        quickReplies: ['Done', 'Open To Do', 'Not now'],
      },
    );
    if (!isSleeping) {
      petWindow.webContents.send('clawbot-mood', { state: 'curious', reason: 'todo reminder' });
    }
    resetInteractionTimer();
    return true;
  });

  // Toggle chatbar window
  ipcMain.on('toggle-chatbar', () => {
    openAssistantOnTab('prayers');
  });

  // Close chatbar window
  ipcMain.on('close-chatbar', () => {
    chatbarWindow?.hide();
  });

  // Control mouse events for chatbar (for click-through on transparent areas)
  ipcMain.on('chatbar-set-ignore-mouse', (_event, ignore: boolean) => {
    if (chatbarWindow) {
      chatbarWindow.setIgnoreMouseEvents(ignore, { forward: true });
    }
  });

  // Toggle screenshot question window
  ipcMain.on('toggle-screenshot-question', () => {
    openAssistantOnTab('reflections');
  });

  // Close screenshot question window
  ipcMain.on('close-screenshot-question', () => {
    screenshotQuestionWindow?.hide();
  });

  // Ask about screen (screenshot + question)
  ipcMain.handle('ask-about-screen', async () => {
    return { error: 'Screen analysis has been removed from Ayati.' };
  });

  // Open external URL
  ipcMain.on('open-external', (_event, url: string) => {
    shell.openExternal(url);
  });

  // Open file/folder
  ipcMain.on('open-path', (_event, filePath: string) => {
    shell.openPath(filePath);
  });

  ipcMain.handle('get-current-workspace-info', () => {
    return getCurrentWorkspaceInfo();
  });

  ipcMain.handle('list-workspace-directory', (_event, relativePath: string = '') => {
    return listWorkspaceDirectory(relativePath);
  });

  ipcMain.handle('open-workspace-path', async (_event, relativePath: string = '') => {
    return openWorkspacePath(relativePath);
  });

  ipcMain.handle('reveal-workspace-path', async (_event, relativePath: string = '') => {
    return revealWorkspacePath(relativePath);
  });

  ipcMain.handle('preview-workspace-file', (_event, relativePath: string = '') => {
    return previewWorkspaceFile(relativePath);
  });

  ipcMain.handle(UPDATE_GET_STATE_CHANNEL, () => updateState);

  ipcMain.handle(UPDATE_CHECK_CHANNEL, async () => {
    if (!updaterConfigured) {
      return {
        checked: false,
        state: updateState,
      } satisfies DesktopUpdateCheckResult;
    }

    const checked = await checkForUpdates('assistant');
    return {
      checked,
      state: updateState,
    } satisfies DesktopUpdateCheckResult;
  });

  ipcMain.handle(UPDATE_DOWNLOAD_CHANNEL, async () => {
    const result = await downloadAvailableUpdate();
    return {
      accepted: result.accepted,
      completed: result.completed,
      state: updateState,
    } satisfies DesktopUpdateActionResult;
  });

  ipcMain.handle(UPDATE_INSTALL_CHANNEL, async () => {
    const result = await installDownloadedUpdate();
    return {
      accepted: result.accepted,
      completed: result.completed,
      state: updateState,
    } satisfies DesktopUpdateActionResult;
  });

  // Get settings
  ipcMain.handle('get-settings', () => {
    return store.store;
  });

  // Update settings
  ipcMain.handle('update-settings', (_event, key: string, value: unknown) => {
    const normalizedValue = normalizeSettingsValue(key, value);
    store.set(key, normalizedValue);

    // Restart watchers if watch settings changed
    if (key.startsWith('watch.')) {
      watchers?.restart();
    }

    // Re-register hotkeys if hotkey settings changed (deferred while UI is capturing a new chord)
    if (key.startsWith('hotkeys.')) {
      registerHotkeys();
    }

    // Update ClawBot client if clawbot settings changed
    if (key.startsWith('clawbot.')) {
      const url = store.get('clawbot.url') as string;
      const token = store.get('clawbot.token') as string;
      const provider = getStoredClawBotProvider();
      const model = getStoredClawBotModel(provider);
      clawbot?.updateConfig(url, token, null, { provider, model });
    }

    if (key === 'pet.transparentWhenSleeping') {
      petWindow?.webContents.send('pet-transparent-sleep-changed', Boolean(value));
    }

    if (key === 'dev.windowBorders') {
      applyDebugWindowBordersToAllWindows();
    }

    if (key === 'dev.showPetModeOverlay') {
      petWindow?.webContents.send('dev-show-pet-mode-overlay-changed', Boolean(value));
    }

    if (key === 'pet.appearanceId') {
      petWindow?.webContents.send('pet-appearance-changed', normalizedValue);
    }

    return store.store;
  });

  ipcMain.handle('hotkeys-begin-capture', () => {
    beginHotkeyCapture();
  });

  ipcMain.handle('hotkeys-end-capture', () => {
    endHotkeyCapture();
  });

  ipcMain.handle('quran-auth-start', () => {
    const pkce = createPkcePair();
    const state = randomUUID();
    const nonce = randomUUID();
    persistPendingQuranOAuthSession({ state, nonce, verifier: pkce.verifier, createdAt: Date.now() });

    const quranConfig = resolveQuranClientConfig({
      state: getAyahLensState(),
      env: process.env,
      decryptSecret,
    });
    const envClientId = process.env.QF_CLIENT_ID?.trim() || process.env.QURAN_CLIENT_ID?.trim();
    const hasEnvClientSecret = Boolean(process.env.QF_CLIENT_SECRET?.trim() || process.env.QURAN_CLIENT_SECRET?.trim());
    if (
      quranConfig.clientId === DEFAULT_PUBLIC_QURAN_CLIENT_ID
      && hasEnvClientSecret
      && envClientId === DEFAULT_PUBLIC_QURAN_CLIENT_ID
    ) {
      throw new QuranFoundationError(
        'missing_config',
        'QF_CLIENT_ID is the public Ayati id, but your redirect URI is registered on your personal Quran Foundation client. Set QF_CLIENT_ID in .env.local to the client id from your Request Access approval (the one that registered your redirect URI).',
      );
    }

    const authorizeUrl = new QuranFoundationClient(quranConfig).buildAuthorizeUrl({
      state,
      nonce,
      codeChallenge: pkce.challenge,
      scopes: QURAN_OAUTH_SCOPES,
    });

    return { authorizeUrl };
  });

  ipcMain.handle('quran-auth-complete', async (_event, callbackUrl: string) => {
    try {
      const url = new URL(callbackUrl);
      const error = url.searchParams.get('error');
      if (error) {
        clearPendingQuranOAuthSession();
        return {
          isConnected: false,
          scopes: [],
          error: 'Quran Foundation sign-in was cancelled or denied.',
        } satisfies QuranAuthStatus;
      }

      const state = url.searchParams.get('state');
      const code = url.searchParams.get('code');
      const session = getPendingQuranOAuthSession();
      clearPendingQuranOAuthSession();
      if (!code || !session || state !== session.state || Date.now() - session.createdAt > QURAN_OAUTH_SESSION_TTL_MS) {
        return {
          isConnected: false,
          scopes: [],
          error: 'Quran Foundation sign-in callback could not be verified.',
        } satisfies QuranAuthStatus;
      }

      const tokens = await getQuranClient().exchangeAuthorizationCode(
        code,
        session.verifier,
        session.nonce,
      );
      return await persistQuranUserTokens(tokens);
    } catch (error) {
      const safeMessage = error instanceof QuranFoundationError
        ? error.safeMessage
        : 'Quran Foundation sign-in failed.';
      return {
        isConnected: false,
        scopes: [],
        error: safeMessage,
      } satisfies QuranAuthStatus;
    }
  });

  ipcMain.handle('keychain-consent-status', () => {
    return getKeychainConsentStatus(store, getAyahLensState());
  });

  ipcMain.handle('keychain-consent-acknowledge', () => {
    acknowledgeKeychainConsent(store);
    return true;
  });

  ipcMain.handle('keychain-consent-ensure', async () => {
    const granted = await ensureKeychainConsent(store, dialog);
    return { granted };
  });

  ipcMain.handle('quran-auth-status', () => {
    return getQuranAuthStatus();
  });

  ipcMain.handle('quran-auth-disconnect', () => {
    const state = getAyahLensState();
    setAyahLensState({
      ...state,
      quranAuth: {
        encryptedAccessToken: null,
        encryptedRefreshToken: null,
        expiresAt: null,
        scopes: [],
      },
    });
    return true;
  });

  ipcMain.handle('ayah-capture-reflection', async (_event, theme?: unknown) => {
    return await captureAyahReflection(theme);
  });

  ipcMain.handle('ayah-pending-reflection-result', async () => {
    if (ayahReflectionPrepareInFlight) {
      await ayahReflectionPrepareInFlight;
    }
    if (pendingAyahReflectionResult) {
      const result = pendingAyahReflectionResult;
      pendingAyahReflectionResult = null;
      ayahPendingReflectionEcho = result;
      ayahPendingReflectionEchoUntil = Date.now() + 12_000;
      return result;
    }
    const screenshotWindowOpen = screenshotQuestionWindow && !screenshotQuestionWindow.isDestroyed();
    if (
      ayahPendingReflectionEcho
      && (screenshotWindowOpen || Date.now() < ayahPendingReflectionEchoUntil)
    ) {
      return ayahPendingReflectionEcho;
    }
    return null;
  });

  ipcMain.handle('ayah-save-reflection', async (_event, reflectionId: string) => {
    if (typeof reflectionId !== 'string' || !reflectionId.trim()) {
      return null;
    }
    return await saveAyahReflectionById(reflectionId);
  });

  ipcMain.handle('ayah-history', () => {
    return getAyahLensState().reflections.filter((reflection) => Boolean(reflection.savedAt));
  });

  ipcMain.handle('ayah-delete-reflection', (_event, reflectionId: string) => {
    if (typeof reflectionId !== 'string' || !reflectionId.trim()) {
      return false;
    }
    setAyahLensState(deleteReflection(getAyahLensState(), reflectionId));
    return true;
  });

  ipcMain.handle('ayah-tafsir', async (_event, reflectionId: unknown, resourceId?: unknown) => {
    if (typeof reflectionId !== 'string' || !reflectionId.trim()) return null;
    const rid = typeof resourceId === 'number' && Number.isInteger(resourceId) && resourceId > 0
      ? resourceId
      : undefined;
    return await getAyahTafsirById(reflectionId, rid);
  });

  ipcMain.handle('ayah-tafsir-resources', async () => {
    try {
      const accessToken = await getQuranContentAccessToken();
      return await getQuranClient().fetchTafsirResources(accessToken);
    } catch {
      return [];
    }
  });

  ipcMain.handle('ayah-translation-resources', async () => {
    try {
      const accessToken = await getQuranContentAccessToken();
      return await getQuranClient().fetchTranslationResources(accessToken);
    } catch {
      return [];
    }
  });

  ipcMain.handle('ayah-audio', async (_event, reflectionId: string) => {
    if (typeof reflectionId !== 'string' || !reflectionId.trim()) return null;
    return await getAyahAudioById(reflectionId);
  });

  ipcMain.handle('ayah-save-note', async (_event, reflectionId: string, body: string) => {
    if (typeof reflectionId !== 'string' || !reflectionId.trim() || typeof body !== 'string') return null;
    return await saveAyahReflectionNoteById(reflectionId, body);
  });

  ipcMain.handle('ayah-collections', async () => {
    return await getAyahCollections();
  });

  ipcMain.handle('ayah-create-collection', async (_event, name: string) => {
    if (typeof name !== 'string' || !name.trim()) {
      throw new Error('Collection name is required.');
    }
    return await createAyahCollection(name);
  });

  ipcMain.handle('ayah-add-to-collection', async (_event, reflectionId: string, collectionId: string) => {
    if (
      typeof reflectionId !== 'string'
      || !reflectionId.trim()
      || typeof collectionId !== 'string'
      || !collectionId.trim()
    ) {
      return null;
    }
    return await addReflectionToCollectionById(reflectionId, collectionId);
  });

  ipcMain.handle('ayah-feedback', (_event, reflectionId: string, value: string) => {
    if (
      typeof reflectionId !== 'string'
      || !reflectionId.trim()
      || (value !== 'relevant' && value !== 'not_relevant')
    ) {
      return null;
    }
    return setReflectionFeedbackById(reflectionId, value);
  });

  ipcMain.handle('ayah-alternate', async (_event, reflectionId: string) => {
    if (typeof reflectionId !== 'string' || !reflectionId.trim()) return null;
    return await showAlternateAyahById(reflectionId);
  });

  ipcMain.handle('ayah-day-summary', () => {
    return getAyahDaySummary();
  });

  ipcMain.handle('ayah-streak-summary', async () => {
    return await getQuranStreakSummary();
  });

  ipcMain.handle('ayah-copy-share-card', (_event, reflectionId: string) => {
    if (typeof reflectionId !== 'string' || !reflectionId.trim()) return false;
    return copyReflectionShareCard(reflectionId);
  });

  ipcMain.handle('ayah-settings-get', () => {
    return getAyahLensState().preferences;
  });

  ipcMain.handle('ayah-recitation-resources', async () => {
    try {
      const accessToken = await getQuranContentAccessToken();
      const resources = await getQuranClient().fetchRecitationResources(accessToken);
      return filterAvailableRecitationResources(resources);
    } catch {
      return [];
    }
  });

  ipcMain.handle('ayah-settings-update', (_event, key: string, value: unknown) => {
    try {
      const nextSettings = updateAyahLensSetting(key, value);
      if (key === 'timedReminders') {
        scheduleTimedQuranReminders();
      }
      return nextSettings;
    } catch {
      return getAyahLensState().preferences;
    }
  });

  ipcMain.handle('qul-is-available', () => isQulBundleAvailable(app));

  ipcMain.handle('qul-font-packs', () => getQulFontPackPresence(resolveQulRoot(app)));

  ipcMain.handle(
    'qul-rendered-verse',
    async (
      _event,
      raw: { verseKey?: string; mushafKey?: string; includeTajweed?: boolean } | undefined,
    ) => {
      if (!raw || typeof raw.verseKey !== 'string') return null;
      const rawMushaf = String(raw.mushafKey ?? '');
      const mushafKey = coerceQulVerseScriptMushafKey(rawMushaf);
      if (!mushafKey) {
        return null;
      }
      const parsed = parseVerseKeyToSurahAyah(raw.verseKey.trim());
      if (!parsed) return null;
      try {
        return await getQulRenderedVerse(
          {
            surahId: parsed.surah,
            ayahNumber: parsed.ayah,
            mushafKey,
            includeTajweed: Boolean(raw.includeTajweed),
          },
          app,
        );
      } catch (error) {
        console.error('qul-rendered-verse failed', error);
        return null;
      }
    },
  );

  ipcMain.handle('qul-read-font', async (_event, rawPath: unknown) => {
    if (typeof rawPath !== 'string' || rawPath.length === 0) return null;
    const root = resolveQulRoot(app);
    if (!root) return null;
    if (!isFontPathWithinQulRoot(root, rawPath)) {
      return null;
    }
    const resolved = path.resolve(rawPath);
    try {
      const s = await stat(resolved);
      if (!s.isFile()) return null;
      return await readFile(resolved);
    } catch {
      return null;
    }
  });

  ipcMain.handle('prayer-settings-get', () => getAyahLensState().prayer.settings);

  ipcMain.handle('prayer-settings-update', (_event, patch: Partial<PrayerSettings>) => {
    const settings = updatePrayerSettings(patch ?? {});
    void refreshPrayerTimes().catch(() => undefined);
    return settings;
  });

  ipcMain.handle('masjidly-mosques-list', async () => listMasjidlyMosques());

  ipcMain.handle('prayer-times-get', async () => {
    const state = getAyahLensState();
    if (shouldRefreshPrayerDay(state.prayer.today, state.prayer.tomorrow, state.prayer.settings, Date.now())) {
      try {
        await refreshPrayerTimes();
      } catch {
        // keep cached bundle below
      }
    }
    const latest = getAyahLensState().prayer;
    return { today: latest.today, tomorrow: latest.tomorrow };
  });

  ipcMain.handle('prayer-times-refresh', async () => {
    await refreshPrayerTimes();
    const latest = getAyahLensState().prayer;
    return { today: latest.today, tomorrow: latest.tomorrow };
  });

  ipcMain.handle('todo-list', () => {
    maintainStoredTodos();
    return listTodos(getAyahLensState().todos);
  });

  ipcMain.handle('todo-settings-update', (_event, patch: Partial<TodoSettings>) => updateTodoSettings(patch ?? {}));

  ipcMain.handle('todo-create', (_event, input: Parameters<typeof createTodo>[1]) => {
    const state = getAyahLensState();
    const todos = purgeCompletedTodos(createTodo(state.todos, input));
    setAyahLensState({ ...state, todos });
    return listTodos(todos);
  });

  ipcMain.handle('todo-update', (_event, todoId: string, patch: Parameters<typeof updateTodo>[2]) => {
    const state = getAyahLensState();
    const todos = purgeCompletedTodos(updateTodo(state.todos, todoId, patch ?? {}));
    setAyahLensState({ ...state, todos });
    return listTodos(todos);
  });

  ipcMain.handle('todo-complete', (_event, todoId: string, completed: boolean) => {
    const state = getAyahLensState();
    const todos = purgeCompletedTodos(setTodoCompleted(state.todos, todoId, completed));
    setAyahLensState({ ...state, todos });
    return listTodos(todos);
  });

  ipcMain.handle('todo-delete', (_event, todoId: string) => {
    const state = getAyahLensState();
    const todos = purgeCompletedTodos(deleteTodoItem(state.todos, todoId));
    setAyahLensState({ ...state, todos });
    return listTodos(todos);
  });

  ipcMain.handle('pomodoro-state-get', () => ({
    ...getAyahLensState().pomodoro,
    remainingMs: getPomodoroRemainingMs(getAyahLensState().pomodoro, Date.now()),
  }));

  ipcMain.handle('pomodoro-settings-update', (_event, patch: Partial<PomodoroSettings>) => {
    const settings = updatePomodoroSettings(patch ?? {});
    return { ...getAyahLensState().pomodoro, settings, remainingMs: getPomodoroRemainingMs(getAyahLensState().pomodoro, Date.now()) };
  });

  ipcMain.handle('pomodoro-start', (_event, input: { kind: PomodoroSessionKind; durationMinutes?: number; todoId?: string | null }) => {
    const state = getAyahLensState();
    const pomodoro = startPomodoroSession(state.pomodoro, input);
    setAyahLensState({ ...state, pomodoro });
    updateTrayPomodoroTooltip();
    return { ...pomodoro, remainingMs: getPomodoroRemainingMs(pomodoro, Date.now()) };
  });

  ipcMain.handle('pomodoro-pause', () => {
    const state = getAyahLensState();
    const pomodoro = pausePomodoroSession(state.pomodoro);
    setAyahLensState({ ...state, pomodoro });
    updateTrayPomodoroTooltip();
    return { ...pomodoro, remainingMs: getPomodoroRemainingMs(pomodoro, Date.now()) };
  });

  ipcMain.handle('pomodoro-resume', () => {
    const state = getAyahLensState();
    const pomodoro = resumePomodoroSession(state.pomodoro);
    setAyahLensState({ ...state, pomodoro });
    updateTrayPomodoroTooltip();
    return { ...pomodoro, remainingMs: getPomodoroRemainingMs(pomodoro, Date.now()) };
  });

  ipcMain.handle('pomodoro-cancel', () => {
    const state = getAyahLensState();
    const pomodoro = cancelPomodoroSession(state.pomodoro);
    setAyahLensState({ ...state, pomodoro });
    updateTrayPomodoroTooltip();
    return { ...pomodoro, remainingMs: getPomodoroRemainingMs(pomodoro, Date.now()) };
  });

  ipcMain.handle('pomodoro-complete', () => {
    const state = getAyahLensState();
    const pomodoro = completePomodoroSession(state.pomodoro);
    setAyahLensState({ ...state, pomodoro });
    updateTrayPomodoroTooltip();
    return { ...pomodoro, remainingMs: getPomodoroRemainingMs(pomodoro, Date.now()) };
  });

  // Get chat history
  ipcMain.handle('get-chat-history', () => {
    return store.get('chatHistory') || [];
  });

  // Save chat history
  ipcMain.handle('save-chat-history', (_event, messages: unknown[]) => {
    // Keep only last 100 messages to prevent storage bloat
    const trimmed = messages.slice(-100);
    store.set('chatHistory', trimmed);
    return true;
  });

  // Clear chat history
  ipcMain.handle('clear-chat-history', () => {
    store.set('chatHistory', []);
    return true;
  });

  // Check screen capture permission status
  // Returns: 'granted', 'denied', 'not-determined', or 'restricted'
  ipcMain.handle('get-screen-capture-permission', () => {
    return getScreenCapturePermissionStatus();
  });

  // Check accessibility permission (for active-win app watching)
  // Returns true if granted, false otherwise
  // If prompt is true, will show macOS permission dialog
  ipcMain.handle('check-accessibility-permission', (_event, prompt: boolean = false) => {
    if (process.platform !== 'darwin') {
      return true; // Non-macOS platforms don't need this
    }
    const result = systemPreferences.isTrustedAccessibilityClient(prompt);
    console.log(`[Accessibility] isTrustedAccessibilityClient(${prompt}) = ${result}`);
    return result;
  });

  // Screen capture
  ipcMain.handle('capture-screen', async () => {
    return null;
  });

  // Build chat payload with history and optional screen context
  const buildClawbotChatPayload = async (message: string, includeScreen?: boolean) => {
    const chatHistory = (store.get('chatHistory') || []) as Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
    }>;
    const history = chatHistory
      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
      .map(msg => ({ role: msg.role as 'user' | 'assistant', content: msg.content }));

    const context = await getScreenContext();
    let fullMessage = message;

    const mentionsScreen = /screen|cursor|mouse|look|where|point|here|there|this/i.test(message);
    if (includeScreen || mentionsScreen) {
      const screenCapture = await captureScreenWithContext();
      if (screenCapture) {
        fullMessage = `[Screen Context: Cursor at (${screenCapture.cursor.x}, ${screenCapture.cursor.y}), Screen size: ${screenCapture.screenSize.width}x${screenCapture.screenSize.height}, Pet at (${context.petPosition.x}, ${context.petPosition.y})]\n\n${message}`;
      }
    }

    return { history, fullMessage };
  };

  // Show final response as a speech bubble on the pet when appropriate
  const maybeShowPetResponse = (responseText?: string) => {
    const assistantActive = assistantWindow && assistantWindow.isVisible();
    const chatbarActive = chatbarWindow && chatbarWindow.isVisible();
    if (responseText && !responseText.includes('error') && petWindow && !assistantActive && !chatbarActive) {
      petWindow.webContents.send('chat-popup', {
        id: randomUUID(),
        text: responseText,
        trigger: 'proactive',
        quickReplies: ['Thanks!', 'Not now'],
      });
    }
  };

  // Send message to ClawBot (with optional screen context)
  ipcMain.handle('send-to-clawbot', async () => {
    return { error: 'Chat has been removed from Ayati.' };
  });

  // Start streaming a message to ClawBot and emit chunk/end/error events
  ipcMain.handle('start-clawbot-stream', async () => {
    return { error: 'Chat has been removed from Ayati.' };
  });

  // Get screen context (cursor position, pet position, etc.)
  ipcMain.handle('get-screen-context', async () => {
    return await getScreenContext();
  });

  // Capture screen with context
  ipcMain.handle('capture-screen-with-context', async () => {
    return null;
  });

  // Execute pet action directly
  ipcMain.handle('execute-pet-action', async (_event, action: PetAction) => {
    await executePetAction(action);
  });

  // Move pet to position
  ipcMain.handle('move-pet-to', async (_event, x: number, y: number, duration?: number) => {
    await animateMoveTo(x, y, duration || 1000);
  });

  // Move pet to cursor
  ipcMain.handle('move-pet-to-cursor', async () => {
    await executePetAction({ type: 'move_to_cursor' });
  });

  ipcMain.handle('pet-wake-flight', async () => {
    await animatePetWindowWakeFlight();
  });

  // Get ClawBot status (returns detailed status)
  ipcMain.handle('clawbot-status', () => {
    return { connected: false, error: 'Chat has been removed from Ayati.', gatewayUrl: '' };
  });

  // Copy text to clipboard
  ipcMain.handle('copy-to-clipboard', (_event, text: string) => {
    const { clipboard } = require('electron');
    clipboard.writeText(text);
    return true;
  });

  // Drag pet window
  ipcMain.on('pet-drag', (_event, deltaX: number, deltaY: number) => {
    if (petWindow) {
      const [x, y] = petWindow.getPosition();
      const newX = x + deltaX;
      const newY = y + deltaY;
      petWindow.setPosition(newX, newY);
      store.set('pet.position', { x: newX, y: newY });
      // Also move the chat windows if visible
      updatePetChatPosition();
      updatePetPomodoroTimerPosition();
      updateWorkspaceBrowserPosition();
      updateAssistantPosition();
      updateScreenshotQuestionPosition();
      petContextMenuWindow?.hide();
      resetInteractionTimer(); // User is interacting
    }
  });

  // Show pet chat popup
  ipcMain.on('show-pet-chat', (_event, message: {
    id: string;
    text: string;
    quickReplies?: string[];
    reflectionId?: string;
    verseKey?: string;
    arabicText?: string;
    footerText?: string;
  }) => {
    showPetChat(message);
  });

  // Hide pet chat popup
  ipcMain.on('hide-pet-chat', () => {
    hidePetChat();
  });

  // Resize pet chat popup to match rendered content
  ipcMain.on('resize-pet-chat', (_event, width: number, height: number) => {
    resizePetChatToContent(width, height);
  });

  // Reset pet chat inactivity timer when user interacts with the popup
  ipcMain.on('pet-chat-interacted', () => {
    if (petChatWindow && !petChatWindow.isDestroyed() && petChatWindow.isVisible()) {
      schedulePetChatAutoHide();
    }
  });

  ipcMain.on('pet-chat-audio-playing', (_event, isPlaying: boolean) => {
    isPetChatAudioPlaying = Boolean(isPlaying);
    if (isPetChatAudioPlaying) {
      if (petChatAutoHideTimeout) {
        clearTimeout(petChatAutoHideTimeout);
        petChatAutoHideTimeout = null;
      }
      return;
    }
    if (petChatWindow && !petChatWindow.isDestroyed() && petChatWindow.isVisible()) {
      schedulePetChatAutoHide();
    }
  });

  // Forward pet chat reply to pet window
  ipcMain.on('pet-chat-reply', (_event, reply: string) => {
    if (reply === 'Open Prayers') {
      openAssistantOnTab('prayers');
    } else if (reply === 'Open To Do') {
      openAssistantOnTab('todos');
    } else if (reply === 'Open Focus') {
      openAssistantOnTab('focus');
    } else if (reply === 'Start Break') {
      const state = getAyahLensState();
      setAyahLensState({ ...state, pomodoro: startPomodoroSession(state.pomodoro, { kind: getNextPomodoroKind(state.pomodoro) }) });
      updateTrayPomodoroTooltip();
    } else if (reply === 'Start Focus') {
      const state = getAyahLensState();
      setAyahLensState({ ...state, pomodoro: startPomodoroSession(state.pomodoro, { kind: 'focus' }) });
      updateTrayPomodoroTooltip();
    }
    petWindow?.webContents.send('pet-chat-reply', reply);
  });

// Pet movement (legacy API)
  ipcMain.handle('pet-move-to', (_event, x: number, y: number, duration?: number) => {
    animateMoveTo(x, y, duration ?? 1000);
  });

  ipcMain.handle('get-cursor-position', () => {
    return screen.getCursorScreenPoint();
  });

  ipcMain.handle('get-pet-position', () => {
    return petWindow?.getPosition() ?? [0, 0];
  });

  // Pet was clicked
  ipcMain.on('pet-clicked', () => {
    resetInteractionTimer();
  });

  // Chat sync - broadcast to all windows when chat history changes
  ipcMain.on('chat-sync', () => {
    // Notify assistant window to refresh its chat history
    if (assistantWindow && !assistantWindow.isDestroyed()) {
      assistantWindow.webContents.send('chat-sync');
    }
    // Notify chatbar window as well (in case it's open)
    if (chatbarWindow && !chatbarWindow.isDestroyed()) {
      chatbarWindow.webContents.send('chat-sync');
    }
  });

  // Onboarding handlers
  ipcMain.handle('onboarding-skip', () => {
    store.set('onboarding.skipped', true);
    closeOnboardingAndStartApp();
    return true;
  });

  ipcMain.on('onboarding-minimize', () => {
    onboardingWindow?.minimize();
  });

  ipcMain.on('onboarding-maximize', () => {
    if (onboardingWindow?.isMaximized()) {
      onboardingWindow.unmaximize();
    } else {
      onboardingWindow?.maximize();
    }
  });

  // Reset onboarding (for testing)
  ipcMain.handle('reset-onboarding', () => {
    resetOnboardingState();
    app.relaunch();
    app.exit(0);
    return true;
  });

  ipcMain.handle('onboarding-complete', (_event, data: {
    launchOnStartup: boolean;
    watchFolders: string[];
    watchActiveApp: boolean;
    watchWindowTitles: boolean;
    hotkeyOpenAssistant: string;
    hotkeyHideApp: string;
  }) => {
    try {
      store.set('onboarding.completed', true);
      store.set('onboarding.skipped', false);
      store.set('onboarding.workspaceType', 'ayati');
      const workspacePath = (store.get('onboarding.ayatiWorkspacePath') as string | null)
        ?? getDefaultAyahLensWorkspacePath();
      fs.mkdirSync(workspacePath, { recursive: true });
      store.set('onboarding.ayatiWorkspacePath', workspacePath);
      store.set('onboarding.memoryMigrated', false);
      store.set('watch.folders', data.watchFolders);
      store.set('watch.activeApp', data.watchActiveApp);
      store.set('watch.sendWindowTitles', data.watchWindowTitles);
      store.set('hotkeys.openAssistant', sanitizeAccelerator(data.hotkeyOpenAssistant, DEFAULT_HOTKEYS.openAssistant));
      store.set('hotkeys.hideApp', sanitizeAccelerator(data.hotkeyHideApp, DEFAULT_HOTKEYS.hideApp));
      setLaunchOnStartup(data.launchOnStartup);
    } catch (error) {
      console.error('[Onboarding] Failed to persist completion (setup window will still close):', error);
    } finally {
      closeOnboardingAndStartApp();
    }
    return true;
  });

  // Validate gateway/provider connection by making a small real AI request.
  ipcMain.handle('validate-gateway', async (
    _event,
    url: string,
    token: string,
    providerInput?: ClawBotProvider,
    modelInput?: string
  ) => {
    const provider = normalizeClawBotProvider(providerInput);
    const model = modelInput?.trim() || getDefaultClawBotModel(provider);
    const makeRequest = async () => {
      const headers = buildProviderHeaders(url, token, provider);
      const providerConfig = getAiProviderConfig(provider);
      if (providerConfig.protocol === 'anthropic-messages') {
        const normalizedBaseUrl = url.trim().replace(/\/+$/, '');
        const messagesUrl = normalizedBaseUrl.endsWith('/messages')
          ? normalizedBaseUrl
          : `${normalizedBaseUrl}/messages`;
        return fetch(messagesUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            max_tokens: 5,
            messages: [{ role: 'user', content: 'hi' }],
            model,
          }),
          signal: AbortSignal.timeout(10000),
        });
      }

      const body: Record<string, unknown> = {
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
      };
      if (model) {
        body.model = model;
      }

      return fetch(buildChatCompletionsUrl(url, provider), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
    };

    try {
      const response = await makeRequest();

      if (response.ok) {
        return { success: true };
      } else {
        const errorText = await response.text();
        return { success: false, error: `${response.status}: ${errorText.slice(0, 100)}` };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
        return { success: false, error: 'AI provider not reachable. Check the base URL and API key.' };
      }
      if (msg.includes('timed out') || msg.includes('AbortError')) {
        return { success: false, error: 'Connection timed out. The AI provider may be slow or unreachable.' };
      }
      return { success: false, error: msg };
    }
  });

  // Get onboarding status
  ipcMain.handle('get-onboarding-status', () => {
    return {
      completed: store.get('onboarding.completed') as boolean,
      skipped: store.get('onboarding.skipped') as boolean,
    };
  });

}

function normalizeSettingsValue(key: string, value: unknown): unknown {
  switch (key) {
    case 'hotkeys.openChat':
      return sanitizeAccelerator(value, DEFAULT_HOTKEYS.openChat);
    case 'hotkeys.captureScreen':
      return sanitizeAccelerator(value, DEFAULT_HOTKEYS.captureScreen);
    case 'hotkeys.openAssistant':
      return sanitizeAccelerator(value, DEFAULT_HOTKEYS.openAssistant);
    case 'hotkeys.hideApp':
      return sanitizeAccelerator(value, DEFAULT_HOTKEYS.hideApp);
    case 'pet.appearanceId': {
      const v = typeof value === 'string' ? value : '';
      if (v === 'ayah' || v === 'bolt' || v === 'cloudlet' || v === 'cosmo' || v === 'boba') {
        return v;
      }
      return 'ayah';
    }
    default:
      return value;
  }
}

/** While > 0, global shortcuts are unregistered so settings UI can capture chords without toggling windows. */
let hotkeyCaptureSuspendDepth = 0;

function beginHotkeyCapture() {
  if (hotkeyCaptureSuspendDepth === 0) {
    globalShortcut.unregisterAll();
  }
  hotkeyCaptureSuspendDepth++;
}

function endHotkeyCapture() {
  if (hotkeyCaptureSuspendDepth === 0) {
    return;
  }
  hotkeyCaptureSuspendDepth -= 1;
  if (hotkeyCaptureSuspendDepth === 0) {
    registerHotkeys();
  }
}

// Register global hotkeys from store
function registerHotkeys() {
  if (hotkeyCaptureSuspendDepth > 0) {
    return;
  }
  // Unregister all first (in case we're re-registering)
  globalShortcut.unregisterAll();

  const hotkeyOpenAssistant = registerConfiguredHotkey('hotkeys.openAssistant', DEFAULT_HOTKEYS.openAssistant, () => {
    toggleAssistantWindow();
  });
  console.log(`[Hotkeys] Registered open assistant: ${hotkeyOpenAssistant}`);

  const hotkeyHideApp = registerConfiguredHotkey('hotkeys.hideApp', DEFAULT_HOTKEYS.hideApp, () => {
    toggleHideAllCompanionWindows();
  });
  console.log(`[Hotkeys] Registered hide app: ${hotkeyHideApp}`);

  registerDevOnlyGlobalShortcuts();
}

/** macOS dev builds only: extra shortcuts that must not ship in production. */
function registerDevOnlyGlobalShortcuts(): void {
  if (!isDev || process.platform !== 'darwin') {
    return;
  }

  const registerOrWarn = (accelerator: string, label: string, callback: () => void): void => {
    try {
      const ok = globalShortcut.register(accelerator, callback);
      if (ok) {
        console.log(`[Hotkeys][Dev] Registered ${label}: ${accelerator}`);
      } else {
        console.warn(
          `[Hotkeys][Dev] Could not register ${label} (${accelerator}); chord may be in use.`,
        );
      }
    } catch (error) {
      console.warn(`[Hotkeys][Dev] Register ${label} failed:`, error);
    }
  };

  registerOrWarn(DEV_HOTKEY_QURAN_REMINDER, 'timed Quran reminder', () => {
    void maybeSendTimedQuranReminder({ force: true });
  });

  registerOrWarn(DEV_HOTKEY_ATTENTION_SEEK_TOGGLE, 'attention seeker toggle', () => {
    const current = store.get('pet.attentionSeeker') ?? true;
    const next = !current;
    store.set('pet.attentionSeeker', next);
    stopAttentionSeeker();
    if (next) {
      startAttentionSeeker();
    }
    console.log(`[Hotkeys][Dev] pet.attentionSeeker → ${next}`);
  });
}

function registerConfiguredHotkey(key: string, fallback: string, callback: () => void): string {
  const storedAccelerator = store.get(key) as string | undefined;
  const accelerator = sanitizeAccelerator(storedAccelerator, fallback);

  if (accelerator !== storedAccelerator) {
    store.set(key, accelerator);
  }

  try {
    const didRegister = globalShortcut.register(accelerator, callback);
    if (didRegister) {
      return accelerator;
    }
  } catch (error) {
    console.warn(`[Hotkeys] Failed to register ${key}: ${accelerator}`, error);
  }

  if (accelerator !== fallback) {
    store.set(key, fallback);
    try {
      globalShortcut.register(fallback, callback);
    } catch (error) {
      console.warn(`[Hotkeys] Failed to register fallback for ${key}: ${fallback}`, error);
    }
    return fallback;
  }

  return accelerator;
}

function getWebsiteUpdatePlatformKey() {
  return getUpdateMetadataPlatformKey(process.platform, desktopRuntimeInfo.appArch);
}

function requestText(url: string, redirectCount = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { Accept: 'application/json' } }, (response) => {
      const statusCode = response.statusCode ?? 0;
      const location = response.headers.location;
      if (statusCode >= 300 && statusCode < 400 && location) {
        response.resume();
        if (redirectCount >= 5) {
          reject(new Error('Too many redirects while fetching update metadata.'));
          return;
        }
        resolve(requestText(new URL(location, url).toString(), redirectCount + 1));
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`Update metadata request failed with HTTP ${statusCode}.`));
        return;
      }

      response.setEncoding('utf8');
      let body = '';
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => resolve(body));
    });

    request.on('error', reject);
    request.setTimeout(30_000, () => {
      request.destroy(new Error('Update metadata request timed out.'));
    });
  });
}

async function downloadFileWithProgress(
  url: string,
  destinationPath: string,
  onProgress: (percent: number) => void,
  redirectCount = 0,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = https.get(url, (response) => {
      const statusCode = response.statusCode ?? 0;
      const location = response.headers.location;
      if (statusCode >= 300 && statusCode < 400 && location) {
        response.resume();
        if (redirectCount >= 5) {
          reject(new Error('Too many redirects while downloading update.'));
          return;
        }
        downloadFileWithProgress(new URL(location, url).toString(), destinationPath, onProgress, redirectCount + 1)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`Update download failed with HTTP ${statusCode}.`));
        return;
      }

      const totalBytes = Number(response.headers['content-length'] ?? 0);
      let receivedBytes = 0;
      const output = fs.createWriteStream(destinationPath);

      response.on('data', (chunk: Buffer) => {
        receivedBytes += chunk.length;
        if (totalBytes > 0) {
          onProgress((receivedBytes / totalBytes) * 100);
        }
      });
      response.pipe(output);
      output.on('finish', () => {
        output.close(() => {
          onProgress(100);
          resolve();
        });
      });
      output.on('error', reject);
      response.on('error', reject);
    });

    request.on('error', reject);
    request.setTimeout(120_000, () => {
      request.destroy(new Error('Update download timed out.'));
    });
  });
}

function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const input = fs.createReadStream(filePath);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('error', reject);
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

function getInstallerFileName(update: SelectedUpdateMetadata): string {
  const urlPath = new URL(update.url).pathname;
  const parsedName = path.basename(urlPath);
  if (parsedName && parsedName !== '/') return parsedName;
  const extension = process.platform === 'win32' ? 'exe' : 'dmg';
  return `Ayati-${update.version}.${extension}`;
}

async function checkWebsiteUpdateMetadata(): Promise<boolean> {
  const platformKey = getWebsiteUpdatePlatformKey();
  if (!platformKey) {
    setUpdateState(reduceUpdateStateOnCheckFailure(
      updateState,
      'Automatic updates are not available for this platform yet.',
      new Date().toISOString(),
    ));
    return true;
  }

  try {
    const rawMetadata = await requestText(UPDATE_METADATA_URL);
    const metadata = parseUpdateMetadata(rawMetadata);
    const selectedUpdate = selectUpdateFromMetadata(metadata, platformKey);
    if (!selectedUpdate) {
      setUpdateState(reduceUpdateStateOnCheckFailure(
        updateState,
        `No update download is published for ${platformKey}.`,
        new Date().toISOString(),
      ));
      return true;
    }

    if (!isVersionGreater(selectedUpdate.version, app.getVersion())) {
      pendingWebsiteUpdate = null;
      downloadedWebsiteUpdatePath = null;
      setUpdateState(reduceUpdateStateOnNoUpdate(updateState, new Date().toISOString()));
      return true;
    }

    pendingWebsiteUpdate = selectedUpdate;
    downloadedWebsiteUpdatePath = null;
    setUpdateState(reduceUpdateStateOnUpdateAvailable(updateState, selectedUpdate.version, new Date().toISOString()));
    return true;
  } catch (error) {
    const message = getSafeErrorMessage(error);
    setUpdateState(reduceUpdateStateOnCheckFailure(updateState, message, new Date().toISOString()));
    console.error('[AutoUpdater] Failed to check website update metadata:', error);
    return true;
  }
}

async function downloadWebsiteUpdate(): Promise<{ accepted: boolean; completed: boolean }> {
  if (!pendingWebsiteUpdate || updateState.status !== 'available') {
    return { accepted: false, completed: false };
  }

  const update = pendingWebsiteUpdate;
  const updatesDirectory = path.join(app.getPath('userData'), 'updates');
  fs.mkdirSync(updatesDirectory, { recursive: true });
  const destinationPath = path.join(updatesDirectory, getInstallerFileName(update));
  if (fs.existsSync(destinationPath)) fs.unlinkSync(destinationPath);

  setUpdateState(reduceUpdateStateOnDownloadStart(updateState));

  try {
    await downloadFileWithProgress(update.url, destinationPath, (percent) => {
      if (shouldBroadcastDownloadProgress(updateState, percent) || updateState.message !== null) {
        setUpdateState(reduceUpdateStateOnDownloadProgress(updateState, percent));
      }
    });

    if (update.sha256 && update.sha256 !== 'TODO') {
      const actualHash = await sha256File(destinationPath);
      if (actualHash.toLowerCase() !== update.sha256.toLowerCase()) {
        fs.unlinkSync(destinationPath);
        throw new Error('Downloaded update failed SHA-256 verification.');
      }
    }

    downloadedWebsiteUpdatePath = destinationPath;
    setUpdateState(reduceUpdateStateOnDownloadComplete(updateState, update.version));
    return { accepted: true, completed: true };
  } catch (error) {
    const message = getSafeErrorMessage(error);
    setUpdateState(reduceUpdateStateOnDownloadFailure(updateState, message));
    console.error('[AutoUpdater] Failed to download website update:', error);
    return { accepted: true, completed: false };
  }
}

async function openWebsiteUpdateInstaller(): Promise<{ accepted: boolean; completed: boolean }> {
  if (!downloadedWebsiteUpdatePath || updateState.status !== 'downloaded') {
    return { accepted: false, completed: false };
  }

  const errorMessage = await shell.openPath(downloadedWebsiteUpdatePath);
  if (errorMessage) {
    setUpdateState(reduceUpdateStateOnInstallFailure(updateState, errorMessage));
    return { accepted: true, completed: false };
  }

  app.quit();
  return { accepted: true, completed: false };
}

function readAppUpdateYml(): Record<string, string> | null {
  try {
    const ymlPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app-update.yml')
      : path.join(app.getAppPath(), 'dev-app-update.yml');
    const raw = fs.readFileSync(ymlPath, 'utf8');
    const entries: Record<string, string> = {};
    for (const line of raw.split('\n')) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match?.[1] && match[2]) {
        entries[match[1]] = match[2].trim();
      }
    }
    return entries.provider ? entries : null;
  } catch {
    return null;
  }
}

function hasUpdateFeedConfig(): boolean {
  if (USE_WEBSITE_UPDATE_METADATA) return Boolean(UPDATE_METADATA_URL);
  return Boolean(ELECTRON_UPDATE_FEED_URL) || readAppUpdateYml() !== null || Boolean(process.env.AYATI_MOCK_UPDATE_URL);
}

function resolveAutoUpdateDisabledReason(): string | null {
  return getAutoUpdateDisabledReason({
    isDevelopment: isDev,
    isPackaged: app.isPackaged,
    platform: process.platform,
    appImage: process.env.APPIMAGE,
    hasUpdateFeedConfig: hasUpdateFeedConfig(),
  });
}

function emitUpdateState(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
    window.webContents.send(UPDATE_STATE_CHANNEL, updateState);
  }
}

function setUpdateState(nextState: DesktopUpdateState): void {
  updateState = nextState;
  emitUpdateState();
}

function stopAutoUpdaterTimers(): void {
  if (updateStartupTimer) {
    clearTimeout(updateStartupTimer);
    updateStartupTimer = null;
  }
  if (updatePollTimer) {
    clearInterval(updatePollTimer);
    updatePollTimer = null;
  }
}

function getUpdateErrorContext(): DesktopUpdateState['errorContext'] {
  if (updateInstallInFlight) return 'install';
  if (updateDownloadInFlight) return 'download';
  if (updateCheckInFlight) return 'check';
  return updateState.errorContext;
}

async function checkForUpdates(reason: string): Promise<boolean> {
  if (!updaterConfigured || updateCheckInFlight) return false;
  if (updateState.status === 'downloading' || updateState.status === 'downloaded') {
    console.log(`[AutoUpdater] Skipping update check (${reason}) while ${updateState.status}`);
    return false;
  }

  updateCheckInFlight = true;
  setUpdateState(reduceUpdateStateOnCheckStart(updateState, new Date().toISOString()));
  console.log(`[AutoUpdater] Checking for updates (${reason})...`);

  try {
    if (USE_WEBSITE_UPDATE_METADATA) {
      return await checkWebsiteUpdateMetadata();
    }

    await autoUpdater.checkForUpdates();
    return true;
  } catch (error) {
    const message = getSafeErrorMessage(error);
    setUpdateState(reduceUpdateStateOnCheckFailure(updateState, message, new Date().toISOString()));
    console.error('[AutoUpdater] Failed to check for updates:', error);
    return true;
  } finally {
    updateCheckInFlight = false;
  }
}

async function downloadAvailableUpdate(): Promise<{ accepted: boolean; completed: boolean }> {
  if (!updaterConfigured || updateDownloadInFlight || updateState.status !== 'available') {
    return { accepted: false, completed: false };
  }

  updateDownloadInFlight = true;

  if (USE_WEBSITE_UPDATE_METADATA) {
    try {
      return await downloadWebsiteUpdate();
    } finally {
      updateDownloadInFlight = false;
    }
  }

  autoUpdater.disableDifferentialDownload = isArm64HostRunningIntelBuild(desktopRuntimeInfo);
  setUpdateState(reduceUpdateStateOnDownloadStart(updateState));

  try {
    await autoUpdater.downloadUpdate();
    return { accepted: true, completed: true };
  } catch (error) {
    const message = getSafeErrorMessage(error);
    setUpdateState(reduceUpdateStateOnDownloadFailure(updateState, message));
    console.error('[AutoUpdater] Failed to download update:', error);
    return { accepted: true, completed: false };
  } finally {
    updateDownloadInFlight = false;
  }
}

async function installDownloadedUpdate(): Promise<{ accepted: boolean; completed: boolean }> {
  if (!updaterConfigured || updateInstallInFlight || updateState.status !== 'downloaded') {
    return { accepted: false, completed: false };
  }

  updateInstallInFlight = true;
  stopAutoUpdaterTimers();

  if (USE_WEBSITE_UPDATE_METADATA) {
    try {
      return await openWebsiteUpdateInstaller();
    } finally {
      updateInstallInFlight = false;
    }
  }

  try {
    autoUpdater.quitAndInstall(false, true);
    return { accepted: true, completed: false };
  } catch (error) {
    const message = getSafeErrorMessage(error);
    updateInstallInFlight = false;
    setUpdateState(reduceUpdateStateOnInstallFailure(updateState, message));
    console.error('[AutoUpdater] Failed to install update:', error);
    return { accepted: true, completed: false };
  }
}

// Auto-updater setup
function setupAutoUpdater() {
  const disabledReason = resolveAutoUpdateDisabledReason();
  const enabled = disabledReason === null;
  setUpdateState(createConfiguredUpdateState(app.getVersion(), desktopRuntimeInfo, enabled, disabledReason));

  if (!enabled) {
    console.log(`[AutoUpdater] Disabled: ${disabledReason}`);
    return;
  }

  updaterConfigured = true;

  if (USE_WEBSITE_UPDATE_METADATA) {
    console.log(`[AutoUpdater] Using website update metadata: ${UPDATE_METADATA_URL}`);
    stopAutoUpdaterTimers();
    updateStartupTimer = setTimeout(() => {
      updateStartupTimer = null;
      void checkForUpdates('startup');
    }, AUTO_UPDATE_STARTUP_DELAY_MS);
    updateStartupTimer.unref?.();

    updatePollTimer = setInterval(() => {
      void checkForUpdates('poll');
    }, AUTO_UPDATE_POLL_INTERVAL_MS);
    updatePollTimer.unref?.();
    return;
  }

  autoUpdater.setFeedURL({
    provider: 'generic',
    url: process.env.AYATI_MOCK_UPDATE_URL || ELECTRON_UPDATE_FEED_URL,
  });

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.disableDifferentialDownload = isArm64HostRunningIntelBuild(desktopRuntimeInfo);

  let lastLoggedDownloadMilestone = -1;

  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Looking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    setUpdateState(
      reduceUpdateStateOnUpdateAvailable(updateState, info.version, new Date().toISOString()),
    );
    lastLoggedDownloadMilestone = -1;
    console.log('[AutoUpdater] Update available:', info.version);
  });

  autoUpdater.on('update-not-available', () => {
    setUpdateState(reduceUpdateStateOnNoUpdate(updateState, new Date().toISOString()));
    lastLoggedDownloadMilestone = -1;
    console.log('[AutoUpdater] No updates available');
  });

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.floor(progress.percent);
    if (shouldBroadcastDownloadProgress(updateState, progress.percent) || updateState.message !== null) {
      setUpdateState(reduceUpdateStateOnDownloadProgress(updateState, progress.percent));
    }

    const milestone = percent - (percent % 10);
    if (milestone > lastLoggedDownloadMilestone) {
      lastLoggedDownloadMilestone = milestone;
      console.log(`[AutoUpdater] Download progress: ${percent}%`);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    setUpdateState(reduceUpdateStateOnDownloadComplete(updateState, info.version));
    console.log('[AutoUpdater] Update downloaded:', info.version);
  });

  autoUpdater.on('error', (error) => {
    const message = getSafeErrorMessage(error);
    if (updateInstallInFlight) {
      updateInstallInFlight = false;
      setUpdateState(reduceUpdateStateOnInstallFailure(updateState, message));
      console.error('[AutoUpdater] Install error:', error);
      return;
    }

    if (!updateCheckInFlight && !updateDownloadInFlight) {
      setUpdateState({
        ...updateState,
        status: 'error',
        message,
        checkedAt: new Date().toISOString(),
        downloadPercent: null,
        errorContext: getUpdateErrorContext(),
        canRetry: updateState.availableVersion !== null || updateState.downloadedVersion !== null,
      });
    }
    console.error('[AutoUpdater] Error:', error);
  });

  stopAutoUpdaterTimers();
  updateStartupTimer = setTimeout(() => {
    updateStartupTimer = null;
    void checkForUpdates('startup');
  }, AUTO_UPDATE_STARTUP_DELAY_MS);
  updateStartupTimer.unref?.();

  updatePollTimer = setInterval(() => {
    void checkForUpdates('poll');
  }, AUTO_UPDATE_POLL_INTERVAL_MS);
  updatePollTimer.unref?.();
}

// Setup system tray
function setupTray() {
  const appIcon = createAppIconImage();
  const trayIcon = appIcon.isEmpty()
    ? nativeImage.createEmpty()
    : appIcon.resize({ width: 16, height: 16 });

  tray = new Tray(trayIcon);
  updateTrayPomodoroTooltip();

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Show ${APP_DISPLAY_NAME}`,
      click: () => {
        petWindow?.show();
        petWindow?.focus();
      },
    },
    {
      label: 'Open Assistant',
      click: () => {
        createAssistantWindow();
      },
    },
    {
      label: 'Settings',
      click: () => {
        createAssistantWindow();
        if (!assistantWindow) return;

        if (assistantWindow.webContents.isLoading()) {
          assistantWindow.webContents.once('did-finish-load', () => {
            assistantWindow?.webContents.send('switch-to-settings');
          });
        } else {
          assistantWindow.webContents.send('switch-to-settings');
        }
      },
    },
    {
      label: 'Reset Onboarding',
      click: () => {
        resetOnboardingState();
        dialog.showMessageBox({
          type: 'info',
          title: 'Onboarding Reset',
          message: `Onboarding has been reset. Restart ${APP_DISPLAY_NAME} to see the onboarding wizard.`,
          buttons: ['OK'],
        });
      },
    },
    { type: 'separator' },
    {
      label: `Quit ${APP_DISPLAY_NAME}`,
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // On macOS, clicking the tray icon shows the menu
  // On Windows/Linux, left-click can show the pet
  if (process.platform !== 'darwin') {
    tray.on('click', () => {
      petWindow?.show();
      petWindow?.focus();
    });
  }
}

// App lifecycle
if (shouldStartApp) {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('ayati', process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient('ayati');
  }

  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (!isQuranOAuthCallbackUrl(url)) return;
    deliverQuranOAuthCallback(url);
  });

  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'ayati-qul-font',
      privileges: {
        secure: true,
        standard: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);

  app.whenReady().then(async () => {
    protocol.handle('ayati-qul-font', async (request) => {
      let requestedUrl: URL;
      try {
        requestedUrl = new URL(request.url);
      } catch {
        return new Response(null, { status: 400 });
      }
      const rawPath = requestedUrl.searchParams.get('path');
      if (typeof rawPath !== 'string' || rawPath.length === 0) {
        return new Response(null, { status: 400 });
      }
      const root = resolveQulRoot(app);
      if (!root || !isFontPathWithinQulRoot(root, rawPath)) {
        return new Response(null, { status: 403 });
      }
      const resolved = path.resolve(rawPath);
      try {
        const stats = await stat(resolved);
        if (!stats.isFile()) return new Response(null, { status: 404 });
        const buf = await readFile(resolved);
        return new Response(buf, {
          headers: {
            'Content-Type': 'font/ttf',
            'Cross-Origin-Resource-Policy': 'cross-origin',
          },
        });
      } catch {
        return new Response(null, { status: 404 });
      }
    });

    applyDockIcon();
    setupIPC();
    setupAutoUpdater();
    setupTray();

    // Check onboarding status
    const onboardingCompleted = store.get('onboarding.completed') as boolean;
    const onboardingSkipped = store.get('onboarding.skipped') as boolean;

    console.log('[Onboarding] Status check:', { onboardingCompleted, onboardingSkipped });

    if (!onboardingCompleted && !onboardingSkipped) {
      // Show onboarding wizard
      console.log('[Onboarding] Showing onboarding window...');
      await createOnboardingWindow();
      console.log('[Onboarding] Window created');
    } else {
      // Start main app directly
      console.log('[Onboarding] Skipping onboarding, starting main app');
      startMainApp();
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createPetWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('will-quit', () => {
    hotkeyCaptureSuspendDepth = 0;
    globalShortcut.unregisterAll();
    watchers?.stop();
    stopAutoUpdaterTimers();
    stopTimedQuranReminders();
    stopIdleBehaviors();
    if (idleCheckInterval) {
      clearInterval(idleCheckInterval);
    }
    stopAttentionSeeker();
    if (moveAnimation) {
      clearInterval(moveAnimation);
    }
  });
}
