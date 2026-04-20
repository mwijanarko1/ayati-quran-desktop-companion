import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PetChat } from './PetChat';

type PetChatMessageHandler = Parameters<Window['clawster']['onPetChatMessage']>[0];

function installMockClawster(): {
  sendPetMessage: PetChatMessageHandler;
  clawster: Partial<Window['clawster']>;
} {
  let messageHandler: PetChatMessageHandler = () => {};
  const clawster = {
    onPetChatMessage: vi.fn((callback: PetChatMessageHandler) => {
      messageHandler = callback;
    }),
    resizePetChat: vi.fn(),
    petChatInteracted: vi.fn(),
    petChatReply: vi.fn(),
    hidePetChat: vi.fn(),
    openAssistant: vi.fn(),
    saveAyahReflection: vi.fn(),
    getClawbotStatus: vi.fn(),
    sendToClawbot: vi.fn(),
  } satisfies Partial<Window['clawster']>;

  Object.defineProperty(window, 'clawster', {
    configurable: true,
    writable: true,
    value: clawster,
  });

  return {
    sendPetMessage: (message) => messageHandler(message),
    clawster,
  };
}

describe('PetChat', () => {
  beforeEach(() => {
    class MockResizeObserver {
      observe = vi.fn();
      disconnect = vi.fn();
    }

    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: MockResizeObserver,
    });
  });

  it('presents pet messages as a speech bubble with a visible tail', async () => {
    const { sendPetMessage } = installMockClawster();

    render(<PetChat />);

    act(() => {
      sendPetMessage({
        id: 'pet-message-1',
        text: 'Also, I hope `Pet.tsx` is a literal pet.',
        quickReplies: ['Thanks!', 'Tell me more', 'Not now'],
      });
    });

    const bubble = await screen.findByRole('group', { name: /pet speech bubble/i });
    const tail = bubble.querySelector('.pet-speech-bubble-tail');

    expect(bubble).toHaveClass('pet-speech-bubble');
    expect(bubble).not.toHaveClass('overflow-hidden');
    expect(tail).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Tell me more' })).toBeInTheDocument();

    await waitFor(() => {
      expect(window.clawster.resizePetChat).toHaveBeenCalled();
    });
  });

  it('opens the reflection flow when a Quran nudge asks to reflect', async () => {
    const user = userEvent.setup();
    const { sendPetMessage } = installMockClawster();

    render(<PetChat />);

    act(() => {
      sendPetMessage({
        id: 'pet-message-2',
        text: 'A fitting reminder: Read, in the Name of your Lord Who created. — 96:1',
        quickReplies: ['Reflect', 'Save', 'Not now'],
        reflectionId: 'reflection-1',
      });
    });

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Reflect' }));
    });

    expect(window.clawster.petChatReply).toHaveBeenCalledWith('curious');
    expect(window.clawster.openAssistant).toHaveBeenCalled();
    expect(window.clawster.hidePetChat).toHaveBeenCalled();
  });

  it('saves the linked reflection when a Quran nudge asks to save', async () => {
    const user = userEvent.setup();
    const { sendPetMessage } = installMockClawster();
    vi.mocked(window.clawster.saveAyahReflection).mockResolvedValue({
      id: 'reflection-1',
      verseKey: '96:1',
      surahName: 'Al-Alaq',
      ayahNumber: 1,
      arabicText: 'ٱقْرَأْ',
      translation: 'Read.',
      translatorId: 20,
      reflection: 'Begin with remembrance.',
      whyThisVerse: 'The screen suggested study.',
      screenSummary: 'A study window is active.',
      themes: [{ id: 'study', confidence: 0.82 }],
      createdAt: Date.now(),
      savedAt: Date.now(),
      syncState: 'local',
    });

    render(<PetChat />);

    act(() => {
      sendPetMessage({
        id: 'pet-message-3',
        text: 'A fitting reminder: Read, in the Name of your Lord Who created. — 96:1',
        quickReplies: ['Reflect', 'Save', 'Not now'],
        reflectionId: 'reflection-1',
      });
    });

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Save' }));
    });

    await waitFor(() => {
      expect(window.clawster.saveAyahReflection).toHaveBeenCalledWith('reflection-1');
    });
    expect(await screen.findByText(/saved this reflection/i)).toBeInTheDocument();
  });

  it('dismisses Quran nudges when the user chooses not now', () => {
    const { sendPetMessage } = installMockClawster();

    render(<PetChat />);

    act(() => {
      sendPetMessage({
        id: 'pet-message-4',
        text: 'A fitting reminder: Read, in the Name of your Lord Who created. — 96:1',
        quickReplies: ['Reflect', 'Save', 'Not now'],
        reflectionId: 'reflection-1',
      });
    });

    screen.getByRole('button', { name: 'Not now' }).click();

    expect(window.clawster.petChatReply).toHaveBeenCalledWith('dismiss');
    expect(window.clawster.hidePetChat).toHaveBeenCalled();
  });
});
