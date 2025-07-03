import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertUserSchema, insertPromptSchema, insertPromptVersionSchema, 
  insertApprovalSchema, insertApiKeySchema, insertLlmProviderSchema,
  insertUserLlmConfigSchema, insertFavoriteSchema, insertPromptComparisonSchema,
  insertPromptExecutionSchema
} from "@shared/schema";
import { llmService } from "./llm-service";
import { 
  requireAuth, 
  requireRole, 
  loginUser, 
  type AuthenticatedRequest 
} from "./auth";

export async function registerRoutes(app: Express): Promise<Server> {

  // Authentication routes
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      const result = await loginUser(username, password);
      
      if (!result) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      res.json({
        user: result.user,
        token: result.token
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.get('/api/auth/me', requireAuth, async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      return res.status(401).json({ message: "User not found" });
    }

    // Remove password from response
    const { password: _, ...userWithoutPassword } = req.user;
    res.json(userWithoutPassword);
  });

  // Prompts routes
  app.get('/api/prompts', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { category, status, environment, search } = req.query;
      const filters = {
        category: category as string,
        status: status as string,
        environment: environment as string,
        search: search as string,
        authorId: req.user?.id
      };

      const prompts = await storage.getPrompts(filters);
      res.json(prompts);
    } catch (error) {
      console.error("Failed to fetch prompts:", error);
      res.status(500).json({ message: "Failed to fetch prompts" });
    }
  });

  app.post('/api/prompts', requireAuth, requireRole(['prompt_engineer', 'engineering_lead', 'admin']), async (req: AuthenticatedRequest, res) => {
    try {
      const promptData = insertPromptSchema.parse({
        ...req.body,
        authorId: req.user?.id
      });

      const prompt = await storage.createPrompt(promptData);
      res.status(201).json(prompt);
    } catch (error) {
      console.error("Failed to create prompt:", error);
      res.status(500).json({ message: "Failed to create prompt" });
    }
  });

  app.get('/api/prompts/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const promptId = parseInt(req.params.id);
      const prompt = await storage.getPrompt(promptId);
      
      if (!prompt) {
        return res.status(404).json({ message: "Prompt not found" });
      }

      res.json(prompt);
    } catch (error) {
      console.error("Failed to fetch prompt:", error);
      res.status(500).json({ message: "Failed to fetch prompt" });
    }
  });

  app.put('/api/prompts/:id', requireAuth, requireRole(['prompt_engineer', 'engineering_lead', 'admin']), async (req: AuthenticatedRequest, res) => {
    try {
      const promptId = parseInt(req.params.id);
      const updateData = insertPromptSchema.partial().parse(req.body);

      const prompt = await storage.updatePrompt(promptId, updateData);
      
      if (!prompt) {
        return res.status(404).json({ message: "Prompt not found" });
      }

      res.json(prompt);
    } catch (error) {
      console.error("Failed to update prompt:", error);
      res.status(500).json({ message: "Failed to update prompt" });
    }
  });

  app.delete('/api/prompts/:id', requireAuth, requireRole(['engineering_lead', 'admin']), async (req: AuthenticatedRequest, res) => {
    try {
      const promptId = parseInt(req.params.id);
      const deleted = await storage.deletePrompt(promptId);
      
      if (!deleted) {
        return res.status(404).json({ message: "Prompt not found" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Failed to delete prompt:", error);
      res.status(500).json({ message: "Failed to delete prompt" });
    }
  });

  // Prompt Version routes
  app.get('/api/prompt-versions/:promptId', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const promptId = parseInt(req.params.promptId);
      const versions = await storage.getPromptVersions(promptId);
      res.json(versions);
    } catch (error) {
      console.error("Failed to fetch prompt versions:", error);
      res.status(500).json({ message: "Failed to fetch prompt versions" });
    }
  });

  app.post('/api/prompt-versions', requireAuth, requireRole(['prompt_engineer', 'engineering_lead', 'admin']), async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const versionData = insertPromptVersionSchema.parse({
        ...req.body,
        authorId: req.user.id,
        status: req.body.status || 'draft'
      });

      const version = await storage.createPromptVersion(versionData);
      res.status(201).json(version);
    } catch (error) {
      console.error("Failed to create prompt version:", error);
      res.status(500).json({ message: "Failed to create prompt version" });
    }
  });

  app.put('/api/prompt-versions/:id', requireAuth, requireRole(['prompt_engineer', 'engineering_lead', 'admin']), async (req: AuthenticatedRequest, res) => {
    try {
      const versionId = parseInt(req.params.id);
      const updateData = insertPromptVersionSchema.partial().parse(req.body);

      const version = await storage.updatePromptVersion(versionId, updateData);
      
      if (!version) {
        return res.status(404).json({ message: "Prompt version not found" });
      }

      res.json(version);
    } catch (error) {
      console.error("Failed to update prompt version:", error);
      res.status(500).json({ message: "Failed to update prompt version" });
    }
  });

  // LLM Provider routes
  app.get('/api/llm-providers', requireAuth, async (req, res) => {
    try {
      const providers = await storage.getLlmProviders();
      res.json(providers);
    } catch (error) {
      console.error("Failed to fetch LLM providers:", error);
      res.status(500).json({ message: "Failed to fetch LLM providers" });
    }
  });

  // User LLM Configuration routes
  app.get('/api/user-llm-configs', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const configs = await storage.getUserLlmConfigs(req.user.id);
      res.json(configs);
    } catch (error) {
      console.error("Failed to fetch user LLM configs:", error);
      res.status(500).json({ message: "Failed to fetch LLM configurations" });
    }
  });

  app.post('/api/user-llm-configs', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const configData = insertUserLlmConfigSchema.parse({
        ...req.body,
        userId: req.user.id
      });

      const config = await storage.createUserLlmConfig(configData);
      res.status(201).json(config);
    } catch (error) {
      console.error("Failed to create LLM config:", error);
      res.status(500).json({ message: "Failed to create LLM configuration" });
    }
  });

  app.put('/api/user-llm-configs/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const configId = parseInt(req.params.id);
      const updateData = insertUserLlmConfigSchema.partial().parse(req.body);

      const config = await storage.updateUserLlmConfig(configId, updateData);
      
      if (!config) {
        return res.status(404).json({ message: "Configuration not found" });
      }

      res.json(config);
    } catch (error) {
      console.error("Failed to update LLM config:", error);
      res.status(500).json({ message: "Failed to update LLM configuration" });
    }
  });

  app.delete('/api/user-llm-configs/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const configId = parseInt(req.params.id);
      const deleted = await storage.deleteUserLlmConfig(configId);
      
      if (!deleted) {
        return res.status(404).json({ message: "Configuration not found" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Failed to delete LLM config:", error);
      res.status(500).json({ message: "Failed to delete LLM configuration" });
    }
  });

  // Prompt Comparison routes
  app.post('/api/prompt-comparisons', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { prompt, models } = req.body;

      if (!prompt || !models || !Array.isArray(models) || models.length === 0) {
        return res.status(400).json({ message: "Prompt and models are required" });
      }

      // Get user's LLM configurations
      const userConfigs = await storage.getUserLlmConfigs(req.user.id);
      const results: any = {};

      // Execute prompt on each model
      for (const modelId of models) {
        try {
          const config = userConfigs.find(c => c.modelId === modelId);
          if (!config || !config.apiKey) {
            results[modelId] = {
              error: "API key not configured for this model",
              success: false
            };
            continue;
          }

          const response = await llmService.sendPrompt(
            prompt,
            modelId,
            config.apiKey,
            config.settings || {}
          );

          results[modelId] = response;
        } catch (error) {
          results[modelId] = {
            error: error instanceof Error ? error.message : "Unknown error",
            success: false,
            responseTime: 0,
            tokens: { input: 0, output: 0 },
            cost: 0,
            modelId: modelId
          };
        }
      }

      // Save comparison to database
      const comparisonData = insertPromptComparisonSchema.parse({
        name: `Comparison ${new Date().toISOString()}`,
        promptId: null, // For ad-hoc comparisons
        userId: req.user.id,
        models: models,
        results: results
      });

      const comparison = await storage.createPromptComparison(comparisonData);
      
      res.json({
        id: comparison.id,
        results: results,
        createdAt: comparison.createdAt
      });
    } catch (error) {
      console.error("Failed to execute prompt comparison:", error);
      res.status(500).json({ message: "Failed to execute prompt comparison" });
    }
  });

  app.get('/api/prompt-comparisons', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const comparisons = await storage.getPromptComparisons(req.user.id);
      res.json(comparisons);
    } catch (error) {
      console.error("Failed to fetch prompt comparisons:", error);
      res.status(500).json({ message: "Failed to fetch prompt comparisons" });
    }
  });

  // Favorites routes
  app.get('/api/favorites', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const favorites = await storage.getFavorites(req.user.id);
      res.json(favorites);
    } catch (error) {
      console.error("Failed to fetch favorites:", error);
      res.status(500).json({ message: "Failed to fetch favorites" });
    }
  });

  app.post('/api/favorites', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const favoriteData = insertFavoriteSchema.parse({
        ...req.body,
        userId: req.user.id
      });

      const favorite = await storage.addFavorite(favoriteData);
      res.status(201).json(favorite);
    } catch (error) {
      console.error("Failed to add favorite:", error);
      res.status(500).json({ message: "Failed to add favorite" });
    }
  });

  app.delete('/api/favorites/:promptId', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const promptId = parseInt(req.params.promptId);
      const deleted = await storage.removeFavorite(req.user.id, promptId);
      
      if (!deleted) {
        return res.status(404).json({ message: "Favorite not found" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Failed to remove favorite:", error);
      res.status(500).json({ message: "Failed to remove favorite" });
    }
  });

  // Stats endpoint
  app.get('/api/stats', requireAuth, async (req, res) => {
    try {
      const stats = await storage.getPromptStats();
      res.json(stats);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}