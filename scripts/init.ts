// Initialize script - run database migrations and seed
import { db } from "../server/db";
import { users, llmProviders } from "@shared/schema";
import { hashPassword } from "../server/auth";
import { eq } from "drizzle-orm";

async function init() {
  console.log("Initializing PromptOps...");
  
  // Create admin user if not exists
  const existing = await db.select().from(users).where(eq(users.username, "admin")).limit(1);
  if (existing.length === 0) {
    const pwd = await hashPassword("admin123");
    await db.insert(users).values([
      { username: "admin", email: "admin@promptops.com", password: pwd, role: "admin", firstName: "Admin", lastName: "User", isActive: true },
      { username: "lead", email: "lead@promptops.com", password: pwd, role: "engineering_lead", firstName: "Sarah", lastName: "Chen", isActive: true },
      { username: "engineer", email: "engineer@promptops.com", password: pwd, role: "prompt_engineer", firstName: "John", lastName: "Doe", isActive: true },
    ]);
    console.log("✓ Created default users (password: admin123)");
  } else {
    console.log("✓ Users exist");
  }

  // Create LLM providers if not exists
  const provExist = await db.select().from(llmProviders).limit(1);
  if (provExist.length === 0) {
    await db.insert(llmProviders).values([
      { name: "openai", displayName: "OpenAI", baseUrl: "https://api.openai.com/v1", apiKeyRequired: true, models: [{ id: "gpt-4o", name: "GPT-4o", contextWindow: 128000, inputCostPer1k: 0.5, outputCostPer1k: 1.5, capabilities: ["text", "vision"] }], isActive: true },
      { name: "gemini", displayName: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com", apiKeyRequired: true, models: [{ id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", contextWindow: 1000000, inputCostPer1k: 0, outputCostPer1k: 0, capabilities: ["text", "vision"] }, { id: "gemini-2.0-flash-exp", name: "Gemini 2.0 Flash", contextWindow: 1000000, inputCostPer1k: 0, outputCostPer1k: 0, capabilities: ["text", "vision"] }], isActive: true },
      { name: "github_models", displayName: "GitHub Models", baseUrl: "https://models.github.ai", apiKeyRequired: true, models: [{ id: "openai/gpt-4o", name: "GPT-4o (Free)", contextWindow: 128000, inputCostPer1k: 0, outputCostPer1k: 0, capabilities: ["text", "vision"] }, { id: "meta/llama-3.1-405b-instruct", name: "Llama 3.1 405B", contextWindow: 32768, inputCostPer1k: 0, outputCostPer1k: 0, capabilities: ["text"] }], isActive: true },
      { name: "anthropic", displayName: "Anthropic", baseUrl: "https://api.anthropic.com", apiKeyRequired: true, models: [{ id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", contextWindow: 200000, inputCostPer1k: 0.3, outputCostPer1k: 1.5, capabilities: ["text", "vision"] }], isActive: true },
    ]);
    console.log("✓ Created LLM providers");
  } else {
    console.log("✓ LLM providers exist");
  }
  
  console.log("\n🚀 PromptOps initialization complete!");
  console.log("\nDefault login credentials:");
  console.log("  Username: admin");
  console.log("  Password: admin123");
}

init().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
