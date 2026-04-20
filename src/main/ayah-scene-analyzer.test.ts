import { describe, expect, it, vi } from 'vitest';

import { analyzeScreenForAyah } from './ayah-scene-analyzer';
import type { ClawBotClient } from './clawbot-client';

function createClientReturning(text: string): ClawBotClient {
  return {
    isConnected: () => true,
    analyzeScreen: vi.fn().mockResolvedValue({ type: 'message', text }),
  } as unknown as ClawBotClient;
}

describe('analyzeScreenForAyah', () => {
  it('throws when the AI provider is not connected instead of returning a fallback insight', async () => {
    const client = {
      isConnected: () => false,
      analyzeScreen: vi.fn(),
    } as unknown as ClawBotClient;

    await expect(analyzeScreenForAyah(client, 'data:image/png;base64,abc'))
      .rejects.toThrow('AI provider is not connected.');
  });

  it('throws the provider response when screen analysis does not return JSON', async () => {
    const client = createClientReturning(
      'AI provider error 400: {"error":{"message":"This model does not support image input."}}',
    );

    await expect(analyzeScreenForAyah(client, 'data:image/png;base64,abc'))
      .rejects.toThrow('This model does not support image input.');
  });

  it('parses theme strings from AI responses instead of treating them as unclear', async () => {
    const client = createClientReturning(JSON.stringify({
      summary: 'A focused study screen with notes and reference material.',
      category: 'study',
      themes: ['study', 'focus'],
      overallConfidence: 0.76,
      isSensitive: false,
    }));

    const insight = await analyzeScreenForAyah(client, 'data:image/png;base64,abc');

    expect(insight).toMatchObject({
      category: 'study',
      themes: [
        { id: 'study', confidence: 0.65 },
        { id: 'focus', confidence: 0.65 },
      ],
      overallConfidence: 0.76,
      isSensitive: false,
    });
  });

  it('uses a valid category as a theme when the model omits structured themes', async () => {
    const client = createClientReturning(JSON.stringify({
      summary: 'A planning board with several upcoming tasks.',
      category: 'planning',
      themes: [],
      isSensitive: false,
    }));

    const insight = await analyzeScreenForAyah(client, 'data:image/png;base64,abc');

    expect(insight.themes).toEqual([{ id: 'planning', confidence: 0.65 }]);
    expect(insight.overallConfidence).toBe(0.65);
  });
});
