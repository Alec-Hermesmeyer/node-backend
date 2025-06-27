# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Development Server
```bash
npm run dev          # Start development server with nodemon (auto-restart)
npm start            # Production server (requires build first)
```

### Build & Test
```bash
npm run build        # Compile TypeScript to dist/
npm test             # Run Jest test suite
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

### CLI Tools
```bash
npm run cli          # Run custom CLI tools (cli.js)
```

## Architecture Overview

This is a **multi-tenant SaaS backend** serving as an API gateway and orchestrator for AI/ML services. The system supports multiple client organizations with sophisticated authentication and role-based access control.

### Core Service Architecture

**API Gateway Pattern**: Routes act as proxies to external services (Azure OpenAI, GroundX, Kernel Memory, Database Manager) with consistent authentication, error handling, and response formatting.

**Dual Authentication System**:
- **Supabase JWT**: Primary user authentication and session management  
- **Azure MSAL**: Service-to-service authentication for Azure OpenAI backend

**Multi-tenant Organization Model**:
- **QIG Users**: Super-admin access to all organizations and services
- **Client Users**: Access restricted to their organization's data/buckets
- **Organization Switching**: QIG admins can impersonate client organizations (24-hour sessions)

### Key External Service Integrations

- **Azure OpenAI**: Chat completions via MSAL authentication
- **GroundX**: Document RAG with organization-filtered buckets
- **Supabase**: PostgreSQL database + authentication + real-time capabilities
- **Kernel Memory**: Alternative RAG system with semantic search
- **OpenAI**: Direct API for RAG response generation
- **Database Manager**: Natural language to SQL conversion

### API Route Structure

- `/api/health` - System health checks
- `/api/auth` - Supabase authentication (login/signup/verify)
- `/api/chat` - Azure OpenAI chat completions (standard + streaming)
- `/api/chat-sessions` - Conversation persistence and management
- `/api/groundx` - Document RAG operations (organization-filtered)
- `/api/kernel-memory` - Alternative RAG system
- `/api/database-manager` - Natural language database queries
- `/api/organizations` - Multi-tenant organization management

## Authentication Flow

1. **User Authentication**: JWT token from Supabase via Authorization header
2. **User Validation**: Token verification with Supabase
3. **Organization Resolution**: Extract user's organization from `client_configurations` table
4. **Context Setting**: Apply organization context for downstream services
5. **QIG Admin Checks**: Special privileges for QIG email addresses

## Environment Configuration

Required environment variables are documented in `ENVIRONMENT_SETUP.md`. The system uses **lazy initialization** - services start successfully without env vars but fail gracefully when APIs are called.

**Critical Variables**:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` - User authentication and database
- `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_SECRET` - Azure OpenAI access
- `GROUNDX_API_KEY`, `OPENAI_API_KEY` - RAG services

## Key Service Classes

**AzureAuthService** (`src/services/azureAuth.ts`): Handles Microsoft Azure AD authentication using MSAL client credential flow.

**ClientConfigService** (`src/services/clientConfigService.ts`): Multi-tenant configuration management with tiered service levels, feature flags, encrypted secrets, and 5-minute caching.

## Testing Approach

- **Framework**: Jest with TypeScript support
- **Mocking Strategy**: Extensive mocks for external dependencies (Azure, Supabase, GroundX)
- **Coverage Areas**: Authentication flows, streaming APIs, organization filtering, error scenarios
- **Multi-tenant Testing**: Organization-specific access control validation

## Organization Data Access

Organization mapping is handled via `src/utils/organizationMapping.ts`:
- **Austin Industries**: Specific organization filter
- **QIG**: Admin access to all data (`*` wildcard)  
- **Spinakr**: Branded organization access
- **Default**: User's organization from `client_configurations`

## Streaming Support

Chat routes support Server-Sent Events (SSE) for real-time responses:
- Proper SSE headers and connection management
- Response aggregation for conversation persistence
- Client-side connection handling required

## Database Schema

Key Supabase tables:
- `client_configurations` - User organization mapping and feature flags
- `client_secrets` - Encrypted secrets with expiration support
- `chat_sessions` - Conversation persistence
- `chat_messages` - Message history

## Security Considerations

- **Helmet**: Security headers with Content Security Policy
- **CORS**: Configured for localhost development (ports 3000/3001)
- **Organization Isolation**: Strict data access controls prevent cross-tenant access
- **Encrypted Secrets**: Sensitive configuration stored encrypted in database
- **JWT Validation**: All protected routes require valid Supabase tokens