import { BaseIntegration, createActionResult } from "../base";
import type {
  IntegrationDefinition,
  ActionContext,
  ActionResult,
  ConnectionCredentials,
} from "../types";

export class GitHubIntegration extends BaseIntegration {
  readonly definition: IntegrationDefinition = {
    config: {
      id: "github",
      name: "GitHub",
      description: "Manage repositories, issues, pull requests, and automate GitHub workflows",
      icon: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/github.svg",
      category: "developer",
      authType: "oauth2",
      website: "https://github.com",
      docsUrl: "https://docs.github.com/en/rest",
      oauth2: {
        authorizationUrl: "https://github.com/login/oauth/authorize",
        tokenUrl: "https://github.com/login/oauth/access_token",
        scopes: ["repo", "read:user", "read:org"],
      },
    },
    actions: [
      {
        id: "create_issue",
        name: "Create Issue",
        description: "Create a new issue in a repository",
        inputSchema: {
          owner: {
            type: "string",
            description: "Repository owner",
            required: true,
          },
          repo: {
            type: "string",
            description: "Repository name",
            required: true,
          },
          title: {
            type: "string",
            description: "Issue title",
            required: true,
          },
          body: {
            type: "string",
            description: "Issue body (markdown supported)",
          },
          labels: {
            type: "array",
            description: "Labels to apply",
          },
          assignees: {
            type: "array",
            description: "Usernames to assign",
          },
        },
        outputSchema: {
          id: { type: "number" },
          number: { type: "number" },
          html_url: { type: "string" },
        },
      },
      {
        id: "create_pull_request",
        name: "Create Pull Request",
        description: "Create a new pull request",
        inputSchema: {
          owner: {
            type: "string",
            description: "Repository owner",
            required: true,
          },
          repo: {
            type: "string",
            description: "Repository name",
            required: true,
          },
          title: {
            type: "string",
            description: "PR title",
            required: true,
          },
          head: {
            type: "string",
            description: "Branch containing changes",
            required: true,
          },
          base: {
            type: "string",
            description: "Branch to merge into",
            required: true,
          },
          body: {
            type: "string",
            description: "PR description",
          },
        },
        outputSchema: {
          id: { type: "number" },
          number: { type: "number" },
          html_url: { type: "string" },
        },
      },
      {
        id: "list_repos",
        name: "List Repositories",
        description: "List repositories for the authenticated user",
        inputSchema: {
          type: {
            type: "string",
            description: "Type of repos (all, owner, member)",
            default: "all",
          },
          sort: {
            type: "string",
            description: "Sort by (created, updated, pushed, full_name)",
            default: "updated",
          },
          per_page: {
            type: "number",
            description: "Results per page (max 100)",
            default: 30,
          },
        },
        outputSchema: {
          repos: { type: "array" },
        },
      },
      {
        id: "get_file_content",
        name: "Get File Content",
        description: "Get the content of a file from a repository",
        inputSchema: {
          owner: {
            type: "string",
            description: "Repository owner",
            required: true,
          },
          repo: {
            type: "string",
            description: "Repository name",
            required: true,
          },
          path: {
            type: "string",
            description: "Path to file",
            required: true,
          },
          ref: {
            type: "string",
            description: "Branch, tag, or commit SHA",
          },
        },
        outputSchema: {
          content: { type: "string" },
          sha: { type: "string" },
          size: { type: "number" },
        },
      },
      {
        id: "create_or_update_file",
        name: "Create or Update File",
        description: "Create or update a file in a repository",
        inputSchema: {
          owner: {
            type: "string",
            description: "Repository owner",
            required: true,
          },
          repo: {
            type: "string",
            description: "Repository name",
            required: true,
          },
          path: {
            type: "string",
            description: "Path to file",
            required: true,
          },
          content: {
            type: "string",
            description: "File content",
            required: true,
          },
          message: {
            type: "string",
            description: "Commit message",
            required: true,
          },
          sha: {
            type: "string",
            description: "SHA of file to update (required for updates)",
          },
          branch: {
            type: "string",
            description: "Branch name",
          },
        },
        outputSchema: {
          commit_sha: { type: "string" },
          content_sha: { type: "string" },
        },
      },
    ],
  };

  private baseUrl = "https://api.github.com";

  async executeAction(
    actionId: string,
    context: ActionContext
  ): Promise<ActionResult> {
    const { connection, input } = context;
    const credentials = connection.credentials;

    switch (actionId) {
      case "create_issue":
        return this.createIssue(credentials, input);
      case "create_pull_request":
        return this.createPullRequest(credentials, input);
      case "list_repos":
        return this.listRepos(credentials, input);
      case "get_file_content":
        return this.getFileContent(credentials, input);
      case "create_or_update_file":
        return this.createOrUpdateFile(credentials, input);
      default:
        return createActionResult(false, `Unknown action: ${actionId}`);
    }
  }

  async validateCredentials(
    credentials: ConnectionCredentials
  ): Promise<{ valid: boolean; error?: string; metadata?: Record<string, unknown> }> {
    try {
      const response = await fetch(`${this.baseUrl}/user`, {
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (response.ok) {
        const data = await response.json();
        return {
          valid: true,
          metadata: {
            login: data.login,
            id: data.id,
            name: data.name,
            avatar_url: data.avatar_url,
          },
        };
      }

      return { valid: false, error: "Invalid credentials" };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Validation failed",
      };
    }
  }

  private getHeaders(credentials: ConnectionCredentials): HeadersInit {
    return {
      Authorization: `Bearer ${credentials.accessToken}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  private async createIssue(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const response = await fetch(
        `${this.baseUrl}/repos/${input.owner}/${input.repo}/issues`,
        {
          method: "POST",
          headers: this.getHeaders(credentials),
          body: JSON.stringify({
            title: input.title,
            body: input.body,
            labels: input.labels,
            assignees: input.assignees,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, {
          id: data.id,
          number: data.number,
          html_url: data.html_url,
        });
      }

      return createActionResult(false, data.message || "Failed to create issue");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async createPullRequest(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const response = await fetch(
        `${this.baseUrl}/repos/${input.owner}/${input.repo}/pulls`,
        {
          method: "POST",
          headers: this.getHeaders(credentials),
          body: JSON.stringify({
            title: input.title,
            head: input.head,
            base: input.base,
            body: input.body,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, {
          id: data.id,
          number: data.number,
          html_url: data.html_url,
        });
      }

      return createActionResult(false, data.message || "Failed to create PR");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async listRepos(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const params = new URLSearchParams({
        type: (input.type as string) || "all",
        sort: (input.sort as string) || "updated",
        per_page: String(input.per_page || 30),
      });

      const response = await fetch(`${this.baseUrl}/user/repos?${params}`, {
        headers: this.getHeaders(credentials),
      });

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, {
          repos: data.map((repo: Record<string, unknown>) => ({
            id: repo.id,
            name: repo.name,
            full_name: repo.full_name,
            private: repo.private,
            html_url: repo.html_url,
            description: repo.description,
          })),
        });
      }

      return createActionResult(false, data.message || "Failed to list repos");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async getFileContent(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      let url = `${this.baseUrl}/repos/${input.owner}/${input.repo}/contents/${input.path}`;
      if (input.ref) {
        url += `?ref=${input.ref}`;
      }

      const response = await fetch(url, {
        headers: this.getHeaders(credentials),
      });

      const data = await response.json();

      if (response.ok) {
        const content = Buffer.from(data.content, "base64").toString("utf-8");
        return createActionResult(true, {
          content,
          sha: data.sha,
          size: data.size,
        });
      }

      return createActionResult(false, data.message || "Failed to get file");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async createOrUpdateFile(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const content = Buffer.from(input.content as string).toString("base64");

      const body: Record<string, unknown> = {
        message: input.message,
        content,
      };

      if (input.sha) body.sha = input.sha;
      if (input.branch) body.branch = input.branch;

      const response = await fetch(
        `${this.baseUrl}/repos/${input.owner}/${input.repo}/contents/${input.path}`,
        {
          method: "PUT",
          headers: this.getHeaders(credentials),
          body: JSON.stringify(body),
        }
      );

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, {
          commit_sha: data.commit.sha,
          content_sha: data.content.sha,
        });
      }

      return createActionResult(false, data.message || "Failed to create/update file");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }
}
