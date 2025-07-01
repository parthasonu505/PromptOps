import { 
  users, prompts, promptVersions, approvals, auditLogs, apiKeys,
  type User, type InsertUser, type Prompt, type InsertPrompt,
  type PromptVersion, type InsertPromptVersion, type Approval, type InsertApproval,
  type AuditLog, type InsertAuditLog, type ApiKey, type InsertApiKey
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
}

export const storage = new DatabaseStorage();
