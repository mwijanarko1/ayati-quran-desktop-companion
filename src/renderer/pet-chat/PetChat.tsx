import React, { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { MarkdownMessage } from '../components/MarkdownMessage';

interface ChatMessage {
  id: string;
  text: string;
  quickReplies?: string[];
  reflectionId?: string;
}

const DEFAULT_QUICK_REPLIES = ['Thanks!', 'Tell me more', 'Not now'];

export const PetChat: React.FC = () => {
  const [message, setMessage] = useState<ChatMessage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const lastSizeRef = useRef<{ width: number; height: number } | null>(null);
  const lastInteractionSentAtRef = useRef(0);

  useEffect(() => {
    // Listen for chat messages from main process
    window.clawster.onPetChatMessage((msg) => {
      setMessage({
        ...msg,
        quickReplies: msg.quickReplies || DEFAULT_QUICK_REPLIES,
      });
      setIsLoading(false);
    });
  }, []);

  const reportContentSize = useCallback(() => {
    const element = contentRef.current;
    if (!element || !message) return;

    const rect = element.getBoundingClientRect();
    const width = Math.ceil(rect.width) + 8;
    const height = Math.ceil(rect.height);
    const lastSize = lastSizeRef.current;

    if (lastSize && Math.abs(lastSize.width - width) < 2 && Math.abs(lastSize.height - height) < 2) {
      return;
    }

    lastSizeRef.current = { width, height };
    window.clawster.resizePetChat(width, height);
  }, [message]);

  useLayoutEffect(() => {
    if (!message) return;

    let frame2 = 0;
    const frame1 = requestAnimationFrame(() => {
      reportContentSize();
      frame2 = requestAnimationFrame(reportContentSize);
    });

    return () => {
      cancelAnimationFrame(frame1);
      if (frame2) cancelAnimationFrame(frame2);
    };
  }, [message, isLoading, reportContentSize]);

  useEffect(() => {
    if (!message || !contentRef.current) return;

    const observer = new ResizeObserver(() => {
      reportContentSize();
    });

    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [message, reportContentSize]);

  const notifyInteraction = useCallback(() => {
    const now = Date.now();
    if (now - lastInteractionSentAtRef.current < 600) return;
    lastInteractionSentAtRef.current = now;
    window.clawster.petChatInteracted();
  }, []);

  const handleQuickReply = useCallback(async (reply: string) => {
    if (!message) return;

    if (reply === 'Not now') {
      window.clawster.petChatReply('dismiss');
      window.clawster.hidePetChat();
      return;
    }

    if (reply === 'Reflect') {
      window.clawster.petChatReply('curious');
      window.clawster.openAssistant();
      window.clawster.hidePetChat();
      return;
    }

    if (reply === 'Save') {
      if (!message.reflectionId) {
        setMessage({
          id: crypto.randomUUID(),
          text: 'There is no reflection to save yet.',
          quickReplies: ['Got it', 'Not now'],
        });
        return;
      }

      setIsLoading(true);
      window.clawster.petChatReply('thinking');
      try {
        const savedReflection = await window.clawster.saveAyahReflection(message.reflectionId);
        setMessage({
          id: crypto.randomUUID(),
          text: savedReflection?.syncState === 'synced'
            ? 'Saved this reflection to Quran Foundation bookmarks.'
            : 'Saved this reflection locally.',
          quickReplies: ['Got it', 'Not now'],
        });
        window.clawster.petChatReply('happy');
      } catch {
        setMessage({
          id: crypto.randomUUID(),
          text: 'Could not save this reflection. Try again from Reflections.',
          quickReplies: ['Got it', 'Not now'],
        });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (reply === 'Tell me more') {
      // Check connection first
      const status = await window.clawster.getClawbotStatus();
      if (!status.connected) {
        setMessage({
          id: crypto.randomUUID(),
          text: 'Gateway not connected. Update your AI provider settings, then check the connection again.',
          quickReplies: ['Got it', 'Not now'],
        });
        return;
      }

      setIsLoading(true);
      window.clawster.petChatReply('thinking');
      try {
        const response = await window.clawster.sendToClawbot(
          `Tell me more about: ${message.text}`
        ) as { text?: string };

        if (response.text) {
          setMessage({
            id: crypto.randomUUID(),
            text: response.text,
            quickReplies: ['Thanks!', 'Not now'],
          });
          window.clawster.petChatReply('curious');
        }
      } catch {
        setMessage({
          id: crypto.randomUUID(),
          text: 'Couldn\'t connect to gateway. Make sure it\'s running.',
          quickReplies: ['Got it', 'Not now'],
        });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // "Got it" - just close
    if (reply === 'Got it') {
      window.clawster.petChatReply('dismiss');
      window.clawster.hidePetChat();
      return;
    }

    // "Thanks!" - close with happy reaction
    window.clawster.petChatReply('thanks');
    window.clawster.hidePetChat();
  }, [message]);

  if (!message) return null;

  return (
    <div className="w-full h-full flex items-end justify-center">
      <div ref={contentRef} className="inline-block px-2 pb-4">
        <div
          role="group"
          aria-label="Pet speech bubble"
          className="pet-speech-bubble min-w-[180px] max-w-[300px] w-max animate-speech-bubble-in"
          onMouseEnter={notifyInteraction}
          onMouseMove={notifyInteraction}
          onMouseDown={notifyInteraction}
          onTouchStart={notifyInteraction}
          onWheel={notifyInteraction}
        >
          <div className="pet-speech-bubble-panel">
            <div className="p-3 max-h-[150px] overflow-y-auto">
              {isLoading ? (
                <div className="flex gap-1 justify-center py-2">
                  <span className="w-2 h-2 rounded-full bg-[#67E0A3] loading-dot"></span>
                  <span className="w-2 h-2 rounded-full bg-[#67E0A3] loading-dot"></span>
                  <span className="w-2 h-2 rounded-full bg-[#67E0A3] loading-dot"></span>
                </div>
              ) : (
                <div className="text-sm text-neutral-200 leading-relaxed break-words select-text cursor-text">
                  <MarkdownMessage content={message.text} />
                </div>
              )}
            </div>

            {/* Quick Replies */}
            {!isLoading && message.quickReplies && (
              <div className="flex gap-2 px-3 pb-2 pt-2 flex-wrap justify-center border-t border-white/5">
                {message.quickReplies.map((reply) => (
                  <button
                    key={reply}
                    onClick={() => handleQuickReply(reply)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#67E0A3]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f0f0f] ${
                      reply === 'Not now'
                        ? 'bg-white/5 border border-white/10 text-neutral-400 hover:bg-white/10 hover:text-neutral-300'
                        : 'bg-[#67E0A3]/10 border border-[#67E0A3]/20 text-[#67E0A3] hover:bg-[#67E0A3]/20 hover:border-[#67E0A3]/40'
                    }`}
                  >
                    {reply}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="pet-speech-bubble-tail" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
};
