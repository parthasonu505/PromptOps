import { DatabaseStorage, type IStorage } from "./storage";
import { GitHubService } from "./github-service";
import type { Prompt, PromptVersion, InsertPrompt, InsertPromptVersion } from "@shared/schema";

interface GitHubStorageConfig {
  token: string;
  owner: string;
  repo: string;
  branch?: string;
  syncMode: 'github-primary' | 'database-primary' | 'hybrid';
}

/**
 * Enhanced storage that integrates GitHub with database operations
 * Supports different sync modes:
 * - github-primary: GitHub is the source of truth, database is cache
 * - database-primary: Database is primary, GitHub is backup
 * - hybrid: Both are kept in sync
 */
export class GitHubStorage extends DatabaseStorage implements IStorage {
  private githubService: GitHubService;
  private config: GitHubStorageConfig;

  constructor(config: GitHubStorageConfig) {
    super();
    this.config = config;
    this.githubService = new GitHubService({
      token: config.token,
      owner: config.owner,
      repo: config.repo,
      branch: config.branch
    });
  }

  // Initialize GitHub repository if needed
  async initialize(): Promise<void> {
    try {
      await this.githubService.initializeRepository();
      console.log('GitHub repository initialized successfully');
    } catch (error) {
      console.error('Failed to initialize GitHub repository:', error);
      // Don't throw - allow system to work with database only
    }
  }

  // Override prompt creation to sync with GitHub
  async createPrompt(insertPrompt: InsertPrompt): Promise<Prompt> {
    try {
      // Create in database first
      const prompt = await super.createPrompt(insertPrompt);
      
      // Sync to GitHub based on mode
      if (this.config.syncMode === 'github-primary' || this.config.syncMode === 'hybrid') {
        try {
          await this.githubService.savePrompt(prompt);
          console.log(`Prompt ${prompt.id} synced to GitHub successfully`);
        } catch (error) {
          console.error(`Failed to sync prompt ${prompt.id} to GitHub:`, error);
          
          // In github-primary mode, rollback database changes if GitHub fails
          if (this.config.syncMode === 'github-primary') {
            try {
              await super.deletePrompt(prompt.id);
            } catch (rollbackError) {
              console.error('Failed to rollback prompt creation:', rollbackError);
            }
            throw new Error('Failed to create prompt: GitHub sync required but failed');
          }
        }
      }

      return prompt;
    } catch (error) {
      console.error('Failed to create prompt with GitHub sync:', error);
      throw error;
    }
  }

  // Override prompt update to sync with GitHub
  async updatePrompt(id: number, updateData: Partial<InsertPrompt>): Promise<Prompt> {
    try {
      // Update in database first
      const prompt = await super.updatePrompt(id, updateData);
      
      // Sync to GitHub based on mode
      if (this.config.syncMode === 'github-primary' || this.config.syncMode === 'hybrid') {
        try {
          await this.githubService.savePrompt(prompt);
          console.log(`Prompt ${prompt.id} update synced to GitHub successfully`);
        } catch (error) {
          console.error(`Failed to sync prompt ${prompt.id} update to GitHub:`, error);
          
          // In github-primary mode, this is a critical failure
          if (this.config.syncMode === 'github-primary') {
            throw new Error('Failed to update prompt: GitHub sync required but failed');
          }
        }
      }

      return prompt;
    } catch (error) {
      console.error('Failed to update prompt with GitHub sync:', error);
      throw error;
    }
  }

  // Override prompt deletion to sync with GitHub
  async deletePrompt(id: number): Promise<boolean> {
    try {
      // Get prompt details before deletion
      const prompt = await super.getPrompt(id);
      if (!prompt) {
        return false;
      }

      // Delete from GitHub first if it's the primary source
      if (this.config.syncMode === 'github-primary' || this.config.syncMode === 'hybrid') {
        try {
          await this.githubService.deletePrompt(prompt);
          console.log(`Prompt ${prompt.id} deleted from GitHub successfully`);
        } catch (error) {
          console.error(`Failed to delete prompt ${prompt.id} from GitHub:`, error);
          
          // In github-primary mode, don't proceed with database deletion
          if (this.config.syncMode === 'github-primary') {
            throw new Error('Failed to delete prompt: GitHub deletion required but failed');
          }
        }
      }

      // Delete from database
      const deleted = await super.deletePrompt(id);
      return deleted;
    } catch (error) {
      console.error('Failed to delete prompt with GitHub sync:', error);
      throw error;
    }
  }

  // Override prompt version creation to sync with GitHub
  async createPromptVersion(insertVersion: InsertPromptVersion): Promise<PromptVersion> {
    try {
      // Create version in database first
      const version = await super.createPromptVersion(insertVersion);
      
      // Get the prompt details for GitHub sync
      const prompt = await super.getPrompt(insertVersion.promptId);
      if (!prompt) {
        throw new Error('Prompt not found for version creation');
      }

      // Sync to GitHub based on mode
      if (this.config.syncMode === 'github-primary' || this.config.syncMode === 'hybrid') {
        try {
          await this.githubService.savePromptVersion(prompt, version);
          console.log(`Prompt version ${version.id} synced to GitHub successfully`);
        } catch (error) {
          console.error(`Failed to sync prompt version ${version.id} to GitHub:`, error);
          
          // In github-primary mode, rollback database changes
          if (this.config.syncMode === 'github-primary') {
            try {
              await super.deletePromptVersion(version.id);
            } catch (rollbackError) {
              console.error('Failed to rollback version creation:', rollbackError);
            }
            throw new Error('Failed to create version: GitHub sync required but failed');
          }
        }
      }

      return version;
    } catch (error) {
      console.error('Failed to create prompt version with GitHub sync:', error);
      throw error;
    }
  }

  // Sync all prompts from GitHub to database (useful for initialization)
  async syncFromGitHub(): Promise<{ synced: number; errors: number }> {
    let synced = 0;
    let errors = 0;

    try {
      console.log('Starting GitHub to database sync...');
      const githubPrompts = await this.githubService.getAllPrompts();
      
      for (const githubPrompt of githubPrompts) {
        try {
          // Check if prompt exists in database
          const existingPrompt = await super.getPrompt(githubPrompt.id);
          
          if (existingPrompt) {
            // Update existing prompt
            await super.updatePrompt(githubPrompt.id, {
              name: githubPrompt.name,
              description: githubPrompt.description,
              content: githubPrompt.content,
              category: githubPrompt.category,
              status: githubPrompt.status,
              environment: githubPrompt.environment,
              accessLevel: githubPrompt.accessLevel,
              variables: githubPrompt.variables
            });
          } else {
            // Create new prompt
            await super.createPrompt({
              name: githubPrompt.name,
              description: githubPrompt.description,
              content: githubPrompt.content,
              category: githubPrompt.category,
              status: githubPrompt.status,
              environment: githubPrompt.environment,
              accessLevel: githubPrompt.accessLevel,
              authorId: githubPrompt.authorId,
              variables: githubPrompt.variables
            });
          }
          
          synced++;
          console.log(`Synced prompt: ${githubPrompt.name} (ID: ${githubPrompt.id})`);
        } catch (error) {
          console.error(`Failed to sync prompt ${githubPrompt.id}:`, error);
          errors++;
        }
      }

      console.log(`GitHub sync completed: ${synced} synced, ${errors} errors`);
      return { synced, errors };
    } catch (error) {
      console.error('Failed to sync from GitHub:', error);
      throw error;
    }
  }

  // Sync all prompts from database to GitHub (useful for backup)
  async syncToGitHub(): Promise<{ synced: number; errors: number }> {
    let synced = 0;
    let errors = 0;

    try {
      console.log('Starting database to GitHub sync...');
      const prompts = await super.getAllPrompts();
      
      for (const prompt of prompts) {
        try {
          await this.githubService.savePrompt(prompt);
          synced++;
          console.log(`Synced prompt to GitHub: ${prompt.name} (ID: ${prompt.id})`);
        } catch (error) {
          console.error(`Failed to sync prompt ${prompt.id} to GitHub:`, error);
          errors++;
        }
      }

      console.log(`Database to GitHub sync completed: ${synced} synced, ${errors} errors`);
      return { synced, errors };
    } catch (error) {
      console.error('Failed to sync to GitHub:', error);
      throw error;
    }
  }

  // Get sync status
  async getSyncStatus(): Promise<{
    databaseCount: number;
    githubCount: number;
    lastSync?: Date;
    syncMode: string;
  }> {
    try {
      const databasePrompts = await super.getAllPrompts();
      const githubPrompts = await this.githubService.getAllPrompts();
      
      return {
        databaseCount: databasePrompts.length,
        githubCount: githubPrompts.length,
        lastSync: new Date(),
        syncMode: this.config.syncMode
      };
    } catch (error) {
      console.error('Failed to get sync status:', error);
      throw error;
    }
  }
}