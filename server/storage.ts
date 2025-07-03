import { 
  users, prompts, promptVersions, approvals, auditLogs, apiKeys,
  llmProviders, userLlmConfigs, favorites, promptComparisons, promptExecutions, systemConfigs,
  type User, type InsertUser, type Prompt, type InsertPrompt,
  type PromptVersion, type InsertPromptVersion, type Approval, type InsertApproval,
  type AuditLog, type InsertAuditLog, type ApiKey, type InsertApiKey,
  type LlmProvider, type InsertLlmProvider, type UserLlmConfig, type InsertUserLlmConfig,
  type Favorite, type InsertFavorite, type PromptComparison, type InsertPromptComparison,
  type PromptExecution, type InsertPromptExecution, type SystemConfig, type InsertSystemConfig
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, ilike, count } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<InsertUser>): Promise<User | undefined>;
  getUsers(): Promise<User[]>;

  // Prompts
  getPrompt(id: number): Promise<Prompt | undefined>;
  getPrompts(filters?: {
    category?: string;
    status?: string;
    environment?: string;
    authorId?: number;
    search?: string;
  }): Promise<Prompt[]>;
  createPrompt(prompt: InsertPrompt): Promise<Prompt>;
  updatePrompt(id: number, prompt: Partial<InsertPrompt>): Promise<Prompt | undefined>;
  deletePrompt(id: number): Promise<boolean>;
  getPromptStats(): Promise<{
    totalPrompts: number;
    approvedPrompts: number;
    pendingPrompts: number;
    activeVersions: number;
  }>;

  // Prompt Versions
  getPromptVersion(id: number): Promise<PromptVersion | undefined>;
  getPromptVersions(promptId: number): Promise<PromptVersion[]>;
  createPromptVersion(version: InsertPromptVersion): Promise<PromptVersion>;
  updatePromptVersion(id: number, version: Partial<InsertPromptVersion>): Promise<PromptVersion | undefined>;

  // Approvals
  getApproval(id: number): Promise<Approval | undefined>;
  getApprovals(filters?: { status?: string; approverId?: number }): Promise<Approval[]>;
  createApproval(approval: InsertApproval): Promise<Approval>;
  updateApproval(id: number, approval: Partial<InsertApproval>): Promise<Approval | undefined>;

  // Audit Logs
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(filters?: { userId?: number; resourceType?: string }): Promise<AuditLog[]>;

  // API Keys
  getApiKey(id: number): Promise<ApiKey | undefined>;
  getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined>;
  getApiKeys(userId: number): Promise<ApiKey[]>;
  createApiKey(apiKey: InsertApiKey): Promise<ApiKey>;
  updateApiKey(id: number, apiKey: Partial<InsertApiKey>): Promise<ApiKey | undefined>;
  deleteApiKey(id: number): Promise<boolean>;

  // LLM Providers
  getLlmProvider(id: number): Promise<LlmProvider | undefined>;
  getLlmProviders(): Promise<LlmProvider[]>;
  createLlmProvider(provider: InsertLlmProvider): Promise<LlmProvider>;
  updateLlmProvider(id: number, provider: Partial<InsertLlmProvider>): Promise<LlmProvider | undefined>;

  // User LLM Configurations
  getUserLlmConfig(userId: number, providerId: number): Promise<UserLlmConfig | undefined>;
  getUserLlmConfigs(userId: number): Promise<UserLlmConfig[]>;
  createUserLlmConfig(config: InsertUserLlmConfig): Promise<UserLlmConfig>;
  updateUserLlmConfig(id: number, config: Partial<InsertUserLlmConfig>): Promise<UserLlmConfig | undefined>;
  deleteUserLlmConfig(id: number): Promise<boolean>;

  // Favorites
  getFavorites(userId: number): Promise<Favorite[]>;
  addFavorite(favorite: InsertFavorite): Promise<Favorite>;
  removeFavorite(userId: number, promptId: number): Promise<boolean>;
  isFavorite(userId: number, promptId: number): Promise<boolean>;

  // Prompt Comparisons
  getPromptComparison(id: number): Promise<PromptComparison | undefined>;
  getPromptComparisons(userId: number): Promise<PromptComparison[]>;
  createPromptComparison(comparison: InsertPromptComparison): Promise<PromptComparison>;
  updatePromptComparison(id: number, comparison: Partial<InsertPromptComparison>): Promise<PromptComparison | undefined>;
  deletePromptComparison(id: number): Promise<boolean>;

  // Prompt Executions
  getPromptExecution(id: number): Promise<PromptExecution | undefined>;
  getPromptExecutions(filters?: { userId?: number; promptId?: number; modelId?: string }): Promise<PromptExecution[]>;
  createPromptExecution(execution: InsertPromptExecution): Promise<PromptExecution>;

  // System Configuration
  getSystemConfig(key: string): Promise<SystemConfig | undefined>;
  getSystemConfigs(): Promise<SystemConfig[]>;
  setSystemConfig(config: InsertSystemConfig): Promise<SystemConfig>;
  updateSystemConfig(key: string, value: any): Promise<SystemConfig | undefined>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: number, updateUser: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...updateUser, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  // Prompts
  async getPrompt(id: number): Promise<Prompt | undefined> {
    const [prompt] = await db.select().from(prompts).where(eq(prompts.id, id));
    return prompt || undefined;
  }

  async getPrompts(filters?: {
    category?: string;
    status?: string;
    environment?: string;
    authorId?: number;
    search?: string;
  }): Promise<Prompt[]> {
    let query = db.select().from(prompts);
    
    const conditions = [];
    
    if (filters?.category) {
      conditions.push(eq(prompts.category, filters.category));
    }
    
    if (filters?.status) {
      conditions.push(eq(prompts.status, filters.status));
    }
    
    if (filters?.environment) {
      conditions.push(eq(prompts.environment, filters.environment));
    }
    
    if (filters?.authorId) {
      conditions.push(eq(prompts.authorId, filters.authorId));
    }
    
    if (filters?.search) {
      conditions.push(
        or(
          ilike(prompts.name, `%${filters.search}%`),
          ilike(prompts.description, `%${filters.search}%`)
        )
      );
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    return query.orderBy(desc(prompts.updatedAt));
  }

  async createPrompt(insertPrompt: InsertPrompt): Promise<Prompt> {
    const [prompt] = await db.insert(prompts).values(insertPrompt).returning();
    return prompt;
  }

  async updatePrompt(id: number, updatePrompt: Partial<InsertPrompt>): Promise<Prompt | undefined> {
    const [prompt] = await db
      .update(prompts)
      .set({ ...updatePrompt, updatedAt: new Date() })
      .where(eq(prompts.id, id))
      .returning();
    return prompt || undefined;
  }

  async deletePrompt(id: number): Promise<boolean> {
    const result = await db.delete(prompts).where(eq(prompts.id, id));
    return result.rowCount > 0;
  }

  async getPromptStats(): Promise<{
    totalPrompts: number;
    approvedPrompts: number;
    pendingPrompts: number;
    activeVersions: number;
  }> {
    const [totalResult] = await db.select({ count: count() }).from(prompts);
    const [approvedResult] = await db
      .select({ count: count() })
      .from(prompts)
      .where(eq(prompts.status, "approved"));
    const [pendingResult] = await db
      .select({ count: count() })
      .from(prompts)
      .where(eq(prompts.status, "pending_review"));
    const [versionsResult] = await db.select({ count: count() }).from(promptVersions);

    return {
      totalPrompts: totalResult.count,
      approvedPrompts: approvedResult.count,
      pendingPrompts: pendingResult.count,
      activeVersions: versionsResult.count,
    };
  }

  // Prompt Versions
  async getPromptVersion(id: number): Promise<PromptVersion | undefined> {
    const [version] = await db.select().from(promptVersions).where(eq(promptVersions.id, id));
    return version || undefined;
  }

  async getPromptVersions(promptId: number): Promise<PromptVersion[]> {
    return db
      .select()
      .from(promptVersions)
      .where(eq(promptVersions.promptId, promptId))
      .orderBy(desc(promptVersions.createdAt));
  }

  async createPromptVersion(insertVersion: InsertPromptVersion): Promise<PromptVersion> {
    const [version] = await db.insert(promptVersions).values(insertVersion).returning();
    return version;
  }

  async updatePromptVersion(id: number, updateVersion: Partial<InsertPromptVersion>): Promise<PromptVersion | undefined> {
    const [version] = await db
      .update(promptVersions)
      .set(updateVersion)
      .where(eq(promptVersions.id, id))
      .returning();
    return version || undefined;
  }

  // Approvals
  async getApproval(id: number): Promise<Approval | undefined> {
    const [approval] = await db.select().from(approvals).where(eq(approvals.id, id));
    return approval || undefined;
  }

  async getApprovals(filters?: { status?: string; approverId?: number }): Promise<Approval[]> {
    let query = db.select().from(approvals);
    
    const conditions = [];
    
    if (filters?.status) {
      conditions.push(eq(approvals.status, filters.status));
    }
    
    if (filters?.approverId) {
      conditions.push(eq(approvals.approverId, filters.approverId));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    return query.orderBy(desc(approvals.requestedAt));
  }

  async createApproval(insertApproval: InsertApproval): Promise<Approval> {
    const [approval] = await db.insert(approvals).values(insertApproval).returning();
    return approval;
  }

  async updateApproval(id: number, updateApproval: Partial<InsertApproval>): Promise<Approval | undefined> {
    const [approval] = await db
      .update(approvals)
      .set({ ...updateApproval, reviewedAt: new Date() })
      .where(eq(approvals.id, id))
      .returning();
    return approval || undefined;
  }

  // Audit Logs
  async createAuditLog(insertLog: InsertAuditLog): Promise<AuditLog> {
    const [log] = await db.insert(auditLogs).values(insertLog).returning();
    return log;
  }

  async getAuditLogs(filters?: { userId?: number; resourceType?: string }): Promise<AuditLog[]> {
    let query = db.select().from(auditLogs);
    
    const conditions = [];
    
    if (filters?.userId) {
      conditions.push(eq(auditLogs.userId, filters.userId));
    }
    
    if (filters?.resourceType) {
      conditions.push(eq(auditLogs.resourceType, filters.resourceType));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    return query.orderBy(desc(auditLogs.createdAt));
  }

  // API Keys
  async getApiKey(id: number): Promise<ApiKey | undefined> {
    const [apiKey] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
    return apiKey || undefined;
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined> {
    const [apiKey] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash));
    return apiKey || undefined;
  }

  async getApiKeys(userId: number): Promise<ApiKey[]> {
    return db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId))
      .orderBy(desc(apiKeys.createdAt));
  }

  async createApiKey(insertApiKey: InsertApiKey): Promise<ApiKey> {
    const [apiKey] = await db.insert(apiKeys).values(insertApiKey).returning();
    return apiKey;
  }

  async updateApiKey(id: number, updateApiKey: Partial<InsertApiKey>): Promise<ApiKey | undefined> {
    const [apiKey] = await db
      .update(apiKeys)
      .set(updateApiKey)
      .where(eq(apiKeys.id, id))
      .returning();
    return apiKey || undefined;
  }

  async deleteApiKey(id: number): Promise<boolean> {
    const result = await db.delete(apiKeys).where(eq(apiKeys.id, id));
    return result.rowCount > 0;
  }

  // LLM Providers
  async getLlmProvider(id: number): Promise<LlmProvider | undefined> {
    const [provider] = await db.select().from(llmProviders).where(eq(llmProviders.id, id));
    return provider || undefined;
  }

  async getLlmProviders(): Promise<LlmProvider[]> {
    return db.select().from(llmProviders).where(eq(llmProviders.isActive, true));
  }

  async createLlmProvider(insertProvider: InsertLlmProvider): Promise<LlmProvider> {
    const [provider] = await db.insert(llmProviders).values(insertProvider).returning();
    return provider;
  }

  async updateLlmProvider(id: number, updateProvider: Partial<InsertLlmProvider>): Promise<LlmProvider | undefined> {
    const [provider] = await db
      .update(llmProviders)
      .set(updateProvider)
      .where(eq(llmProviders.id, id))
      .returning();
    return provider || undefined;
  }

  // User LLM Configurations
  async getUserLlmConfig(userId: number, providerId: number): Promise<UserLlmConfig | undefined> {
    const [config] = await db
      .select()
      .from(userLlmConfigs)
      .where(and(eq(userLlmConfigs.userId, userId), eq(userLlmConfigs.providerId, providerId)));
    return config || undefined;
  }

  async getUserLlmConfigs(userId: number): Promise<UserLlmConfig[]> {
    return db
      .select()
      .from(userLlmConfigs)
      .where(and(eq(userLlmConfigs.userId, userId), eq(userLlmConfigs.isActive, true)));
  }

  async createUserLlmConfig(insertConfig: InsertUserLlmConfig): Promise<UserLlmConfig> {
    const [config] = await db.insert(userLlmConfigs).values(insertConfig).returning();
    return config;
  }

  async updateUserLlmConfig(id: number, updateConfig: Partial<InsertUserLlmConfig>): Promise<UserLlmConfig | undefined> {
    const [config] = await db
      .update(userLlmConfigs)
      .set(updateConfig)
      .where(eq(userLlmConfigs.id, id))
      .returning();
    return config || undefined;
  }

  async deleteUserLlmConfig(id: number): Promise<boolean> {
    const result = await db.delete(userLlmConfigs).where(eq(userLlmConfigs.id, id));
    return result.rowCount > 0;
  }

  // Favorites
  async getFavorites(userId: number): Promise<Favorite[]> {
    return db
      .select()
      .from(favorites)
      .where(eq(favorites.userId, userId))
      .orderBy(desc(favorites.createdAt));
  }

  async addFavorite(insertFavorite: InsertFavorite): Promise<Favorite> {
    const [favorite] = await db.insert(favorites).values(insertFavorite).returning();
    return favorite;
  }

  async removeFavorite(userId: number, promptId: number): Promise<boolean> {
    const result = await db
      .delete(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.promptId, promptId)));
    return result.rowCount > 0;
  }

  async isFavorite(userId: number, promptId: number): Promise<boolean> {
    const [favorite] = await db
      .select()
      .from(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.promptId, promptId)));
    return !!favorite;
  }

  // Prompt Comparisons
  async getPromptComparison(id: number): Promise<PromptComparison | undefined> {
    const [comparison] = await db.select().from(promptComparisons).where(eq(promptComparisons.id, id));
    return comparison || undefined;
  }

  async getPromptComparisons(userId: number): Promise<PromptComparison[]> {
    return db
      .select()
      .from(promptComparisons)
      .where(eq(promptComparisons.userId, userId))
      .orderBy(desc(promptComparisons.createdAt));
  }

  async createPromptComparison(insertComparison: InsertPromptComparison): Promise<PromptComparison> {
    const [comparison] = await db.insert(promptComparisons).values(insertComparison).returning();
    return comparison;
  }

  async updatePromptComparison(id: number, updateComparison: Partial<InsertPromptComparison>): Promise<PromptComparison | undefined> {
    const [comparison] = await db
      .update(promptComparisons)
      .set(updateComparison)
      .where(eq(promptComparisons.id, id))
      .returning();
    return comparison || undefined;
  }

  async deletePromptComparison(id: number): Promise<boolean> {
    const result = await db.delete(promptComparisons).where(eq(promptComparisons.id, id));
    return result.rowCount > 0;
  }

  // Prompt Executions
  async getPromptExecution(id: number): Promise<PromptExecution | undefined> {
    const [execution] = await db.select().from(promptExecutions).where(eq(promptExecutions.id, id));
    return execution || undefined;
  }

  async getPromptExecutions(filters?: { userId?: number; promptId?: number; modelId?: string }): Promise<PromptExecution[]> {
    let query = db.select().from(promptExecutions);
    
    const conditions = [];
    
    if (filters?.userId) {
      conditions.push(eq(promptExecutions.userId, filters.userId));
    }
    
    if (filters?.promptId) {
      conditions.push(eq(promptExecutions.promptId, filters.promptId));
    }
    
    if (filters?.modelId) {
      conditions.push(eq(promptExecutions.modelId, filters.modelId));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    return query.orderBy(desc(promptExecutions.createdAt));
  }

  async createPromptExecution(insertExecution: InsertPromptExecution): Promise<PromptExecution> {
    const [execution] = await db.insert(promptExecutions).values(insertExecution).returning();
    return execution;
  }

  // System Configuration
  async getSystemConfig(key: string): Promise<SystemConfig | undefined> {
    const [config] = await db.select().from(systemConfigs).where(eq(systemConfigs.key, key));
    return config || undefined;
  }

  async getSystemConfigs(): Promise<SystemConfig[]> {
    return db.select().from(systemConfigs).orderBy(systemConfigs.key);
  }

  async setSystemConfig(insertConfig: InsertSystemConfig): Promise<SystemConfig> {
    const [config] = await db
      .insert(systemConfigs)
      .values(insertConfig)
      .onConflictDoUpdate({
        target: systemConfigs.key,
        set: {
          value: insertConfig.value,
          description: insertConfig.description,
          updatedBy: insertConfig.updatedBy,
          updatedAt: new Date(),
        },
      })
      .returning();
    return config;
  }

  async updateSystemConfig(key: string, value: any): Promise<SystemConfig | undefined> {
    const [config] = await db
      .update(systemConfigs)
      .set({ value, updatedAt: new Date() })
      .where(eq(systemConfigs.key, key))
      .returning();
    return config || undefined;
  }
}

export const storage = new DatabaseStorage();
