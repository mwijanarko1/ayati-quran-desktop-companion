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
} from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFile, execSync } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
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
import { TutorialManager } from './tutorial';
import { getFrontmostWindowTitleFromSystemEvents } from './window-title';
import { buildContextualQuranNudge, buildTimedQuranReminder } from './ayah-contextual-nudges';
import { analyzeScreenForAyah } from './ayah-scene-analyzer';
import { selectAyahCandidateWithAi } from './ayah-ai-selector';
import { fetchVerseContentForReflection as fetchVerseContentWithFallback } from './ayah-reflection-content';
import {
  createDefaultAyahLensState,
  addReflectionToCollectionLocal,
  deleteReflection,
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
  QuranAuthStatus,
  QuranStreakSummary,
  QuranVerseContent,
} from './ayah-types';
import { createPkcePair, QuranFoundationClient, QuranFoundationError, type StoredTokenSet } from './quran-foundation-client';
import { QURAN_OAUTH_SCOPES } from './quran-oauth-scopes';
import { resolveQuranClientConfig } from './quran-runtime-config';
import { getDefaultClawBotModel } from './ai-provider-defaults';
import { DEFAULT_HOTKEYS, sanitizeAccelerator } from './hotkeys';
import { getAiProviderConfig } from './ai-providers';
import { getWindowPositionNearAnchor } from './window-positioning';
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

const execFileAsync = promisify(execFile);

// Load environment variables from repo root (.env then .env.local overrides)
const repoRoot = process.cwd();
config({ path: path.join(repoRoot, '.env') });
config({ path: path.join(repoRoot, '.env.local'), override: true });

// Fix transparent window rendering on some Mac hardware (e.g. Mac Mini)
// Electron has a bug where transparent windows < 162px become opaque on external/4K displays
// See: https://github.com/electron/electron/issues/44884
app.disableHardwareAcceleration();

// Windows
let petWindow: BrowserWindow | null = null;
let petChatWindow: BrowserWindow | null = null;
let assistantWindow: BrowserWindow | null = null;
let chatbarWindow: BrowserWindow | null = null;
let screenshotQuestionWindow: BrowserWindow | null = null;
let onboardingWindow: BrowserWindow | null = null;
let petContextMenuWindow: BrowserWindow | null = null;
let workspaceBrowserWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let pendingPetChatReveal = false;
let petChatRevealTimeout: NodeJS.Timeout | null = null;
let petChatAutoHideTimeout: NodeJS.Timeout | null = null;

// Services
let watchers: Watchers | null = null;
let clawbot: ClawBotClient | null = null;
const store = createStore();
const tutorialManager = new TutorialManager(store);
let quranOAuthSession: { state: string; nonce: string; verifier: string } | null = null;
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

const isDev = !app.isPackaged;
const DEV_PORT = process.env.VITE_DEV_PORT || '5173';
const UPDATE_STATE_CHANNEL = 'update-state';
const UPDATE_GET_STATE_CHANNEL = 'update-get-state';
const UPDATE_CHECK_CHANNEL = 'update-check';
const UPDATE_DOWNLOAD_CHANNEL = 'update-download';
const UPDATE_INSTALL_CHANNEL = 'update-install';
const AUTO_UPDATE_STARTUP_DELAY_MS = 10_000;
const AUTO_UPDATE_POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;
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
const DEV_WINDOW_BORDER_CSS = `
  html, body {
    box-sizing: border-box !important;
    border: 1px dashed rgba(255, 120, 120, 0.95) !important;
  }
`;
const debugBorderStyleKeys = new WeakMap<BrowserWindow, string>();

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
      headers['X-OpenRouter-Title'] = 'Ayati - Quran Desktop Companion';
    }
  } catch {
    if (url.includes('openrouter.ai')) {
      headers['X-OpenRouter-Title'] = 'Ayati - Quran Desktop Companion';
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
  const windows = [petWindow, petChatWindow, assistantWindow, chatbarWindow, screenshotQuestionWindow, onboardingWindow, petContextMenuWindow, workspaceBrowserWindow];
  for (const window of windows) {
    if (!window || window.isDestroyed()) continue;
    void applyDebugWindowBorder(window);
  }
}

function getAyahLensState(): AyahLensState {
  const stored = store.get('ayahLens') as AyahLensState | undefined;
  if (!stored) {
    const defaultState = createDefaultAyahLensState();
    store.set('ayahLens', defaultState);
    return defaultState;
  }

  const defaultState = createDefaultAyahLensState();
  return {
    ...defaultState,
    ...stored,
    quranConfig: { ...defaultState.quranConfig, ...stored.quranConfig },
    quranAuth: { ...defaultState.quranAuth, ...stored.quranAuth },
    contentAuth: { ...defaultState.contentAuth, ...stored.contentAuth },
    preferences: { ...defaultState.preferences, ...stored.preferences },
    reflections: stored.reflections ?? [],
    collections: stored.collections ?? [],
    pendingSync: stored.pendingSync ?? [],
    recentVerseKeys: stored.recentVerseKeys ?? [],
    nudgeState: { ...defaultState.nudgeState, ...stored.nudgeState },
    verseCache: stored.verseCache ?? {},
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

function persistQuranUserTokens(tokens: StoredTokenSet): QuranAuthStatus {
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
  return getQuranAuthStatusFromState(nextState);
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

async function getQuranUserAccessToken(): Promise<string | null> {
  const state = getAyahLensState();
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
    persistQuranUserTokens({
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

async function getQuranContentAccessToken(): Promise<string> {
  const userToken = await getQuranUserAccessToken();
  if (userToken) return userToken;

  const state = getAyahLensState();
  const contentToken = decryptSecret(state.contentAuth.encryptedAccessToken);
  if (contentToken && (state.contentAuth.expiresAt ?? 0) > Date.now() + 60_000) {
    return contentToken;
  }

  const tokens = await getQuranClient().requestContentToken();
  setAyahLensState({
    ...state,
    contentAuth: {
      encryptedAccessToken: encryptSecret(tokens.accessToken),
      expiresAt: tokens.expiresAt,
    },
  });
  return tokens.accessToken;
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
  const preferred = resources.find((resource) => /mishari|mishary|alafasy/i.test(resource.name)) ?? resources[0];
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

async function getAyahTafsirById(reflectionId: string): Promise<AyahReflection | null> {
  const reflection = getAyahLensState().reflections.find((item) => item.id === reflectionId);
  if (!reflection) return null;
  if (reflection.tafsir) return reflection;

  const resource = await resolveTafsirResource();
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
  if (reflection.audio) return reflection;

  const resource = await resolveRecitationResource();
  if (!resource) return reflection;

  const accessToken = await getQuranContentAccessToken();
  const audio = await getQuranClient().fetchAyahAudio(accessToken, reflection.verseKey, resource.id, resource.name);
  const nextReflection: AyahReflection = { ...reflection, audio };
  const nextState = updateReflection(getAyahLensState(), nextReflection);
  setAyahLensState(nextState);
  return nextState.reflections.find((item) => item.id === reflectionId) ?? nextReflection;
}

async function captureAyahReflection(): Promise<AyahReflection> {
  isCapturingAyahReflection = true;
  let capture: Awaited<ReturnType<typeof captureScreenWithContext>> | null = null;

  try {
    await playPetCameraSnapAnimationBeforeCapture();
    capture = await captureScreenWithContext();
    if (!capture) {
      throw new Error('Screen capture was unavailable. Check Screen Recording permission and try again.');
    }

    const insight = await analyzeScreenForAyah(clawbot, capture.image);
    const state = getAyahLensState();
    const candidates = rankAyahCandidates(insight, state.recentVerseKeys, getFeedbackSignals(state));
    const candidate = await selectAyahCandidateWithAi(clawbot, insight, candidates);
    const verse = await fetchVerseContentForReflection(candidate.verseKey);
    const candidateIndex = Math.max(0, candidates.findIndex((item) => item.verseKey === candidate.verseKey));
    const reflection = buildAyahReflection(verse, candidate, insight, candidates.map((item) => item.verseKey), candidateIndex);
    setAyahLensState(saveReflectionLocally(getAyahLensState(), reflection));
    return reflection;
  } finally {
    if (capture) {
      capture.image = '';
    }
    isCapturingAyahReflection = false;
  }
}

function buildAyahReflection(
  verse: QuranVerseContent,
  candidate: ReturnType<typeof rankAyahCandidates>[number],
  insight: Awaited<ReturnType<typeof analyzeScreenForAyah>>,
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
  };
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
  setAyahLensState(updateReflection(state, savedReflection));

  const accessToken = await getQuranUserAccessToken();
  if (!accessToken) {
    return savedReflection;
  }

  try {
    const result = await getQuranClient().createBookmark(accessToken, {
      verseKey: reflection.verseKey,
      mushafId: state.preferences.mushafId,
    });
    const syncedState = markReflectionSynced(getAyahLensState(), reflectionId, result.bookmarkId);
    setAyahLensState(syncedState);
    const syncedReflection = syncedState.reflections.find((item) => item.id === reflectionId) ?? savedReflection;
    await recordReflectionActivity(syncedReflection);
    return getAyahLensState().reflections.find((item) => item.id === reflectionId) ?? syncedReflection;
  } catch {
    const pendingState = markReflectionPendingSync(getAyahLensState(), reflectionId, 'bookmark');
    setAyahLensState(pendingState);
    return pendingState.reflections.find((item) => item.id === reflectionId) ?? savedReflection;
  }
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
    'Shared from Ayati - Quran Desktop Companion',
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
  } else if (key === 'maxNudgesPerDay' && typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 48) {
    preferences.maxNudgesPerDay = value;
  } else if (key === 'timedReminders' && typeof value === 'boolean') {
    preferences.timedReminders = value;
  } else if (key === 'timedReminderMinutes' && typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1440) {
    preferences.timedReminderMinutes = value;
  } else if (key === 'tafsirResourceId' && (value === null || (typeof value === 'number' && Number.isInteger(value) && value > 0))) {
    preferences.tafsirResourceId = value;
  } else if (key === 'tafsirResourceName' && (value === null || typeof value === 'string')) {
    preferences.tafsirResourceName = value;
  } else if (key === 'recitationId' && (value === null || (typeof value === 'number' && Number.isInteger(value) && value > 0))) {
    preferences.recitationId = value;
  } else if (key === 'reciterName' && (value === null || typeof value === 'string')) {
    preferences.reciterName = value;
  } else {
    throw new Error('Unknown or invalid Ayati - Quran Desktop Companion setting.');
  }

  setAyahLensState({ ...state, preferences });
  return preferences;
}

// Idle detection state
let lastActivityTime = Date.now();
let idleCheckInterval: NodeJS.Timeout | null = null;
let timedQuranReminderInterval: NodeJS.Timeout | null = null;
let isCapturingAyahReflection = false;
const IDLE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
const DEFAULT_TIMED_QURAN_REMINDER_MINUTES = 15;

// Pet movement animation state
let moveAnimation: NodeJS.Timeout | null = null;

// Pet window size constants
// Minimum 162px to avoid Electron transparency bug on external/4K displays
const PET_WINDOW_WIDTH = 164;
const PET_WINDOW_HEIGHT = 164;
const PET_WINDOW_TUTORIAL_WIDTH = 320;
const PET_WINDOW_TUTORIAL_HEIGHT = 350;
const PET_WAKE_FLIGHT_DURATION_MS = 1100;
const PET_CHAT_MIN_WIDTH = 220;
const PET_CHAT_MAX_WIDTH = 360;
const PET_CHAT_MIN_HEIGHT = 90;
const PET_CHAT_MAX_HEIGHT = 420;
const PET_CHAT_AUTO_HIDE_MS = 10000;
const PET_CHAT_VERTICAL_GAP = -2;
const ASSISTANT_VERTICAL_GAP = -3;
const WORKSPACE_BROWSER_VERTICAL_GAP = -6;
const PET_CONTEXT_MENU_WIDTH = 220;
const PET_CONTEXT_MENU_HEIGHT = 342;
const PET_WAKE_FLIGHT_KEYFRAMES = [
  { progress: 0, x: 0, y: 0 },
  { progress: 0.24, x: -10, y: -24 },
  { progress: 0.58, x: 12, y: -56 },
  { progress: 0.8, x: 6, y: -18 },
  { progress: 1, x: 0, y: 0 },
];
const WORKSPACE_BROWSER_WIDTH = 420;
const WORKSPACE_BROWSER_HEIGHT = 520;
const SCREENSHOT_QUESTION_WIDTH = 520;
const SCREENSHOT_QUESTION_HEIGHT = 280;
const PET_CAMERA_SNAP_CAPTURE_DELAY_MS = 560;
const PET_CAMERA_SNAP_DURATION_MS = 920;
const PET_CAMERA_SNAP_FLASH_DURATION_MS = 120;
const DEV_FORCE_ACTIVE_APP_COMMENT_DELAY_MS = 5000;

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

    // Notify renderer that movement started
    petWindow.webContents.send('pet-moving', { moving: true });

    moveAnimation = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out curve for natural movement
      const eased = 1 - Math.pow(1 - progress, 3);

      const currentX = Math.round(startX + (targetX - startX) * eased);
      const currentY = Math.round(startY + (targetY - startY) * eased);

      petWindow?.setPosition(currentX, currentY);
      updatePetChatPosition();
      updateAssistantPosition();
      updateScreenshotQuestionPosition();
      updateWorkspaceBrowserPosition();

      if (progress >= 1) {
        clearInterval(moveAnimation!);
        moveAnimation = null;
        store.set('pet.position', { x: targetX, y: targetY });
        petWindow?.webContents.send('pet-moving', { moving: false });
        updateScreenshotQuestionPosition();
        updateWorkspaceBrowserPosition();
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

function clampPetWindowPosition(x: number, y: number): { x: number; y: number } {
  if (!petWindow || petWindow.isDestroyed()) return { x, y };

  const bounds = petWindow.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: Math.round(x + bounds.width / 2),
    y: Math.round(y + bounds.height / 2),
  });
  const maxX = display.workArea.x + display.workArea.width - bounds.width;
  const maxY = display.workArea.y + display.workArea.height - bounds.height;

  return {
    x: Math.max(display.workArea.x, Math.min(Math.round(x), maxX)),
    y: Math.max(display.workArea.y, Math.min(Math.round(y), maxY)),
  };
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
      updateAssistantPosition();
      updateScreenshotQuestionPosition();
      updateWorkspaceBrowserPosition();

      if (progress >= 1) {
        clearInterval(moveAnimation!);
        moveAnimation = null;
        store.set('pet.position', { x: startX, y: startY });
        updatePetChatPosition();
        updateAssistantPosition();
        updateScreenshotQuestionPosition();
        updateWorkspaceBrowserPosition();
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

async function playPetCameraSnapAnimationBeforeCapture(): Promise<void> {
  if (!petWindow || petWindow.isDestroyed() || isSleeping) return;

  petWindow.webContents.send('pet-camera-snap', {
    captureAtMs: PET_CAMERA_SNAP_CAPTURE_DELAY_MS,
    durationMs: PET_CAMERA_SNAP_DURATION_MS,
    flashDurationMs: PET_CAMERA_SNAP_FLASH_DURATION_MS,
  });

  await new Promise((resolve) => setTimeout(resolve, PET_CAMERA_SNAP_CAPTURE_DELAY_MS));
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
  if (!petWindow || !clawbot?.isConnected()) return;

  // Don't show chat popups during tutorial
  if (tutorialManager?.getStatus().isActive) return;

  try {
      let prompt: string;
      switch (trigger) {
      case 'app_switch':
        if (!context?.trim()) {
          return;
        }
        prompt = `User is using app name: "${context}". Window title: "${windowTitle?.trim() || '[unavailable]'}". Based on what you know about the user, say something funny that's relevant to the app and/or window title.`;
        break;
      case 'idle':
        prompt = 'The user has been idle for a while. Give a brief, friendly message to check in or suggest a break (1-2 sentences max). Be warm and not pushy.';
        break;
      case 'proactive':
        prompt = context || 'Share a brief, helpful tip with the user.';
        break;
    }

    console.log('[ChatPopup] sendChatPopup', { trigger, context, windowTitle, prompt });
    const response = await clawbot.chat(prompt);

    if (response.text && !response.text.includes('error')) {
      resetInteractionTimer();
      petWindow.webContents.send('chat-popup', {
        id: randomUUID(),
        text: response.text,
        trigger,
        quickReplies: ['Thanks!', 'Tell me more', 'Not now'],
      });
    }
  } catch (error) {
    console.error('Failed to send chat popup:', error);
  }
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
    || tutorialManager?.getStatus().isActive
    || isCapturingAyahReflection
    || (!options.force && hasActiveConversationSurface())
  ) {
    return false;
  }

  const state = getAyahLensState();
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
    console.error('[Ayati - Quran Desktop Companion] Failed to build contextual Quran nudge:', error);
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
    || tutorialManager?.getStatus().isActive
    || isCapturingAyahReflection
    || (!options.force && hasActiveConversationSurface())
  ) {
    return false;
  }

  const state = getAyahLensState();
  const reminderSettings = options.force
    ? { ...state.preferences, timedReminders: true }
    : state.preferences;
  const reminderNudgeState = options.force
    ? { ...state.nudgeState, lastTimedReminderAt: null }
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
    console.error('[Ayati - Quran Desktop Companion] Failed to build timed Quran reminder:', error);
    petWindow.webContents.send('chat-popup', {
      id: randomUUID(),
      text: `Quran Foundation error: ${message}`,
      trigger: 'timer',
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

function stopTimedQuranReminders(): void {
  if (!timedQuranReminderInterval) return;
  clearInterval(timedQuranReminderInterval);
  timedQuranReminderInterval = null;
}

function scheduleTimedQuranReminders(): void {
  stopTimedQuranReminders();

  const { timedReminders, timedReminderMinutes } = getAyahLensState().preferences;
  if (!timedReminders) return;

  const intervalMinutes = Math.max(1, Math.min(1440, timedReminderMinutes || DEFAULT_TIMED_QURAN_REMINDER_MINUTES));
  timedQuranReminderInterval = setInterval(() => {
    void maybeSendTimedQuranReminder();
  }, intervalMinutes * 60 * 1000);
  timedQuranReminderInterval.unref?.();
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

// Expand pet window for tutorial (to show speech bubble)
function expandPetWindowForTutorial(): void {
  if (!petWindow) return;

  const [currentX, currentY] = petWindow.getPosition();
  const { height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  // Calculate new position to keep pet at same visual location
  // The pet will be at the bottom of the expanded window
  const newY = currentY - (PET_WINDOW_TUTORIAL_HEIGHT - PET_WINDOW_HEIGHT);
  const newX = currentX - (PET_WINDOW_TUTORIAL_WIDTH - PET_WINDOW_WIDTH) / 2;

  // Ensure window stays on screen
  const safeY = Math.max(0, newY);
  const safeX = Math.max(0, newX);

  petWindow.setSize(PET_WINDOW_TUTORIAL_WIDTH, PET_WINDOW_TUTORIAL_HEIGHT);
  petWindow.setPosition(Math.round(safeX), Math.round(safeY));
  updateScreenshotQuestionPosition();
  updateWorkspaceBrowserPosition();
  petWindow.webContents.send('tutorial-window-expanded', true);
  console.log('[Tutorial] Pet window expanded for tutorial');
}

// Contract pet window back to normal size
function contractPetWindow(): void {
  if (!petWindow) return;

  const [currentX, currentY] = petWindow.getPosition();

  // Calculate new position to keep pet at same visual location
  const newY = currentY + (PET_WINDOW_TUTORIAL_HEIGHT - PET_WINDOW_HEIGHT);
  const newX = currentX + (PET_WINDOW_TUTORIAL_WIDTH - PET_WINDOW_WIDTH) / 2;

  petWindow.setSize(PET_WINDOW_WIDTH, PET_WINDOW_HEIGHT);
  petWindow.setPosition(Math.round(newX), Math.round(newY));
  updateScreenshotQuestionPosition();
  updateWorkspaceBrowserPosition();
  petWindow.webContents.send('tutorial-window-expanded', false);
  console.log('[Tutorial] Pet window contracted to normal');
}

function createPetWindow() {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  // Small window just for the lobster
  const petWindowWidth = PET_WINDOW_WIDTH;
  const petWindowHeight = PET_WINDOW_HEIGHT;

  // Use saved position or default to bottom-right
  const savedPosition = store.get('pet.position') as { x: number; y: number } | null;
  const startX = savedPosition ? savedPosition.x : screenWidth - petWindowWidth - 20;
  const startY = savedPosition ? savedPosition.y : screenHeight - petWindowHeight - 20;

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
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  wireDebugWindowBorder(petWindow);

  // Allow dragging and going above menu bar
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.setAlwaysOnTop(true, 'screen-saver');

  if (isDev) {
    petWindow.loadURL(`http://localhost:${DEV_PORT}/pet.html`);
  } else {
    petWindow.loadFile(path.join(__dirname, '../renderer/pet.html'));
  }

  petWindow.on('closed', () => {
    petWindow = null;
    // Also close the chat window when pet is closed
    petChatWindow?.close();
    petContextMenuWindow?.close();
    workspaceBrowserWindow?.close();
  });
}

// Show chat popup above the pet
function schedulePetChatAutoHide() {
  if (petChatAutoHideTimeout) {
    clearTimeout(petChatAutoHideTimeout);
  }

  petChatAutoHideTimeout = setTimeout(() => {
    petChatAutoHideTimeout = null;
    if (!petChatWindow || petChatWindow.isDestroyed() || !petChatWindow.isVisible()) return;
    hidePetChat();
  }, PET_CHAT_AUTO_HIDE_MS);
}

function showPetChat(message: { id: string; text: string; quickReplies?: string[]; reflectionId?: string }) {
  if (!petWindow) return;

  // Don't show chat popups during tutorial
  if (tutorialManager?.getStatus().isActive) return;
  pendingPetChatReveal = true;

  const [petX, petY] = petWindow.getPosition();
  const [petWidth] = petWindow.getSize();

  const chatWidth = PET_CHAT_MIN_WIDTH;
  const chatHeight = PET_CHAT_MIN_HEIGHT;
  const chatX = petX + (petWidth - chatWidth) / 2;
  const chatY = petY - chatHeight + PET_CHAT_VERTICAL_GAP;

  const scheduleFallbackReveal = () => {
    if (petChatRevealTimeout) clearTimeout(petChatRevealTimeout);
    petChatRevealTimeout = setTimeout(() => {
      if (!pendingPetChatReveal || !petChatWindow || petChatWindow.isDestroyed()) return;
      petChatWindow.setOpacity(1);
      petChatWindow.showInactive();
      pendingPetChatReveal = false;
      petChatRevealTimeout = null;
    }, 250);
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
      scheduleFallbackReveal();
      schedulePetChatAutoHide();
    });
  } else {
    // Update position and message
    petChatWindow.setPosition(Math.max(0, Math.round(chatX)), Math.max(0, Math.round(chatY)));
    petChatWindow.setOpacity(0);
    if (!petChatWindow.isVisible()) {
      petChatWindow.showInactive();
    }
    petChatWindow.webContents.send('chat-message', message);
    scheduleFallbackReveal();
    schedulePetChatAutoHide();
  }
}

function hidePetChat() {
  pendingPetChatReveal = false;
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
}

function updatePetChatPosition() {
  if (!petWindow || !petChatWindow) return;

  const [petX, petY] = petWindow.getPosition();
  const [petWidth] = petWindow.getSize();
  const [chatWidth] = petChatWindow.getSize();

  const [cw, ch] = petChatWindow.getSize();
  const chatX = petX + (petWidth - cw) / 2;
  const chatY = petY - ch + PET_CHAT_VERTICAL_GAP;

  petChatWindow.setPosition(Math.max(0, Math.round(chatX)), Math.max(0, Math.round(chatY)));
}

function updateAssistantPosition() {
  if (!petWindow || !assistantWindow || !assistantWindow.isVisible()) return;

  const [petX, petY] = petWindow.getPosition();
  const [petWidth] = petWindow.getSize();
  const [assistantWidth, assistantHeight] = assistantWindow.getSize();
  const { workArea } = screen.getPrimaryDisplay();
  const position = getWindowPositionNearAnchor({
    anchor: { x: petX, y: petY, width: petWidth, height: PET_WINDOW_HEIGHT },
    windowSize: { width: assistantWidth, height: assistantHeight },
    workArea,
    verticalGap: ASSISTANT_VERTICAL_GAP,
  });

  assistantWindow.setPosition(position.x, position.y);
}

function updateWorkspaceBrowserPosition() {
  if (!petWindow || !workspaceBrowserWindow || !workspaceBrowserWindow.isVisible()) return;

  const [petX, petY] = petWindow.getPosition();
  const [petWidth] = petWindow.getSize();
  const [browserWidth, browserHeight] = workspaceBrowserWindow.getSize();
  const { workArea } = screen.getPrimaryDisplay();
  const position = getWindowPositionNearAnchor({
    anchor: { x: petX, y: petY, width: petWidth, height: PET_WINDOW_HEIGHT },
    windowSize: { width: browserWidth, height: browserHeight },
    workArea,
    verticalGap: WORKSPACE_BROWSER_VERTICAL_GAP,
  });

  workspaceBrowserWindow.setPosition(position.x, position.y);
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
    verticalGap: ASSISTANT_VERTICAL_GAP,
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

  assistantWindow.show();
  assistantWindow.focus();
}

function openAssistantOnTab(tab: 'chat' | 'settings') {
  createAssistantWindow();
  if (!assistantWindow || assistantWindow.isDestroyed()) return;

  const channel = tab === 'settings' ? 'switch-to-settings' : 'switch-to-chat';
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

function createAssistantWindow() {
  if (assistantWindow) {
    revealAssistantWindow();
    updateAssistantPosition();
    return;
  }

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  // Position above pet if pet window exists, otherwise bottom-right
  let initialX = screenWidth - 420;
  let initialY = screenHeight - 520;

  if (petWindow) {
    const [petX, petY] = petWindow.getPosition();
    const [petWidth] = petWindow.getSize();
    const assistantWidth = 400;
    const assistantHeight = 500;

    initialX = petX + (petWidth - assistantWidth) / 2;
    initialY = petY - assistantHeight + ASSISTANT_VERTICAL_GAP;

    // Keep within screen bounds
    initialX = Math.max(0, Math.min(initialX, screenWidth - assistantWidth));
    initialY = Math.max(0, initialY);
  }

  assistantWindow = new BrowserWindow({
    width: 400,
    height: 500,
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
  if (process.platform === 'darwin' || process.platform === 'linux') {
    assistantWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  if (isDev) {
    assistantWindow.loadURL(`http://localhost:${DEV_PORT}/assistant.html`);
  } else {
    assistantWindow.loadFile(path.join(__dirname, '../renderer/assistant.html'));
  }

  assistantWindow.once('ready-to-show', () => {
    revealAssistantWindow();
    // Open DevTools in dev mode
    if (isDev) {
      assistantWindow?.webContents.openDevTools({ mode: 'detach' });
    }
  });

  assistantWindow.on('closed', () => {
    assistantWindow = null;
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
  // Keep the context menu above the pet window, which also uses screen-saver level.
  petContextMenuWindow.setAlwaysOnTop(true, 'screen-saver', 1);

  if (isDev) {
    petContextMenuWindow.loadURL(`http://localhost:${DEV_PORT}/pet-context-menu.html`);
  } else {
    petContextMenuWindow.loadFile(path.join(__dirname, '../renderer/pet-context-menu.html'));
  }

  petContextMenuWindow.on('blur', () => {
    petContextMenuWindow?.hide();
  });

  petContextMenuWindow.on('closed', () => {
    petContextMenuWindow = null;
  });
}

function createWorkspaceBrowserWindow() {
  if (workspaceBrowserWindow) {
    workspaceBrowserWindow.show();
    workspaceBrowserWindow.focus();
    updateWorkspaceBrowserPosition();
    return;
  }

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  let initialX = screenWidth - WORKSPACE_BROWSER_WIDTH - 24;
  let initialY = screenHeight - WORKSPACE_BROWSER_HEIGHT - 24;

  if (petWindow) {
    const [petX, petY] = petWindow.getPosition();
    const [petWidth] = petWindow.getSize();

    initialX = petX + (petWidth - WORKSPACE_BROWSER_WIDTH) / 2;
    initialY = petY - WORKSPACE_BROWSER_HEIGHT + ASSISTANT_VERTICAL_GAP;
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

  if (isDev) {
    workspaceBrowserWindow.loadURL(`http://localhost:${DEV_PORT}/workspace-browser.html`);
  } else {
    workspaceBrowserWindow.loadFile(path.join(__dirname, '../renderer/workspace-browser.html'));
  }

  workspaceBrowserWindow.once('ready-to-show', () => {
    workspaceBrowserWindow?.show();
    workspaceBrowserWindow?.focus();
    updateWorkspaceBrowserPosition();
  });

  workspaceBrowserWindow.on('focus', () => {
    resetInteractionTimer();
  });

  workspaceBrowserWindow.on('resize', () => {
    updateWorkspaceBrowserPosition();
  });

  workspaceBrowserWindow.on('closed', () => {
    workspaceBrowserWindow = null;
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
  };

  if (petContextMenuWindow.webContents.isLoading()) {
    petContextMenuWindow.webContents.once('did-finish-load', showWindow);
  } else {
    showWindow();
  }
}

function toggleAssistantWindow() {
  if (assistantWindow && assistantWindow.isVisible()) {
    assistantWindow.hide();
  } else {
    createAssistantWindow();
  }
}

function createChatbarWindow() {
  if (chatbarWindow) {
    chatbarWindow.show();
    chatbarWindow.focus();
    return;
  }

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

  // Make transparent areas click-through
  chatbarWindow.setIgnoreMouseEvents(true, { forward: true });

  if (isDev) {
    chatbarWindow.loadURL(`http://localhost:${DEV_PORT}/chatbar.html`);
  } else {
    chatbarWindow.loadFile(path.join(__dirname, '../renderer/chatbar.html'));
  }

  chatbarWindow.once('ready-to-show', () => {
    chatbarWindow?.show();
  });

  // Hide on blur (click outside)
  chatbarWindow.on('blur', () => {
    chatbarWindow?.hide();
  });

  chatbarWindow.on('closed', () => {
    chatbarWindow = null;
  });
}

function toggleChatbarWindow() {
  if (chatbarWindow && chatbarWindow.isVisible()) {
    chatbarWindow.hide();
  } else {
    createChatbarWindow();
  }
}

function createScreenshotQuestionWindow() {
  console.log('[ScreenshotQuestion] Creating window...');
  if (screenshotQuestionWindow) {
    console.log('[ScreenshotQuestion] Window exists, showing and refocusing');
    screenshotQuestionWindow.show();
    updateScreenshotQuestionPosition();
    screenshotQuestionWindow.focus();
    // Trigger a fresh screenshot capture
    screenshotQuestionWindow.webContents.send('retake-screenshot');
    return;
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
      verticalGap: ASSISTANT_VERTICAL_GAP,
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

  if (isDev) {
    screenshotQuestionWindow.loadURL(`http://localhost:${DEV_PORT}/screenshot-question.html`);
  } else {
    screenshotQuestionWindow.loadFile(path.join(__dirname, '../renderer/screenshot-question.html'));
  }

  screenshotQuestionWindow.once('ready-to-show', () => {
    console.log('[ScreenshotQuestion] Window ready, showing...');
    screenshotQuestionWindow?.show();
  });

  // Hide on blur (click outside)
  screenshotQuestionWindow.on('blur', () => {
    screenshotQuestionWindow?.hide();
  });

  screenshotQuestionWindow.on('closed', () => {
    screenshotQuestionWindow = null;
  });
}

function toggleScreenshotQuestionWindow() {
  if (screenshotQuestionWindow && screenshotQuestionWindow.isVisible()) {
    screenshotQuestionWindow.hide();
  } else {
    createScreenshotQuestionWindow();
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
  if (onboardingWindow) {
    onboardingWindow.close();
    onboardingWindow = null;
  }
  startMainApp();
}

function startMainApp() {
  // Register global hotkeys
  registerHotkeys();

  createPetWindow();

  // Set up tutorial manager with pet window
  if (petWindow) {
    tutorialManager.setPetWindow(petWindow);
    tutorialManager.setAnimateMoveTo(animateMoveTo);
    tutorialManager.setWindowResizeFunctions(expandPetWindowForTutorial, contractPetWindow);

    // Start or resume tutorial after pet window content is loaded
    petWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        if (tutorialManager.shouldShowResumePrompt()) {
          hidePetChat(); // Hide any existing chat popup during tutorial
          expandPetWindowForTutorial();
          petWindow?.webContents.send('tutorial-resume-prompt');
        } else if (tutorialManager.shouldStartTutorial()) {
          hidePetChat(); // Hide any existing chat popup during tutorial
          tutorialManager.start();
        }
      }, 500); // Small delay to let pet window settle
    });
  }

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

  // Listen for cron job results - send to ClawBot for processing
  clawbot.on('cronResult', async (data) => {
    console.log('[Main] Cron result received:', data.jobName, '- sending to ClawBot for processing');

    if (!clawbot) return;

    // Send the cron instruction to ClawBot and get its response
    const response = await clawbot.chat(`[Scheduled reminder: ${data.jobName}] ${data.summary}`);

    if (response.text) {
      const processedData = {
        ...data,
        summary: response.text, // Replace instruction with AI response
      };

      // Send to assistant window and chatbar for chat history
      assistantWindow?.webContents.send('cron-result', processedData);
      chatbarWindow?.webContents.send('cron-result', processedData);

      // Show pet chat popup directly (don't rely on petWindow forwarding)
      if (!tutorialManager?.getStatus().isActive) {
        showPetChat({
          id: randomUUID(),
          text: response.text,
          quickReplies: ['Thanks!', 'Snooze', 'Dismiss'],
        });
        if (!isSleeping) {
          petWindow?.webContents.send('clawbot-mood', { state: 'excited', reason: 'cron reminder' });
        }
      }

      // Handle any actions from the response
      if (response.action) {
        executePetAction(response.action.payload as PetAction);
      }
    }
  });

  clawbot.on('cronError', (data) => {
    console.log('[Main] Cron error received:', data.jobName, data.error);
    petWindow?.webContents.send('cron-error', data);
    assistantWindow?.webContents.send('cron-error', data);
  });
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
      openAssistantOnTab('chat');
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

  // Toggle chatbar window
  ipcMain.on('toggle-chatbar', () => {
    toggleChatbarWindow();
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
    toggleScreenshotQuestionWindow();
  });

  // Close screenshot question window
  ipcMain.on('close-screenshot-question', () => {
    screenshotQuestionWindow?.hide();
  });

  // Ask about screen (screenshot + question)
  ipcMain.handle('ask-about-screen', async (_event, question: string, imageDataUrl: string) => {
    console.log('[ScreenshotQuestion] ask-about-screen called');
    console.log('[ScreenshotQuestion] Question:', question);
    console.log('[ScreenshotQuestion] Image size:', imageDataUrl?.length || 0, 'chars');

    if (!clawbot) {
      console.log('[ScreenshotQuestion] ClawBot not connected!');
      return { error: 'ClawBot not connected' };
    }

    try {
      console.log('[ScreenshotQuestion] Calling analyzeScreen...');
      const response = await clawbot.analyzeScreen(imageDataUrl, question);
      console.log('[ScreenshotQuestion] Response:', response);
      return response;
    } catch (error) {
      console.error('Failed to analyze screen:', error);
      return { error: 'Failed to analyze screenshot' };
    }
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

    // Re-register hotkeys if hotkey settings changed
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

    return store.store;
  });

  ipcMain.handle('quran-auth-start', () => {
    const pkce = createPkcePair();
    const state = randomUUID();
    const nonce = randomUUID();
    quranOAuthSession = { state, nonce, verifier: pkce.verifier };

    const authorizeUrl = getQuranClient().buildAuthorizeUrl({
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
        return {
          isConnected: false,
          scopes: [],
          error: 'Quran Foundation sign-in was cancelled or denied.',
        } satisfies QuranAuthStatus;
      }

      const state = url.searchParams.get('state');
      const code = url.searchParams.get('code');
      if (!code || !quranOAuthSession || state !== quranOAuthSession.state) {
        return {
          isConnected: false,
          scopes: [],
          error: 'Quran Foundation sign-in callback could not be verified.',
        } satisfies QuranAuthStatus;
      }

      const tokens = await getQuranClient().exchangeAuthorizationCode(
        code,
        quranOAuthSession.verifier,
        quranOAuthSession.nonce,
      );
      quranOAuthSession = null;
      return persistQuranUserTokens(tokens);
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

  ipcMain.handle('ayah-capture-reflection', async () => {
    return await captureAyahReflection();
  });

  ipcMain.handle('ayah-save-reflection', async (_event, reflectionId: string) => {
    if (typeof reflectionId !== 'string' || !reflectionId.trim()) {
      return null;
    }
    return await saveAyahReflectionById(reflectionId);
  });

  ipcMain.handle('ayah-history', () => {
    return getAyahLensState().reflections;
  });

  ipcMain.handle('ayah-delete-reflection', (_event, reflectionId: string) => {
    if (typeof reflectionId !== 'string' || !reflectionId.trim()) {
      return false;
    }
    setAyahLensState(deleteReflection(getAyahLensState(), reflectionId));
    return true;
  });

  ipcMain.handle('ayah-tafsir', async (_event, reflectionId: string) => {
    if (typeof reflectionId !== 'string' || !reflectionId.trim()) return null;
    return await getAyahTafsirById(reflectionId);
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

  ipcMain.handle('ayah-settings-update', (_event, key: string, value: unknown) => {
    try {
      const nextSettings = updateAyahLensSetting(key, value);
      if (key === 'timedReminders' || key === 'timedReminderMinutes') {
        scheduleTimedQuranReminders();
      }
      return nextSettings;
    } catch {
      return getAyahLensState().preferences;
    }
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
    await playPetCameraSnapAnimationBeforeCapture();
    return await captureScreen();
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
    if (responseText && !responseText.includes('error') && petWindow && !assistantActive && !chatbarActive && !tutorialManager?.getStatus().isActive) {
      petWindow.webContents.send('chat-popup', {
        id: randomUUID(),
        text: responseText,
        trigger: 'proactive',
        quickReplies: ['Thanks!', 'Not now'],
      });
    }
  };

  // Send message to ClawBot (with optional screen context)
  ipcMain.handle('send-to-clawbot', async (_event, message: string, includeScreen?: boolean) => {
    if (!clawbot) return { error: 'ClawBot not connected' };

    resetInteractionTimer(); // User is chatting

    const { history, fullMessage } = await buildClawbotChatPayload(message, includeScreen);

    const response = await clawbot.chat(fullMessage, history);

    // Handle any actions in the response
    if (response.action?.payload) {
      await executePetAction(response.action.payload as PetAction);
    }

    maybeShowPetResponse(response.text);

    return response;
  });

  // Start streaming a message to ClawBot and emit chunk/end/error events
  ipcMain.handle('start-clawbot-stream', async (event, message: string, includeScreen?: boolean) => {
    const clawbotClient = clawbot;
    if (!clawbotClient) return { error: 'ClawBot not connected' };

    resetInteractionTimer();

    const requestId = randomUUID();
    const sender = event.sender;
    const isChatbarRequest = Boolean(
      chatbarWindow &&
      !chatbarWindow.isDestroyed() &&
      chatbarWindow.webContents.id === sender.id
    );

    const runStream = async () => {
      try {
        const { history, fullMessage } = await buildClawbotChatPayload(message, includeScreen);
        const response = await clawbotClient.chatStream(fullMessage, history, {
          onDelta: (delta, text) => {
            if (!sender.isDestroyed()) {
              sender.send('clawbot-stream-chunk', { requestId, delta, text });
            }
          },
        });

        if (response.action?.payload) {
          await executePetAction(response.action.payload as PetAction);
        }

        if (!isChatbarRequest) {
          maybeShowPetResponse(response.text);
        }

        if (!sender.isDestroyed()) {
          sender.send('clawbot-stream-end', { requestId, response });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Failed to stream from ClawBot:', error);
        if (!sender.isDestroyed()) {
          sender.send('clawbot-stream-error', { requestId, error: errorMessage });
        }
      }
    };

    void runStream();
    return { requestId };
  });

  // Get screen context (cursor position, pet position, etc.)
  ipcMain.handle('get-screen-context', async () => {
    return await getScreenContext();
  });

  // Capture screen with context
  ipcMain.handle('capture-screen-with-context', async () => {
    await playPetCameraSnapAnimationBeforeCapture();
    return await captureScreenWithContext();
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
    if (clawbot) {
      return clawbot.getConnectionStatus();
    }
    return { connected: false, error: 'ClawBot not initialized', gatewayUrl: '' };
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
      updateAssistantPosition();
      updateScreenshotQuestionPosition();
      updateWorkspaceBrowserPosition();
      petContextMenuWindow?.hide();
      resetInteractionTimer(); // User is interacting
    }
  });

  // Show pet chat popup
  ipcMain.on('show-pet-chat', (_event, message: { id: string; text: string; quickReplies?: string[]; reflectionId?: string }) => {
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

  // Forward pet chat reply to pet window
  ipcMain.on('pet-chat-reply', (_event, reply: string) => {
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
    // Also reset tutorial so it starts fresh after onboarding
    store.set('tutorial.completedAt', null);
    store.set('tutorial.lastStep', 0);
    store.set('tutorial.wasInterrupted', false);
    app.relaunch();
    app.exit(0);
    return true;
  });

  ipcMain.handle('onboarding-complete', (_event, data: {
    launchOnStartup: boolean;
    aiProvider?: ClawBotProvider;
    gatewayUrl: string;
    gatewayToken: string;
    gatewayModel?: string;
    watchFolders: string[];
    watchActiveApp: boolean;
    watchWindowTitles: boolean;
    hotkeyOpenChat: string;
    hotkeyCaptureScreen: string;
    hotkeyOpenAssistant: string;
  }) => {
    // Save onboarding data to store
    store.set('onboarding.completed', true);

    // Reset tutorial state so it starts fresh after onboarding
    store.set('tutorial.completedAt', null);
    store.set('tutorial.lastStep', 0);
    store.set('tutorial.wasInterrupted', false);
    store.set('onboarding.workspaceType', 'ayati');
    const workspacePath = (store.get('onboarding.ayatiWorkspacePath') as string | null)
      ?? getDefaultAyahLensWorkspacePath();
    fs.mkdirSync(workspacePath, { recursive: true });
    store.set('onboarding.ayatiWorkspacePath', workspacePath);
    store.set('onboarding.memoryMigrated', false);
    const provider = normalizeClawBotProvider(data.aiProvider);
    const model = data.gatewayModel?.trim() || getDefaultClawBotModel(provider);
    store.set('clawbot.provider', provider);
    store.set('clawbot.url', data.gatewayUrl);
    store.set('clawbot.token', data.gatewayToken);
    store.set('clawbot.model', model);
    store.set('watch.folders', data.watchFolders);
    store.set('watch.activeApp', data.watchActiveApp);
    store.set('watch.sendWindowTitles', data.watchWindowTitles);
    store.set('hotkeys.openChat', sanitizeAccelerator(data.hotkeyOpenChat, DEFAULT_HOTKEYS.openChat));
    store.set('hotkeys.captureScreen', sanitizeAccelerator(data.hotkeyCaptureScreen, DEFAULT_HOTKEYS.captureScreen));
    store.set('hotkeys.openAssistant', sanitizeAccelerator(data.hotkeyOpenAssistant, DEFAULT_HOTKEYS.openAssistant));
    setLaunchOnStartup(data.launchOnStartup);

    // Update ClawBotClient with new config
    clawbot?.updateConfig(data.gatewayUrl, data.gatewayToken, null, { provider, model });

    closeOnboardingAndStartApp();
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

  // Tutorial handlers
  ipcMain.on('tutorial-pet-clicked', () => {
    tutorialManager.handlePetClicked();
  });

  ipcMain.on('tutorial-next', () => {
    tutorialManager.handleNextClicked();
  });

  ipcMain.on('tutorial-skip', () => {
    tutorialManager.skip();
  });

  ipcMain.on('tutorial-resume', () => {
    hidePetChat(); // Hide any existing chat popup during tutorial
    tutorialManager.resume();
  });

  ipcMain.on('tutorial-start-over', () => {
    hidePetChat(); // Hide any existing chat popup during tutorial
    tutorialManager.startOver();
  });

  ipcMain.on('tutorial-open-panel', () => {
    tutorialManager.handleOpenPanelClicked();
  });

  ipcMain.handle('replay-tutorial', () => {
    hidePetChat(); // Hide any existing chat popup during tutorial
    tutorialManager.replay();
    return true;
  });

  ipcMain.handle('get-tutorial-status', () => {
    return tutorialManager.getStatus();
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
    default:
      return value;
  }
}

// Register global hotkeys from store
function registerHotkeys() {
  // Unregister all first (in case we're re-registering)
  globalShortcut.unregisterAll();

  const hotkeyOpenAssistant = registerConfiguredHotkey('hotkeys.openAssistant', DEFAULT_HOTKEYS.openAssistant, () => {
    // Notify tutorial if active
    tutorialManager.handleHotkeyPressed('openAssistant');
    toggleAssistantWindow();
  });
  console.log(`[Hotkeys] Registered open assistant: ${hotkeyOpenAssistant}`);

  const hotkeyOpenChat = registerConfiguredHotkey('hotkeys.openChat', DEFAULT_HOTKEYS.openChat, () => {
    // Notify tutorial if active
    tutorialManager.handleHotkeyPressed('openChat');
    resetInteractionTimer();
    toggleChatbarWindow();
  });
  console.log(`[Hotkeys] Registered open chat: ${hotkeyOpenChat}`);

  const hotkeyCaptureScreen = registerConfiguredHotkey('hotkeys.captureScreen', DEFAULT_HOTKEYS.captureScreen, () => {
    console.log('[ScreenshotQuestion] Hotkey triggered');
    toggleScreenshotQuestionWindow();
  });
  console.log(`[Hotkeys] Registered capture screen: ${hotkeyCaptureScreen}`);
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
  return readAppUpdateYml() !== null || Boolean(process.env.AYATI_MOCK_UPDATE_URL);
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

  if (process.env.AYATI_MOCK_UPDATE_URL) {
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: process.env.AYATI_MOCK_UPDATE_URL,
    });
  }

  updaterConfigured = true;
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
  tray.setToolTip('Ayati - Quran Desktop Companion');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Ayati - Quran Desktop Companion',
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
    { type: 'separator' },
    {
      label: 'Restart Tutorial',
      click: () => {
        tutorialManager.startOver();
      },
    },
    {
      label: 'Reset Onboarding',
      click: () => {
        resetOnboardingState();
        dialog.showMessageBox({
          type: 'info',
          title: 'Onboarding Reset',
          message: 'Onboarding has been reset. Restart Ayati - Quran Desktop Companion to see the onboarding wizard.',
          buttons: ['OK'],
        });
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Ayati - Quran Desktop Companion',
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
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('ayati', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('ayati');
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  if (!url.startsWith('ayati://oauth/callback')) return;
  const targetWindow = assistantWindow && !assistantWindow.isDestroyed() ? assistantWindow : null;
  targetWindow?.webContents.send('ayah-oauth-callback', url);
});

app.whenReady().then(async () => {
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
  tutorialManager.destroy();
});
