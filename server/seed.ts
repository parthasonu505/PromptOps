import { db } from "./db";
import { users, prompts, promptVersions, llmProviders } from "@shared/schema";
import { hashPassword } from "./auth";
import { eq, or } from "drizzle-orm";

async function seed() {
  console.log("Starting seed...");
  
  const existing = await db.select().from(users).where(eq(users.username, "admin")).limit(1);
  if (existing.length === 0) {
    const pwd = await hashPassword("admin123");
    await db.insert(users).values([
      { username: "admin", email: "admin@promptops.com", password: pwd, role: "admin", firstName: "Admin", lastName: "User", isActive: true },
      { username: "lead", email: "lead@promptops.com", password: pwd, role: "engineering_lead", firstName: "Sarah", lastName: "Chen", isActive: true },
      { username: "engineer", email: "engineer@promptops.com", password: pwd, role: "prompt_engineer", firstName: "John", lastName: "Doe", isActive: true },
    ]);
    console.log("Created users (password: admin123)");
  }

  // Check if gemini provider exists
  const geminiExists = await db.select().from(llmProviders).where(eq(llmProviders.name, "gemini")).limit(1);
  if (geminiExists.length === 0) {
    await db.insert(llmProviders).values({
      name: "gemini",
      displayName: "Google Gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      apiKeyRequired: true,
      models: [
        { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash", contextWindow: 1000000, inputCostPer1k: 0, outputCostPer1k: 0, capabilities: ["text", "vision"] },
        { id: "gemini-flash-latest", name: "Gemini Flash (Latest)", contextWindow: 1000000, inputCostPer1k: 0, outputCostPer1k: 0, capabilities: ["text", "vision"] },
        { id: "gemini-pro-latest", name: "Gemini Pro (Latest)", contextWindow: 2000000, inputCostPer1k: 1.25, outputCostPer1k: 5.0, capabilities: ["text", "vision", "code"] },
      ],
      isActive: true
    });
    console.log("Created Gemini provider");
  }

  // Check if github_models provider exists
  const githubExists = await db.select().from(llmProviders).where(eq(llmProviders.name, "github_models")).limit(1);
  if (githubExists.length === 0) {
    await db.insert(llmProviders).values({
      name: "github_models",
      displayName: "GitHub Models",
      baseUrl: "https://models.github.ai/inference",
      apiKeyRequired: true,
      models: [
        { id: "openai/gpt-4o", name: "GPT-4o (GitHub)", contextWindow: 128000, inputCostPer1k: 0, outputCostPer1k: 0, capabilities: ["text", "vision"] },
        { id: "openai/gpt-4o-mini", name: "GPT-4o Mini (GitHub)", contextWindow: 128000, inputCostPer1k: 0, outputCostPer1k: 0, capabilities: ["text", "vision"] },
        { id: "meta/llama-3.1-70b-instruct", name: "Llama 3.1 70B", contextWindow: 128000, inputCostPer1k: 0, outputCostPer1k: 0, capabilities: ["text"] },
      ],
      isActive: true
    });
    console.log("Created GitHub Models provider");
  }

  console.log("Seed completed!");
}

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
