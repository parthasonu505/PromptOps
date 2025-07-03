import { Octokit } from "@octokit/rest";
import type { Prompt, PromptVersion } from "@shared/schema";

interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

export class GitHubIntegration {
  private octokit: Octokit;
  private config: GitHubConfig;

  constructor(config: GitHubConfig) {
    this.config = config;
    this.octokit = new Octokit({
      auth: config.token,
    });
  }

  // Generate safe filename from prompt name
  private generateFileName(name: string, id: number): string {
    const safeName = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
    return `${safeName}-${id}.json`;
  }

  // Save prompt to GitHub
  async savePrompt(prompt: Prompt): Promise<void> {
    try {
      const filePath = `prompts/${prompt.category}/${this.generateFileName(prompt.name, prompt.id)}`;
      
      // Create prompt data structure
      const promptData = {
        id: prompt.id,
        name: prompt.name,
        description: prompt.description,
        content: prompt.content,
        category: prompt.category,
        status: prompt.status,
        environment: prompt.environment,
        accessLevel: prompt.accessLevel,
        authorId: prompt.authorId,
        variables: prompt.variables,
        metadata: {
          createdAt: prompt.createdAt.toISOString(),
          updatedAt: prompt.updatedAt.toISOString(),
          usageCount: prompt.usageCount,
          rating: prompt.rating
        }
      };

      const content = JSON.stringify(promptData, null, 2);
      const encodedContent = Buffer.from(content).toString('base64');

      // Check if file exists
      let sha: string | undefined;
      try {
        const existingFile = await this.octokit.repos.getContent({
          owner: this.config.owner,
          repo: this.config.repo,
          path: filePath,
          ref: this.config.branch
        });

        if ('sha' in existingFile.data) {
          sha = existingFile.data.sha;
        }
      } catch (error: any) {
        // File doesn't exist, we'll create it
        if (error.status !== 404) {
          throw error;
        }
      }

      // Save to GitHub
      await this.octokit.repos.createOrUpdateFileContents({
        owner: this.config.owner,
        repo: this.config.repo,
        path: filePath,
        message: sha ? 
          `Update prompt: ${prompt.name} (ID: ${prompt.id})` : 
          `Create prompt: ${prompt.name} (ID: ${prompt.id})`,
        content: encodedContent,
        branch: this.config.branch,
        sha: sha
      });

      console.log(`Successfully saved prompt ${prompt.id} to GitHub: ${filePath}`);
    } catch (error: any) {
      console.error(`Failed to save prompt ${prompt.id} to GitHub:`, error);
      throw new Error(`GitHub save failed: ${error?.message || 'Unknown error'}`);
    }
  }

  // Save prompt version to GitHub
  async savePromptVersion(prompt: Prompt, version: PromptVersion): Promise<void> {
    try {
      const filePath = `prompts/${prompt.category}/versions/${this.generateFileName(prompt.name, prompt.id)}-${version.version}.json`;
      
      const versionData = {
        id: version.id,
        promptId: prompt.id,
        version: version.version,
        content: version.content,
        changelog: version.changelog,
        authorId: version.authorId,
        status: version.status,
        metadata: {
          createdAt: version.createdAt.toISOString()
        },
        promptMetadata: {
          name: prompt.name,
          category: prompt.category
        }
      };

      const content = JSON.stringify(versionData, null, 2);
      const encodedContent = Buffer.from(content).toString('base64');

      await this.octokit.repos.createOrUpdateFileContents({
        owner: this.config.owner,
        repo: this.config.repo,
        path: filePath,
        message: `Create version ${version.version} for prompt: ${prompt.name} (ID: ${prompt.id})`,
        content: encodedContent,
        branch: this.config.branch
      });

      console.log(`Successfully saved prompt version ${version.id} to GitHub: ${filePath}`);
    } catch (error: any) {
      console.error(`Failed to save prompt version ${version.id} to GitHub:`, error);
      throw new Error(`GitHub version save failed: ${error?.message || 'Unknown error'}`);
    }
  }

  // Initialize repository structure
  async initializeRepository(): Promise<void> {
    try {
      // Create directory structure
      const directories = [
        'prompts/customer_support',
        'prompts/code_generation', 
        'prompts/testing',
        'prompts/documentation',
        'prompts/analysis'
      ];

      for (const dir of directories) {
        try {
          await this.octokit.repos.createOrUpdateFileContents({
            owner: this.config.owner,
            repo: this.config.repo,
            path: `${dir}/.gitkeep`,
            message: `Initialize ${dir} directory`,
            content: Buffer.from('').toString('base64'),
            branch: this.config.branch
          });
        } catch (error: any) {
          if (error.status !== 422) {
            console.error(`Failed to create directory ${dir}:`, error);
          }
        }
      }

      // Create README
      const readmeContent = `# PromptOps Repository

This repository contains all prompts managed by the PromptOps platform.

## Structure

\`\`\`
prompts/
├── customer_support/     # Customer service prompts
├── code_generation/      # Code generation prompts  
├── testing/             # Testing and QA prompts
├── documentation/       # Documentation prompts
└── analysis/           # Analysis and reporting prompts
\`\`\`

Generated by PromptOps Platform
`;

      try {
        await this.octokit.repos.createOrUpdateFileContents({
          owner: this.config.owner,
          repo: this.config.repo,
          path: 'README.md',
          message: 'Initialize PromptOps repository',
          content: Buffer.from(readmeContent).toString('base64'),
          branch: this.config.branch
        });
      } catch (error: any) {
        if (error.status !== 422) {
          console.error('Failed to create README:', error);
        }
      }

      console.log('Successfully initialized GitHub repository structure');
    } catch (error: any) {
      console.error('Failed to initialize GitHub repository:', error);
      throw new Error(`GitHub initialization failed: ${error?.message || 'Unknown error'}`);
    }
  }

  // Test GitHub connection
  async testConnection(): Promise<boolean> {
    try {
      await this.octokit.repos.get({
        owner: this.config.owner,
        repo: this.config.repo
      });
      return true;
    } catch (error: any) {
      console.error('GitHub connection test failed:', error);
      return false;
    }
  }

  // Get repository information
  async getRepoInfo(): Promise<any> {
    try {
      const repo = await this.octokit.repos.get({
        owner: this.config.owner,
        repo: this.config.repo
      });
      
      return {
        name: repo.data.name,
        fullName: repo.data.full_name,
        private: repo.data.private,
        url: repo.data.html_url,
        defaultBranch: repo.data.default_branch,
        updatedAt: repo.data.updated_at
      };
    } catch (error: any) {
      console.error('Failed to get repository info:', error);
      throw new Error(`Failed to get repository info: ${error?.message || 'Unknown error'}`);
    }
  }
}