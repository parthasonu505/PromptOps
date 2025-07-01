import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { 
  insertUserSchema, insertPromptSchema, insertPromptVersionSchema, 
  insertApprovalSchema, insertApiKeySchema 
} from "@shared/schema";

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

  const httpServer = createServer(app);
  return httpServer;
}
