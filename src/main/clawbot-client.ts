import { EventEmitter } from 'events';
import type { ActivityEvent } from './watchers';
import { getDefaultClawBotModel } from './ai-provider-defaults';
import {
  getAiProviderConfig,
  normalizeClawBotProvider,
  type AiProviderProtocol,
  type ClawBotProvider,
} from './ai-providers';

interface ClawBotResponse {
  type: 'message' | 'suggestion' | 'action';
  text?: string;
  action?: {
    type: string;
    payload: unknown;
  };
}

interface ChatStreamHandlers {
  onDelta?: (delta: string, fullText: string) => void;
}

export type { ClawBotProvider } from './ai-providers';

export interface ClawBotClientOptions {
  provider?: unknown;
  model?: string;
  fetchImpl?: typeof fetch;
  autoStart?: boolean;
}

export interface ClawBotClientUpdateOptions {
  provider?: unknown;
  model?: string;
}

const OPENROUTER_APP_TITLE = 'Ayati - Quran Desktop Companion';
const ANTHROPIC_API_VERSION = '2023-06-01';
const ANTHROPIC_DEFAULT_MAX_TOKENS = 1024;

export { normalizeClawBotProvider } from './ai-providers';

export function buildChatCompletionsUrl(baseUrl: string, _provider?: unknown): string {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '');
  if (normalizedBaseUrl.endsWith('/chat/completions')) {
    return normalizedBaseUrl;
  }

  return `${normalizedBaseUrl}/chat/completions`;
}

type ChatCompletionsContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type ChatCompletionsMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatCompletionsContentPart[];
};

type AnthropicTextPart = {
  type: 'text';
  text: string;
};

type AnthropicImagePart = {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
};

type AnthropicContentPart = AnthropicTextPart | AnthropicImagePart;

type AnthropicMessage = {
  role: 'user' | 'assistant';
  content: string | AnthropicContentPart[];
};

function parseActionFromResponse(text: string): { cleanText: string; action?: unknown } {
  const actionMatch = text.match(/```action\s*(\{[\s\S]*?\})\s*```/);
  if (actionMatch) {
    try {
      const jsonStr = actionMatch[1].trim();
      const action = JSON.parse(jsonStr);
      const cleanText = text.replace(/```action\s*\{[\s\S]*?\}\s*```/g, '').trim();
      return { cleanText, action };
    } catch {
      const typeMatch = actionMatch[1].match(/"type"\s*:\s*"([^"]+)"/);
      const valueMatch = actionMatch[1].match(/"value"\s*:\s*"([^"]+)"/);
      const xMatch = actionMatch[1].match(/"x"\s*:\s*(\d+)/);
      const yMatch = actionMatch[1].match(/"y"\s*:\s*(\d+)/);

      let bareValue: string | undefined;
      if (!valueMatch) {
        const allStrings = actionMatch[1].match(/"([^"]+)"/g);
        if (allStrings && allStrings.length >= 2) {
          for (const str of allStrings) {
            const value = str.replace(/"/g, '');
            if (!['type', 'value', 'x', 'y', typeMatch?.[1]].includes(value)) {
              bareValue = value;
              break;
            }
          }
        }
      }

      if (typeMatch) {
        const cleanText = text.replace(/```action\s*\{[\s\S]*?\}\s*```/g, '').trim();
        return {
          cleanText,
          action: {
            type: typeMatch[1],
            value: valueMatch?.[1] || bareValue,
            x: xMatch ? parseInt(xMatch[1], 10) : undefined,
            y: yMatch ? parseInt(yMatch[1], 10) : undefined,
          },
        };
      }
    }
  }

  return { cleanText: text };
}

export class ClawBotClient extends EventEmitter {
  private baseUrl: string;
  private token: string;
  private provider: ClawBotProvider;
  private protocol: AiProviderProtocol;
  private model: string;
  private fetchImpl: typeof fetch;
  private connected = false;
  private lastError: string | null = null;

  constructor(
    baseUrl: string,
    token: string = '',
    _agentId: string | null = null,
    options: ClawBotClientOptions = {},
  ) {
    super();
    this.baseUrl = baseUrl;
    this.token = token;
    this.provider = normalizeClawBotProvider(options.provider);
    this.protocol = getAiProviderConfig(this.provider).protocol;
    this.model = options.model ?? getDefaultClawBotModel(this.provider);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.applyOptimisticConnectionState();

    if (options.autoStart !== false) {
      this.checkConnection();
    }
  }

  updateConfig(
    baseUrl: string,
    token: string,
    _agentId?: string | null,
    options: ClawBotClientUpdateOptions = {},
  ): void {
    const wasConnected = this.connected;
    this.baseUrl = baseUrl;
    this.token = token;
    if (options.provider !== undefined) {
      this.provider = normalizeClawBotProvider(options.provider);
      this.protocol = getAiProviderConfig(this.provider).protocol;
    }
    if (options.model !== undefined) {
      this.model = options.model;
    }
    this.applyOptimisticConnectionState();
    if (wasConnected !== this.connected) {
      this.emit('connection-changed', this.getConnectionStatus());
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.protocol === 'anthropic-messages') {
      if (this.token) {
        headers['x-api-key'] = this.token;
      }
      headers['anthropic-version'] = ANTHROPIC_API_VERSION;
      return headers;
    }

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    if (this.isOpenRouterEndpoint()) {
      headers['X-OpenRouter-Title'] = OPENROUTER_APP_TITLE;
    }
    return headers;
  }

  private isOpenRouterEndpoint(): boolean {
    try {
      return new URL(this.baseUrl).hostname.endsWith('openrouter.ai');
    } catch {
      return this.baseUrl.includes('openrouter.ai');
    }
  }

  private applyOptimisticConnectionState(): void {
    this.connected = this.baseUrl.trim().length > 0;
    this.lastError = this.connected ? null : 'Provider URL is required';
  }

  private getConfiguredModel(): string {
    const model = this.model.trim();
    return model.length > 0 ? model : getDefaultClawBotModel(this.provider);
  }

  private withConfiguredModel<T extends Record<string, unknown>>(body: T): T & { model: string } {
    return { model: this.getConfiguredModel(), ...body };
  }

  isConnected(): boolean {
    return this.connected;
  }

  getConnectionStatus(): { connected: boolean; error: string | null; gatewayUrl: string } {
    return {
      connected: this.connected,
      error: this.lastError,
      gatewayUrl: this.baseUrl,
    };
  }

  private async checkConnection(): Promise<void> {
    const wasConnected = this.connected;
    this.applyOptimisticConnectionState();
    if (wasConnected !== this.connected) {
      this.emit('connection-changed', this.getConnectionStatus());
    }
  }

  async sendEvent(_event: ActivityEvent): Promise<void> {
    return;
  }

  private buildTextChatMessages(
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Array<{ role: string; content: string }> {
    const recentHistory = history.slice(-20);
    return [...recentHistory, { role: 'user', content: message }];
  }

  async chat(
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  ): Promise<ClawBotResponse> {
    if (!this.connected) {
      return { type: 'message', text: 'AI provider is not connected. Check the provider settings.' };
    }

    const messages = this.buildTextChatMessages(message, history);
    if (this.protocol === 'anthropic-messages') {
      return this.chatViaAnthropicMessages(messages);
    }

    return this.chatViaCompletions(messages);
  }

  async chatStream(
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    handlers: ChatStreamHandlers = {},
  ): Promise<ClawBotResponse> {
    if (!this.connected) {
      return { type: 'message', text: 'AI provider is not connected. Check the provider settings.' };
    }

    const messages = this.buildTextChatMessages(message, history);
    if (this.protocol === 'anthropic-messages') {
      const response = await this.chatViaAnthropicMessages(messages);
      if (response.text) {
        handlers.onDelta?.(response.text, response.text);
      }
      return response;
    }

    return this.chatStreamViaCompletions(messages, handlers);
  }

  async analyzeScreen(imageDataUrl: string, question?: string): Promise<ClawBotResponse> {
    const userQuestion = question || 'What do you see? How can you help?';

    if (!this.connected) {
      return { type: 'message', text: 'AI provider is not connected. Check the provider settings.' };
    }

    if (!this.isBase64ImageDataUrl(imageDataUrl)) {
      return { type: 'message', text: 'Invalid screenshot format. Expected a base64 data URL.' };
    }

    if (this.protocol === 'anthropic-messages') {
      return this.analyzeScreenViaAnthropicMessages(imageDataUrl, userQuestion);
    }

    return this.analyzeScreenViaCompletions(imageDataUrl, userQuestion);
  }

  private isBase64ImageDataUrl(imageDataUrl: string): boolean {
    return /^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/.test(imageDataUrl);
  }

  private parseBase64ImageDataUrl(imageDataUrl: string): AnthropicImagePart['source'] | null {
    const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return null;

    return {
      type: 'base64',
      media_type: match[1],
      data: match[2],
    };
  }

  private normalizeChatCompletionsRole(role: string): ChatCompletionsMessage['role'] {
    if (role === 'system' || role === 'assistant' || role === 'user') {
      return role;
    }
    return 'user';
  }

  private buildChatCompletionsMessages(
    messages: Array<{ role: string; content: string }>,
  ): ChatCompletionsMessage[] {
    return messages.map((message) => ({
      role: this.normalizeChatCompletionsRole(message.role),
      content: message.content,
    }));
  }

  private buildAnthropicMessages(
    messages: Array<{ role: string; content: string }>,
  ): AnthropicMessage[] {
    return messages.map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    }));
  }

  private buildAnthropicMessagesUrl(): string {
    const normalizedBaseUrl = this.baseUrl.trim().replace(/\/+$/, '');
    if (normalizedBaseUrl.endsWith('/messages')) {
      return normalizedBaseUrl;
    }
    return `${normalizedBaseUrl}/messages`;
  }

  private async chatViaAnthropicMessages(
    messages: Array<{ role: string; content: string }>,
  ): Promise<ClawBotResponse> {
    try {
      const response = await this.fetchImpl(this.buildAnthropicMessagesUrl(), {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          max_tokens: ANTHROPIC_DEFAULT_MAX_TOKENS,
          messages: this.buildAnthropicMessages(messages),
          model: this.getConfiguredModel(),
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Claude API message error (${response.status}):`, errorText);
        return { type: 'message', text: this.formatProviderError(response.status, errorText) };
      }

      const data = (await response.json()) as unknown;
      const rawText = this.extractTextFromPayload(data) || 'No response';
      return this.toClawBotResponse(rawText);
    } catch (error) {
      console.error('Failed to chat with Claude API:', error);
      return { type: 'message', text: `Failed to reach AI provider: ${error}` };
    }
  }

  private async chatViaCompletions(
    messages: Array<{ role: string; content: string }>,
  ): Promise<ClawBotResponse> {
    try {
      const response = await this.fetchImpl(buildChatCompletionsUrl(this.baseUrl), {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(this.withConfiguredModel({
          messages: this.buildChatCompletionsMessages(messages),
        })),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`AI provider chat-completions error (${response.status}):`, errorText);
        return { type: 'message', text: this.formatProviderError(response.status, errorText) };
      }

      const data = (await response.json()) as unknown;
      const rawText = this.extractTextFromPayload(data) || 'No response';
      return this.toClawBotResponse(rawText);
    } catch (error) {
      console.error('Failed to chat with AI provider:', error);
      return { type: 'message', text: `Failed to reach AI provider: ${error}` };
    }
  }

  private async chatStreamViaCompletions(
    messages: Array<{ role: string; content: string }>,
    handlers: ChatStreamHandlers,
  ): Promise<ClawBotResponse> {
    try {
      const response = await this.fetchImpl(buildChatCompletionsUrl(this.baseUrl), {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(this.withConfiguredModel({
          messages: this.buildChatCompletionsMessages(messages),
          stream: true,
        })),
        signal: AbortSignal.timeout(120000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`AI provider stream chat-completions error (${response.status}):`, errorText);
        return { type: 'message', text: this.formatProviderError(response.status, errorText) };
      }

      if (!response.body) {
        console.warn('[AI Provider] Chat-completions stream missing body; falling back to non-streaming chat');
        return this.chatViaCompletions(messages);
      }

      return this.consumeStreamResponse(response, handlers);
    } catch (error) {
      console.error('Failed to stream chat with AI provider:', error);
      return { type: 'message', text: `Failed to reach AI provider: ${error}` };
    }
  }

  private async consumeStreamResponse(
    response: Response,
    handlers: ChatStreamHandlers,
  ): Promise<ClawBotResponse> {
    if (!response.body) {
      return { type: 'message', text: 'No response body received from AI provider.' };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let rawText = '';
    let done = false;
    let completedPayload: unknown = null;

    const handleStreamPayload = (payload: string): void => {
      if (!payload) return;
      if (payload === '[DONE]') {
        done = true;
        return;
      }

      try {
        const chunk = JSON.parse(payload) as { type?: unknown; response?: unknown };
        const delta = this.extractDeltaFromStreamPayload(chunk);
        if (delta) {
          rawText += delta;
          handlers.onDelta?.(delta, rawText);
        }

        if (chunk.type === 'response.completed') {
          completedPayload = chunk.response || chunk;
        } else {
          completedPayload = chunk;
        }
      } catch (error) {
        console.warn('[AI Provider] Failed to parse stream chunk:', payload.slice(0, 120), error);
      }
    };

    while (!done) {
      const result = await reader.read();
      done = result.done;

      if (result.value) {
        buffer += decoder.decode(result.value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const event of events) {
          const lines = event.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            handleStreamPayload(payload);
          }
        }
      }
    }

    if (buffer.trim().length > 0) {
      const trailingLines = buffer.split('\n');
      for (const line of trailingLines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        handleStreamPayload(payload);
      }
    }

    if (!rawText) {
      rawText = this.extractTextFromPayload(completedPayload) || 'No response';
    }

    return this.toClawBotResponse(rawText);
  }

  private async analyzeScreenViaCompletions(
    imageDataUrl: string,
    userQuestion: string,
  ): Promise<ClawBotResponse> {
    const messages: ChatCompletionsMessage[] = [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: `${userQuestion}\n\nPlease analyze the attached screenshot and answer specifically about what is visible.`,
        },
        {
          type: 'image_url',
          image_url: { url: imageDataUrl },
        },
      ],
    }];

    try {
      const response = await this.fetchImpl(buildChatCompletionsUrl(this.baseUrl), {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(this.withConfiguredModel({ messages })),
        signal: AbortSignal.timeout(120000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`AI provider image analysis failed (${response.status}):`, errorText);
        return { type: 'message', text: this.formatProviderError(response.status, errorText) };
      }

      const data = (await response.json()) as unknown;
      const rawText = this.extractTextFromPayload(data) || 'No response';
      return this.toClawBotResponse(rawText);
    } catch (error) {
      console.error('[AI Provider] Image analysis failed:', error);
      return { type: 'message', text: 'Failed to analyze screenshot.' };
    }
  }

  private async analyzeScreenViaAnthropicMessages(
    imageDataUrl: string,
    userQuestion: string,
  ): Promise<ClawBotResponse> {
    const imageSource = this.parseBase64ImageDataUrl(imageDataUrl);
    if (!imageSource) {
      return { type: 'message', text: 'Invalid screenshot format. Expected a base64 data URL.' };
    }

    const messages: AnthropicMessage[] = [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: `${userQuestion}\n\nPlease analyze the attached screenshot and answer specifically about what is visible.`,
        },
        {
          type: 'image',
          source: imageSource,
        },
      ],
    }];

    try {
      const response = await this.fetchImpl(this.buildAnthropicMessagesUrl(), {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          max_tokens: ANTHROPIC_DEFAULT_MAX_TOKENS,
          messages,
          model: this.getConfiguredModel(),
        }),
        signal: AbortSignal.timeout(120000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Claude API image analysis failed (${response.status}):`, errorText);
        return { type: 'message', text: this.formatProviderError(response.status, errorText) };
      }

      const data = (await response.json()) as unknown;
      const rawText = this.extractTextFromPayload(data) || 'No response';
      return this.toClawBotResponse(rawText);
    } catch (error) {
      console.error('[Claude API] Image analysis failed:', error);
      return { type: 'message', text: 'Failed to analyze screenshot.' };
    }
  }

  private formatProviderError(status: number, errorText: string): string {
    return `AI provider error ${status}: ${errorText.slice(0, 200)}`;
  }

  private extractTextFromPayload(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const data = payload as {
      content?: unknown;
      output_text?: unknown;
      output?: unknown;
      response?: unknown;
      choices?: Array<{
        message?: {
          content?: unknown;
        };
      }>;
    };

    if (Array.isArray(data.content)) {
      const textParts = data.content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
            return (part as { text: string }).text;
          }
          return '';
        })
        .filter((part) => part.length > 0);
      if (textParts.length > 0) {
        return textParts.join('');
      }
    }

    if (typeof data.output_text === 'string' && data.output_text.length > 0) {
      return data.output_text;
    }

    if (Array.isArray(data.output_text)) {
      const textParts = data.output_text
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
            return (part as { text: string }).text;
          }
          return '';
        })
        .filter((part) => part.length > 0);
      if (textParts.length > 0) {
        return textParts.join('');
      }
    }

    const outputTextParts: string[] = [];
    if (Array.isArray(data.output)) {
      for (const item of data.output) {
        if (!item || typeof item !== 'object') continue;
        const itemObj = item as { text?: unknown; content?: unknown };
        if (typeof itemObj.text === 'string' && itemObj.text.length > 0) {
          outputTextParts.push(itemObj.text);
        }
        if (Array.isArray(itemObj.content)) {
          for (const part of itemObj.content) {
            if (!part || typeof part !== 'object') continue;
            const partObj = part as { type?: unknown; text?: unknown };
            if (typeof partObj.text === 'string' && partObj.text.length > 0) {
              const partType = typeof partObj.type === 'string' ? partObj.type : '';
              if (!partType || partType.includes('text')) {
                outputTextParts.push(partObj.text);
              }
            }
          }
        }
      }
    }
    if (outputTextParts.length > 0) {
      return outputTextParts.join('');
    }

    if (data.response && typeof data.response === 'object') {
      const nested = this.extractTextFromPayload(data.response);
      if (nested) return nested;
    }

    const fallbackText = data.choices?.[0]?.message?.content;
    if (typeof fallbackText === 'string' && fallbackText.length > 0) {
      return fallbackText;
    }
    if (Array.isArray(fallbackText)) {
      const parts = fallbackText
        .map((part) => {
          if (typeof part === 'string') return part;
          if (
            part &&
            typeof part === 'object' &&
            typeof (part as { text?: unknown }).text === 'string'
          ) {
            return (part as { text: string }).text;
          }
          return '';
        })
        .filter((part) => part.length > 0);
      if (parts.length > 0) {
        return parts.join('');
      }
    }

    return null;
  }

  private extractDeltaFromStreamPayload(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const data = payload as {
      type?: unknown;
      delta?: unknown;
      part?: unknown;
      choices?: Array<{
        delta?: { content?: unknown };
      }>;
    };

    if (data.type === 'response.output_text.delta') {
      if (typeof data.delta === 'string' && data.delta.length > 0) {
        return data.delta;
      }
      if (data.delta && typeof data.delta === 'object' && typeof (data.delta as { text?: unknown }).text === 'string') {
        return (data.delta as { text: string }).text;
      }
    }

    if (data.type === 'response.content_part.added' && data.part && typeof data.part === 'object') {
      const part = data.part as { type?: unknown; text?: unknown };
      if (typeof part.text === 'string' && part.text.length > 0) {
        const partType = typeof part.type === 'string' ? part.type : '';
        if (!partType || partType.includes('text')) {
          return part.text;
        }
      }
    }

    const chatCompletionsDelta = data.choices?.[0]?.delta?.content;
    if (typeof chatCompletionsDelta === 'string' && chatCompletionsDelta.length > 0) {
      return chatCompletionsDelta;
    }
    if (Array.isArray(chatCompletionsDelta)) {
      const parts = chatCompletionsDelta
        .map((part) => {
          if (typeof part === 'string') return part;
          if (
            part &&
            typeof part === 'object' &&
            typeof (part as { text?: unknown }).text === 'string'
          ) {
            return (part as { text: string }).text;
          }
          return '';
        })
        .filter((part) => part.length > 0);
      if (parts.length > 0) {
        return parts.join('');
      }
    }

    return null;
  }

  private toClawBotResponse(rawText: string): ClawBotResponse {
    const { cleanText, action } = parseActionFromResponse(rawText);
    return {
      type: action ? 'action' : 'message',
      text: cleanText,
      action: action ? { type: (action as { type: string }).type, payload: action } : undefined,
    };
  }

  async performAction(_actionType: string, _payload: unknown): Promise<ClawBotResponse> {
    return { type: 'message', text: 'Provider actions are handled from model responses.' };
  }

  destroy(): void {
    return;
  }
}
