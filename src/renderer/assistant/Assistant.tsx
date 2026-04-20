import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from '@iconify/react';
import { LinkifyText } from '../components/LinkifyText';
import { MarkdownMessage } from '../components/MarkdownMessage';
import { HotkeyInput } from '../components/HotkeyInput';
import { GatewayConnectionBanner } from '../components/GatewayConnectionBanner';
import { GatewaySetupModal } from '../components/GatewaySetupModal';
import { AiProviderSettingsFields } from '../components/AiProviderSettingsFields';
import {
  DEFAULT_AI_PROVIDER,
  getAiProviderConfig,
  type ClawBotProvider,
} from '../aiProviderDefaults';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface ActivityEvent {
  type: string;
  app?: string;
  title?: string;
  path?: string;
  filename?: string;
  at: number;
}

type Tab = 'chat' | 'reflections' | 'activity' | 'updates' | 'settings';
type UpdateAction = 'check' | 'download' | 'install';

const isDevEnvironment = import.meta.env.DEV;
const SCROLL_TO_BOTTOM_THRESHOLD = 140;
const QURAN_GUIDANCE_PROMPT = 'What Quranic guidance should I keep in mind for what I do next?';
const DAY_REFLECTION_PROMPT = 'Summarize my day through Quranic reminders and practical next steps.';

function getUpdateAction(state: DesktopUpdateState | null): UpdateAction {
  if (state?.status === 'available') return 'download';
  if (state?.status === 'downloaded') return 'install';
  return 'check';
}

function getUpdateStatusLabel(state: DesktopUpdateState | null): string {
  if (!state) return 'Loading update status...';
  if (!state.enabled) return 'Updates unavailable';
  if (state.status === 'idle') return 'Ready to check';
  if (state.status === 'checking') return 'Checking for updates...';
  if (state.status === 'up-to-date') return 'Up to date';
  if (state.status === 'available') return `Version ${state.availableVersion ?? 'new'} is available`;
  if (state.status === 'downloading') {
    const percent = typeof state.downloadPercent === 'number'
      ? ` (${Math.floor(state.downloadPercent)}%)`
      : '';
    return `Downloading update${percent}`;
  }
  if (state.status === 'downloaded') return `Version ${state.downloadedVersion ?? 'new'} is ready`;
  return 'Update check failed';
}

function getUpdateButtonLabel(state: DesktopUpdateState | null): string {
  const action = getUpdateAction(state);
  if (action === 'download') return 'Download Update';
  if (action === 'install') return 'Restart and Install';
  if (state?.status === 'checking') return 'Checking...';
  return 'Check for Updates';
}

function isUpdateButtonDisabled(state: DesktopUpdateState | null): boolean {
  if (!state || !state.enabled) return true;
  return state.status === 'checking' || state.status === 'downloading';
}

function shouldShowUpdateBadge(state: DesktopUpdateState | null): boolean {
  return state?.status === 'available' || state?.status === 'downloaded' || state?.status === 'downloading';
}

export const Assistant: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeStreamMessageId, setActiveStreamMessageId] = useState<string | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityEvent[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<{ connected: boolean; error: string | null; gatewayUrl: string }>({
    connected: false,
    error: null,
    gatewayUrl: '',
  });
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [ayahSettings, setAyahSettings] = useState<AyahLensSettings | null>(null);
  const [quranAuthStatus, setQuranAuthStatus] = useState<QuranAuthStatus>({ isConnected: false, scopes: [] });
  const [reflections, setReflections] = useState<AyahReflection[]>([]);
  const [collections, setCollections] = useState<AyahCollection[]>([]);
  const [streakSummary, setStreakSummary] = useState<QuranStreakSummary | null>(null);
  const [daySummary, setDaySummary] = useState<AyahDaySummary | null>(null);
  const [reflectionSearch, setReflectionSearch] = useState('');
  const [reflectionStatusFilter, setReflectionStatusFilter] = useState<'all' | 'saved' | 'pending'>('all');
  const [reflectionThemeFilter, setReflectionThemeFilter] = useState<'all' | AyahTheme>('all');
  const [reflectionFeedbackFilter, setReflectionFeedbackFilter] = useState<'all' | 'relevant' | 'not_relevant'>('all');
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [updateState, setUpdateState] = useState<DesktopUpdateState | null>(null);
  const [updateStatusMessage, setUpdateStatusMessage] = useState('');
  const [oauthCallbackUrl, setOauthCallbackUrl] = useState('');
  const [quranStatusMessage, setQuranStatusMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const activeStreamRequestIdRef = useRef<string | null>(null);
  const activeStreamMessageIdRef = useRef<string | null>(null);
  const chatScrollTopRef = useRef(0);
  const chatShouldAutoScrollRef = useRef(true);
  const hasInitializedChatScrollRef = useRef(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (typeof messagesEndRef.current?.scrollIntoView !== 'function') return;
    messagesEndRef.current.scrollIntoView({ behavior });
  }, []);

  const updateScrollState = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const isAboveThreshold = distanceFromBottom > SCROLL_TO_BOTTOM_THRESHOLD;

    chatScrollTopRef.current = container.scrollTop;
    chatShouldAutoScrollRef.current = !isAboveThreshold;
    setShowScrollToBottom(isAboveThreshold);
  }, []);

  const persistChatScrollPosition = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    chatScrollTopRef.current = container.scrollTop;
    chatShouldAutoScrollRef.current = distanceFromBottom <= SCROLL_TO_BOTTOM_THRESHOLD;
  }, []);

  const switchTab = useCallback((nextTab: Tab) => {
    setActiveTab((currentTab) => {
      if (currentTab === nextTab) return currentTab;
      if (currentTab === 'chat') {
        persistChatScrollPosition();
      }
      return nextTab;
    });
  }, [persistChatScrollPosition]);

  const handleMessagesScroll = useCallback(() => {
    updateScrollState();
  }, [updateScrollState]);

  const handleScrollToBottomClick = useCallback(() => {
    scrollToBottom('smooth');
    setShowScrollToBottom(false);
    setTimeout(() => {
      updateScrollState();
    }, 0);
  }, [scrollToBottom, updateScrollState]);

  // Initialize
  useEffect(() => {
    window.ayati.getSettings().then((s) => {
      setSettings(s as Record<string, unknown>);
    });
    window.ayati.getAyahLensSettings().then(setAyahSettings);
    window.ayati.getQuranAuthStatus().then(setQuranAuthStatus);
    window.ayati.getAyahReflectionHistory().then(setReflections);
    window.ayati.getAyahCollections?.().then(setCollections);
    window.ayati.getQuranStreakSummary?.().then(setStreakSummary);
    window.ayati.getAyahDaySummary?.().then(setDaySummary);
    window.ayati.getUpdateState().then(setUpdateState);

    window.ayati.getChatHistory().then((history) => {
      if (Array.isArray(history) && history.length > 0) {
        setMessages(history as Message[]);
        // Scroll to bottom immediately after loading history
        setTimeout(() => {
          scrollToBottom('auto');
          updateScrollState();
        }, 0);
      }
    });

    window.ayati.getClawbotStatus().then(setConnectionStatus);

    // Listen for connection status changes
    window.ayati.onConnectionStatusChange(setConnectionStatus);
    window.ayati.onUpdateState(setUpdateState);
    window.ayati.onAyahOAuthCallback((callbackUrl) => {
      window.ayati.completeQuranOAuthCallback(callbackUrl).then((status) => {
        setQuranAuthStatus(status);
        setQuranStatusMessage(status.error ?? 'Quran Foundation account connected.');
      });
    });

    window.ayati.onActivityEvent((event: unknown) => {
      const activityEvent = event as ActivityEvent;
      setActivityLog((prev) => [...prev.slice(-49), activityEvent]);
    });

    window.ayati.onClawbotSuggestion((data: unknown) => {
      const suggestion = data as { text: string };
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: suggestion.text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    });

    window.ayati.onCronResult((data) => {
      const cronMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `[${data.jobName}] ${data.summary}`,
        timestamp: data.timestamp,
      };
      setMessages((prev) => [...prev, cronMsg]);
    });

    window.ayati.onCronError((data) => {
      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: 'system',
        content: `[Cron Error: ${data.jobName}] ${data.error}`,
        timestamp: data.timestamp,
      };
      setMessages((prev) => [...prev, errorMsg]);
    });

    window.ayati.onClawbotStreamChunk((data) => {
      if (data.requestId !== activeStreamRequestIdRef.current) return;
      const messageId = activeStreamMessageIdRef.current;
      if (!messageId) return;

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, content: data.text }
            : msg
        )
      );
    });

    window.ayati.onClawbotStreamEnd((data) => {
      if (data.requestId !== activeStreamRequestIdRef.current) return;
      const response = data.response as {
        text?: string;
        action?: { type: string; payload: unknown };
      };

      const messageId = activeStreamMessageIdRef.current;
      if (messageId) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId
              ? { ...msg, content: response.text || msg.content || 'No response' }
              : msg
          )
        );
      }

      if (response.action?.type === 'open_url' && response.action.payload) {
        window.ayati.openExternal(response.action.payload as string);
      }

      activeStreamRequestIdRef.current = null;
      activeStreamMessageIdRef.current = null;
      setActiveStreamMessageId(null);
      setIsLoading(false);
    });

    window.ayati.onClawbotStreamError((data) => {
      if (data.requestId !== activeStreamRequestIdRef.current) return;
      const messageId = activeStreamMessageIdRef.current;
      if (messageId) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId
              ? { ...msg, content: `Failed to stream response: ${data.error}` }
              : msg
          )
        );
      }

      activeStreamRequestIdRef.current = null;
      activeStreamMessageIdRef.current = null;
      setActiveStreamMessageId(null);
      setIsLoading(false);
    });

    window.ayati.onChatSync(() => {
      const shouldAutoScroll = chatShouldAutoScrollRef.current;
      const savedScrollTop = chatScrollTopRef.current;
      window.ayati.getChatHistory().then((history) => {
        if (Array.isArray(history)) {
          setMessages(history as Message[]);
          setTimeout(() => {
            const container = messagesContainerRef.current;
            if (!container) return;

            if (shouldAutoScroll) {
              scrollToBottom('auto');
            } else {
              const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
              container.scrollTop = Math.min(savedScrollTop, maxScrollTop);
            }
            updateScrollState();
          }, 0);
        }
      });
    });

    window.ayati.onSwitchToChat(() => {
      switchTab('chat');
    });

    window.ayati.onSwitchToSettings(() => {
      switchTab('settings');
    });

    return () => {
      window.ayati.removeAllListeners();
    };
  }, [scrollToBottom, switchTab, updateScrollState]);

  useEffect(() => {
    if (activeTab !== 'chat') return;
    const timer = setTimeout(() => {
      const container = messagesContainerRef.current;
      if (!container) return;

      if (hasInitializedChatScrollRef.current) {
        const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
        container.scrollTop = Math.min(chatScrollTopRef.current, maxScrollTop);
      } else {
        hasInitializedChatScrollRef.current = true;
      }

      updateScrollState();
    }, 0);

    return () => clearTimeout(timer);
  }, [activeTab, updateScrollState]);

  useEffect(() => {
    if (activeTab !== 'chat') return;
    const timer = setTimeout(() => {
      if (chatShouldAutoScrollRef.current) {
        scrollToBottom('auto');
      } else {
        const container = messagesContainerRef.current;
        if (!container) return;
        const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
        container.scrollTop = Math.min(chatScrollTopRef.current, maxScrollTop);
      }
      updateScrollState();
    }, 0);

    return () => clearTimeout(timer);
  }, [messages, activeTab, scrollToBottom, updateScrollState]);

  useEffect(() => {
    if (messages.length > 0) {
      window.ayati.saveChatHistory(messages);
    }
  }, [messages]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    const prompt = input.trim();

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
    };

    const streamingAssistantMessageId = crypto.randomUUID();
    const assistantPlaceholder: Message = {
      id: streamingAssistantMessageId,
      role: 'assistant',
      content: '...',
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
    setInput('');
    setIsLoading(true);
    setActiveStreamMessageId(streamingAssistantMessageId);
    activeStreamMessageIdRef.current = streamingAssistantMessageId;

    try {
      const started = await window.ayati.startClawbotStream(prompt);
      if (!started.requestId || started.error) {
        throw new Error(started.error || 'Failed to start stream');
      }

      activeStreamRequestIdRef.current = started.requestId;
      return;
    } catch {
      try {
        const response = (await window.ayati.sendToClawbot(prompt)) as {
          text?: string;
          action?: { type: string; payload: unknown };
        };

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === streamingAssistantMessageId
              ? { ...msg, content: response.text || 'No response' }
              : msg
          )
        );

        if (response.action?.type === 'open_url' && response.action.payload) {
          window.ayati.openExternal(response.action.payload as string);
        }
      } catch {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === streamingAssistantMessageId
              ? { ...msg, content: 'Failed to get response from ClawBot' }
              : msg
          )
        );
      } finally {
        activeStreamRequestIdRef.current = null;
        activeStreamMessageIdRef.current = null;
        setActiveStreamMessageId(null);
        setIsLoading(false);
      }
    }
  }, [input, isLoading]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  const captureScreen = useCallback(async () => {
    // Check permission first - if denied, show message
    const permissionStatus = await window.ayati.getScreenCapturePermission();
    if (permissionStatus === 'denied' || permissionStatus === 'restricted') {
      alert('Screen recording permission required. Please enable in System Settings > Privacy & Security > Screen Recording');
      return;
    }

    setIsLoading(true);
    try {
      const screenshot = await window.ayati.captureScreen();
      if (screenshot) {
        const userMessage: Message = {
          id: crypto.randomUUID(),
          role: 'user',
          content: '[Screen captured - analyzing...]',
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, userMessage]);

        const response = (await window.ayati.askAboutScreen(
          'What is on my screen right now? Give me a short, practical summary and one helpful next step.',
          screenshot
        )) as { text?: string; response?: string; error?: string };

        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response.response || response.text || response.error || 'Could not analyze screen',
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateSetting = useCallback(async (key: string, value: unknown) => {
    const newSettings = await window.ayati.updateSettings(key, value);
    setSettings(newSettings as Record<string, unknown>);
  }, []);

  const updateAyahSetting = useCallback(async (key: string, value: unknown) => {
    const nextSettings = await window.ayati.updateAyahLensSetting(key, value);
    setAyahSettings(nextSettings);
  }, []);

  const handleUpdateAction = useCallback(async () => {
    if (isUpdateButtonDisabled(updateState)) return;

    const action = getUpdateAction(updateState);
    try {
      if (action === 'download') {
        const result = await window.ayati.downloadUpdate();
        setUpdateState(result.state);
        setUpdateStatusMessage(
          result.completed
            ? 'Update downloaded. Restart Ayati - Quran Desktop Companion to install it.'
            : result.state.message ?? 'Could not start the update download.',
        );
        return;
      }

      if (action === 'install') {
        const confirmed = confirm('Restart Ayati - Quran Desktop Companion now to install the downloaded update?');
        if (!confirmed) return;
        const result = await window.ayati.installUpdate();
        setUpdateState(result.state);
        if (!result.accepted && result.state.message) {
          setUpdateStatusMessage(result.state.message);
        }
        return;
      }

      const result = await window.ayati.checkForUpdate();
      setUpdateState(result.state);
      setUpdateStatusMessage(
        result.checked
          ? getUpdateStatusLabel(result.state)
          : result.state.message ?? 'Automatic updates are not available in this build.',
      );
    } catch (error) {
      setUpdateStatusMessage(error instanceof Error ? error.message : 'Update action failed.');
    }
  }, [updateState]);

  const refreshReflections = useCallback(async () => {
    const [nextReflections, nextSummary, nextStreak] = await Promise.all([
      window.ayati.getAyahReflectionHistory(),
      window.ayati.getAyahDaySummary(),
      window.ayati.getQuranStreakSummary(),
    ]);
    setReflections(nextReflections);
    setDaySummary(nextSummary);
    setStreakSummary(nextStreak);
  }, []);

  const reflectOnScreen = useCallback(async () => {
    const permissionStatus = await window.ayati.getScreenCapturePermission();
    if (permissionStatus === 'denied' || permissionStatus === 'restricted') {
      alert('Screen recording permission required. Please enable in System Settings > Privacy & Security > Screen Recording');
      return;
    }

    setIsLoading(true);
    try {
      const nextReflection = await window.ayati.captureAyahReflection();
      await refreshReflections();
      switchTab('reflections');
      setQuranStatusMessage(`New reflection: ${nextReflection.surahName} ${nextReflection.verseKey}`);
    } finally {
      setIsLoading(false);
    }
  }, [refreshReflections, switchTab]);

  const saveReflectionFromPanel = useCallback(async (reflectionId: string) => {
    const savedReflection = await window.ayati.saveAyahReflection(reflectionId);
    if (savedReflection) {
      await refreshReflections();
      setQuranStatusMessage(
        savedReflection.syncState === 'synced'
          ? 'Bookmark synced with Quran Foundation.'
          : 'Reflection saved locally. Sign in to sync bookmarks.',
      );
    }
  }, [refreshReflections]);

  const loadReflectionTafsir = useCallback(async (reflectionId: string) => {
    await window.ayati.getAyahTafsir(reflectionId);
    await refreshReflections();
  }, [refreshReflections]);

  const loadReflectionAudio = useCallback(async (reflectionId: string) => {
    await window.ayati.getAyahAudio(reflectionId);
    await refreshReflections();
  }, [refreshReflections]);

  const saveReflectionNoteFromPanel = useCallback(async (reflectionId: string) => {
    const body = noteDrafts[reflectionId]?.trim() ?? '';
    if (body.length < 6) return;
    await window.ayati.saveAyahReflectionNote(reflectionId, body);
    await refreshReflections();
    setQuranStatusMessage('Reflection note saved.');
  }, [noteDrafts, refreshReflections]);

  const addReflectionToCollectionFromPanel = useCallback(async (reflectionId: string, collectionId: string) => {
    await window.ayati.addReflectionToCollection(reflectionId, collectionId);
    await refreshReflections();
    setQuranStatusMessage('Collection updated.');
  }, [refreshReflections]);

  const createCollectionFromPanel = useCallback(async () => {
    const collection = await window.ayati.createAyahCollection('Ayati Reflections');
    setCollections(await window.ayati.getAyahCollections());
    setQuranStatusMessage(`Collection ready: ${collection.name}`);
  }, []);

  const setReflectionFeedbackFromPanel = useCallback(async (
    reflectionId: string,
    value: 'relevant' | 'not_relevant',
  ) => {
    await window.ayati.setReflectionFeedback(reflectionId, value);
    await refreshReflections();
  }, [refreshReflections]);

  const showAlternateFromPanel = useCallback(async (reflectionId: string) => {
    const alternate = await window.ayati.showAlternateAyah(reflectionId);
    await refreshReflections();
    setQuranStatusMessage(
      alternate
        ? `Another ayah: ${alternate.surahName} ${alternate.verseKey}`
        : 'No stronger alternate ayah is available for this reflection.',
    );
  }, [refreshReflections]);

  const copyShareCardFromPanel = useCallback(async (reflectionId: string) => {
    const copied = await window.ayati.copyReflectionShareCard(reflectionId);
    setQuranStatusMessage(copied ? 'Share card copied.' : 'Could not copy this reflection.');
  }, []);

  const startQuranSignIn = useCallback(async () => {
    try {
      const { authorizeUrl } = await window.ayati.startQuranOAuth();
      window.ayati.openExternal(authorizeUrl);
      setQuranStatusMessage('Complete sign-in in your browser, then paste the callback URL if the app does not finish automatically.');
    } catch {
      setQuranStatusMessage('Quran Foundation client ID is not configured.');
    }
  }, []);

  const completeQuranSignIn = useCallback(async () => {
    if (!oauthCallbackUrl.trim()) return;
    const status = await window.ayati.completeQuranOAuthCallback(oauthCallbackUrl.trim());
    setQuranAuthStatus(status);
    setOauthCallbackUrl('');
    setQuranStatusMessage(status.error ?? 'Quran Foundation account connected.');
  }, [oauthCallbackUrl]);

  const disconnectQuran = useCallback(async () => {
    await window.ayati.disconnectQuranAccount();
    setQuranAuthStatus(await window.ayati.getQuranAuthStatus());
    setQuranStatusMessage('Quran Foundation account disconnected. Local reflections remain on this device.');
  }, []);

  const closeWindow = useCallback(() => {
    window.ayati.closeAssistant();
  }, []);

  const formatActivityType = (type: string) => {
    switch (type) {
      case 'app_focus_changed':
        return 'App Switched';
      case 'file_modified':
        return 'File Saved';
      case 'screen_capture':
        return 'Screen Captured';
      default:
        return type;
    }
  };

  const AyatiIcon = ({ size = 18 }: { size?: number }) => (
    <svg viewBox="0 0 128 128" width={size} height={size}>
      <rect x="18" y="18" width="92" height="92" rx="24" fill="#0A1914" stroke="#67E0A3" strokeOpacity="0.35" strokeWidth="4" />
      <path d="M39 64C48 44 80 44 89 64C80 84 48 84 39 64Z" fill="#67E0A3" fillOpacity="0.14" stroke="#67E0A3" strokeWidth="5" strokeLinejoin="round" />
      <circle cx="64" cy="64" r="13" fill="#AFF9C9" fillOpacity="0.22" stroke="#AFF9C9" strokeWidth="4" />
      <path d="M53 91H75" stroke="#7CF0BD" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );

  const clawbotSettings = settings.clawbot as {
    url?: string;
    token?: string;
    provider?: ClawBotProvider;
    model?: string;
  } | undefined;
  const aiProvider = clawbotSettings?.provider ?? DEFAULT_AI_PROVIDER;
  const handleAiProviderChange = (nextProvider: ClawBotProvider) => {
    const nextConfig = getAiProviderConfig(nextProvider);
    updateSetting('clawbot.provider', nextProvider);
    updateSetting('clawbot.url', nextConfig.baseUrl);
    updateSetting('clawbot.model', nextConfig.defaultModel);
    updateSetting('clawbot.token', '');
  };

  const availableThemes = Array.from(
    new Set(reflections.flatMap((reflection) => reflection.themes.map((theme) => theme.id))),
  );
  const filteredReflections = reflections.filter((reflection) => {
    const query = reflectionSearch.trim().toLowerCase();
    const matchesQuery = !query || [
      reflection.verseKey,
      reflection.surahName,
      reflection.translation,
      reflection.reflection,
      reflection.note?.body ?? '',
    ].join(' ').toLowerCase().includes(query);
    const matchesStatus = reflectionStatusFilter === 'all'
      || (reflectionStatusFilter === 'saved' && Boolean(reflection.savedAt))
      || (reflectionStatusFilter === 'pending' && (reflection.syncState === 'pending' || reflection.note?.syncState === 'pending'));
    const matchesTheme = reflectionThemeFilter === 'all'
      || reflection.themes.some((theme) => theme.id === reflectionThemeFilter);
    const matchesFeedback = reflectionFeedbackFilter === 'all'
      || reflection.feedback?.value === reflectionFeedbackFilter;
    return matchesQuery && matchesStatus && matchesTheme && matchesFeedback;
  });

  return (
    <div className="flex flex-col h-screen bg-[#0f0f0f] text-neutral-200 overflow-hidden">
      {/* Header */}
      <div className="h-12 border-b border-white/5 flex items-center justify-between px-4 select-none shrink-0 bg-[#0f0f0f] drag-region">
        <div className="flex items-center gap-2.5">
          <AyatiIcon size={18} />
          <span className="min-w-0 truncate text-sm font-medium tracking-tight text-white" title="Ayati - Quran Desktop Companion">
            Ayati - Quran Desktop Companion
          </span>
          <button
            className="no-drag relative flex items-center justify-center ml-1 cursor-pointer"
            onClick={() => !connectionStatus.connected && setShowSetupModal(true)}
            title={connectionStatus.connected ? 'Connected to gateway' : 'Gateway disconnected - Click for setup'}
          >
            <div className={`w-2 h-2 rounded-full ${connectionStatus.connected ? 'bg-[#7CF0BD] status-pulse' : 'bg-red-400'}`}></div>
          </button>
        </div>
        <button
          className="no-drag text-neutral-500 hover:text-white transition-colors flex items-center justify-center w-6 h-6"
          onClick={closeWindow}
        >
          <Icon icon="solar:close-circle-linear" className="text-lg" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex px-2 border-b border-white/5 shrink-0 bg-[#0f0f0f] overflow-x-auto scrollbar-hide">
        <button
          onClick={() => switchTab('chat')}
          className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'chat'
              ? 'text-[#67E0A3] border-[#67E0A3]'
              : 'text-neutral-500 border-transparent hover:text-neutral-300'
          }`}
        >
          Chat
        </button>
        <button
          onClick={() => switchTab('reflections')}
          className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'reflections'
              ? 'text-[#67E0A3] border-[#67E0A3]'
              : 'text-neutral-500 border-transparent hover:text-neutral-300'
          }`}
        >
          Reflections
        </button>
        <button
          onClick={() => switchTab('activity')}
          className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'activity'
              ? 'text-[#67E0A3] border-[#67E0A3]'
              : 'text-neutral-500 border-transparent hover:text-neutral-300'
          }`}
        >
          Activity
        </button>
        <button
          onClick={() => switchTab('updates')}
          className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors inline-flex items-center gap-1.5 ${
            activeTab === 'updates'
              ? 'text-[#67E0A3] border-[#67E0A3]'
              : 'text-neutral-500 border-transparent hover:text-neutral-300'
          }`}
        >
          Updates
          {shouldShowUpdateBadge(updateState) && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#67E0A3]" aria-hidden="true" />
          )}
        </button>
        <button
          onClick={() => switchTab('settings')}
          className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'settings'
              ? 'text-[#67E0A3] border-[#67E0A3]'
              : 'text-neutral-500 border-transparent hover:text-neutral-300'
          }`}
        >
          Settings
        </button>
      </div>

      {/* Connection Banner */}
      {activeTab === 'chat' && (
        <GatewayConnectionBanner
          connected={connectionStatus.connected}
          error={connectionStatus.error}
          onShowSetupGuide={() => setShowSetupModal(true)}
        />
      )}

      {/* CONTENT: Chat */}
      {activeTab === 'chat' && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Messages */}
          <div className="relative flex-1 min-h-0">
            <div
              ref={messagesContainerRef}
              onScroll={handleMessagesScroll}
              className="h-full overflow-y-auto p-4 space-y-5 scrollbar-hide flex flex-col"
            >
              {messages.length === 0 && (
                <div className="text-center text-neutral-500 py-10">
                  <p className="mb-2">Capture your screen for a Quran-focused reflection.</p>
                  <p>Use chat for connection help or open Reflections for recent ayahs.</p>
                </div>
              )}
              {messages.map((msg) => (
                <React.Fragment key={msg.id}>
                  {msg.role === 'assistant' && (
                    <div className="max-w-[85%] mr-auto">
                      <div className="bg-[#67E0A3]/10 border border-[#67E0A3]/20 text-neutral-200 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed">
                        <MarkdownMessage content={msg.content} />
                      </div>
                    </div>
                  )}
                  {msg.role === 'user' && (
                    <div className="max-w-[85%] ml-auto">
                      <div className="bg-white/10 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed border border-white/5">
                        <LinkifyText text={msg.content} />
                      </div>
                    </div>
                  )}
                  {msg.role === 'system' && (
                    <div className="text-center">
                      <span className="text-xs text-neutral-500 bg-white/5 px-2 py-1 rounded-full">
                        {msg.content}
                      </span>
                    </div>
                  )}
                </React.Fragment>
              ))}
              {isLoading && !activeStreamMessageId && (
                <div className="max-w-[85%] mr-auto">
                  <div className="bg-[#67E0A3]/5 border border-[#67E0A3]/10 text-neutral-400 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#67E0A3] typing-dot"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-[#67E0A3] typing-dot"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-[#67E0A3] typing-dot"></div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            {showScrollToBottom && (
              <button
                onClick={handleScrollToBottomClick}
                className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-[#0a0a0a]/95 border border-white/15 text-neutral-300 hover:text-white hover:border-white/30 transition-colors flex items-center justify-center shadow-lg"
                title="Scroll to bottom"
              >
                <Icon icon="solar:arrow-down-linear" className="text-base" />
              </button>
            )}
          </div>

          {/* Quick Actions */}
          <div className="px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-hide shrink-0">
            <button
              onClick={reflectOnScreen}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 bg-neutral-900 hover:bg-neutral-800 text-xs text-neutral-300 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Icon icon="solar:camera-linear" className="text-neutral-500" />
              Find Relevant Ayah
            </button>
            <button
              onClick={() => setInput(QURAN_GUIDANCE_PROMPT)}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 bg-neutral-900 hover:bg-neutral-800 text-xs text-neutral-300 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Icon icon="solar:clipboard-list-linear" className="text-neutral-500" />
              Quran Guidance
            </button>
            <button
              onClick={() => setInput(DAY_REFLECTION_PROMPT)}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 bg-neutral-900 hover:bg-neutral-800 text-xs text-neutral-300 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Icon icon="solar:chart-square-linear" className="text-neutral-500" />
              Day Reflection
            </button>
          </div>

          {/* Input */}
          <div className="p-3 bg-[#0a0a0a] border-t border-white/5 shrink-0 flex gap-2 items-end">
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask Ayati - Quran Desktop Companion anything..."
              disabled={isLoading}
              className="flex-1 bg-neutral-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-neutral-200 outline-none focus:border-[#67E0A3] focus:ring-1 focus:ring-[#67E0A3]/30 transition-all resize-none min-h-[44px] max-h-[120px] scrollbar-hide disabled:opacity-50 cursor-text"
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              className="w-[44px] h-[44px] rounded-xl bg-white/10 text-neutral-400 flex items-center justify-center shrink-0 border border-white/5 transition-all hover:bg-[#67E0A3] hover:text-black hover:border-[#67E0A3] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white/10 disabled:hover:text-neutral-400 disabled:hover:border-white/5"
            >
              <Icon icon="solar:arrow-up-linear" className="text-lg" />
            </button>
          </div>
        </div>
      )}

      {/* CONTENT: Reflections */}
      {activeTab === 'reflections' && (
        <div className="flex-1 flex flex-col overflow-y-auto p-4 scrollbar-hide">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Recent Reflections</h2>
              <p className="text-xs text-neutral-500 mt-1">Screenshots stay transient; only text summaries are saved.</p>
            </div>
            <button
              onClick={reflectOnScreen}
              disabled={isLoading}
              className="px-3 py-2 bg-[#67E0A3] text-[#07120f] rounded-md text-xs font-semibold disabled:opacity-60"
            >
              Reflect on Screen
            </button>
          </div>

          {quranStatusMessage && (
            <div className="mb-3 text-xs text-[#67E0A3] bg-[#67E0A3]/10 border border-[#67E0A3]/25 rounded-md px-3 py-2">
              {quranStatusMessage}
            </div>
          )}

          <section className="mb-4 grid gap-3 border border-white/10 rounded-md p-3 bg-white/[0.03]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold text-white">Day Recap</h3>
                <p className="text-[11px] text-neutral-500">
                  {daySummary
                    ? `${daySummary.reflectionCount} reflections, ${daySummary.savedCount} saved, ${daySummary.noteCount} notes today`
                    : 'No day summary loaded yet.'}
                </p>
              </div>
              <div className="text-right text-[11px] text-neutral-400">
                <p>Quran streak: {streakSummary?.currentDays ?? 0} days</p>
                <p className={streakSummary?.syncState === 'synced' ? 'text-[#67E0A3]' : 'text-neutral-500'}>
                  {streakSummary?.syncState === 'synced' ? 'Today recorded' : 'Pending Quran Foundation'}
                </p>
              </div>
            </div>
            {daySummary && daySummary.themes.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {daySummary.themes.map((theme) => (
                  <span key={theme.id} className="text-[11px] px-2 py-1 rounded-md border border-white/10 text-neutral-300">
                    {theme.id} {theme.count}
                  </span>
                ))}
              </div>
            )}
          </section>

          <div className="mb-4 grid gap-2">
            <input
              type="search"
              aria-label="Search reflections"
              value={reflectionSearch}
              onChange={(event) => setReflectionSearch(event.target.value)}
              placeholder="Search reflections..."
              className="w-full bg-[#0a0a0a] border border-white/10 rounded-md px-3 py-2 text-sm text-neutral-200 outline-none focus:border-[#67E0A3]"
            />
            <div className="grid grid-cols-3 gap-2">
              <select
                aria-label="Saved status filter"
                value={reflectionStatusFilter}
                onChange={(event) => setReflectionStatusFilter(event.target.value as typeof reflectionStatusFilter)}
                className="bg-[#0a0a0a] border border-white/10 rounded-md px-2 py-2 text-xs text-neutral-300"
              >
                <option value="all">All</option>
                <option value="saved">Saved</option>
                <option value="pending">Pending</option>
              </select>
              <select
                aria-label="Theme filter"
                value={reflectionThemeFilter}
                onChange={(event) => setReflectionThemeFilter(event.target.value as typeof reflectionThemeFilter)}
                className="bg-[#0a0a0a] border border-white/10 rounded-md px-2 py-2 text-xs text-neutral-300"
              >
                <option value="all">All Themes</option>
                {availableThemes.map((theme) => (
                  <option key={theme} value={theme}>{theme}</option>
                ))}
              </select>
              <select
                aria-label="Feedback filter"
                value={reflectionFeedbackFilter}
                onChange={(event) => setReflectionFeedbackFilter(event.target.value as typeof reflectionFeedbackFilter)}
                className="bg-[#0a0a0a] border border-white/10 rounded-md px-2 py-2 text-xs text-neutral-300"
              >
                <option value="all">All Feedback</option>
                <option value="relevant">Relevant</option>
                <option value="not_relevant">Not Relevant</option>
              </select>
            </div>
          </div>

          {reflections.length === 0 ? (
            <div className="text-center text-neutral-500 py-12 border border-white/10 rounded-md">
              <p className="mb-2 text-neutral-300">No reflections yet.</p>
              <p>Capture your screen to receive a Quran-focused reminder.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredReflections.map((reflection) => (
                <article key={reflection.id} className="border-t border-white/10 pt-4">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="text-xs font-semibold text-[#67E0A3]">
                      {reflection.surahName} {reflection.verseKey}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-neutral-500">
                      {reflection.syncState}
                    </span>
                  </div>
                  <p dir="rtl" lang="ar" translate="no" className="text-right text-2xl leading-loose text-white font-serif">
                    {reflection.arabicText}
                  </p>
                  <p translate="no" className="text-sm leading-relaxed text-neutral-200 mt-2">
                    {reflection.translation}
                  </p>
                  <p className="text-xs leading-relaxed text-neutral-500 mt-3">
                    {reflection.whyThisVerse}
                  </p>
                  {reflection.tafsir && (
                    <p className="text-xs leading-relaxed text-neutral-400 mt-3 border-l border-[#67E0A3]/40 pl-3">
                      <span className="text-[#AFF9C9]">Tafsir:</span> {reflection.tafsir.text}
                    </p>
                  )}
                  {reflection.audio?.url && (
                    <audio aria-label={`Recitation for ${reflection.verseKey}`} controls src={reflection.audio.url} className="mt-3 w-full" />
                  )}
                  <textarea
                    aria-label={`Note for ${reflection.verseKey}`}
                    value={noteDrafts[reflection.id] ?? reflection.note?.body ?? ''}
                    onChange={(event) => setNoteDrafts((current) => ({ ...current, [reflection.id]: event.target.value }))}
                    placeholder="Add a short note..."
                    className="mt-3 w-full bg-[#0a0a0a] border border-white/10 rounded-md px-3 py-2 text-xs text-neutral-200 outline-none focus:border-[#67E0A3]"
                    rows={2}
                  />
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button
                      onClick={() => saveReflectionFromPanel(reflection.id)}
                      className="px-3 py-1.5 border border-white/10 rounded-md text-xs text-neutral-300 hover:border-[#67E0A3]/70"
                    >
                      {reflection.savedAt ? 'Sync Bookmark' : 'Save Bookmark'}
                    </button>
                    <button
                      onClick={() => loadReflectionTafsir(reflection.id)}
                      className="px-3 py-1.5 border border-white/10 rounded-md text-xs text-neutral-300 hover:border-[#67E0A3]/70"
                    >
                      Load Tafsir
                    </button>
                    <button
                      onClick={() => loadReflectionAudio(reflection.id)}
                      className="px-3 py-1.5 border border-white/10 rounded-md text-xs text-neutral-300 hover:border-[#67E0A3]/70"
                    >
                      Load Recitation
                    </button>
                    <button
                      onClick={() => saveReflectionNoteFromPanel(reflection.id)}
                      className="px-3 py-1.5 border border-white/10 rounded-md text-xs text-neutral-300 hover:border-[#67E0A3]/70"
                    >
                      Save Note
                    </button>
                    <select
                      aria-label={`Collection for ${reflection.verseKey}`}
                      defaultValue=""
                      onChange={(event) => {
                        if (event.target.value) void addReflectionToCollectionFromPanel(reflection.id, event.target.value);
                      }}
                      className="bg-[#0a0a0a] border border-white/10 rounded-md px-2 py-1.5 text-xs text-neutral-300"
                    >
                      <option value="">Save To Collection</option>
                      {collections.map((collection) => (
                        <option key={collection.id} value={collection.id}>{collection.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={createCollectionFromPanel}
                      className="px-3 py-1.5 border border-white/10 rounded-md text-xs text-neutral-300 hover:border-[#67E0A3]/70"
                    >
                      Create Collection
                    </button>
                    <button
                      onClick={() => setReflectionFeedbackFromPanel(reflection.id, 'relevant')}
                      className="px-3 py-1.5 border border-white/10 rounded-md text-xs text-neutral-300 hover:border-[#67E0A3]/70"
                    >
                      Relevant
                    </button>
                    <button
                      onClick={() => setReflectionFeedbackFromPanel(reflection.id, 'not_relevant')}
                      className="px-3 py-1.5 border border-white/10 rounded-md text-xs text-neutral-300 hover:border-[#67E0A3]/70"
                    >
                      Not Relevant
                    </button>
                    <button
                      onClick={() => showAlternateFromPanel(reflection.id)}
                      className="px-3 py-1.5 border border-white/10 rounded-md text-xs text-neutral-300 hover:border-[#67E0A3]/70"
                    >
                      Show Another Ayah
                    </button>
                    <button
                      onClick={() => copyShareCardFromPanel(reflection.id)}
                      className="px-3 py-1.5 border border-white/10 rounded-md text-xs text-neutral-300 hover:border-[#67E0A3]/70"
                    >
                      Copy Share Card
                    </button>
                    <button
                      onClick={async () => {
                        await window.ayati.deleteAyahReflection(reflection.id);
                        await refreshReflections();
                      }}
                      className="px-3 py-1.5 border border-white/10 rounded-md text-xs text-neutral-500 hover:text-neutral-300"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
              {filteredReflections.length === 0 && (
                <p className="text-center text-neutral-500 py-8">No reflections match these filters.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* CONTENT: Activity */}
      {activeTab === 'activity' && (
        <div className="flex-1 flex flex-col overflow-y-auto p-4 scrollbar-hide">
          {activityLog.length === 0 && (
            <div className="text-center text-neutral-500 py-10">
              <p className="mb-2">No activity recorded yet.</p>
              <p>Switch apps or modify files to see events.</p>
            </div>
          )}
          {[...activityLog].reverse().map((event, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-3 border-b border-white/5"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-neutral-300">
                  {formatActivityType(event.type)}
                </span>
                <span className="text-[11px] font-mono text-neutral-500">
                  {event.app || event.filename || event.path}
                </span>
              </div>
              <span className="text-[11px] text-neutral-600">
                {new Date(event.at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* CONTENT: Updates */}
      {activeTab === 'updates' && (
        <div className="flex-1 flex flex-col overflow-y-auto p-5 space-y-5 scrollbar-hide">
          <div>
            <h2 className="text-sm font-semibold text-white">Updates</h2>
            <p className="text-xs text-neutral-500 mt-1">
              Keep Ayati - Quran Desktop Companion current without leaving the assistant.
            </p>
          </div>

          <div className="border border-white/10 rounded-lg p-4 bg-white/[0.03]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-200">{getUpdateStatusLabel(updateState)}</p>
                <p className="text-[11px] text-neutral-500 mt-1">
                  Current version {updateState?.currentVersion ?? 'unknown'}
                </p>
              </div>
              <span
                className={`shrink-0 mt-1 w-2 h-2 rounded-full ${
                  updateState?.status === 'available' || updateState?.status === 'downloaded'
                    ? 'bg-[#67E0A3]'
                    : updateState?.status === 'error'
                      ? 'bg-red-400'
                      : 'bg-neutral-600'
                }`}
                aria-hidden="true"
              />
            </div>

            {typeof updateState?.downloadPercent === 'number' && updateState.status === 'downloading' && (
              <div className="mt-4 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#67E0A3] transition-[width]"
                  style={{ width: `${Math.max(0, Math.min(100, updateState.downloadPercent))}%` }}
                />
              </div>
            )}

            {updateState?.message && (
              <p className="text-xs leading-relaxed text-neutral-400 mt-3">{updateState.message}</p>
            )}

            {updateStatusMessage && (
              <p className="text-xs leading-relaxed text-[#67E0A3] mt-3">{updateStatusMessage}</p>
            )}

            {updateState?.checkedAt && (
              <p className="text-[11px] text-neutral-600 mt-3">
                Last checked {new Date(updateState.checkedAt).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}

            {updateState?.runningUnderArm64Translation && (
              <p className="text-xs leading-relaxed text-amber-300 mt-3">
                This Mac is running the Intel build under Rosetta. The next compatible update can move you to the native Apple Silicon build.
              </p>
            )}
          </div>

          <button
            onClick={handleUpdateAction}
            disabled={isUpdateButtonDisabled(updateState)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-[#67E0A3] text-[#07120f] rounded-md text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icon
              icon={getUpdateAction(updateState) === 'install' ? 'solar:restart-linear' : 'solar:download-linear'}
              className="text-base"
            />
            {getUpdateButtonLabel(updateState)}
          </button>
        </div>
      )}

      {/* CONTENT: Settings */}
      {activeTab === 'settings' && (
        <div className="flex-1 flex flex-col overflow-y-auto p-5 space-y-6 scrollbar-hide">
          {/* Group 1: AI Provider */}
          <div>
            <h3 className="text-[10px] font-medium text-neutral-500 uppercase tracking-widest mb-3">
              AI Provider
            </h3>
            <AiProviderSettingsFields
              idPrefix="assistant-ai-provider"
              provider={aiProvider}
              baseUrl={clawbotSettings?.url || ''}
              model={clawbotSettings?.model || ''}
              apiKey={clawbotSettings?.token || ''}
              onProviderChange={handleAiProviderChange}
              onBaseUrlChange={(value) => updateSetting('clawbot.url', value)}
              onModelChange={(value) => updateSetting('clawbot.model', value)}
              onApiKeyChange={(value) => updateSetting('clawbot.token', value)}
            />
          </div>

          <div className="pt-4 border-t border-white/5">
            <h3 className="text-[10px] font-medium text-neutral-500 uppercase tracking-widest mb-3">
              Quran Reminders
            </h3>
            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex flex-col pr-4">
                  <span className="text-sm font-medium text-neutral-300">
                    Timer Quran Reminders
                  </span>
                  <span className="text-[11px] text-neutral-500 mt-0.5">
                    Show a Quran reminder on the interval you choose
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={ayahSettings?.timedReminders ?? false}
                    onChange={(event) => updateAyahSetting('timedReminders', event.target.checked)}
                  />
                  <div className="w-9 h-5 bg-neutral-800 rounded-full peer-checked:bg-[#67E0A3] transition-colors border border-white/5"></div>
                  <div className="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-4 shadow-sm"></div>
                </div>
              </label>

              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex flex-col pr-4">
                  <span className="text-sm font-medium text-neutral-300">
                    App Switch Quran Nudges
                  </span>
                  <span className="text-[11px] text-neutral-500 mt-0.5">
                    Show Quran-linked reminders only when app context is clear
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={ayahSettings?.contextualNudges ?? true}
                    onChange={(event) => updateAyahSetting('contextualNudges', event.target.checked)}
                  />
                  <div className="w-9 h-5 bg-neutral-800 rounded-full peer-checked:bg-[#67E0A3] transition-colors border border-white/5"></div>
                  <div className="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-4 shadow-sm"></div>
                </div>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-medium text-neutral-300 mb-1.5">Timer Minutes</span>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    list="timed-reminder-options"
                    value={ayahSettings?.timedReminderMinutes ?? 15}
                    onChange={(event) => updateAyahSetting('timedReminderMinutes', Number(event.target.value))}
                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-sm text-neutral-200 outline-none focus:border-[#67E0A3] focus:ring-1 focus:ring-[#67E0A3]/30 transition-all"
                  />
                  <datalist id="timed-reminder-options">
                    <option value="5" />
                    <option value="10" />
                    <option value="15" />
                    <option value="20" />
                    <option value="60" />
                  </datalist>
                  <span className="mt-1 block text-[11px] text-neutral-500">
                    Use 5, 10, 15, 20, 60, or any minute interval.
                  </span>
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-neutral-300 mb-1.5">Cooldown Minutes</span>
                  <input
                    type="number"
                    min={1}
                    max={240}
                    value={ayahSettings?.nudgeCooldownMinutes ?? 15}
                    onChange={(event) => updateAyahSetting('nudgeCooldownMinutes', Number(event.target.value))}
                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-sm text-neutral-200 outline-none focus:border-[#67E0A3] focus:ring-1 focus:ring-[#67E0A3]/30 transition-all"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-neutral-300 mb-1.5">Max Per Day</span>
                  <input
                    type="number"
                    min={1}
                    max={48}
                    value={ayahSettings?.maxNudgesPerDay ?? 8}
                    onChange={(event) => updateAyahSetting('maxNudgesPerDay', Number(event.target.value))}
                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-sm text-neutral-200 outline-none focus:border-[#67E0A3] focus:ring-1 focus:ring-[#67E0A3]/30 transition-all"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Group 2: Watching */}
          <div className="pt-4 border-t border-white/5">
            <h3 className="text-[10px] font-medium text-neutral-500 uppercase tracking-widest mb-3">
              Watching
            </h3>
            <div className="space-y-4">
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-sm font-medium text-neutral-300">
                  Watch active app changes
                </span>
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={(settings.watch as { activeApp: boolean })?.activeApp ?? true}
                    onChange={(e) => updateSetting('watch.activeApp', e.target.checked)}
                  />
                  <div className="w-9 h-5 bg-neutral-800 rounded-full peer-checked:bg-[#67E0A3] transition-colors border border-white/5"></div>
                  <div className="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-4 shadow-sm"></div>
                </div>
              </label>
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-sm font-medium text-neutral-300">
                  Include window titles
                </span>
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={(settings.watch as { sendWindowTitles: boolean })?.sendWindowTitles ?? false}
                    onChange={(e) => updateSetting('watch.sendWindowTitles', e.target.checked)}
                  />
                  <div className="w-9 h-5 bg-neutral-800 rounded-full peer-checked:bg-[#67E0A3] transition-colors border border-white/5"></div>
                  <div className="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-4 shadow-sm"></div>
                </div>
              </label>
            </div>
          </div>

          {/* Group 3: Companion Behavior */}
          <div className="pt-4 border-t border-white/5">
            <h3 className="text-[10px] font-medium text-neutral-500 uppercase tracking-widest mb-3">
              Companion Behavior
            </h3>
            <div className="space-y-4">
              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-neutral-300">
                    Seek attention
                  </span>
                  <span className="text-[11px] text-neutral-500 mt-0.5">
                    Move toward cursor periodically
                  </span>
                </div>
                <div className="relative shrink-0">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={(settings.pet as { attentionSeeker: boolean })?.attentionSeeker ?? true}
                    onChange={(e) => updateSetting('pet.attentionSeeker', e.target.checked)}
                  />
                  <div className="w-9 h-5 bg-neutral-800 rounded-full peer-checked:bg-[#67E0A3] transition-colors border border-white/5"></div>
                  <div className="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-4 shadow-sm"></div>
                </div>
              </label>
              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-neutral-300">
                    Transparent while asleep
                  </span>
                  <span className="text-[11px] text-neutral-500 mt-0.5">
                    Fade Ayati - Quran Desktop Companion when in doze/sleep state
                  </span>
                </div>
                <div className="relative shrink-0">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={(settings.pet as { transparentWhenSleeping?: boolean })?.transparentWhenSleeping ?? false}
                    onChange={(e) => updateSetting('pet.transparentWhenSleeping', e.target.checked)}
                  />
                  <div className="w-9 h-5 bg-neutral-800 rounded-full peer-checked:bg-[#67E0A3] transition-colors border border-white/5"></div>
                  <div className="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-4 shadow-sm"></div>
                </div>
              </label>
            </div>
          </div>

          {/* Group 4: Keyboard Shortcuts */}
          <div className="pt-4 border-t border-white/5">
            <h3 className="text-[10px] font-medium text-neutral-500 uppercase tracking-widest mb-3">
              Keyboard Shortcuts
            </h3>
            <div className="space-y-1 divide-y divide-white/5">
              <HotkeyInput
                label="Open Chat"
                description="Summon the quick chat bar"
                value={(settings.hotkeys as { openChat?: string })?.openChat || 'CommandOrControl+Alt+,'}
                onChange={(value) => updateSetting('hotkeys.openChat', value)}
              />
              <HotkeyInput
                label="Open Assistant"
                description="Open the full assistant panel"
                value={(settings.hotkeys as { openAssistant?: string })?.openAssistant || 'CommandOrControl+Alt+.'}
                onChange={(value) => updateSetting('hotkeys.openAssistant', value)}
              />
              <HotkeyInput
                label="Reflect on Screen"
                description="Capture your screen and receive a fitting ayah"
                value={(settings.hotkeys as { captureScreen?: string })?.captureScreen || 'CommandOrControl+Alt+/'}
                onChange={(value) => updateSetting('hotkeys.captureScreen', value)}
              />
            </div>
          </div>

          <div className="pt-4 border-t border-white/5">
            <h3 className="text-[10px] font-medium text-neutral-500 uppercase tracking-widest mb-3">
              Quran Foundation
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-neutral-300">
                    {quranAuthStatus.isConnected ? 'Connected' : 'Not connected'}
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    {quranAuthStatus.userName ?? 'Sign in to sync bookmarks with Quran Foundation.'}
                  </p>
                </div>
                {quranAuthStatus.isConnected ? (
                  <button
                    onClick={disconnectQuran}
                    className="px-3 py-2 bg-white/5 border border-white/10 rounded-md hover:bg-white/10 text-xs font-medium text-neutral-300"
                  >
                    Sign Out
                  </button>
                ) : (
                  <button
                    onClick={startQuranSignIn}
                    className="px-3 py-2 bg-[#67E0A3] text-[#07120f] rounded-md text-xs font-semibold"
                  >
                    Sign In
                  </button>
                )}
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-neutral-300">
                  Manual callback URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={oauthCallbackUrl}
                    onChange={(event) => setOauthCallbackUrl(event.target.value)}
                    placeholder="ayati://oauth/callback?code=..."
                    className="min-w-0 flex-1 bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-xs text-neutral-200 outline-none focus:border-[#67E0A3] focus:ring-1 focus:ring-[#67E0A3]/30 transition-all"
                  />
                  <button
                    onClick={completeQuranSignIn}
                    className="px-3 py-2 bg-white/5 border border-white/10 rounded-md hover:bg-white/10 text-xs font-medium text-neutral-300"
                  >
                    Complete
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-medium text-neutral-300 mb-1.5">Translation ID</span>
                  <input
                    type="number"
                    min={1}
                    value={ayahSettings?.translationId ?? 20}
                    onChange={(event) => updateAyahSetting('translationId', Number(event.target.value))}
                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-sm text-neutral-200 outline-none focus:border-[#67E0A3] focus:ring-1 focus:ring-[#67E0A3]/30 transition-all"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-neutral-300 mb-1.5">Mushaf ID</span>
                  <input
                    type="number"
                    min={1}
                    value={ayahSettings?.mushafId ?? 4}
                    onChange={(event) => updateAyahSetting('mushafId', Number(event.target.value))}
                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-sm text-neutral-200 outline-none focus:border-[#67E0A3] focus:ring-1 focus:ring-[#67E0A3]/30 transition-all"
                  />
                </label>
              </div>

              <p className="text-[11px] leading-relaxed text-neutral-500">
                Ayati - Quran Desktop Companion deletes screenshot data after analysis. Translation text from Quran Foundation is displayed as returned and is not re-translated.
              </p>
              {quranStatusMessage && <p className="text-[11px] text-[#67E0A3]">{quranStatusMessage}</p>}
            </div>
          </div>

          {/* Group 5: Developer */}
          <div className="pt-4 border-t border-white/5">
            <h3 className="text-[10px] font-medium text-neutral-500 uppercase tracking-widest mb-3">
              Developer
            </h3>
            <div className="space-y-3">
              {isDevEnvironment && (
                <label className="flex items-center justify-between cursor-pointer group px-1">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-neutral-300">
                      Show window borders
                    </span>
                    <span className="text-[11px] text-neutral-500 mt-0.5">
                      Draw debug outlines around window bounds
                    </span>
                  </div>
                  <div className="relative shrink-0">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={(settings.dev as { windowBorders?: boolean })?.windowBorders ?? false}
                      onChange={(e) => updateSetting('dev.windowBorders', e.target.checked)}
                    />
                    <div className="w-9 h-5 bg-neutral-800 rounded-full peer-checked:bg-[#67E0A3] transition-colors border border-white/5"></div>
                    <div className="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-4 shadow-sm"></div>
                  </div>
                </label>
              )}
              {isDevEnvironment && (
                <label className="flex items-center justify-between cursor-pointer group px-1">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-neutral-300">
                      Show companion mode overlay
                    </span>
                    <span className="text-[11px] text-neutral-500 mt-0.5">
                      Display current mode text above Ayati - Quran Desktop Companion
                    </span>
                  </div>
                  <div className="relative shrink-0">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={(settings.dev as { showPetModeOverlay?: boolean })?.showPetModeOverlay ?? false}
                      onChange={(e) => updateSetting('dev.showPetModeOverlay', e.target.checked)}
                    />
                    <div className="w-9 h-5 bg-neutral-800 rounded-full peer-checked:bg-[#67E0A3] transition-colors border border-white/5"></div>
                    <div className="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-4 shadow-sm"></div>
                  </div>
                </label>
              )}
              {isDevEnvironment && (
                <div className="space-y-2">
                  <div className="px-1">
                    <span className="text-sm font-medium text-neutral-300">
                      Force companion state
                    </span>
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      Instantly set Ayati - Quran Desktop Companion's current mood state
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      'idle',
                      'happy',
                      'curious',
                      'thinking',
                      'excited',
                      'doze',
                      'sleeping',
                      'startle',
                      'proud',
                      'mad',
                      'spin',
                      'mouth_o',
                    ].map((mood) => (
                      <button
                        key={mood}
                        onClick={() => {
                          window.ayati.executePetAction({ type: 'set_mood', value: mood });
                        }}
                        className="px-2.5 py-2 bg-white/5 border border-white/10 rounded-md hover:bg-white/10 text-xs font-medium text-neutral-300 transition-colors"
                      >
                        {mood}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {isDevEnvironment && (
                <button
                  onClick={() => {
                    void window.ayati.forceActiveAppComment();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <Icon icon="solar:monitor-smartphone-linear" className="text-neutral-400 group-hover:text-neutral-300" />
                    <span className="text-sm font-medium text-neutral-300">Test Active App Comment</span>
                  </div>
                  <span className="text-[10px] text-neutral-500">Dev action</span>
                </button>
              )}
              {isDevEnvironment && (
                <button
                  onClick={() => {
                    void window.ayati.forceTimedReminderComment();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <Icon icon="solar:bell-bing-linear" className="text-neutral-400 group-hover:text-neutral-300" />
                    <span className="text-sm font-medium text-neutral-300">Test Reminder Comment</span>
                  </div>
                  <span className="text-[10px] text-neutral-500">Dev action</span>
                </button>
              )}
              {isDevEnvironment && (
                <button
                  onClick={() => {
                    window.ayati.forcePetSleep();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <Icon icon="solar:sleeping-linear" className="text-neutral-400 group-hover:text-neutral-300" />
                    <span className="text-sm font-medium text-neutral-300">Set Ayati - Quran Desktop Companion to Sleep</span>
                  </div>
                  <span className="text-[10px] text-neutral-500">Dev action</span>
                </button>
              )}
              <button
                onClick={() => {
                  window.ayati.replayTutorial();
                  window.ayati.closeAssistant();
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <Icon icon="solar:play-circle-linear" className="text-neutral-400 group-hover:text-neutral-300" />
                  <span className="text-sm font-medium text-neutral-300">Replay Tutorial</span>
                </div>
                <span className="text-[10px] text-neutral-500">Interactive guide</span>
              </button>
              <button
                onClick={() => {
                  if (confirm('This will reset onboarding and restart the app. Continue?')) {
                    window.ayati.resetOnboarding();
                  }
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <Icon icon="solar:restart-linear" className="text-neutral-400 group-hover:text-neutral-300" />
                  <span className="text-sm font-medium text-neutral-300">Reset Onboarding</span>
                </div>
                <span className="text-[10px] text-neutral-500">Restart required</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gateway Setup Modal */}
      <GatewaySetupModal
        isOpen={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        onCheckConnection={async () => {
          const status = await window.ayati.getClawbotStatus();
          setConnectionStatus(status);
          if (status.connected) {
            setShowSetupModal(false);
          }
        }}
      />
    </div>
  );
};
