// GitHub Models Provider - implements the existing LLM interface structure

interface GitHubModel {
  id: string;
  name: string;
  publisher: string;
  summary: string;
  rate_limit_tier: string;
  supported_input_modalities: string[];
  supported_output_modalities: string[];
  tags: string[];
}

interface GitHubChatMessage {
  role: 'system' | 'user' | 'assistant' | 'developer';
  content: string;
}

interface GitHubChatRequest {
  model: string;
  messages: GitHubChatMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  stream?: boolean;
  seed?: number;
  response_format?: {
    type: 'text' | 'json_object' | 'json_schema';
    json_schema?: any;
  };
}

interface GitHubChatResponse {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices: Array<{
    index?: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Define the LLM Response interface
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

// Define the LLM Provider interface
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

export class GitHubModelsProvider implements ILLMProvider {
  private baseUrl = 'https://models.github.ai';
  private modelsCache: GitHubModel[] | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  name = 'github_models';

  getModels(): Array<{
    id: string;
    name: string;
    contextWindow: number;
    inputCostPer1k: number;
    outputCostPer1k: number;
    capabilities: string[];
  }> {
    // Return static model list for GitHub Models (catalog can be fetched async when needed)
    return [
      {
        id: 'openai/gpt-4o',
        name: 'GPT-4o',
        contextWindow: 128000,
        inputCostPer1k: 0, // Free tier
        outputCostPer1k: 0, // Free tier
        capabilities: ['text', 'multimodal', 'vision', 'audio']
      },
      {
        id: 'openai/gpt-4o-mini',
        name: 'GPT-4o Mini',
        contextWindow: 128000,
        inputCostPer1k: 0, // Free tier
        outputCostPer1k: 0, // Free tier
        capabilities: ['text', 'multimodal', 'vision']
      },
      {
        id: 'meta/llama-3.1-405b-instruct',
        name: 'Llama 3.1 405B Instruct',
        contextWindow: 32768,
        inputCostPer1k: 0, // Free tier
        outputCostPer1k: 0, // Free tier
        capabilities: ['text', 'multilingual', 'reasoning']
      },
      {
        id: 'meta/llama-3.2-90b-vision-instruct',
        name: 'Llama 3.2 90B Vision',
        contextWindow: 8192,
        inputCostPer1k: 0, // Free tier
        outputCostPer1k: 0, // Free tier
        capabilities: ['text', 'vision', 'multimodal']
      },
      {
        id: 'microsoft/phi-3.5-moe-instruct',
        name: 'Phi-3.5 MoE Instruct',
        contextWindow: 131072,
        inputCostPer1k: 0, // Free tier
        outputCostPer1k: 0, // Free tier
        capabilities: ['text', 'reasoning', 'mathematics']
      },
      {
        id: 'mistralai/mistral-large-2411',
        name: 'Mistral Large 2411',
        contextWindow: 128000,
        inputCostPer1k: 0, // Free tier
        outputCostPer1k: 0, // Free tier
        capabilities: ['text', 'multilingual', 'reasoning']
      },
      {
        id: 'cohere/command-r-plus-08-2024',
        name: 'Command R+ 08-2024',
        contextWindow: 128000,
        inputCostPer1k: 0, // Free tier
        outputCostPer1k: 0, // Free tier
        capabilities: ['text', 'rag', 'tool-use']
      }
    ];
  }

  // Helper method to fetch live model catalog (for admin/config purposes)
  async getLiveModelCatalog(apiKey?: string): Promise<GitHubModel[]> {
    try {
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      };
      
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(`${this.baseUrl}/catalog/models`, { headers });

      if (!response.ok) {
        throw new Error(`GitHub Models API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching GitHub Models catalog:', error);
      return [];
    }
  }

  async sendPrompt(
    prompt: string,
    modelId: string,
    apiKey: string,
    options: any = {}
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    try {
      // Validate API key
      if (!apiKey || !apiKey.trim()) {
        throw new Error('GitHub token is required for GitHub Models API');
      }

      // Prepare the request
      const requestBody: GitHubChatRequest = {
        model: modelId,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: options.max_tokens || 1000,
        temperature: options.temperature || 0.7,
        stream: false,
      };

      // Add optional parameters
      if (options.top_p !== undefined) requestBody.top_p = options.top_p;
      if (options.frequency_penalty !== undefined) requestBody.frequency_penalty = options.frequency_penalty;
      if (options.presence_penalty !== undefined) requestBody.presence_penalty = options.presence_penalty;
      if (options.stop) requestBody.stop = Array.isArray(options.stop) ? options.stop : [options.stop];
      if (options.seed !== undefined) requestBody.seed = options.seed;
      
      // Handle response format
      if (options.response_format) {
        requestBody.response_format = options.response_format;
      }

      // Make the API request
      const response = await fetch(`${this.baseUrl}/inference/chat/completions`, {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${apiKey}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`GitHub Models API error (${response.status}): ${errorData}`);
      }

      const data: GitHubChatResponse = await response.json();

      if (!data.choices || data.choices.length === 0) {
        throw new Error('No response choices returned from GitHub Models API');
      }

      const choice = data.choices[0];
      const responseText = choice.message?.content || '';

      // Calculate approximate cost (GitHub Models is free for personal use, but we'll estimate for tracking)
      const estimatedCost = this.calculateEstimatedCost(
        data.usage?.prompt_tokens || 0,
        data.usage?.completion_tokens || 0,
        modelId
      );

      return {
        response: responseText,
        responseTime: responseTime,
        tokens: {
          input: data.usage?.prompt_tokens || 0,
          output: data.usage?.completion_tokens || 0,
        },
        cost: estimatedCost,
        modelId: modelId,
        success: true,
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        response: '',
        responseTime: responseTime,
        tokens: { input: 0, output: 0 },
        cost: 0,
        modelId: modelId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  private calculateEstimatedCost(promptTokens: number, completionTokens: number, modelId: string): number {
    // GitHub Models provides free access, but we'll estimate costs for tracking purposes
    // These are approximate values based on similar models from other providers
    
    const modelCosts: Record<string, { prompt: number; completion: number }> = {
      'openai/gpt-4o': { prompt: 0.0025, completion: 0.01 },
      'openai/gpt-4o-mini': { prompt: 0.00015, completion: 0.0006 },
      'meta/llama-3.1-405b-instruct': { prompt: 0.003, completion: 0.015 },
      'microsoft/phi-3.5-moe-instruct': { prompt: 0.0001, completion: 0.0004 },
      'mistralai/mistral-large-2411': { prompt: 0.002, completion: 0.006 },
    };

    const costs = modelCosts[modelId] || { prompt: 0.001, completion: 0.002 }; // Default fallback
    
    const promptCost = (promptTokens / 1000) * costs.prompt;
    const completionCost = (completionTokens / 1000) * costs.completion;
    
    return Math.round((promptCost + completionCost) * 100) / 100; // Round to 2 decimal places
  }

  // Additional methods for GitHub Models specific features
  async getModelDetails(modelId: string, apiKey: string): Promise<GitHubModel | null> {
    try {
      const models = await this.getModels();
      const modelData = models.find(m => m.id === modelId);
      
      if (!modelData && this.modelsCache) {
        return this.modelsCache.find(m => m.id === modelId) || null;
      }
      
      return null;
    } catch (error) {
      console.error('Error getting model details:', error);
      return null;
    }
  }

  async testConnection(apiKey: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.sendPrompt(
        'Hello, this is a test message.',
        'openai/gpt-4o-mini',
        apiKey,
        { max_tokens: 50 }
      );

      if (response.success) {
        return {
          success: true,
          message: 'Successfully connected to GitHub Models API'
        };
      } else {
        return {
          success: false,
          message: response.error || 'Failed to connect to GitHub Models API'
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed'
      };
    }
  }
}