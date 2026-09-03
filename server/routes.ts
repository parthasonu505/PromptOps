import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import crypto from "crypto";
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
import { GitHubIntegration } from "./github-integration";

export async function registerRoutes(app: Express): Promise<Server> {
  // GitHub Integration setup
  let githubIntegration: GitHubIntegration | null = null;

  // Initialize GitHub integration if configured
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER && process.env.GITHUB_REPO) {
    githubIntegration = new GitHubIntegration({
      token: process.env.GITHUB_TOKEN,
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      branch: process.env.GITHUB_BRANCH || 'main'
    });
    console.log('GitHub integration initialized');
  }

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
  // ==========================================
  // API Keys Routes
  // ==========================================

  app.get('/api/api-keys', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      // Ensure storage.getApiKeys is implemented in your storage.ts file
      const apiKeys = await storage.getApiKeys(req.user.id);
      res.json(apiKeys);
    } catch (error) {
      console.error("Failed to fetch API keys:", error);
      res.status(500).json({ message: "Failed to fetch API keys" });
    }
  });

  app.post('/api/api-keys', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Generate a secure 32-byte key
      const rawKey = crypto.randomBytes(32).toString("hex");
      const keyPrefix = rawKey.substring(0, 8);
      
      // Hash the key for secure storage (never store plain text keys!)
      const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

      // Calculate expiry date if provided
      let expiresAt = null;
      if (req.body.expires_in_days) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + req.body.expires_in_days);
        expiresAt = expiryDate;
      }

      const keyData = {
        name: req.body.name,
        scopes: req.body.scopes || [],
        keyPrefix,
        keyHash,
        userId: req.user.id,
        expiresAt,
        isActive: true
      };

      // Ensure storage.createApiKey is implemented in your storage.ts file
      const apiKey = await storage.createApiKey(keyData);

      // Return the new API key object, injecting the unhashed key ONLY THIS ONE TIME
      res.status(201).json({
        ...apiKey,
        key: rawKey 
      });
    } catch (error) {
      console.error("Failed to create API key:", error);
      res.status(500).json({ message: "Failed to create API key" });
    }
  });

  // ==========================================
  // Public API Routes (Secured by X-API-Key)
  // ==========================================

  app.get('/api/public/prompts/:id', async (req, res) => {
    try {
      const apiKeyHeader = req.header('X-API-Key');
      
      if (!apiKeyHeader) {
        return res.status(401).json({ message: "Missing X-API-Key header" });
      }

      // 1. Hash the incoming plain-text key to compare with the database
      const keyHash = crypto.createHash("sha256").update(apiKeyHeader).digest("hex");

      // 2. Fetch the key from the database using the hash
      const apiKey = await storage.getApiKeyByHash(keyHash);

      if (!apiKey || !apiKey.isActive) {
        return res.status(401).json({ message: "Invalid or inactive API key" });
      }

      // 3. Check if the key has expired
      if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
        return res.status(401).json({ message: "API key has expired" });
      }

      // 4. Update the 'lastUsedAt' timestamp for usage analytics (Optional but recommended)
      if (typeof storage.updateApiKeyUsage === 'function') {
        await storage.updateApiKeyUsage(apiKey.id).catch(err => 
          console.error("Failed to update API key usage:", err)
        );
      }

      // 5. Fetch the requested prompt
      const promptId = parseInt(req.params.id);
      if (isNaN(promptId)) {
        return res.status(400).json({ message: "Invalid prompt ID" });
      }

      const prompt = await storage.getPrompt(promptId);
      
      if (!prompt) {
        return res.status(404).json({ message: "Prompt not found" });
      }

      // Return the prompt
      res.json(prompt);
      
    } catch (error) {
      console.error("Public API error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==========================================
  // Approvals Routes
  // ==========================================

  app.get('/api/approvals', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const statusFilter = req.query.status as string | undefined;
      const isLeadOrAdmin = req.user.role === 'engineering_lead' || req.user.role === 'admin';

      const filters: any = {};
      
      if (statusFilter) {
        filters.status = statusFilter;
      }
      
      // Role-based filtering: if not a lead or admin, only show their own requests
      if (!isLeadOrAdmin) {
        filters.requesterId = req.user.id;
      }

      const approvals = await storage.getApprovals(filters);
      res.json(approvals);
    } catch (error) {
      console.error("Failed to fetch approvals:", error);
      res.status(500).json({ message: "Failed to fetch approvals" });
    }
  });

  app.post('/api/approvals', requireAuth, requireRole(['prompt_engineer', 'engineering_lead', 'admin']), async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const approvalData = insertApprovalSchema.parse({
        ...req.body,
        requesterId: req.user.id,
        status: 'pending'
      });

      // 1. Verify the version exists
      const version = await storage.getPromptVersion(approvalData.versionId);
      if (!version) {
        return res.status(404).json({ message: "Version not found" });
      }

      // 2. Eval Gate Logic (Temporarily bypassed)
      const isAdmin = req.user.role === 'admin';
      
      if (!isAdmin) {
        // TODO: Re-enable this when PromptEval table is migrated to Node.js
        /*
        const promptId = approvalData.promptId || version.promptId;
        const activeEvalsCount = await storage.getActiveEvalsCount(promptId);

        if (activeEvalsCount > 0 && version.evalStatus !== 'passed') {
          return res.status(422).json({
            detail: `Version '${version.version}' must pass all eval suites before it can be submitted...`
          });
        }
        */
      }

      // 3. Create the approval
      const approval = await storage.createApproval(approvalData);
      res.status(201).json(approval);
      
    } catch (error) {
      console.error("Failed to create approval:", error);
      res.status(500).json({ message: "Failed to create approval" });
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
      
      // Auto-sync to GitHub if configured
      if (githubIntegration) {
        try {
          await githubIntegration.savePrompt(prompt);
          console.log(`Prompt ${prompt.id} automatically synced to GitHub`);
        } catch (githubError) {
          console.error(`Failed to auto-sync prompt ${prompt.id} to GitHub:`, githubError);
          // Don't fail the request, just log the error
        }
      }
      
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

      // Auto-sync to GitHub if configured
      if (githubIntegration) {
        try {
          await githubIntegration.savePrompt(prompt);
          console.log(`Prompt ${prompt.id} update automatically synced to GitHub`);
        } catch (githubError) {
          console.error(`Failed to auto-sync prompt ${prompt.id} update to GitHub:`, githubError);
          // Don't fail the request, just log the error
        }
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

  // LLM Providers endpoint
  app.get('/api/llm-providers', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const providers = llmService.getProviders();
      res.json(providers);
    } catch (error) {
      console.error("Failed to fetch LLM providers:", error);
      res.status(500).json({ message: "Failed to fetch LLM providers" });
    }
  });

  // Test LLM endpoint for playground
  app.post('/api/llm/test', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { provider, modelId, prompt, options = {} } = req.body;

      if (!provider || !modelId || !prompt) {
        return res.status(400).json({ 
          message: "Provider, modelId, and prompt are required" 
        });
      }

      // For GitHub Models, we need to get the user's GitHub token
      let apiKey = '';
      
      if (provider === 'github_models') {
        // For GitHub Models, we expect the user to have a GitHub token
        // This would be configured in their environment or provided via a config
        apiKey = process.env.GITHUB_TOKEN || '';
        
        if (!apiKey) {
          return res.status(400).json({ 
            message: "GitHub token is required for GitHub Models. Please set GITHUB_TOKEN environment variable." 
          });
        }
      } else {
        // For other providers, get the user's API key from their config
        const userConfigs = await storage.getUserLlmConfigs(req.user.id);
        const config = userConfigs.find(c => c.provider?.name === provider && c.isActive);
        
        if (!config) {
          return res.status(400).json({ 
            message: `No active configuration found for ${provider}` 
          });
        }
        
        apiKey = config.apiKey;
      }

      const result = await llmService.sendPrompt(
        prompt,
        provider,
        modelId,
        apiKey,
        options
      );

      res.json(result);
    } catch (error) {
      console.error("Failed to test LLM prompt:", error);
      res.status(500).json({ 
        message: "Failed to test prompt",
        error: error instanceof Error ? error.message : "Unknown error"
      });
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

  // GitHub Integration endpoints

  // GitHub configuration endpoint
  app.get('/api/github/config', requireAuth, requireRole(['admin']), async (req, res) => {
    try {
      const config = {
        enabled: !!githubIntegration,
        owner: process.env.GITHUB_OWNER || null,
        repo: process.env.GITHUB_REPO || null,
        branch: process.env.GITHUB_BRANCH || 'main'
      };
      res.json(config);
    } catch (error) {
      console.error("Failed to get GitHub config:", error);
      res.status(500).json({ message: "Failed to get GitHub configuration" });
    }
  });

  // Test GitHub connection
  app.post('/api/github/test', requireAuth, requireRole(['admin']), async (req, res) => {
    try {
      if (!githubIntegration) {
        return res.status(400).json({ message: "GitHub integration not configured" });
      }

      const connected = await githubIntegration.testConnection();
      const repoInfo = connected ? await githubIntegration.getRepoInfo() : null;

      res.json({
        connected,
        repoInfo
      });
    } catch (error) {
      console.error("Failed to test GitHub connection:", error);
      res.status(500).json({ message: "Failed to test GitHub connection" });
    }
  });

  // Initialize GitHub repository
  app.post('/api/github/initialize', requireAuth, requireRole(['admin']), async (req, res) => {
    try {
      if (!githubIntegration) {
        return res.status(400).json({ message: "GitHub integration not configured" });
      }

      await githubIntegration.initializeRepository();
      res.json({ message: "GitHub repository initialized successfully" });
    } catch (error) {
      console.error("Failed to initialize GitHub repository:", error);
      res.status(500).json({ message: "Failed to initialize GitHub repository" });
    }
  });

  // Manually sync a prompt to GitHub
  app.post('/api/github/sync/prompt/:id', requireAuth, requireRole(['admin', 'engineering_lead']), async (req, res) => {
    try {
      if (!githubIntegration) {
        return res.status(400).json({ message: "GitHub integration not configured" });
      }

      const promptId = parseInt(req.params.id);
      const prompt = await storage.getPrompt(promptId);
      
      if (!prompt) {
        return res.status(404).json({ message: "Prompt not found" });
      }

      await githubIntegration.savePrompt(prompt);
      res.json({ message: `Prompt ${promptId} synced to GitHub successfully` });
    } catch (error) {
      console.error("Failed to sync prompt to GitHub:", error);
      res.status(500).json({ message: "Failed to sync prompt to GitHub" });
    }
  });

  // Sync all prompts to GitHub
  app.post('/api/github/sync/all', requireAuth, requireRole(['admin']), async (req, res) => {
    try {
      if (!githubIntegration) {
        return res.status(400).json({ message: "GitHub integration not configured" });
      }

      const prompts = await storage.getPrompts();
      let synced = 0;
      let errors = 0;

      for (const prompt of prompts) {
        try {
          await githubIntegration.savePrompt(prompt);
          synced++;
        } catch (error) {
          console.error(`Failed to sync prompt ${prompt.id}:`, error);
          errors++;
        }
      }

      res.json({ 
        message: `Sync completed: ${synced} prompts synced, ${errors} errors`,
        synced,
        errors
      });
    } catch (error) {
      console.error("Failed to sync all prompts to GitHub:", error);
      res.status(500).json({ message: "Failed to sync all prompts to GitHub" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}