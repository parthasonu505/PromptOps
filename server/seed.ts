import { db } from "./db";
import { llmProviders, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

// Seed LLM Providers
const seedProviders = async () => {
  console.log("Seeding LLM providers...");

  const providersData = [
    {
      name: "openai",
      displayName: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      apiKeyRequired: true,
      models: [
        {
          id: "gpt-4o",
          name: "GPT-4o",
          contextWindow: 128000,
          inputCostPer1k: 250, // $0.0025 per 1k tokens in cents
          outputCostPer1k: 1000, // $0.01 per 1k tokens in cents
          capabilities: ["text", "vision", "function-calling"]
        },
        {
          id: "gpt-4o-mini",
          name: "GPT-4o Mini",
          contextWindow: 128000,
          inputCostPer1k: 15, // $0.00015 per 1k tokens in cents
          outputCostPer1k: 60, // $0.0006 per 1k tokens in cents
          capabilities: ["text", "vision", "function-calling"]
        },
        {
          id: "gpt-3.5-turbo",
          name: "GPT-3.5 Turbo",
          contextWindow: 16385,
          inputCostPer1k: 50, // $0.0005 per 1k tokens in cents
          outputCostPer1k: 150, // $0.0015 per 1k tokens in cents
          capabilities: ["text", "function-calling"]
        }
      ],
      isActive: true
    },
    {
      name: "anthropic",
      displayName: "Anthropic",
      baseUrl: "https://api.anthropic.com",
      apiKeyRequired: true,
      models: [
        {
          id: "claude-sonnet-4-20250514",
          name: "Claude 4.0 Sonnet",
          contextWindow: 200000,
          inputCostPer1k: 300, // $0.003 per 1k tokens in cents
          outputCostPer1k: 1500, // $0.015 per 1k tokens in cents
          capabilities: ["text", "vision", "document-analysis"]
        },
        {
          id: "claude-3-7-sonnet-20250219",
          name: "Claude 3.7 Sonnet",
          contextWindow: 200000,
          inputCostPer1k: 300, // $0.003 per 1k tokens in cents
          outputCostPer1k: 1500, // $0.015 per 1k tokens in cents
          capabilities: ["text", "vision", "document-analysis"]
        },
        {
          id: "claude-3-5-haiku-20241022",
          name: "Claude 3.5 Haiku",
          contextWindow: 200000,
          inputCostPer1k: 100, // $0.001 per 1k tokens in cents
          outputCostPer1k: 500, // $0.005 per 1k tokens in cents
          capabilities: ["text", "vision"]
        }
      ],
      isActive: true
    },
    {
      name: "google",
      displayName: "Google AI",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      apiKeyRequired: true,
      models: [
        {
          id: "gemini-2.5-flash",
          name: "Gemini 2.5 Flash",
          contextWindow: 1048576,
          inputCostPer1k: 7.5, // $0.000075 per 1k tokens in cents
          outputCostPer1k: 30, // $0.0003 per 1k tokens in cents
          capabilities: ["text", "vision", "audio", "video"]
        },
        {
          id: "gemini-2.5-pro",
          name: "Gemini 2.5 Pro",
          contextWindow: 2097152,
          inputCostPer1k: 125, // $0.00125 per 1k tokens in cents
          outputCostPer1k: 500, // $0.005 per 1k tokens in cents
          capabilities: ["text", "vision", "audio", "video", "code-execution"]
        },
        {
          id: "gemini-1.5-flash",
          name: "Gemini 1.5 Flash",
          contextWindow: 1048576,
          inputCostPer1k: 7.5, // $0.000075 per 1k tokens in cents
          outputCostPer1k: 30, // $0.0003 per 1k tokens in cents
          capabilities: ["text", "vision", "audio", "video"]
        }
      ],
      isActive: true
    }
  ];

  for (const providerData of providersData) {
    // Check if provider already exists
    const existingProvider = await db.select()
      .from(llmProviders)
      .where(eq(llmProviders.name, providerData.name))
      .limit(1);

    if (existingProvider.length === 0) {
      await db.insert(llmProviders).values(providerData);
      console.log(`✓ Seeded provider: ${providerData.displayName}`);
    } else {
      // Update existing provider with latest models and pricing
      await db.update(llmProviders)
        .set({
          models: providerData.models,
          updatedAt: new Date()
        })
        .where(eq(llmProviders.name, providerData.name));
      console.log(`✓ Updated provider: ${providerData.displayName}`);
    }
  }
};

// Seed sample users for development
const seedUsers = async () => {
  console.log("Seeding sample users...");

  const sampleUsers = [
    {
      username: "admin",
      email: "admin@promptops.dev",
      password: await bcrypt.hash("admin123", 10),
      role: "admin",
      firstName: "Admin",
      lastName: "User"
    },
    {
      username: "engineer",
      email: "engineer@promptops.dev",
      password: await bcrypt.hash("engineer123", 10),
      role: "prompt_engineer",
      firstName: "Prompt",
      lastName: "Engineer"
    },
    {
      username: "lead",
      email: "lead@promptops.dev",
      password: await bcrypt.hash("lead123", 10),
      role: "engineering_lead",
      firstName: "Engineering",
      lastName: "Lead"
    }
  ];

  for (const userData of sampleUsers) {
    // Check if user already exists
    const existingUser = await db.select()
      .from(users)
      .where(eq(users.username, userData.username))
      .limit(1);

    if (existingUser.length === 0) {
      await db.insert(users).values(userData);
      console.log(`✓ Seeded user: ${userData.username} (${userData.role})`);
    } else {
      console.log(`✓ User already exists: ${userData.username}`);
    }
  }
};

export async function seedDatabase() {
  try {
    await seedProviders();
    await seedUsers();
    console.log("✅ Database seeding completed successfully");
  } catch (error) {
    console.error("❌ Database seeding failed:", error);
    throw error;
  }
}

// Run seeding if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}