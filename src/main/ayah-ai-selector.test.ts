import { describe, expect, it, vi } from 'vitest';

import { selectAyahCandidateWithAi } from './ayah-ai-selector';
import type { RankedAyahCandidate, ScreenInsight } from './ayah-types';

const insight: ScreenInsight = {
  summary: 'The screen shows a heavy work session with a task list and several urgent notes.',
  category: 'work',
  themes: [
    { id: 'stress', confidence: 0.8 },
    { id: 'patience', confidence: 0.7 },
  ],
  overallConfidence: 0.86,
  isSensitive: false,
};

const candidates: RankedAyahCandidate[] = [
  {
    verseKey: '2:286',
    themeId: 'stress',
    score: 180,
    reflection: 'Meet the pressure with your real capacity.',
    whyThisVerse: 'The screen suggested pressure and overload.',
    isFallback: false,
  },
  {
    verseKey: '94:6',
    themeId: 'patience',
    score: 160,
    reflection: 'Stay steady through the next step.',
    whyThisVerse: 'The scene called for patience.',
    isFallback: false,
  },
];

describe('selectAyahCandidateWithAi', () => {
  it('asks the AI provider to choose from allowed candidates using the screen description', async () => {
    const client = {
      isConnected: () => true,
      chat: vi.fn().mockResolvedValue({
        type: 'message',
        text: '{"verseKey":"94:6","reason":"The description points to patience while working through difficulty."}',
      }),
    };

    const selected = await selectAyahCandidateWithAi(client, insight, candidates);

    expect(selected).toMatchObject({
      verseKey: '94:6',
      whyThisVerse: 'The description points to patience while working through difficulty.',
    });
    expect(client.chat).toHaveBeenCalledTimes(1);
    const [prompt] = client.chat.mock.calls[0];
    expect(prompt).toContain(insight.summary);
    expect(prompt).toContain('"verseKey": "2:286"');
    expect(prompt).toContain('"verseKey": "94:6"');
    expect(prompt).toContain('Do not choose any verse outside this list.');
  });

  it('throws when the AI provider returns an invalid verse key instead of falling back to deterministic ranking', async () => {
    const client = {
      isConnected: () => true,
      chat: vi.fn().mockResolvedValue({
        type: 'message',
        text: '{"verseKey":"99:99","reason":"Invalid."}',
      }),
    };

    await expect(selectAyahCandidateWithAi(client, insight, candidates)).rejects.toThrow(
      'AI provider selected a verse outside the allowed candidates.',
    );
  });

  it('throws when the AI provider is disconnected instead of falling back to deterministic ranking', async () => {
    const client = {
      isConnected: () => false,
      chat: vi.fn(),
    };

    await expect(selectAyahCandidateWithAi(client, insight, candidates)).rejects.toThrow(
      'AI provider is not connected.',
    );
    expect(client.chat).not.toHaveBeenCalled();
  });

  it('does not ask the AI provider to rerank sensitive or fallback selections', async () => {
    const client = {
      isConnected: () => true,
      chat: vi.fn(),
    };
    const sensitiveInsight = { ...insight, isSensitive: true };

    await expect(selectAyahCandidateWithAi(client, sensitiveInsight, candidates)).resolves.toBe(candidates[0]);
    expect(client.chat).not.toHaveBeenCalled();
  });
});
