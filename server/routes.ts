import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { 
  insertUserSchema, insertPromptSchema, insertPromptVersionSchema, 
  insertApprovalSchema, insertApiKeySchema, insertLlmProviderSchema,
  insertUserLlmConfigSchema, insertFavoriteSchema, insertPromptComparisonSchema,
  insertPromptExecutionSchema
} from "@shared/schema";
import { llmService } from "./llm-service";

// Simple session store for demo purposes
const sessions = new Map<string, { userId: number; role: string }>();

// Middleware to check authentication
const requireAuth = (req: any, res: any, next: any) => {
  const sessionId = req.headers['authorization']?.replace('Bearer ', '');
  const session = sessionId ? sessions.get(sessionId) : null;
  
  if (!session) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  req.user = session;
  next();
};

// Middleware to check role permissions
const requireRole = (roles: string[]) => (req: any, res: any, next: any) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Authentication routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password required" });
      }

      const user = await storage.getUserByUsername(username);
      if (!user || !await bcrypt.compare(password, user.password)) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      if (!user.isActive) {
        return res.status(401).json({ message: "Account is disabled" });
      }

      const sessionId = crypto.randomUUID();
      sessions.set(sessionId, { userId: user.id, role: user.role });

      res.json({
        token: sessionId,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
        }
      });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", requireAuth, (req, res) => {
    const sessionId = req.headers['authorization']?.replace('Bearer ', '');
    if (sessionId) {
      sessions.delete(sessionId);
    }
    res.json({ message: "Logged out successfully" });
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.user.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // User management routes
  app.get("/api/users", requireAuth, requireRole(["admin", "engineering_lead"]), async (req, res) => {
    try {
      const users = await storage.getUsers();
      res.json(users.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        isActive: user.isActive,
        createdAt: user.createdAt,
      })));
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/users", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      
      const user = await storage.createUser({
        ...userData,
        password: hashedPassword,
      });

      await storage.createAuditLog({
        userId: req.user.userId,
        action: "created",
        resourceType: "user",
        resourceId: user.id,
        details: { username: user.username, role: user.role },
      });

      res.status(201).json({
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        isActive: user.isActive,
      });
    } catch (error) {
      if (error.code === '23505') { // Unique constraint violation
        res.status(400).json({ message: "Username or email already exists" });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  // Prompt routes
  app.get("/api/prompts", requireAuth, async (req, res) => {
    try {
      const { category, status, environment, search } = req.query;
      const prompts = await storage.getPrompts({
        category: category as string,
        status: status as string,
        environment: environment as string,
        search: search as string,
      });

      res.json(prompts);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/prompts/stats", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getPromptStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/prompts/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const prompt = await storage.getPrompt(id);
      
      if (!prompt) {
        return res.status(404).json({ message: "Prompt not found" });
      }

      res.json(prompt);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/prompts", requireAuth, async (req, res) => {
    try {
      const promptData = insertPromptSchema.parse({
        ...req.body,
        authorId: req.user.userId,
      });

      const prompt = await storage.createPrompt(promptData);

      await storage.createAuditLog({
        userId: req.user.userId,
        action: "created",
        resourceType: "prompt",
        resourceId: prompt.id,
        details: { name: prompt.name, category: prompt.category },
      });

      res.status(201).json(prompt);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/prompts/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const prompt = await storage.getPrompt(id);
      
      if (!prompt) {
        return res.status(404).json({ message: "Prompt not found" });
      }

      // Check permissions
      if (prompt.authorId !== req.user.userId && !["admin", "engineering_lead"].includes(req.user.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const updateData = insertPromptSchema.partial().parse(req.body);
      const updatedPrompt = await storage.updatePrompt(id, updateData);

      await storage.createAuditLog({
        userId: req.user.userId,
        action: "updated",
        resourceType: "prompt",
        resourceId: id,
        details: updateData,
      });

      res.json(updatedPrompt);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/prompts/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const prompt = await storage.getPrompt(id);
      
      if (!prompt) {
        return res.status(404).json({ message: "Prompt not found" });
      }

      // Check permissions
      if (prompt.authorId !== req.user.userId && !["admin", "engineering_lead"].includes(req.user.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      await storage.deletePrompt(id);

      await storage.createAuditLog({
        userId: req.user.userId,
        action: "deleted",
        resourceType: "prompt",
        resourceId: id,
        details: { name: prompt.name },
      });

      res.json({ message: "Prompt deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Prompt versions routes
  app.get("/api/prompts/:id/versions", requireAuth, async (req, res) => {
    try {
      const promptId = parseInt(req.params.id);
      const versions = await storage.getPromptVersions(promptId);
      res.json(versions);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/prompts/:id/versions", requireAuth, async (req, res) => {
    try {
      const promptId = parseInt(req.params.id);
      const versionData = insertPromptVersionSchema.parse({
        ...req.body,
        promptId,
        authorId: req.user.userId,
      });

      const version = await storage.createPromptVersion(versionData);

      await storage.createAuditLog({
        userId: req.user.userId,
        action: "created",
        resourceType: "prompt_version",
        resourceId: version.id,
        details: { promptId, version: version.version },
      });

      res.status(201).json(version);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Approval routes
  app.get("/api/approvals", requireAuth, requireRole(["engineering_lead", "admin"]), async (req, res) => {
    try {
      const { status } = req.query;
      const approvals = await storage.getApprovals({
        status: status as string,
        approverId: req.user.role === "engineering_lead" ? req.user.userId : undefined,
      });
      res.json(approvals);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/approvals", requireAuth, async (req, res) => {
    try {
      const approvalData = insertApprovalSchema.parse({
        ...req.body,
        requesterId: req.user.userId,
      });

      const approval = await storage.createApproval(approvalData);

      await storage.createAuditLog({
        userId: req.user.userId,
        action: "requested_approval",
        resourceType: "approval",
        resourceId: approval.id,
        details: { promptId: approval.promptId, versionId: approval.versionId },
      });

      res.status(201).json(approval);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/approvals/:id", requireAuth, requireRole(["engineering_lead", "admin"]), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status, comments } = req.body;

      const approval = await storage.updateApproval(id, {
        status,
        comments,
        approverId: req.user.userId,
      });

      if (!approval) {
        return res.status(404).json({ message: "Approval not found" });
      }

      await storage.createAuditLog({
        userId: req.user.userId,
        action: status === "approved" ? "approved" : "rejected",
        resourceType: "approval",
        resourceId: id,
        details: { status, comments },
      });

      res.json(approval);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // API Keys routes
  app.get("/api/api-keys", requireAuth, async (req, res) => {
    try {
      const apiKeys = await storage.getApiKeys(req.user.userId);
      res.json(apiKeys.map(key => ({
        id: key.id,
        name: key.name,
        permissions: key.permissions,
        isActive: key.isActive,
        lastUsedAt: key.lastUsedAt,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
      })));
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/api-keys", requireAuth, async (req, res) => {
    try {
      const { name, permissions, expiresAt } = req.body;
      const key = crypto.randomBytes(32).toString('hex');
      const keyHash = crypto.createHash('sha256').update(key).digest('hex');

      const apiKey = await storage.createApiKey({
        userId: req.user.userId,
        name,
        keyHash,
        permissions: permissions || [],
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });

      await storage.createAuditLog({
        userId: req.user.userId,
        action: "created",
        resourceType: "api_key",
        resourceId: apiKey.id,
        details: { name, permissions },
      });

      res.status(201).json({
        id: apiKey.id,
        name: apiKey.name,
        key, // Only returned once
        permissions: apiKey.permissions,
        isActive: apiKey.isActive,
        createdAt: apiKey.createdAt,
        expiresAt: apiKey.expiresAt,
      });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Audit logs route
  app.get("/api/audit-logs", requireAuth, requireRole(["admin", "engineering_lead"]), async (req, res) => {
    try {
      const { resourceType } = req.query;
      const logs = await storage.getAuditLogs({
        resourceType: resourceType as string,
      });
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Public API for prompt consumption (requires API key)
  app.get("/api/public/prompts/:id", async (req, res) => {
    try {
      const apiKey = req.headers['x-api-key'] as string;
      if (!apiKey) {
        return res.status(401).json({ message: "API key required" });
      }

      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
      const validKey = await storage.getApiKeyByHash(keyHash);

      if (!validKey || !validKey.isActive) {
        return res.status(401).json({ message: "Invalid API key" });
      }

      if (validKey.expiresAt && validKey.expiresAt < new Date()) {
        return res.status(401).json({ message: "API key expired" });
      }

      const id = parseInt(req.params.id);
      const prompt = await storage.getPrompt(id);

      if (!prompt || prompt.status !== "approved") {
        return res.status(404).json({ message: "Prompt not found or not approved" });
      }

      // Update last used timestamp
      await storage.updateApiKey(validKey.id, { lastUsedAt: new Date() });

      res.json({
        id: prompt.id,
        name: prompt.name,
        content: prompt.content,
        variables: prompt.variables,
        version: prompt.currentVersionId,
      });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // LLM Provider routes
  app.get("/api/llm-providers", requireAuth, async (req, res) => {
    try {
      const providers = await storage.getLlmProviders();
      res.json(providers);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/llm-providers", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const providerData = insertLlmProviderSchema.parse(req.body);
      const provider = await storage.createLlmProvider(providerData);
      res.status(201).json(provider);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // User LLM Configuration routes
  app.get("/api/llm-configs", requireAuth, async (req, res) => {
    try {
      const configs = await storage.getUserLlmConfigs(req.user.userId);
      res.json(configs.map(config => ({
        id: config.id,
        providerId: config.providerId,
        isActive: config.isActive,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      })));
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/llm-configs", requireAuth, async (req, res) => {
    try {
      const { providerId, apiKey } = req.body;
      const encryptedApiKey = llmService.encryptApiKey(apiKey);
      
      const config = await storage.createUserLlmConfig({
        userId: req.user.userId,
        providerId,
        apiKey: encryptedApiKey,
      });

      res.status(201).json({
        id: config.id,
        providerId: config.providerId,
        isActive: config.isActive,
        createdAt: config.createdAt,
      });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/llm-configs/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteUserLlmConfig(id);
      
      if (!success) {
        return res.status(404).json({ message: "Configuration not found" });
      }

      res.json({ message: "Configuration deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Favorites routes
  app.get("/api/favorites", requireAuth, async (req, res) => {
    try {
      const favorites = await storage.getFavorites(req.user.userId);
      res.json(favorites);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/favorites", requireAuth, async (req, res) => {
    try {
      const { promptId } = req.body;
      const favorite = await storage.addFavorite({
        userId: req.user.userId,
        promptId,
      });

      res.status(201).json(favorite);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/favorites/:promptId", requireAuth, async (req, res) => {
    try {
      const promptId = parseInt(req.params.promptId);
      const success = await storage.removeFavorite(req.user.userId, promptId);
      
      if (!success) {
        return res.status(404).json({ message: "Favorite not found" });
      }

      res.json({ message: "Favorite removed successfully" });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Prompt Testing & Execution routes
  app.post("/api/prompts/:id/test", requireAuth, async (req, res) => {
    try {
      const promptId = parseInt(req.params.id);
      const { modelId, providerId, inputData, options } = req.body;

      const prompt = await storage.getPrompt(promptId);
      if (!prompt) {
        return res.status(404).json({ message: "Prompt not found" });
      }

      const userConfig = await storage.getUserLlmConfig(req.user.userId, providerId);
      if (!userConfig) {
        return res.status(400).json({ message: "LLM configuration not found" });
      }

      // Process prompt with variables
      let processedContent = prompt.content;
      if (inputData && typeof inputData === 'object') {
        Object.entries(inputData).forEach(([key, value]) => {
          processedContent = processedContent.replace(
            new RegExp(`{{${key}}}`, 'g'), 
            String(value)
          );
        });
      }

      const result = await llmService.sendPrompt(
        processedContent,
        providerId,
        modelId,
        userConfig.apiKey,
        options
      );

      // Store execution record
      await storage.createPromptExecution({
        userId: req.user.userId,
        promptId,
        modelId,
        inputData: inputData || {},
        response: result.response,
        responseTime: result.responseTime,
        tokens: result.tokens,
        cost: result.cost,
        success: result.success,
        error: result.error,
      });

      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Prompt Comparison routes
  app.get("/api/comparisons", requireAuth, async (req, res) => {
    try {
      const comparisons = await storage.getPromptComparisons(req.user.userId);
      res.json(comparisons);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/comparisons", requireAuth, async (req, res) => {
    try {
      const { name, description, promptId, models, inputData } = req.body;
      
      const prompt = await storage.getPrompt(promptId);
      if (!prompt) {
        return res.status(404).json({ message: "Prompt not found" });
      }

      // Process prompt with variables
      let processedContent = prompt.content;
      if (inputData && typeof inputData === 'object') {
        Object.entries(inputData).forEach(([key, value]) => {
          processedContent = processedContent.replace(
            new RegExp(`{{${key}}}`, 'g'), 
            String(value)
          );
        });
      }

      // Get user's LLM configurations
      const userConfigs = await storage.getUserLlmConfigs(req.user.userId);
      const modelConfigs = [];

      for (const modelId of models) {
        // Extract provider from model ID (format: provider:model)
        const [providerId] = modelId.split(':');
        const config = userConfigs.find(c => c.providerId.toString() === providerId);
        
        if (config) {
          modelConfigs.push({
            providerId,
            modelId,
            apiKey: config.apiKey,
          });
        }
      }

      if (modelConfigs.length === 0) {
        return res.status(400).json({ message: "No valid LLM configurations found" });
      }

      // Run comparison across models
      const results = await llmService.comparePrompts(processedContent, modelConfigs);

      const comparison = await storage.createPromptComparison({
        userId: req.user.userId,
        name,
        description,
        promptId,
        models,
        inputData: inputData || {},
        results,
      });

      res.status(201).json(comparison);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/comparisons/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const comparison = await storage.getPromptComparison(id);
      
      if (!comparison || comparison.userId !== req.user.userId) {
        return res.status(404).json({ message: "Comparison not found" });
      }

      res.json(comparison);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/comparisons/:id/score", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { modelId, score, notes } = req.body;

      const comparison = await storage.getPromptComparison(id);
      if (!comparison || comparison.userId !== req.user.userId) {
        return res.status(404).json({ message: "Comparison not found" });
      }

      // Update the score for the specific model result
      const updatedResults = comparison.results.map(result => 
        result.modelId === modelId 
          ? { ...result, score, notes }
          : result
      );

      const updatedComparison = await storage.updatePromptComparison(id, {
        results: updatedResults,
      });

      res.json(updatedComparison);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Execution History routes
  app.get("/api/executions", requireAuth, async (req, res) => {
    try {
      const { promptId, modelId } = req.query;
      const executions = await storage.getPromptExecutions({
        userId: req.user.userId,
        promptId: promptId ? parseInt(promptId as string) : undefined,
        modelId: modelId as string,
      });
      res.json(executions);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Analytics routes
  app.get("/api/analytics/usage", requireAuth, async (req, res) => {
    try {
      const executions = await storage.getPromptExecutions({ userId: req.user.userId });
      
      const analytics = {
        totalExecutions: executions.length,
        successRate: executions.filter(e => e.success).length / executions.length * 100,
        averageResponseTime: executions.reduce((sum, e) => sum + e.responseTime, 0) / executions.length,
        totalCost: executions.reduce((sum, e) => sum + e.cost, 0),
        modelUsage: executions.reduce((acc, e) => {
          acc[e.modelId] = (acc[e.modelId] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      };

      res.json(analytics);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
