import { describe, expect, it, vi } from 'vitest';

import { ClawBotClient, normalizeClawBotProvider } from './clawbot-client';
import { getAiProviderConfig } from './ai-providers';
import type { ActivityEvent } from './watchers';

describe('ClawBotClient OpenAI-compatible provider mode', () => {
  it('normalizes legacy OpenClaw provider values to OpenRouter mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{ message: { content: 'OpenRouter response.' } }],
      }), { status: 200 }),
    );

    const client = new ClawBotClient('https://openrouter.ai/api/v1', 'openrouter-key', null, {
      autoStart: false,
      fetchImpl: fetchMock,
      model: 'openai/gpt-5.2',
      provider: 'openclaw',
    });

    expect(normalizeClawBotProvider('openclaw')).toBe('openrouter');

    const response = await client.chat('Use the configured OpenRouter model.');

    expect(response.text).toBe('OpenRouter response.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty('x-openclaw-agent-id');
  });

  it('uses the configured chat-completions endpoint and model', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{ message: { content: 'A short reflection.' } }],
      }), { status: 200 }),
    );

    const client = new ClawBotClient('https://openrouter.ai/api/v1', 'openrouter-key', null, {
      autoStart: false,
      fetchImpl: fetchMock,
      model: 'anthropic/claude-sonnet-4.5',
      provider: 'openai-compatible',
    });

    const response = await client.chat('Reflect on this.');

    expect(response).toMatchObject({
      type: 'message',
      text: 'A short reflection.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init).toMatchObject({ method: 'POST' });
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer openrouter-key',
      'Content-Type': 'application/json',
      'X-OpenRouter-Title': 'Ayati - Quran Desktop Companion',
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'anthropic/claude-sonnet-4.5',
      messages: [{ role: 'user', content: 'Reflect on this.' }],
    });
  });

  it('uses the Gemini API account preset with its OpenAI-compatible endpoint', async () => {
    const provider = getAiProviderConfig('gemini');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{ message: { content: 'Gemini response.' } }],
      }), { status: 200 }),
    );

    const client = new ClawBotClient(provider.baseUrl, 'gemini-key', null, {
      autoStart: false,
      fetchImpl: fetchMock,
      model: provider.defaultModel,
      provider: 'gemini',
    });

    const response = await client.chat('Reflect on this.');

    expect(response.text).toBe('Gemini response.');
    expect(fetchMock.mock.calls[0][0]).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: 'Bearer gemini-key',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      model: 'gemini-3-flash-preview',
    });
  });

  it('uses Anthropic Messages API for Claude API accounts', async () => {
    const provider = getAiProviderConfig('anthropic');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        content: [{ type: 'text', text: 'Claude response.' }],
      }), { status: 200 }),
    );

    const client = new ClawBotClient(provider.baseUrl, 'anthropic-key', null, {
      autoStart: false,
      fetchImpl: fetchMock,
      model: provider.defaultModel,
      provider: 'anthropic',
    });

    const response = await client.chat('Reflect on this.');

    expect(response.text).toBe('Claude response.');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
      'x-api-key': 'anthropic-key',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      max_tokens: 1024,
      model: 'claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'Reflect on this.' }],
    });
  });

  it('does not send OpenClaw-only activity events to generic providers', async () => {
    const fetchMock = vi.fn();
    const client = new ClawBotClient('https://openrouter.ai/api/v1', 'openrouter-key', null, {
      autoStart: false,
      fetchImpl: fetchMock,
      model: 'openai/gpt-5.2',
      provider: 'openai-compatible',
    });

    const event: ActivityEvent = {
      type: 'app_focus_changed',
      app: 'Safari',
      title: 'OpenRouter',
      at: 1,
    };

    await client.sendEvent(event);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
