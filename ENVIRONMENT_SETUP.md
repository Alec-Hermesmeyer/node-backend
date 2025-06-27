# Environment Variables Setup

## Required Environment Variables

### Server Configuration
```bash
NODE_ENV=development
PORT=3000
```

### Azure Authentication (for Chat APIs)
```bash
AZURE_TENANT_ID=your-azure-tenant-id
AZURE_CLIENT_ID=your-azure-client-id
AZURE_SECRET=your-azure-client-secret
```

### Backend API URL
```bash
BACKEND_API_URL=https://your-backend-api-url.com
```

### Supabase Configuration (for GroundX APIs - Organization filtering)
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
```

### GroundX API Configuration
```bash
GROUNDX_API_KEY=your-groundx-api-key
```

### OpenAI Configuration
```bash
OPENAI_API_KEY=your-openai-api-key
```

## Authentication Architecture

### Chat Routes (`/api/chat`, `/api/chat-stream`)
- Uses **Azure Authentication** only
- Requires: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_SECRET`
- Purpose: Direct integration with Azure backend APIs

### GroundX Routes (`/api/groundx/*`)
- Uses **Supabase Authentication** for multitenant access
- Requires: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GROUNDX_API_KEY`, `OPENAI_API_KEY`
- Purpose: Organization-based bucket filtering and RAG functionality

## Development Setup

1. Create a `.env` file in the project root
2. Copy the environment variables above and fill in your actual values
3. Start the development server: `npm run dev`

## Testing

The application uses lazy initialization for all external services, so:
- **Without env vars**: Server starts successfully, APIs fail gracefully when called
- **With env vars**: Full functionality enabled
- **Tests**: All tests pass with mocked values

Run tests: `npm test` 