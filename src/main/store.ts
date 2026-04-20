import Store from 'electron-store';
import type { AyahLensState } from './ayah-types';
import { createDefaultAyahLensState } from './ayah-reflection-store';
import {
  DEFAULT_AI_PROVIDER,
  DEFAULT_OPENROUTER_BASE_URL,
  DEFAULT_OPENROUTER_MODEL,
  getDefaultOpenRouterToken,
} from './ai-provider-defaults';
import { DEFAULT_HOTKEYS } from './hotkeys';
import type { ClawBotProvider } from './ai-providers';

const LEGACY_OPENCLAW_BASE_URL = 'http://127.0.0.1:18789';
const PREVIOUS_OPENROUTER_DEFAULT_MODELS = new Set(['minimax/minimax-m2.5:free']);

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface OnboardingState {
  completed: boolean;
  skipped: boolean;
  workspaceType: 'ayati' | null;
  ayatiWorkspacePath: string | null;
  memoryMigrated: boolean;
}

interface TutorialState {
  version: number;
  completedAt: string | null;  // ISO timestamp
  wasInterrupted: boolean;     // For resume prompt
  lastStep: number;
}

interface StoreSchema {
  clawbot: {
    url: string;
    token: string;
    provider: ClawBotProvider;
    model: string;
  };
  watch: {
    activeApp: boolean;
    sendWindowTitles: boolean;
    folders: string[];
  };
  pet: {
    position: { x: number; y: number } | null;
    mood: string;
    attentionSeeker: boolean;
    transparentWhenSleeping: boolean;
  };
  screenCapture: {
    enabled: boolean;
    autoAnalyze: boolean;
  };
  hotkeys: {
    openChat: string;
    captureScreen: string;
    openAssistant: string;
  };
  chatHistory: ChatMessage[];
  onboarding: OnboardingState;
  tutorial: TutorialState;
  dev: {
    windowBorders: boolean;
    showPetModeOverlay: boolean;
  };
  ayahLens: AyahLensState;
}

interface StoreAccessor {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
}

export function createDefaultStoreSchema(): StoreSchema {
  return {
    clawbot: {
      url: DEFAULT_OPENROUTER_BASE_URL,
      token: getDefaultOpenRouterToken(),
      provider: DEFAULT_AI_PROVIDER,
      model: DEFAULT_OPENROUTER_MODEL,
    },
    watch: {
      activeApp: true,
      sendWindowTitles: true,
      folders: [],
    },
    pet: {
      position: null,
      mood: 'idle',
      attentionSeeker: true,
      transparentWhenSleeping: false,
    },
    screenCapture: {
      enabled: false,
      autoAnalyze: false,
    },
    hotkeys: {
      openChat: DEFAULT_HOTKEYS.openChat,
      captureScreen: DEFAULT_HOTKEYS.captureScreen,
      openAssistant: DEFAULT_HOTKEYS.openAssistant,
    },
    chatHistory: [],
    onboarding: {
      completed: false,
      skipped: false,
      workspaceType: null,
      ayatiWorkspacePath: null,
      memoryMigrated: false,
    },
    tutorial: {
      version: 1,
      completedAt: null,
      wasInterrupted: false,
      lastStep: 0,
    },
    dev: {
      windowBorders: false,
      showPetModeOverlay: false,
    },
    ayahLens: createDefaultAyahLensState(),
  };
}

export function migrateLegacyClawBotDefaults(store: StoreAccessor): void {
  const clawbotUrl = store.get('clawbot.url');
  const clawbotProvider = store.get('clawbot.provider');
  const clawbotModel = store.get('clawbot.model');
  const hasLegacyBaseUrl = clawbotUrl === LEGACY_OPENCLAW_BASE_URL;
  const hasLegacyProvider = clawbotProvider === 'openclaw';
  const hasPriorOpenRouterDefaults =
    clawbotProvider === 'openai-compatible' &&
    clawbotUrl === DEFAULT_OPENROUTER_BASE_URL &&
    (clawbotModel === DEFAULT_OPENROUTER_MODEL ||
      PREVIOUS_OPENROUTER_DEFAULT_MODELS.has(String(clawbotModel)));
  const hasPreviousOpenRouterDefaultModel =
    clawbotProvider === DEFAULT_AI_PROVIDER &&
    clawbotUrl === DEFAULT_OPENROUTER_BASE_URL &&
    PREVIOUS_OPENROUTER_DEFAULT_MODELS.has(String(clawbotModel));

  if (hasPreviousOpenRouterDefaultModel) {
    store.set('clawbot.model', DEFAULT_OPENROUTER_MODEL);
    return;
  }

  if (!hasLegacyBaseUrl && !hasLegacyProvider && !hasPriorOpenRouterDefaults) {
    return;
  }

  store.set('clawbot.url', DEFAULT_OPENROUTER_BASE_URL);
  store.set('clawbot.token', getDefaultOpenRouterToken());
  store.set('clawbot.provider', DEFAULT_AI_PROVIDER);
  store.set('clawbot.model', DEFAULT_OPENROUTER_MODEL);
}

export function createStore(): Store<StoreSchema> {
  const store = new Store<StoreSchema>({
    defaults: createDefaultStoreSchema(),
    name: 'ayati-config',
  });

  migrateLegacyClawBotDefaults(store);
  return store;
}

export type { StoreSchema, OnboardingState, TutorialState };
