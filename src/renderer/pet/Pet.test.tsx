import { readFileSync } from 'node:fs';
import path from 'node:path';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Pet } from './Pet';

function getCssRuleBody(styles: string, selectorStart: string): string {
  const selectorIndex = styles.indexOf(selectorStart);
  if (selectorIndex === -1) {
    throw new Error(`Missing CSS selector: ${selectorStart}`);
  }

  const openBraceIndex = styles.indexOf('{', selectorIndex);
  const closeBraceIndex = styles.indexOf('}', openBraceIndex);
  return styles.slice(openBraceIndex + 1, closeBraceIndex);
}

function installMockAyati(): {
  ayati: Partial<Window['ayati']>;
  sendMood: (data: { state: string; reason?: string }) => void;
  sendIdleBehavior: (data: { type: string; direction?: string }) => void;
} {
  let moodHandler: (data: { state: string; reason?: string }) => void = () => {};
  let idleBehaviorHandler: (data: { type: string; direction?: string }) => void = () => {};
  const ayati = {
    getSettings: vi.fn().mockResolvedValue({
      pet: { transparentWhenSleeping: false },
      dev: { showPetModeOverlay: false },
    }),
    getCursorPosition: vi.fn().mockResolvedValue({ x: 0, y: 0 }),
    getPetPosition: vi.fn().mockResolvedValue([0, 0]),
    dragPet: vi.fn(),
    playPetWakeFlight: vi.fn().mockResolvedValue(undefined),
    showPetChat: vi.fn(),
    showPetContextMenu: vi.fn(),
    petClicked: vi.fn(),
    tutorialPetClicked: vi.fn(),
    removeAllListeners: vi.fn(),
    onClawbotMood: vi.fn((callback: (data: { state: string; reason?: string }) => void) => {
      moodHandler = callback;
    }),
    onPetTransparentSleepChanged: vi.fn(),
    onDevShowPetModeOverlayChanged: vi.fn(),
    onChatPopup: vi.fn(),
    onClawbotSuggestion: vi.fn(),
    onPetChatReply: vi.fn(),
    onActivityEvent: vi.fn(),
    onPetMoving: vi.fn(),
    onPetCameraSnap: vi.fn(),
    onIdleBehavior: vi.fn((callback: (data: { type: string; direction?: string }) => void) => {
      idleBehaviorHandler = callback;
    }),
    onTutorialStep: vi.fn(),
    onTutorialEnded: vi.fn(),
    onTutorialResumePrompt: vi.fn(),
    onTutorialHint: vi.fn(),
  } satisfies Partial<Window['ayati']>;

  Object.defineProperty(window, 'ayati', {
    configurable: true,
    writable: true,
    value: ayati,
  });

  return {
    ayati,
    sendMood: (data) => moodHandler(data),
    sendIdleBehavior: (data) => idleBehaviorHandler(data),
  };
}

describe('Pet', () => {
  beforeEach(() => {
    installMockAyati();
  });

  it('renders the Ayati - Quran Desktop Companion character as animated asset layers', () => {
    render(<Pet />);

    const character = screen.getByTestId('ayah-character-pet');

    expect(character).toBeInTheDocument();
    expect(screen.getAllByTestId('character-leg-layer')).toHaveLength(2);
    expect(screen.getByTestId('character-body-layer')).toBeInTheDocument();
    expect(screen.getByTestId('character-head-layer')).toBeInTheDocument();
  });

  it('renders wings behind the body so they can flap from the body', () => {
    render(<Pet />);

    const body = screen.getByTestId('character-body-layer');
    const leftWing = screen.getByTestId('character-left-wing-layer');
    const rightWing = screen.getByTestId('character-right-wing-layer');

    expect(Boolean(leftWing.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(Boolean(rightWing.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it('renders the face features over the character head', () => {
    render(<Pet />);

    const head = screen.getByTestId('character-head-layer');
    const openEyes = screen.getByTestId('character-eye-open-layer');
    const mouth = screen.getByTestId('character-mouth-neutral-layer');

    expect(Boolean(head.compareDocumentPosition(openEyes) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(Boolean(head.compareDocumentPosition(mouth) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it('draws open eyes as glossy dark ovals with tracked pupils', () => {
    render(<Pet />);

    const openEyes = screen.getByTestId('character-eye-open-layer');
    const focusGroup = openEyes.querySelector('.character-eye-focus');
    const eyeShells = openEyes.querySelectorAll('.character-eye-shell');

    expect(eyeShells).toHaveLength(2);
    eyeShells.forEach((eye) => {
      expect(eye.tagName.toLowerCase()).toBe('ellipse');
      expect(eye).toHaveAttribute('fill', '#173f43');
      expect(Number(eye.getAttribute('ry'))).toBeGreaterThan(Number(eye.getAttribute('rx')));
    });
    expect(openEyes.querySelectorAll('.character-eye-glow')).toHaveLength(2);
    expect(focusGroup?.querySelectorAll('.character-eye-pupil')).toHaveLength(2);
    expect(focusGroup?.querySelectorAll('.character-eye-highlight')).toHaveLength(4);
    expect(focusGroup?.querySelector('.character-eye-shell')).toBeNull();
  });

  it('tracks the dark pupils instead of the fixed eye shells', () => {
    render(<Pet />);

    const openEyes = screen.getByTestId('character-eye-open-layer');
    const focusGroup = openEyes.querySelector('.character-eye-focus');

    expect(focusGroup).not.toBeNull();
    expect(focusGroup?.querySelector('.character-eye-pupil-left')).not.toBeNull();
    expect(focusGroup?.querySelector('.character-eye-pupil-right')).not.toBeNull();
    expect(focusGroup?.querySelector('.character-eye-shell')).toBeNull();
  });

  it('renders both hands above the body layer', () => {
    render(<Pet />);

    const body = screen.getByTestId('character-body-layer');
    const leftHand = screen.getByTestId('character-left-hand-layer');
    const rightHand = screen.getByTestId('character-right-hand-layer');

    expect(Boolean(body.compareDocumentPosition(leftHand) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(Boolean(body.compareDocumentPosition(rightHand) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it('ignores hand wave idle events while the wave behavior is disabled', async () => {
    const { sendIdleBehavior } = installMockAyati();
    render(<Pet />);

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      sendIdleBehavior({ type: 'wave' });
    });

    expect(screen.getByTestId('ayah-character-shell')).not.toHaveClass('idle-wave');
  });

  it('wakes up by moving the pet window when tapped while sleeping', async () => {
    const { ayati, sendMood } = installMockAyati();
    render(<Pet />);

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      sendMood({ state: 'sleeping' });
    });

    const characterShell = screen.getByTestId('ayah-character-shell');
    expect(characterShell).toHaveClass('state-sleep');

    fireEvent.click(characterShell);

    expect(characterShell).toHaveClass('state-idle');
    expect(characterShell).toHaveClass('wake-window-flight');
    expect(characterShell).not.toHaveClass('wake-flip');
    expect(characterShell).not.toHaveClass('idle-wave');
    expect(characterShell).not.toHaveClass('state-sleep');
    expect(ayati.playPetWakeFlight).toHaveBeenCalled();
    expect(ayati.petClicked).toHaveBeenCalled();
  });

  it('does not define hand wave animation rules while wave is disabled', () => {
    const styles = readFileSync(path.join(process.cwd(), 'src/renderer/pet/styles.css'), 'utf8');

    expect(styles).not.toContain('idle-wave');
    expect(styles).not.toContain('leftHandWave');
    expect(styles).not.toContain('rightHandWave');
  });

  it('does not fly or flip the character within the pet window during wake', () => {
    const styles = readFileSync(path.join(process.cwd(), 'src/renderer/pet/styles.css'), 'utf8');
    const wakeWindowFlightRule = getCssRuleBody(styles, '.lobster-container.wake-window-flight');

    expect(styles).not.toContain('wakeFlyFlip');
    expect(wakeWindowFlightRule).not.toMatch(/transform\s*:/);
    expect(wakeWindowFlightRule).not.toMatch(/animation\s*:/);
  });

  it('keeps hand layers from moving down in sleeping poses', () => {
    const styles = readFileSync(path.join(process.cwd(), 'src/renderer/pet/styles.css'), 'utf8');
    const leftSleepHandRule = getCssRuleBody(
      styles,
      '.lobster-container.state-sleep .character-left-hand-top-layer,',
    );
    const rightSleepHandRule = getCssRuleBody(
      styles,
      '.lobster-container.state-sleep .character-right-hand-top-layer,',
    );

    expect(leftSleepHandRule).not.toMatch(/translate\([^)]*,\s*[1-9][\d.]*px\)/);
    expect(rightSleepHandRule).not.toMatch(/translate\([^)]*,\s*[1-9][\d.]*px\)/);
  });

  it('leans the tucked wings with the dozing sleep pose', () => {
    const styles = readFileSync(path.join(process.cwd(), 'src/renderer/pet/styles.css'), 'utf8');
    const leftDozeWingRule = getCssRuleBody(
      styles,
      '.lobster-container.state-doze .character-left-wing',
    );
    const rightDozeWingRule = getCssRuleBody(
      styles,
      '.lobster-container.state-doze .character-right-wing',
    );

    expect(leftDozeWingRule).toContain('dozeLeftWingLean');
    expect(rightDozeWingRule).toContain('dozeRightWingLean');
    expect(styles).toContain('@keyframes dozeLeftWingLean');
    expect(styles).toContain('@keyframes dozeRightWingLean');
  });
});
