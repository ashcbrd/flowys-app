# Flowys Workflow App

The main workflow builder application for Flowys - Visual AI Workflow Automation Platform.

**Live URL:** https://app.flowys.io
**Dev URL:** http://localhost:3001

## Overview

This is the core application where users build, manage, and execute AI workflows. It includes:
- Visual node-based workflow editor
- AI node integrations (OpenAI, Anthropic)
- Webhook triggers and scheduling
- Third-party integrations
- API key management

## Tech Stack

- Next.js 16 (App Router)
- React 19
- React Flow (node-based editor)
- Zustand (state management)
- MongoDB + Mongoose
- NextAuth.js (authentication)
- Tailwind CSS
- TypeScript

## Project Structure

```
workflow-app/
├── app/
│   ├── page.tsx              # Redirects to /workflow
│   ├── login/                # Login page
│   ├── workflow/             # Workflow list
│   │   └── [id]/             # Workflow editor
│   │       └── version/[versionId]/  # Version viewer
│   ├── integrations/         # Integration connections
│   ├── settings/
│   │   ├── page.tsx          # Settings overview
│   │   ├── api-keys/         # API key management
│   │   └── webhooks/         # Webhook configuration
│   ├── docs/                 # Documentation
│   ├── tutorial/             # Tutorial
│   └── api/
│       ├── auth/[...nextauth]/  # Authentication
│       ├── workflows/        # Workflow CRUD
│       ├── executions/       # Execution history
│       ├── connections/      # Integration connections
│       ├── integrations/     # Available integrations
│       ├── schedules/        # Scheduled workflows
│       ├── webhooks/         # Webhook handling
│       ├── api-keys/         # API key management
│       ├── nodes/            # Node testing
│       ├── flux/             # AI assistant
│       ├── v1/               # Public API
│       │   ├── workflows/
│       │   └── executions/
│       └── health/           # Health check
├── components/
│   ├── ui/                   # Shared UI components
│   ├── shared/               # Layout components
│   ├── canvas/               # Workflow canvas
│   ├── workflow/             # Workflow-specific components
│   ├── nodes/                # Node type components
│   ├── panels/               # Side panels
│   ├── flux/                 # AI assistant
│   ├── docs/                 # Documentation components
│   └── providers/            # Context providers
├── lib/
│   ├── db/                   # Database models & connection
│   ├── engine/               # Workflow execution engine
│   ├── nodes/                # Node definitions
│   ├── integrations/         # Integration handlers
│   ├── services/             # Business logic services
│   ├── providers/            # AI provider clients
│   ├── auth.ts               # NextAuth configuration
│   ├── utils.ts              # Utility functions
│   └── navigation.ts         # Cross-domain navigation
├── store/
│   └── workflow.ts           # Zustand workflow store
├── hooks/
│   ├── use-toast.ts
│   └── use-workflow.ts
├── types/
│   └── workflow.ts           # TypeScript types
└── proxy.ts                  # Auth boundary (was middleware.ts)
```

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB database

### Installation

```bash
cd workflow-app
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

Required variables:

```env
# Database
MONGODB_URI=mongodb+srv://...

# Authentication
AUTH_SECRET=your-32-char-secret

# Fixed login account
# Email: user@flowys.io
# Password: @FLOWYS2025

# Encryption (for storing integration credentials)
ENCRYPTION_KEY=your-32-character-key

# AI Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Integration OAuth
GOOGLE_SHEETS_CLIENT_ID=your-sheets-client-id
GOOGLE_SHEETS_CLIENT_SECRET=your-sheets-client-secret

# Cross-domain URLs
NEXT_PUBLIC_APP_URL=https://app.flowys.io
NEXT_PUBLIC_LANDING_URL=https://flowys.io
```

### Development

```bash
npm run dev
```

Runs on http://localhost:3001

### Build

```bash
npm run build
npm start
```

## Key Features

### Workflow Editor
- Drag-and-drop node-based interface
- Real-time execution preview
- Version history
- Import/Export workflows

### Step Types
- **Input**: the questions a run starts with, including file upload
- **AI**: hand any step's work to a model, with structured output
- **Your docs**: search your own documents and pass the best passages on
- **Picture**: generate an image from a description
- **Brand kit**: turn a logo into mockups, a palette, and a brand board
- **Email**: assemble a branded email that renders in real clients
- **API**: fetch from external services
- **Logic**: transform, filter, condition, sort, slice
- **Output**: the formatted result

### Marketing suite
The Picture, Brand kit and Email steps power three ready-made templates:
an ad creative pack grounded in your own brand material, a logo concept
with composited mockups and a derived colour palette, and a designed email
campaign shaped for any key-auth sender. Mockup scenes are generated once
by `scripts/generate-mockup-scenes.mjs` and composited deterministically,
so the logo is pixel-identical in every mockup.

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/workflows` | List user workflows |
| `POST /api/workflows` | Create workflow |
| `GET /api/workflows/[id]` | Get workflow |
| `PATCH /api/workflows/[id]` | Update workflow |
| `DELETE /api/workflows/[id]` | Delete workflow |
| `POST /api/workflows/[id]/execute` | Execute workflow |
| `GET /api/executions` | List executions |
| `GET /api/v1/workflows/[id]/trigger` | Public trigger API |

## Database Models

- `User` - User accounts
- `Workflow` - Workflow definitions
- `WorkflowVersion` - Version history
- `Execution` - Execution logs
- `Connection` - Integration credentials
- `Schedule` - Scheduled executions
- `ApiKey` - User API keys
- `UserCredits` - User credit balances

## Authentication

Uses NextAuth.js credentials auth with one fixed account:

- Email: `user@flowys.io`
- Password: `@FLOWYS2025`

Protected routes require authentication via middleware.

## Deployment

Deploy as a standalone Next.js application. Requirements:
- MongoDB database access
- Environment variables configured
- Webhook endpoints accessible (for integrations)

Recommended platforms:
- Vercel
- Railway
- Docker

Configure the domain to point to `app.flowys.io`.
