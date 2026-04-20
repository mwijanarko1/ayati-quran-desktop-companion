import React, { useState, useEffect, useRef, useCallback } from 'react';
import bodyUrl from '../../../assets/character/body.svg';
import headUrl from '../../../assets/character/head.svg';
import leftHandUrl from '../../../assets/character/left-hand.svg';
import leftWingUrl from '../../../assets/character/left-wing.svg';
import legUrl from '../../../assets/character/leg.svg';
import rightHandUrl from '../../../assets/character/right-hand.svg';
import rightWingUrl from '../../../assets/character/right-wing.svg';
import { TutorialOverlay } from './TutorialOverlay';

type Mood = 'idle' | 'happy' | 'curious' | 'sleeping' | 'thinking' | 'excited' | 'doze' | 'startle' | 'proud' | 'mad' | 'spin' | 'mouth_o';
type IdleBehavior = 'blink' | 'look_around' | 'snip_claws' | 'yawn' | 'stretch' | 'wiggle' | 'wander' | null;

interface ChatMessage {
  id: string;
  text: string;
  content?: string;
  trigger?: 'app_switch' | 'idle' | 'proactive' | 'suggestion';
  quickReplies?: string[];
  reflectionId?: string;
}

const DEFAULT_QUICK_REPLIES = ['Thanks!', 'Tell me more', 'Not now'];
const isSleepMood = (nextMood: Mood): boolean => nextMood === 'sleeping' || nextMood === 'doze';
const WAKE_WINDOW_FLIGHT_DURATION_MS = 1100;
const IDLE_BEHAVIOR_DURATIONS_MS: Record<NonNullable<IdleBehavior>, number> = {
  blink: 400,
  look_around: 2000,
  snip_claws: 1500,
  yawn: 2500,
  stretch: 2000,
  wiggle: 1200,
  wander: 2500,
};
const IDLE_BEHAVIORS = new Set<string>(Object.keys(IDLE_BEHAVIOR_DURATIONS_MS));

const getIdleBehaviorDuration = (idleBehavior: IdleBehavior): number => {
  if (!idleBehavior) return 1500;
  return IDLE_BEHAVIOR_DURATIONS_MS[idleBehavior];
};

const isIdleBehavior = (nextIdleBehavior: string | null | undefined): nextIdleBehavior is NonNullable<IdleBehavior> => (
  Boolean(nextIdleBehavior && IDLE_BEHAVIORS.has(nextIdleBehavior))
);
const shouldReduceMotion = (): boolean => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

// Map internal moods to lobster animation states
const moodToState = (mood: Mood): string => {
  switch (mood) {
    case 'happy':
    case 'excited':
      return 'state-happy';
    case 'curious':
      return 'state-snip';
    case 'sleeping':
      return 'state-sleep';
    case 'doze':
      return 'state-doze';
    case 'startle':
      return 'state-startle';
    case 'proud':
      return 'state-proud';
    case 'mad':
      return 'state-crossed';
    case 'spin':
      return 'state-spin';
    case 'mouth_o':
      return 'state-mouth-o';
    case 'thinking':
      return 'state-worried';
    default:
      return 'state-idle';
  }
};

interface CharacterSvgProps {
  pupilOffset: { x: number; y: number } | null;
}

const CharacterSvg: React.FC<CharacterSvgProps> = ({ pupilOffset }) => (
  <svg viewBox="0 0 128 128" data-testid="ayah-character-pet" aria-hidden="true">

    <g className="left-claw character-left-wing" data-testid="character-left-wing-layer">
      <image className="character-layer" href={leftWingUrl} x="-16" y="44" width="64" height="64" />
    </g>

    <g className="right-claw character-right-wing" data-testid="character-right-wing-layer">
      <image className="character-layer" href={rightWingUrl} x="76" y="44" width="64" height="64" />
    </g>

    <g className="body-group">
      <image
        data-testid="character-leg-layer"
        className="character-layer character-leg-layer"
        href={legUrl}
        x="5"
        y="70"
        width="84"
        height="84"
      />
      <image
        data-testid="character-leg-layer"
        className="character-layer character-leg-layer"
        href={legUrl}
        x="35"
        y="70"
        width="84"
        height="84"
      />
      <image
        data-testid="character-body-layer"
        className="character-layer character-body-layer"
        href={bodyUrl}
        x="0"
        y="10"
        width="128"
        height="128"
      />
      <image
        data-testid="character-head-layer"
        className="character-layer character-head-layer"
        href={headUrl}
        x="0"
        y="-30"
        width="128"
        height="128"
      />

      <g className="face character-face-overlay" transform="translate(-5 -15)">
        <g className="eye-open" data-testid="character-eye-open-layer">
          <ellipse className="character-eye-shell character-eye-shell-left" cx="49" cy="58" rx="8.8" ry="10.2" fill="#173f43" />
          <ellipse className="character-eye-shell character-eye-shell-right" cx="83" cy="58" rx="8.8" ry="10.2" fill="#173f43" />
          <ellipse className="character-eye-glow character-eye-glow-left" cx="49" cy="63.5" rx="6.7" ry="3.6" fill="#8ee5c4" opacity="0.48" />
          <ellipse className="character-eye-glow character-eye-glow-right" cx="83" cy="63.5" rx="6.7" ry="3.6" fill="#8ee5c4" opacity="0.48" />
          <g
            className="pupils character-eye-focus"
            style={pupilOffset ? { transform: `translate(${pupilOffset.x}px, ${pupilOffset.y}px)` } : undefined}
          >
            <g className="character-eye-pupil character-eye-pupil-left">
              <ellipse cx="49" cy="58.6" rx="5.1" ry="6.2" fill="#0d3034" />
              <ellipse className="character-eye-highlight" cx="46.2" cy="54.6" rx="2.5" ry="1.35" fill="#dfffe9" transform="rotate(-32 46.2 54.6)" />
              <ellipse className="character-eye-highlight" cx="52.8" cy="61" rx="1.2" ry="2" fill="#dfffe9" transform="rotate(34 52.8 61)" opacity="0.9" />
            </g>
            <g className="character-eye-pupil character-eye-pupil-right">
              <ellipse cx="83" cy="58.6" rx="5.1" ry="6.2" fill="#0d3034" />
              <ellipse className="character-eye-highlight" cx="80.2" cy="54.6" rx="2.5" ry="1.35" fill="#dfffe9" transform="rotate(-32 80.2 54.6)" />
              <ellipse className="character-eye-highlight" cx="86.8" cy="61" rx="1.2" ry="2" fill="#dfffe9" transform="rotate(34 86.8 61)" opacity="0.9" />
            </g>
          </g>
        </g>
        <g className="eye-closed">
          <path
            d="M 40 57 Q 48 62 56 57"
            fill="none"
            stroke="var(--ink)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M 72 57 Q 80 62 88 57"
            fill="none"
            stroke="var(--ink)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
        <path
          className="mouth-neutral"
          data-testid="character-mouth-neutral-layer"
          d="M 60 68 Q 64 71 68 68"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          className="mouth-mad"
          d="M 59 72 Q 64 68 69 72"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          className="mouth-happy"
          d="M 58 66 Q 64 74 70 66"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle className="mouth-worried" cx="64" cy="70" r="2.5" fill="var(--ink)" />
        <circle className="mouth-o" cx="64" cy="70" r="3.4" fill="var(--ink)" />
      </g>
    </g>

    <g className="character-left-hand-top-layer">
      <image
        data-testid="character-left-hand-layer"
        className="character-layer"
        href={leftHandUrl}
        x="55"
        y="70"
        width="50"
        height="50"
      />
    </g>

    <g className="character-right-hand-top-layer">
      <image
        data-testid="character-right-hand-layer"
        className="character-layer"
        href={rightHandUrl}
        x="20"
        y="70"
        width="50"
        height="50"
      />
    </g>

    <g className="fx-zzz">
      <text x="85" y="40" fill="white" fontWeight="bold" fontSize="14">
        Z
      </text>
      <text x="95" y="25" fill="white" fontWeight="bold" fontSize="10">
        z
      </text>
    </g>
    <g className="fx-sweat">
      <path d="M 35 35 Q 30 45 35 50 Q 40 45 35 35 Z" fill="#87CEFA" opacity="0.8" />
    </g>
    <g className="fx-alert">
      <text x="88" y="32" fill="white" fontWeight="bold" fontSize="18">
        !
      </text>
    </g>
  </svg>
);

export const Pet: React.FC = () => {
  const [mood, setMood] = useState<Mood>('idle');
  const [isWalking, setIsWalking] = useState(false);
  const [idleBehavior, setIdleBehavior] = useState<IdleBehavior>(null);
  const [pupilOffset, setPupilOffset] = useState<{ x: number; y: number } | null>(null);
  const [tutorialActive, setTutorialActive] = useState(false);
  const [transparentWhenSleeping, setTransparentWhenSleeping] = useState(false);
  const [showModeOverlay, setShowModeOverlay] = useState(false);
  const [cameraSnapActive, setCameraSnapActive] = useState(false);
  const [cameraFlashActive, setCameraFlashActive] = useState(false);
  const [wakeWindowFlightActive, setWakeWindowFlightActive] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const didDragRef = useRef(false);
  const idleBehaviorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cameraSnapEndTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cameraFlashOnTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cameraFlashOffTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wakeWindowFlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sleepLockedRef = useRef(false);

  const setPetMood = useCallback((nextMood: Mood) => {
    const sleeping = isSleepMood(nextMood);
    sleepLockedRef.current = sleeping;
    if (sleeping) {
      setIsWalking(false);
      if (idleBehaviorTimeoutRef.current) {
        clearTimeout(idleBehaviorTimeoutRef.current);
        idleBehaviorTimeoutRef.current = null;
      }
      if (wakeWindowFlightTimeoutRef.current) {
        clearTimeout(wakeWindowFlightTimeoutRef.current);
        wakeWindowFlightTimeoutRef.current = null;
      }
      setIdleBehavior(null);
      setWakeWindowFlightActive(false);
    }
    setMood(nextMood);
  }, []);

  const canApplyMoodUpdate = useCallback((nextMood: Mood): boolean => {
    if (!sleepLockedRef.current) return true;
    return nextMood === 'sleeping' || nextMood === 'doze' || nextMood === 'startle' || nextMood === 'idle';
  }, []);

  const playIdleBehavior = useCallback((nextIdleBehavior: IdleBehavior) => {
    if (idleBehaviorTimeoutRef.current) {
      clearTimeout(idleBehaviorTimeoutRef.current);
    }

    setIdleBehavior(nextIdleBehavior);

    idleBehaviorTimeoutRef.current = setTimeout(() => {
      setIdleBehavior(null);
      idleBehaviorTimeoutRef.current = null;
    }, getIdleBehaviorDuration(nextIdleBehavior));
  }, []);

  const playWakeWindowFlight = useCallback(() => {
    if (wakeWindowFlightTimeoutRef.current) {
      clearTimeout(wakeWindowFlightTimeoutRef.current);
    }

    setWakeWindowFlightActive(true);
    if (!shouldReduceMotion()) {
      void window.ayati.playPetWakeFlight().catch((error) => {
        console.warn('[Pet] Failed to play wake window flight:', error);
      });
    }

    wakeWindowFlightTimeoutRef.current = setTimeout(() => {
      setWakeWindowFlightActive(false);
      wakeWindowFlightTimeoutRef.current = null;
    }, WAKE_WINDOW_FLIGHT_DURATION_MS);
  }, []);

  // Cursor tracking for pupils
  useEffect(() => {
    const TRACKING_RANGE = 300;
    const MAX_OFFSET = 3;
    const POLL_MS = 100;
    const PET_SIZE = 120;

    const interval = setInterval(async () => {
      // Only track when idle
      if (mood !== 'idle') {
        setPupilOffset(null);
        return;
      }

      try {
        const [cursor, petPos] = await Promise.all([
          window.ayati.getCursorPosition(),
          window.ayati.getPetPosition(),
        ]);

        const petCenterX = petPos[0] + PET_SIZE / 2;
        const petCenterY = petPos[1] + PET_SIZE / 2;

        const dx = cursor.x - petCenterX;
        const dy = cursor.y - petCenterY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < TRACKING_RANGE && distance > 0) {
          const nx = dx / distance;
          const ny = dy / distance;
          setPupilOffset({
            x: Math.round(nx * MAX_OFFSET * 10) / 10,
            y: Math.round(ny * MAX_OFFSET * 10) / 10,
          });
        } else {
          setPupilOffset(null);
        }
      } catch {
        // IPC failure — fall back to idle animation
        setPupilOffset(null);
      }
    }, POLL_MS);

    return () => clearInterval(interval);
  }, [mood]);

  // Handle mood updates from ClawBot
  useEffect(() => {
    window.ayati.getSettings().then((settings) => {
      const typedSettings = settings as {
        pet?: { transparentWhenSleeping?: boolean };
        dev?: { showPetModeOverlay?: boolean };
      };
      const petSettings = typedSettings.pet;
      const devSettings = typedSettings.dev;
      setTransparentWhenSleeping(Boolean(petSettings?.transparentWhenSleeping));
      setShowModeOverlay(Boolean(devSettings?.showPetModeOverlay));
    });

    window.ayati.onClawbotMood((data: unknown) => {
      const moodData = data as { state: Mood; reason?: string };
      if (!canApplyMoodUpdate(moodData.state)) return;
      setPetMood(moodData.state);
    });

    window.ayati.onPetTransparentSleepChanged((enabled: boolean) => {
      setTransparentWhenSleeping(enabled);
    });
    window.ayati.onDevShowPetModeOverlayChanged((enabled: boolean) => {
      setShowModeOverlay(enabled);
    });

    // Handle chat messages from main process - show in separate window
    window.ayati.onChatPopup((data: unknown) => {
      const messageData = data as ChatMessage;
      const message = {
        id: messageData.id || crypto.randomUUID(),
        text: messageData.text || messageData.content || '',
        quickReplies: messageData.quickReplies || DEFAULT_QUICK_REPLIES,
        reflectionId: messageData.reflectionId,
      };
      window.ayati.showPetChat(message);
      if (!sleepLockedRef.current) {
        setPetMood('curious');
      }
    });

    // Legacy suggestion support - show in separate window
    window.ayati.onClawbotSuggestion((data: unknown) => {
      const suggestionData = data as { text: string; id: string };
      const message = {
        id: suggestionData.id,
        text: suggestionData.text,
        quickReplies: DEFAULT_QUICK_REPLIES,
      };
      window.ayati.showPetChat(message);
    });

    // Handle chat reply reactions
    window.ayati.onPetChatReply((reply: string) => {
      if (sleepLockedRef.current) return;

      if (reply === 'thanks') {
        setPetMood('happy');
        setTimeout(() => {
          if (!sleepLockedRef.current) {
            setPetMood('idle');
          }
        }, 2000);
      } else if (reply === 'thinking') {
        setPetMood('thinking');
      } else if (reply === 'curious') {
        setPetMood('curious');
      } else if (reply === 'dismiss') {
        setPetMood('idle');
      }
    });

    window.ayati.onActivityEvent((event: unknown) => {
      if (sleepLockedRef.current) return;

      const activityEvent = event as { type: string };
      // React to activity - show curiosity briefly
      if (activityEvent.type === 'app_focus_changed') {
        setPetMood('curious');
        setTimeout(() => {
          if (!sleepLockedRef.current) {
            setPetMood('idle');
          }
        }, 3000);
      }
    });

    // Listen for pet movement events
    window.ayati.onPetMoving((data) => {
      if (sleepLockedRef.current) {
        setIsWalking(false);
        return;
      }
      setIsWalking(data.moving);
    });

    window.ayati.onPetCameraSnap((data) => {
      if (sleepLockedRef.current) return;

      const captureAtMs = Math.max(0, data.captureAtMs || 0);
      const durationMs = Math.max(captureAtMs + 80, data.durationMs || 900);
      const flashDurationMs = Math.max(60, data.flashDurationMs || 120);

      if (cameraSnapEndTimeoutRef.current) {
        clearTimeout(cameraSnapEndTimeoutRef.current);
      }
      if (cameraFlashOnTimeoutRef.current) {
        clearTimeout(cameraFlashOnTimeoutRef.current);
      }
      if (cameraFlashOffTimeoutRef.current) {
        clearTimeout(cameraFlashOffTimeoutRef.current);
      }

      setCameraSnapActive(true);
      setCameraFlashActive(false);

      cameraFlashOnTimeoutRef.current = setTimeout(() => {
        setCameraFlashActive(true);
        cameraFlashOffTimeoutRef.current = setTimeout(() => {
          setCameraFlashActive(false);
        }, flashDurationMs);
      }, captureAtMs);

      cameraSnapEndTimeoutRef.current = setTimeout(() => {
        setCameraSnapActive(false);
      }, durationMs);
    });

    // Listen for idle behaviors
    window.ayati.onIdleBehavior((data) => {
      if (sleepLockedRef.current) return;

      const idleData = data as { type?: string; direction?: string };
      if (!isIdleBehavior(idleData.type)) return;
      playIdleBehavior(idleData.type);
    });

    // Listen for tutorial events
    window.ayati.onTutorialStep(() => {
      setTutorialActive(true);
    });

    window.ayati.onTutorialEnded(() => {
      setTutorialActive(false);
    });

    window.ayati.onTutorialResumePrompt(() => {
      setTutorialActive(true);
    });

    return () => {
      if (idleBehaviorTimeoutRef.current) {
        clearTimeout(idleBehaviorTimeoutRef.current);
      }
      if (cameraSnapEndTimeoutRef.current) {
        clearTimeout(cameraSnapEndTimeoutRef.current);
      }
      if (cameraFlashOnTimeoutRef.current) {
        clearTimeout(cameraFlashOnTimeoutRef.current);
      }
      if (cameraFlashOffTimeoutRef.current) {
        clearTimeout(cameraFlashOffTimeoutRef.current);
      }
      if (wakeWindowFlightTimeoutRef.current) {
        clearTimeout(wakeWindowFlightTimeoutRef.current);
      }
      window.ayati.removeAllListeners();
    };
  }, [canApplyMoodUpdate, playIdleBehavior, setPetMood]);

  const isSleepTransparent = transparentWhenSleeping && (mood === 'sleeping' || mood === 'doze');
  const shouldShowModeOverlay = import.meta.env.DEV && showModeOverlay;
  const currentMode = wakeWindowFlightActive ? 'wake-window-flight' : isWalking ? 'walking' : idleBehavior ? `idle:${idleBehavior}` : `mood:${mood}`;

  // Handle dragging - use document-level events to track fast mouse movements
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    didDragRef.current = false;
    dragStart.current = { x: e.screenX, y: e.screenY };

    const handleDocumentMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;

      const deltaX = moveEvent.screenX - dragStart.current.x;
      const deltaY = moveEvent.screenY - dragStart.current.y;

      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        didDragRef.current = true;
      }

      if (didDragRef.current) {
        window.ayati.dragPet(deltaX, deltaY);
        dragStart.current = { x: moveEvent.screenX, y: moveEvent.screenY };
      }
    };

    const handleDocumentMouseUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      document.removeEventListener('mouseup', handleDocumentMouseUp);
    };

    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('mouseup', handleDocumentMouseUp);
  }, []);

  // Poke reactions - random animations when clicked
  const pokeReactions: Array<{ mood?: Mood; behavior?: IdleBehavior; duration: number }> = [
    // Happy reactions
    { mood: 'happy', duration: 1500 },
    { mood: 'excited', duration: 1500 },
    { mood: 'proud', duration: 1800 },      // feeling smug
    { mood: 'spin', duration: 1000 },       // celebratory spin!
    // Curious/playful
    { mood: 'curious', duration: 1200 },
    { behavior: 'snip_claws', duration: 1500 },
    { behavior: 'wiggle', duration: 1200 },
    // Surprised reactions
    { mood: 'startle', duration: 1200 },    // startled by the poke
    // Annoyed/grumpy reactions
    { mood: 'thinking', duration: 1500 },   // worried/annoyed face
    { mood: 'mad', duration: 1500 },        // arms crossed, annoyed
    { behavior: 'yawn', duration: 2500 },   // bored yawn
    // Neutral
    { behavior: 'stretch', duration: 2000 },
    { behavior: 'look_around', duration: 2000 },
    { behavior: 'blink', duration: 400 },
  ];

  // Single click = poke animation
  const handleClick = useCallback(() => {
    if (didDragRef.current) return;

    // Notify tutorial if active
    if (tutorialActive) {
      window.ayati.tutorialPetClicked();
    }

    if (sleepLockedRef.current) {
      setPetMood('idle');
      playWakeWindowFlight();
      window.ayati.petClicked?.();
      return;
    }

    // Pick a random reaction
    const reaction = pokeReactions[Math.floor(Math.random() * pokeReactions.length)];

    if (reaction.mood) {
      setPetMood(reaction.mood);
      setTimeout(() => {
        if (!sleepLockedRef.current) {
          setPetMood('idle');
        }
      }, reaction.duration);
    } else if (reaction.behavior) {
      setIdleBehavior(reaction.behavior);
      setTimeout(() => {
        if (!sleepLockedRef.current) {
          setIdleBehavior(null);
        }
      }, reaction.duration);
    }

    // Notify main process (optional - for sound effects or other reactions)
    window.ayati.petClicked?.();
  }, [playWakeWindowFlight, setPetMood, tutorialActive]);

  // Right click = open custom context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (!didDragRef.current) {
      window.ayati.petClicked?.();
      window.ayati.showPetContextMenu(e.screenX, e.screenY);
    }
  }, []);

  return (
    <div
      className={`pet-container ${tutorialActive ? 'tutorial-active' : ''} ${cameraFlashActive ? 'camera-flash-active' : ''}`}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {shouldShowModeOverlay && (
        <div className="pet-mode-overlay">{currentMode}</div>
      )}

      {/* Animated companion pet */}
      <div
        data-testid="ayah-character-shell"
        className={`lobster-container ${moodToState(mood)} ${isWalking ? 'state-walking' : ''} ${idleBehavior ? `idle-${idleBehavior}` : ''} ${pupilOffset ? 'tracking-cursor' : ''} ${isSleepTransparent ? 'sleep-transparent' : ''} ${cameraSnapActive ? 'action-camera-snap' : ''} ${wakeWindowFlightActive ? 'wake-window-flight' : ''}`}
      >
        <CharacterSvg pupilOffset={pupilOffset} />
        <div className="camera-prop" aria-hidden="true">
          <span className="camera-shutter" />
          <span className="camera-lens" />
        </div>
      </div>
      <div className="camera-flash-overlay" aria-hidden="true" />

      {/* Tutorial Overlay */}
      <TutorialOverlay />
    </div>
  );
};
