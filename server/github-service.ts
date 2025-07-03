import { Octokit } from "@octokit/rest";
import { createHash } from "crypto";
import type { Prompt, PromptVersion } from "@shared/schema";

interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  branch?: string;
}

interface GitHubPrompt {
  id: number;
  name: string;
  description?: string;
  content: string;
  category: string;
  status: string;
  environment: string;
  accessLevel: string;
  authorId: number;
  variables: any[];
  metadata: {
    createdAt: string;
    updatedAt: string;
    usageCount: number;
    rating?: number;
  };
}

interface GitHubPromptVersion {
  id: number;
  promptId: number;
  version: string;
  content: string;
  changelog?: string;
  authorId: number;
  status: string;
  metadata: {
    createdAt: string;
  };
}

export class GitHubService {
  private octokit: Octokit;
  private config: GitHubConfig;

  constructor(config: GitHubConfig) {
    this.config = {
      ...config,
      branch: config.branch || 'main'
    };
    this.octokit = new Octokit({
      auth: config.token,
    });
  }

  // Generate a safe filename from prompt name
  private generateFileName(name: string, id: number): string {
    const safeName = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
    return `${safeName}-${id}.json`;
  }

  // Get file path for a prompt
  private getPromptPath(prompt: Prompt): string {
    return `prompts/${prompt.category}/${this.generateFileName(prompt.name, prompt.id)}`;
  }

  // Get file path for a prompt version
  private getVersionPath(prompt: Prompt, version: PromptVersion): string {
    return `prompts/${prompt.category}/versions/${this.generateFileName(prompt.name, prompt.id)}-${version.version}.json`;
  }

  // Convert database prompt to GitHub format
  private toGitHubPrompt(prompt: Prompt): GitHubPrompt {
    return {
      id: prompt.id,
      name: prompt.name,
      description: prompt.description || undefined,
      content: prompt.content,
      category: prompt.category,
      status: prompt.status,
      environment: prompt.environment,
      accessLevel: prompt.accessLevel,
      authorId: prompt.authorId,
      variables: prompt.variables || [],
      metadata: {
        createdAt: prompt.createdAt.toISOString(),
        updatedAt: prompt.updatedAt.toISOString(),
        usageCount: prompt.usageCount,
        rating: prompt.rating || undefined
      }
    };
  }

  // Convert database prompt version to GitHub format
  private toGitHubPromptVersion(prompt: Prompt, version: PromptVersion): GitHubPromptVersion {
    return {
      id: version.id,
      promptId: prompt.id,
      version: version.version,
      content: version.content,
      changelog: version.changelog,
      authorId: version.authorId,
      status: version.status,
      metadata: {
        createdAt: version.createdAt.toISOString()
      }
    };
  }

  // Save or update a prompt to GitHub
  async savePrompt(prompt: Prompt): Promise<void> {
    try {
      const filePath = this.getPromptPath(prompt);
      const gitHubPrompt = this.toGitHubPrompt(prompt);
      const content = JSON.stringify(gitHubPrompt, null, 2);
      const encodedContent = Buffer.from(content).toString('base64');

      // Check if file exists to determine if we're creating or updating
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

      // Create or update the file
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

  // Save a prompt version to GitHub
  async savePromptVersion(prompt: Prompt, version: PromptVersion): Promise<void> {
    try {
      const filePath = this.getVersionPath(prompt, version);
      const gitHubVersion = this.toGitHubPromptVersion(prompt, version);
      const content = JSON.stringify(gitHubVersion, null, 2);
      const encodedContent = Buffer.from(content).toString('base64');

      // Create the version file (versions are always new)
      await this.octokit.repos.createOrUpdateFileContents({
        owner: this.config.owner,
        repo: this.config.repo,
        path: filePath,
        message: `Create version ${version.version} for prompt: ${prompt.name} (ID: ${prompt.id})`,
        content: encodedContent,
        branch: this.config.branch
      });

      console.log(`Successfully saved prompt version ${version.id} to GitHub: ${filePath}`);
    } catch (error) {
      console.error(`Failed to save prompt version ${version.id} to GitHub:`, error);
      throw new Error(`GitHub version save failed: ${error.message}`);
    }
  }

  // Retrieve a prompt from GitHub
  async getPrompt(promptId: number): Promise<GitHubPrompt | null> {
    try {
      // Search for the prompt file by scanning the prompts directory
      const contents = await this.octokit.repos.getContent({
        owner: this.config.owner,
        repo: this.config.repo,
        path: 'prompts',
        ref: this.config.branch
      });

      if (!Array.isArray(contents.data)) {
        return null;
      }

      // Recursively search through categories
      for (const category of contents.data) {
        if (category.type === 'dir') {
          try {
            const categoryContents = await this.octokit.repos.getContent({
              owner: this.config.owner,
              repo: this.config.repo,
              path: category.path,
              ref: this.config.branch
            });

            if (Array.isArray(categoryContents.data)) {
              for (const file of categoryContents.data) {
                if (file.type === 'file' && file.name.endsWith('.json')) {
                  const fileContent = await this.octokit.repos.getContent({
                    owner: this.config.owner,
                    repo: this.config.repo,
                    path: file.path,
                    ref: this.config.branch
                  });

                  if ('content' in fileContent.data) {
                    const content = Buffer.from(fileContent.data.content, 'base64').toString();
                    const prompt: GitHubPrompt = JSON.parse(content);
                    
                    if (prompt.id === promptId) {
                      return prompt;
                    }
                  }
                }
              }
            }
          } catch (error) {
            // Skip categories that can't be read
            continue;
          }
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to retrieve prompt ${promptId} from GitHub:`, error);
      throw new Error(`GitHub retrieval failed: ${error.message}`);
    }
  }

  // List all prompts from GitHub
  async getAllPrompts(): Promise<GitHubPrompt[]> {
    try {
      const allPrompts: GitHubPrompt[] = [];
      
      const contents = await this.octokit.repos.getContent({
        owner: this.config.owner,
        repo: this.config.repo,
        path: 'prompts',
        ref: this.config.branch
      });

      if (!Array.isArray(contents.data)) {
        return allPrompts;
      }

      // Process each category directory
      for (const category of contents.data) {
        if (category.type === 'dir') {
          try {
            const categoryContents = await this.octokit.repos.getContent({
              owner: this.config.owner,
              repo: this.config.repo,
              path: category.path,
              ref: this.config.branch
            });

            if (Array.isArray(categoryContents.data)) {
              for (const file of categoryContents.data) {
                if (file.type === 'file' && file.name.endsWith('.json')) {
                  try {
                    const fileContent = await this.octokit.repos.getContent({
                      owner: this.config.owner,
                      repo: this.config.repo,
                      path: file.path,
                      ref: this.config.branch
                    });

                    if ('content' in fileContent.data) {
                      const content = Buffer.from(fileContent.data.content, 'base64').toString();
                      const prompt: GitHubPrompt = JSON.parse(content);
                      allPrompts.push(prompt);
                    }
                  } catch (error) {
                    console.error(`Failed to parse prompt file ${file.path}:`, error);
                  }
                }
              }
            }
          } catch (error) {
            console.error(`Failed to read category ${category.path}:`, error);
          }
        }
      }

      return allPrompts;
    } catch (error) {
      console.error('Failed to retrieve all prompts from GitHub:', error);
      throw new Error(`GitHub retrieval failed: ${error.message}`);
    }
  }

  // Delete a prompt from GitHub
  async deletePrompt(prompt: Prompt): Promise<void> {
    try {
      const filePath = this.getPromptPath(prompt);
      
      // Get the file to obtain its SHA
      const existingFile = await this.octokit.repos.getContent({
        owner: this.config.owner,
        repo: this.config.repo,
        path: filePath,
        ref: this.config.branch
      });

      if ('sha' in existingFile.data) {
        await this.octokit.repos.deleteFile({
          owner: this.config.owner,
          repo: this.config.repo,
          path: filePath,
          message: `Delete prompt: ${prompt.name} (ID: ${prompt.id})`,
          sha: existingFile.data.sha,
          branch: this.config.branch
        });

        console.log(`Successfully deleted prompt ${prompt.id} from GitHub: ${filePath}`);
      }
    } catch (error) {
      console.error(`Failed to delete prompt ${prompt.id} from GitHub:`, error);
      throw new Error(`GitHub deletion failed: ${error.message}`);
    }
  }

  // Initialize the repository structure
  async initializeRepository(): Promise<void> {
    try {
      // Create basic directory structure
      const directories = [
        'prompts/customer_support',
        'prompts/code_generation',
        'prompts/testing',
        'prompts/documentation',
        'prompts/analysis'
      ];

      for (const dir of directories) {
        try {
          // Create a .gitkeep file to ensure the directory exists
          await this.octokit.repos.createOrUpdateFileContents({
            owner: this.config.owner,
            repo: this.config.repo,
            path: `${dir}/.gitkeep`,
            message: `Initialize ${dir} directory`,
            content: Buffer.from('').toString('base64'),
            branch: this.config.branch
          });
        } catch (error: any) {
          // Directory might already exist, continue
          if (error.status !== 422) {
            console.error(`Failed to create directory ${dir}:`, error);
          }
        }
      }

      // Create README.md
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

Each prompt is stored as a JSON file containing:
- Prompt metadata (name, description, category, etc.)
- Content and variables
- Author information
- Usage statistics

## Versioning

Prompt versions are stored in \`versions/\` subdirectories within each category.
Each version maintains its own changelog and metadata.

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
    } catch (error) {
      console.error('Failed to initialize GitHub repository:', error);
      throw new Error(`GitHub initialization failed: ${error.message}`);
    }
  }
}