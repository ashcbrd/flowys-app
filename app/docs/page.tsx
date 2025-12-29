"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Book,
  Workflow,
  Webhook,
  Key,
  ChevronRight,
  Play,
  Plus,
  Settings,
  Zap,
  ArrowRight,
  CheckCircle,
  MousePointer,
  Link2,
  Cpu,
  Filter,
  FileOutput,
  Globe,
  Plug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DocsSearch } from "@/components/docs/DocsSearch";
import { ThemeToggle } from "@/components/ui/theme-toggle";

type DocSection = "getting-started" | "nodes" | "integrations" | "api" | "webhooks";

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState<DocSection>("getting-started");

  const handleNavigate = (sectionId: string) => {
    setActiveSection(sectionId as DocSection);
    // Scroll to top of content
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold">Flowys</span>
            <span className="text-sm text-muted-foreground ml-2 hidden sm:inline">Documentation</span>
          </Link>

          <div className="flex items-center gap-3">
            <DocsSearch onNavigate={handleNavigate} />
            <ThemeToggle />
            <Button asChild>
              <Link href="/workflow" target="_blank">
                Open App
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto flex">
        {/* Sidebar */}
        <aside className="w-64 border-r min-h-[calc(100vh-65px)] p-4 sticky top-[65px] h-fit">
          <nav className="space-y-1">
            <SidebarItem
              icon={Book}
              label="Getting Started"
              active={activeSection === "getting-started"}
              onClick={() => setActiveSection("getting-started")}
            />
            <SidebarItem
              icon={Workflow}
              label="Node Types"
              active={activeSection === "nodes"}
              onClick={() => setActiveSection("nodes")}
            />
            <SidebarItem
              icon={Plug}
              label="Integrations"
              active={activeSection === "integrations"}
              onClick={() => setActiveSection("integrations")}
            />
            <SidebarItem
              icon={Key}
              label="API Reference"
              active={activeSection === "api"}
              onClick={() => setActiveSection("api")}
            />
            <SidebarItem
              icon={Webhook}
              label="Webhooks"
              active={activeSection === "webhooks"}
              onClick={() => setActiveSection("webhooks")}
            />
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 p-8 max-w-4xl">
          {activeSection === "getting-started" && <GettingStartedDocs />}
          {activeSection === "nodes" && <NodeTypesDocs />}
          {activeSection === "integrations" && <IntegrationsDocs />}
          {activeSection === "api" && <ApiDocs />}
          {activeSection === "webhooks" && <WebhookDocs />}
        </main>
      </div>
    </div>
  );
}

function SidebarItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: any;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "hover:bg-muted text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function GettingStartedDocs() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Getting Started</h1>
        <p className="text-lg text-muted-foreground">
          Learn how to create your first automation workflow in under 5 minutes.
        </p>
      </div>

      {/* What is Flowys */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">What is Flowys?</h2>
        <p className="text-muted-foreground leading-relaxed">
          Flowys is a visual workflow builder that lets you automate tasks by connecting
          different "nodes" together. Think of it like building with LEGO blocks - each block
          does something specific, and when you connect them, they work together to accomplish
          bigger tasks.
        </p>
        <div className="bg-muted/50 rounded-lg p-4 border">
          <p className="font-medium mb-2">For example, you can:</p>
          <ul className="space-y-2 text-muted-foreground">
            <li className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              Fetch data from any website or API
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              Process it with AI (summarize, analyze, generate content)
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              Filter and transform the data
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              Send results to other apps or save them
            </li>
          </ul>
        </div>
      </section>

      {/* Step by Step */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">Create Your First Workflow</h2>

        <div className="space-y-6">
          {/* Step 1 */}
          <StepCard
            number={1}
            title="Add Your First Node"
            description="Click on any node type in the left sidebar and drag it onto the canvas. Start with an 'Input' node - this is where your workflow begins."
          >
            <div className="flex items-center gap-2 text-sm bg-background rounded p-2">
              <MousePointer className="h-4 w-4 text-primary" />
              <span>Drag "Input" from the sidebar to the canvas</span>
            </div>
          </StepCard>

          {/* Step 2 */}
          <StepCard
            number={2}
            title="Configure the Node"
            description="Click on any node to open its settings panel on the right. Each node type has different options you can customize."
          >
            <div className="flex items-center gap-2 text-sm bg-background rounded p-2">
              <Settings className="h-4 w-4 text-primary" />
              <span>Click the node, then adjust settings in the right panel</span>
            </div>
          </StepCard>

          {/* Step 3 */}
          <StepCard
            number={3}
            title="Connect Nodes Together"
            description="Drag from the small circle on the right side of one node to the left side of another. This creates a connection that passes data between them."
          >
            <div className="flex items-center gap-2 text-sm bg-background rounded p-2">
              <Link2 className="h-4 w-4 text-primary" />
              <span>Drag from output (right) to input (left) of nodes</span>
            </div>
          </StepCard>

          {/* Step 4 */}
          <StepCard
            number={4}
            title="Run Your Workflow"
            description="Click the 'Run' button in the top right corner. Enter any input data required, then click 'Execute' to see your workflow in action!"
          >
            <div className="flex items-center gap-2 text-sm bg-background rounded p-2">
              <Play className="h-4 w-4 text-primary" />
              <span>Click "Run" and watch the magic happen</span>
            </div>
          </StepCard>
        </div>
      </section>

      {/* Tips */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Helpful Tips</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <TipCard
            title="Save Your Work"
            description="Click 'Save' to keep your workflow. Give it a memorable name so you can find it later."
          />
          <TipCard
            title="Check the Logs"
            description="The right panel shows execution logs. If something goes wrong, check here for error details."
          />
          <TipCard
            title="Use the Chat Assistant"
            description="Click the chat button in the bottom right. Describe what you want to build and AI will help create it!"
          />
          <TipCard
            title="Start Simple"
            description="Begin with 2-3 nodes. Once that works, gradually add more complexity."
          />
        </div>
      </section>
    </div>
  );
}

function NodeTypesDocs() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Node Types</h1>
        <p className="text-lg text-muted-foreground">
          Learn about each node type and when to use them.
        </p>
      </div>

      <div className="space-y-6">
        <NodeDocCard
          icon={Plus}
          name="Input"
          color="bg-blue-500"
          description="The starting point of your workflow. Define what data your workflow needs to begin."
          whenToUse="Every workflow needs at least one Input node. Use it to accept text, numbers, or other data that will flow through your workflow."
          example='Set up fields like "text" (for a message) or "url" (for a website address) that users will provide when running the workflow.'
        />

        <NodeDocCard
          icon={Globe}
          name="API Fetch"
          color="bg-green-500"
          description="Connect to external services and fetch data from any URL or API."
          whenToUse="When you need to get data from websites, external services, or databases. Great for pulling in live data."
          example="Fetch weather data, get stock prices, retrieve customer information from your CRM, or pull posts from social media."
        />

        <NodeDocCard
          icon={Cpu}
          name="AI / LLM"
          color="bg-purple-500"
          description="Process data using artificial intelligence. Summarize, analyze, generate, or transform content."
          whenToUse="When you need intelligent processing - understanding text, generating content, making decisions, or extracting information."
          example="Summarize a long article, generate product descriptions, analyze sentiment of reviews, or extract key information from documents."
        />

        <NodeDocCard
          icon={Filter}
          name="Logic"
          color="bg-orange-500"
          description="Filter, transform, or manipulate your data without AI."
          whenToUse="When you need to filter items, transform data formats, or apply simple rules to your data."
          example="Filter a list of products to only show items over $50, transform dates to a different format, or extract specific fields from objects."
        />

        <NodeDocCard
          icon={FileOutput}
          name="Output"
          color="bg-red-500"
          description="Define the final result of your workflow and how it should be formatted."
          whenToUse="At the end of your workflow to specify what the final output should look like."
          example="Return the processed data as JSON, format it as readable text, or structure it for sending to another system."
        />

        <NodeDocCard
          icon={Webhook}
          name="Webhook"
          color="bg-cyan-500"
          description="Send data to external services or trigger actions in other apps."
          whenToUse="When you need to notify other systems, send data to external services, or trigger actions in third-party apps."
          example="Send a Slack notification, update a Google Sheet, trigger a Zapier workflow, or post to a custom API endpoint."
        />

        <NodeDocCard
          icon={Plug}
          name="Integration"
          color="bg-purple-600"
          description="Connect to third-party apps like Slack, GitHub, Google Sheets, and more using pre-built integrations."
          whenToUse="When you want to interact with popular apps without manually configuring API calls. Integrations handle authentication and provide easy-to-use actions."
          example="Send a Slack message, create a GitHub issue, add a row to Google Sheets, or create a Notion page - all with a few clicks."
        />
      </div>
    </div>
  );
}

function IntegrationsDocs() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">App Integrations</h1>
        <p className="text-lg text-muted-foreground">
          Connect your workflows to popular third-party services with pre-built integrations.
        </p>
      </div>

      {/* Overview */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Overview</h2>
        <p className="text-muted-foreground leading-relaxed">
          Integrations allow you to connect Flowys to external apps like Slack, GitHub, Google Sheets,
          and more. Instead of manually configuring API calls, integrations provide:
        </p>
        <div className="bg-muted/50 rounded-lg p-4 border">
          <ul className="space-y-2 text-muted-foreground">
            <li className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span><strong>Secure authentication</strong> - OAuth2 or API key based, with encrypted credential storage</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span><strong>Pre-built actions</strong> - Common operations ready to use (send message, create issue, etc.)</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span><strong>No code required</strong> - Just select the action and fill in the inputs</span>
            </li>
          </ul>
        </div>
      </section>

      {/* Available Integrations */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Available Integrations</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <IntegrationCard
            name="Slack"
            authType="OAuth2"
            actions={["Send Message", "Create Channel", "List Channels", "Upload File"]}
          />
          <IntegrationCard
            name="GitHub"
            authType="OAuth2"
            actions={["Create Issue", "Create PR", "List Repos", "Get/Update Files"]}
          />
          <IntegrationCard
            name="Google Sheets"
            authType="OAuth2"
            actions={["Read Range", "Write Range", "Append Rows", "Create Spreadsheet"]}
          />
          <IntegrationCard
            name="Notion"
            authType="OAuth2"
            actions={["Create Page", "Query Database", "Add Item", "Search"]}
          />
          <IntegrationCard
            name="Discord"
            authType="OAuth2"
            actions={["Send Message", "Create Channel", "List Guilds", "Add Reaction"]}
          />
          <IntegrationCard
            name="Airtable"
            authType="API Key"
            actions={["List Records", "Create Record", "Update Record"]}
          />
          <IntegrationCard
            name="OpenAI"
            authType="API Key"
            actions={["Chat Completion", "Generate Image", "Embeddings", "Transcribe"]}
          />
          <IntegrationCard
            name="SendGrid"
            authType="API Key"
            actions={["Send Email", "Bulk Email", "Add Contact", "Get Stats"]}
          />
          <IntegrationCard
            name="Twilio"
            authType="Basic Auth"
            actions={["Send SMS", "Make Call", "WhatsApp", "Phone Lookup"]}
          />
          <IntegrationCard
            name="Stripe"
            authType="API Key"
            actions={["Create Customer", "Payment Intent", "Subscription", "Refund"]}
          />
        </div>
      </section>

      {/* Setting Up */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">Setting Up an Integration</h2>

        <div className="space-y-6">
          <StepCard
            number={1}
            title="Go to Integrations Page"
            description="Click on the hamburger menu in the header and select 'App Integrations', or navigate directly to /integrations."
          />

          <StepCard
            number={2}
            title="Choose an Integration"
            description="Browse available integrations and click 'Connect' on the one you want to use."
          />

          <StepCard
            number={3}
            title="Authenticate"
            description="For OAuth2 integrations, you'll be redirected to authorize access. For API key integrations, paste your key from the service's dashboard."
          />

          <StepCard
            number={4}
            title="Name Your Connection"
            description="Give your connection a descriptive name like 'Production Slack' or 'Personal GitHub' so you can identify it later."
          />
        </div>
      </section>

      {/* Using in Workflows */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Using Integrations in Workflows</h2>
        <p className="text-muted-foreground">
          Once you've connected an integration, you can use it in your workflows:
        </p>

        <div className="space-y-4">
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-2">1. Add an Integration Node</h3>
            <p className="text-sm text-muted-foreground">
              Drag the "Integration" node from the sidebar onto your canvas.
            </p>
          </div>

          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-2">2. Select Your Connection</h3>
            <p className="text-sm text-muted-foreground">
              In the node configuration panel, choose which connected account to use.
            </p>
          </div>

          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-2">3. Choose an Action</h3>
            <p className="text-sm text-muted-foreground">
              Select what you want to do (e.g., "Send Message" for Slack).
            </p>
          </div>

          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-2">4. Configure Inputs</h3>
            <p className="text-sm text-muted-foreground">
              Fill in the required fields. Use {"{{variableName}}"} to inject dynamic values from previous nodes.
            </p>
          </div>
        </div>
      </section>

      {/* Example */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Example: AI Summary to Slack</h2>
        <p className="text-muted-foreground">
          Here's a workflow that summarizes text using AI and posts it to Slack:
        </p>
        <div className="bg-muted/50 rounded-lg p-4 border font-mono text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-blue-500 text-white px-2 py-1 rounded">Input</span>
            <ArrowRight className="h-4 w-4" />
            <span className="bg-purple-500 text-white px-2 py-1 rounded">AI (Summarize)</span>
            <ArrowRight className="h-4 w-4" />
            <span className="bg-purple-600 text-white px-2 py-1 rounded">Integration (Slack)</span>
            <ArrowRight className="h-4 w-4" />
            <span className="bg-red-500 text-white px-2 py-1 rounded">Output</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          The Integration node sends the AI's summary to a Slack channel using your connected Slack account.
        </p>
      </section>

      {/* Security */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Security</h2>
        <p className="text-muted-foreground">
          Your integration credentials are protected with enterprise-grade security:
        </p>
        <div className="bg-muted/50 rounded-lg p-4 border">
          <ul className="space-y-2 text-muted-foreground">
            <li className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span><strong>AES-256 encryption</strong> - All credentials are encrypted at rest</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span><strong>OAuth2 tokens</strong> - We never store your passwords, only secure tokens</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span><strong>Revoke anytime</strong> - Disconnect integrations instantly from your dashboard</span>
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}

function IntegrationCard({
  name,
  authType,
  actions,
}: {
  name: string;
  authType: string;
  actions: string[];
}) {
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">{name}</h3>
        <span className="text-xs bg-muted px-2 py-1 rounded">{authType}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {actions.map((action) => (
          <span key={action} className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
            {action}
          </span>
        ))}
      </div>
    </div>
  );
}

function ApiDocs() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">API Reference</h1>
        <p className="text-lg text-muted-foreground">
          Integrate Flowys into your applications using our REST API.
        </p>
      </div>

      {/* Authentication */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Authentication</h2>
        <p className="text-muted-foreground">
          All API requests require an API key. Create one in the Integrations panel.
        </p>
        <CodeBlock
          title="Include your API key in requests"
          code={`curl -X GET https://your-domain.com/api/v1/workflows \\
  -H "Authorization: Bearer ask_your_api_key_here"`}
        />
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            <strong>Keep your API key secret!</strong> Never expose it in client-side code or public repositories.
          </p>
        </div>
      </section>

      {/* Rate Limits */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Rate Limits</h2>
        <p className="text-muted-foreground">
          Default: 60 requests per minute. Check response headers for your current limit:
        </p>
        <div className="bg-muted rounded-lg p-4 font-mono text-sm">
          <p>X-RateLimit-Limit: 60</p>
          <p>X-RateLimit-Remaining: 58</p>
          <p>X-RateLimit-Reset: 1703347200</p>
        </div>
      </section>

      {/* Endpoints */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">Endpoints</h2>

        <ApiEndpoint
          method="GET"
          path="/api/v1/workflows"
          description="List all workflows"
          scopes={["workflows:read"]}
          response={`{
  "data": [
    {
      "id": "abc123",
      "name": "My Workflow",
      "description": "Processes customer data",
      "nodeCount": 5,
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T14:20:00Z"
    }
  ],
  "pagination": {
    "total": 10,
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}`}
        />

        <ApiEndpoint
          method="GET"
          path="/api/v1/workflows/:id"
          description="Get a specific workflow with full details"
          scopes={["workflows:read"]}
          response={`{
  "data": {
    "id": "abc123",
    "name": "My Workflow",
    "nodes": [...],
    "edges": [...],
    "createdAt": "2024-01-15T10:30:00Z"
  }
}`}
        />

        <ApiEndpoint
          method="POST"
          path="/api/v1/workflows/:id/trigger"
          description="Execute a workflow"
          scopes={["workflows:execute"]}
          body={`{
  "input": {
    "text": "Hello, process this!"
  }
}`}
          response={`{
  "data": {
    "executionId": "exec_xyz789",
    "status": "completed",
    "output": {
      "result": "Processed successfully"
    },
    "duration": 1250
  }
}`}
        />

        <ApiEndpoint
          method="GET"
          path="/api/v1/executions/:id"
          description="Check execution status (useful for async executions)"
          scopes={["executions:read"]}
          response={`{
  "data": {
    "id": "exec_xyz789",
    "workflowId": "abc123",
    "status": "completed",
    "input": { "text": "Hello" },
    "output": { "result": "Done" },
    "duration": 1250,
    "logs": [...]
  }
}`}
        />
      </section>

      {/* API Key Scopes */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">API Key Scopes</h2>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Scope</th>
                <th className="px-4 py-2 text-left font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="px-4 py-2 font-mono text-xs">workflows:read</td>
                <td className="px-4 py-2 text-muted-foreground">View workflow details</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono text-xs">workflows:write</td>
                <td className="px-4 py-2 text-muted-foreground">Create and update workflows</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono text-xs">workflows:execute</td>
                <td className="px-4 py-2 text-muted-foreground">Run workflows via API</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono text-xs">executions:read</td>
                <td className="px-4 py-2 text-muted-foreground">View execution history</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono text-xs">full_access</td>
                <td className="px-4 py-2 text-muted-foreground">All permissions</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function WebhookDocs() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Webhooks</h1>
        <p className="text-lg text-muted-foreground">
          Connect Flowys with external services using webhooks.
        </p>
      </div>

      {/* Overview */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Overview</h2>
        <p className="text-muted-foreground leading-relaxed">
          Webhooks allow two-way communication between Flowys and external services:
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-blue-500" />
              Incoming Webhooks
            </h3>
            <p className="text-sm text-muted-foreground">
              External services can trigger your workflows by sending data to a unique URL.
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-green-500 rotate-180" />
              Outgoing Webhooks
            </h3>
            <p className="text-sm text-muted-foreground">
              Flowys sends data to external services when workflows complete or events occur.
            </p>
          </div>
        </div>
      </section>

      {/* Incoming Webhooks */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Incoming Webhooks</h2>
        <p className="text-muted-foreground">
          Trigger workflows from external services like Zapier, Make, or your own applications.
        </p>

        <h3 className="text-lg font-medium mt-6">Setup</h3>
        <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
          <li>Go to <strong>Integrations</strong> in the app header</li>
          <li>Click <strong>Add Webhook</strong> and select "Incoming"</li>
          <li>Choose which workflow to trigger</li>
          <li>Copy the generated URL and secret</li>
        </ol>

        <h3 className="text-lg font-medium mt-6">Triggering</h3>
        <CodeBlock
          title="Send a POST request to trigger the workflow"
          code={`curl -X POST https://your-domain.com/api/webhooks/incoming/abc123xyz \\
  -H "Content-Type: application/json" \\
  -H "X-Webhook-Signature: sha256=..." \\
  -d '{"text": "Process this data"}'`}
        />

        <h3 className="text-lg font-medium mt-6">Signature Verification</h3>
        <p className="text-muted-foreground mb-4">
          For security, sign your requests using HMAC-SHA256:
        </p>
        <CodeBlock
          title="Generate signature (Node.js example)"
          code={`const crypto = require('crypto');

const payload = JSON.stringify({ text: "Hello" });
const secret = "whsec_your_webhook_secret";

const signature = "sha256=" + crypto
  .createHmac("sha256", secret)
  .update(payload)
  .digest("hex");

// Include in header: X-Webhook-Signature: sha256=...`}
        />
      </section>

      {/* Outgoing Webhooks */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Outgoing Webhooks</h2>
        <p className="text-muted-foreground">
          Receive notifications when workflows complete or other events occur.
        </p>

        <h3 className="text-lg font-medium mt-6">Available Events</h3>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Event</th>
                <th className="px-4 py-2 text-left font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="px-4 py-2 font-mono text-xs">workflow.started</td>
                <td className="px-4 py-2 text-muted-foreground">Workflow execution began</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono text-xs">workflow.completed</td>
                <td className="px-4 py-2 text-muted-foreground">Workflow finished successfully</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono text-xs">workflow.failed</td>
                <td className="px-4 py-2 text-muted-foreground">Workflow encountered an error</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono text-xs">node.completed</td>
                <td className="px-4 py-2 text-muted-foreground">Individual node finished</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono text-xs">node.failed</td>
                <td className="px-4 py-2 text-muted-foreground">Individual node failed</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 className="text-lg font-medium mt-6">Payload Format</h3>
        <CodeBlock
          title="Example webhook payload"
          code={`{
  "event": "workflow.completed",
  "timestamp": "2024-01-15T14:30:00Z",
  "data": {
    "workflowId": "abc123",
    "workflowName": "Data Processor",
    "executionId": "exec_xyz789",
    "status": "completed",
    "output": {
      "result": "Successfully processed 150 items"
    }
  }
}`}
        />

        <h3 className="text-lg font-medium mt-6">Retry Policy</h3>
        <p className="text-muted-foreground">
          Failed webhook deliveries are automatically retried with exponential backoff:
        </p>
        <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
          <li>Attempt 1: Immediate</li>
          <li>Attempt 2: After 1 second</li>
          <li>Attempt 3: After 2 seconds</li>
          <li>Attempt 4: After 4 seconds (final attempt)</li>
        </ul>
      </section>
    </div>
  );
}

// Helper Components
function StepCard({
  number,
  title,
  description,
  children,
}: {
  number: number;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
        {number}
      </div>
      <div className="flex-1 space-y-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-muted-foreground">{description}</p>
        {children && <div className="mt-3 bg-muted/50 rounded-lg p-3 border">{children}</div>}
      </div>
    </div>
  );
}

function TipCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="border rounded-lg p-4 bg-muted/30">
      <h4 className="font-medium mb-1">{title}</h4>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function NodeDocCard({
  icon: Icon,
  name,
  color,
  description,
  whenToUse,
  example,
}: {
  icon: any;
  name: string;
  color: string;
  description: string;
  whenToUse: string;
  example: string;
}) {
  return (
    <div className="border rounded-lg p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", color)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <h3 className="text-xl font-semibold">{name}</h3>
      </div>
      <p className="text-muted-foreground">{description}</p>
      <div className="space-y-3">
        <div>
          <span className="text-sm font-medium text-primary">When to use:</span>
          <p className="text-sm text-muted-foreground mt-1">{whenToUse}</p>
        </div>
        <div>
          <span className="text-sm font-medium text-primary">Example:</span>
          <p className="text-sm text-muted-foreground mt-1">{example}</p>
        </div>
      </div>
    </div>
  );
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-muted px-4 py-2 border-b">
        <span className="text-sm font-medium">{title}</span>
      </div>
      <pre className="p-4 overflow-x-auto bg-slate-950 text-slate-50">
        <code className="text-sm">{code}</code>
      </pre>
    </div>
  );
}

function ApiEndpoint({
  method,
  path,
  description,
  scopes,
  body,
  response,
}: {
  method: string;
  path: string;
  description: string;
  scopes: string[];
  body?: string;
  response: string;
}) {
  const methodColors: Record<string, string> = {
    GET: "bg-green-500",
    POST: "bg-blue-500",
    PUT: "bg-orange-500",
    DELETE: "bg-red-500",
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-muted px-4 py-3 flex items-center gap-3">
        <span className={cn("px-2 py-1 rounded text-xs font-bold text-white", methodColors[method])}>
          {method}
        </span>
        <code className="text-sm font-medium">{path}</code>
      </div>
      <div className="p-4 space-y-4">
        <p className="text-muted-foreground">{description}</p>
        <div className="flex gap-2">
          <span className="text-sm text-muted-foreground">Required scopes:</span>
          {scopes.map((scope) => (
            <span key={scope} className="text-xs bg-muted px-2 py-1 rounded font-mono">
              {scope}
            </span>
          ))}
        </div>
        {body && (
          <div>
            <span className="text-sm font-medium">Request Body:</span>
            <pre className="mt-2 p-3 bg-slate-950 text-slate-50 rounded-lg overflow-x-auto text-sm">
              {body}
            </pre>
          </div>
        )}
        <div>
          <span className="text-sm font-medium">Response:</span>
          <pre className="mt-2 p-3 bg-slate-950 text-slate-50 rounded-lg overflow-x-auto text-sm">
            {response}
          </pre>
        </div>
      </div>
    </div>
  );
}
