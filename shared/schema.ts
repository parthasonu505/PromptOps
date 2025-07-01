import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("prompt_engineer"), // prompt_engineer, engineering_lead, api_developer, admin
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const prompts = pgTable("prompts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  content: text("content").notNull(),
  category: text("category").notNull(),
  status: text("status").notNull().default("draft"), // draft, pending_review, approved, rejected, archived
  environment: text("environment").notNull().default("development"), // development, staging, production
  accessLevel: text("access_level").notNull().default("private"), // private, team, organization
  authorId: integer("author_id").notNull().references(() => users.id),
  currentVersionId: integer("current_version_id").references(() => promptVersions.id),
  usageCount: integer("usage_count").notNull().default(0),
  rating: integer("rating").default(0), // 0-5 stars * 10 (0-50 for decimal precision)
  variables: jsonb("variables").$type<string[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const promptVersions = pgTable("prompt_versions", {
  id: serial("id").primaryKey(),
  promptId: integer("prompt_id").notNull().references(() => prompts.id),
  version: text("version").notNull(), // semantic versioning
  content: text("content").notNull(),
  changelog: text("changelog"),
  authorId: integer("author_id").notNull().references(() => users.id),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const approvals = pgTable("approvals", {
  id: serial("id").primaryKey(),
  promptId: integer("prompt_id").notNull().references(() => prompts.id),
  versionId: integer("version_id").notNull().references(() => promptVersions.id),
  requesterId: integer("requester_id").notNull().references(() => users.id),
  approverId: integer("approver_id").references(() => users.id),
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  comments: text("comments"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  action: text("action").notNull(), // created, updated, deleted, approved, rejected, etc.
  resourceType: text("resource_type").notNull(), // prompt, version, user, etc.
  resourceId: integer("resource_id").notNull(),
  details: jsonb("details").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  permissions: jsonb("permissions").$type<string[]>().default([]),
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  prompts: many(prompts),
  promptVersions: many(promptVersions),
  approvals: many(approvals),
  auditLogs: many(auditLogs),
  apiKeys: many(apiKeys),
}));

export const promptsRelations = relations(prompts, ({ one, many }) => ({
  author: one(users, {
    fields: [prompts.authorId],
    references: [users.id],
  }),
  currentVersion: one(promptVersions, {
    fields: [prompts.currentVersionId],
    references: [promptVersions.id],
  }),
  versions: many(promptVersions),
  approvals: many(approvals),
}));

export const promptVersionsRelations = relations(promptVersions, ({ one, many }) => ({
  prompt: one(prompts, {
    fields: [promptVersions.promptId],
    references: [prompts.id],
  }),
  author: one(users, {
    fields: [promptVersions.authorId],
    references: [users.id],
  }),
  approvals: many(approvals),
}));

export const approvalsRelations = relations(approvals, ({ one }) => ({
  prompt: one(prompts, {
    fields: [approvals.promptId],
    references: [prompts.id],
  }),
  version: one(promptVersions, {
    fields: [approvals.versionId],
    references: [promptVersions.id],
  }),
  requester: one(users, {
    fields: [approvals.requesterId],
    references: [users.id],
  }),
  approver: one(users, {
    fields: [approvals.approverId],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPromptSchema = createInsertSchema(prompts).omit({
  id: true,
  currentVersionId: true,
  usageCount: true,
  rating: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPromptVersionSchema = createInsertSchema(promptVersions).omit({
  id: true,
  createdAt: true,
});

export const insertApprovalSchema = createInsertSchema(approvals).omit({
  id: true,
  requestedAt: true,
  reviewedAt: true,
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  keyHash: true,
  lastUsedAt: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Prompt = typeof prompts.$inferSelect;
export type InsertPrompt = z.infer<typeof insertPromptSchema>;
export type PromptVersion = typeof promptVersions.$inferSelect;
export type InsertPromptVersion = z.infer<typeof insertPromptVersionSchema>;
export type Approval = typeof approvals.$inferSelect;
export type InsertApproval = z.infer<typeof insertApprovalSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
