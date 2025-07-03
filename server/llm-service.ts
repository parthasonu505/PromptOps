import CryptoJS from 'crypto-js';
import { LlmProvider, UserLlmConfig } from '@shared/schema';

// LLM Response interface
export interface LLMResponse {
  response: string;
  responseTime: number;
  tokens: {
    input: number;
    output: number;
  };
  cost: number; // in cents
  modelId: string;
  success: boolean;
  error?: string;
}

// Base LLM Provider interface
export interface ILLMProvider {
  name: string;
  sendPrompt(
    prompt: string,
    modelId: string,
    apiKey: string,
    options?: Record<string, any>
  ): Promise<LLMResponse>;
  getModels(): Array<{
    id: string;
    name: string;
    contextWindow: number;
    inputCostPer1k: number;
    outputCostPer1k: number;
    capabilities: string[];
  }>;
}

// OpenAI Provider
class OpenAIProvider implements ILLMProvider {
  name = 'openai';

  async sendPrompt(
    prompt: string,
    modelId: string,
    apiKey: string,
    options: Record<string, any> = {}
  ): Promise<LLMResponse> {
    const startTime = Date.now();
    
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: options.maxTokens || 1000,
          temperature: options.temperature || 0.7,
          ...options,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const responseTime = Date.now() - startTime;
      
      const model = this.getModels().find(m => m.id === modelId);
      const inputTokens = data.usage?.prompt_tokens || 0;
      const outputTokens = data.usage?.completion_tokens || 0;
      
      const cost = model ? 
        (inputTokens / 1000 * model.inputCostPer1k + outputTokens / 1000 * model.outputCostPer1k) * 100 : 0;

      return {
        response: data.choices[0]?.message?.content || '',
        responseTime,
        tokens: { input: inputTokens, output: outputTokens },
        cost: Math.round(cost),
        modelId,
        success: true,
      };
    } catch (error) {
      return {
        response: '',
        responseTime: Date.now() - startTime,
        tokens: { input: 0, output: 0 },
        cost: 0,
        modelId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  getModels() {
    return [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        contextWindow: 128000,
        inputCostPer1k: 0.5,
        outputCostPer1k: 1.5,
        capabilities: ['text', 'vision', 'function_calling'],
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        contextWindow: 128000,
        inputCostPer1k: 0.15,
        outputCostPer1k: 0.6,
        capabilities: ['text', 'vision', 'function_calling'],
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        contextWindow: 16385,
        inputCostPer1k: 0.5,
        outputCostPer1k: 1.5,
        capabilities: ['text', 'function_calling'],
      },
    ];
  }
}

// Anthropic Provider
class AnthropicProvider implements ILLMProvider {
  name = 'anthropic';

  async sendPrompt(
    prompt: string,
    modelId: string,
    apiKey: string,
    options: Record<string, any> = {}
  ): Promise<LLMResponse> {
    const startTime = Date.now();
    
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: modelId,
          max_tokens: options.maxTokens || 1000,
          messages: [{ role: 'user', content: prompt }],
          temperature: options.temperature || 0.7,
          ...options,
        }),
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const responseTime = Date.now() - startTime;
      
      const model = this.getModels().find(m => m.id === modelId);
      const inputTokens = data.usage?.input_tokens || 0;
      const outputTokens = data.usage?.output_tokens || 0;
      
      const cost = model ? 
        (inputTokens / 1000 * model.inputCostPer1k + outputTokens / 1000 * model.outputCostPer1k) * 100 : 0;

      return {
        response: data.content[0]?.text || '',
        responseTime,
        tokens: { input: inputTokens, output: outputTokens },
        cost: Math.round(cost),
        modelId,
        success: true,
      };
    } catch (error) {
      return {
        response: '',
        responseTime: Date.now() - startTime,
        tokens: { input: 0, output: 0 },
        cost: 0,
        modelId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  getModels() {
    return [
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude 4.0 Sonnet',
        contextWindow: 200000,
        inputCostPer1k: 3.0,
        outputCostPer1k: 15.0,
        capabilities: ['text', 'vision', 'code'],
      },
      {
        id: 'claude-3-7-sonnet-20250219',
        name: 'Claude 3.7 Sonnet',
        contextWindow: 200000,
        inputCostPer1k: 3.0,
        outputCostPer1k: 15.0,
        capabilities: ['text', 'vision', 'code'],
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        contextWindow: 200000,
        inputCostPer1k: 1.0,
        outputCostPer1k: 5.0,
        capabilities: ['text', 'fast_response'],
      },
    ];
  }
}

// Google Gemini Provider
class GeminiProvider implements ILLMProvider {
  name = 'gemini';

  async sendPrompt(
    prompt: string,
    modelId: string,
    apiKey: string,
    options: Record<string, any> = {}
  ): Promise<LLMResponse> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: options.temperature || 0.7,
            maxOutputTokens: options.maxTokens || 1000,
            ...options,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const responseTime = Date.now() - startTime;
      
      const model = this.getModels().find(m => m.id === modelId);
      // Gemini doesn't provide token usage in all responses
      const inputTokens = data.usageMetadata?.promptTokenCount || 0;
      const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;
      
      const cost = model ? 
        (inputTokens / 1000 * model.inputCostPer1k + outputTokens / 1000 * model.outputCostPer1k) * 100 : 0;

      return {
        response: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
        responseTime,
        tokens: { input: inputTokens, output: outputTokens },
        cost: Math.round(cost),
        modelId,
        success: true,
      };
    } catch (error) {
      return {
        response: '',
        responseTime: Date.now() - startTime,
        tokens: { input: 0, output: 0 },
        cost: 0,
        modelId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  getModels() {
    return [
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        contextWindow: 1000000,
        inputCostPer1k: 0.075,
        outputCostPer1k: 0.3,
        capabilities: ['text', 'vision', 'fast_response'],
      },
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        contextWindow: 2000000,
        inputCostPer1k: 1.25,
        outputCostPer1k: 5.0,
        capabilities: ['text', 'vision', 'code', 'reasoning'],
      },
    ];
  }
}

// LLM Service Manager
export class LLMService {
  private providers: Map<string, ILLMProvider> = new Map();
  private encryptionKey: string;

  constructor() {
    this.encryptionKey = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production';
    
    // Register providers
    this.providers.set('openai', new OpenAIProvider());
    this.providers.set('anthropic', new AnthropicProvider());
    this.providers.set('gemini', new GeminiProvider());
  }

  // Encrypt API key for storage
  encryptApiKey(apiKey: string): string {
    return CryptoJS.AES.encrypt(apiKey, this.encryptionKey).toString();
  }

  // Decrypt API key for use
  decryptApiKey(encryptedApiKey: string): string {
    const bytes = CryptoJS.AES.decrypt(encryptedApiKey, this.encryptionKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  // Get available providers
  getProviders(): LlmProvider[] {
    return Array.from(this.providers.values()).map(provider => ({
      id: 0, // Will be set by database
      name: provider.name,
      displayName: this.getDisplayName(provider.name),
      baseUrl: this.getBaseUrl(provider.name),
      apiKeyRequired: true,
      models: provider.getModels(),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  // Send prompt to multiple models for comparison
  async comparePrompts(
    prompt: string,
    models: Array<{ providerId: string; modelId: string; apiKey: string }>,
    options: Record<string, any> = {}
  ): Promise<LLMResponse[]> {
    const promises = models.map(async ({ providerId, modelId, apiKey }) => {
      const provider = this.providers.get(providerId);
      if (!provider) {
        return {
          response: '',
          responseTime: 0,
          tokens: { input: 0, output: 0 },
          cost: 0,
          modelId,
          success: false,
          error: `Provider ${providerId} not found`,
        };
      }

      const decryptedApiKey = this.decryptApiKey(apiKey);
      return provider.sendPrompt(prompt, modelId, decryptedApiKey, options);
    });

    return Promise.all(promises);
  }

  // Send prompt to a single model
  async sendPrompt(
    prompt: string,
    providerId: string,
    modelId: string,
    apiKey: string,
    options: Record<string, any> = {}
  ): Promise<LLMResponse> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      return {
        response: '',
        responseTime: 0,
        tokens: { input: 0, output: 0 },
        cost: 0,
        modelId,
        success: false,
        error: `Provider ${providerId} not found`,
      };
    }

    const decryptedApiKey = this.decryptApiKey(apiKey);
    return provider.sendPrompt(prompt, modelId, decryptedApiKey, options);
  }

  private getDisplayName(providerName: string): string {
    const names: Record<string, string> = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      gemini: 'Google Gemini',
    };
    return names[providerName] || providerName;
  }

  private getBaseUrl(providerName: string): string {
    const urls: Record<string, string> = {
      openai: 'https://api.openai.com/v1',
      anthropic: 'https://api.anthropic.com/v1',
      gemini: 'https://generativelanguage.googleapis.com/v1beta',
    };
    return urls[providerName] || '';
  }
}

export const llmService = new LLMService();