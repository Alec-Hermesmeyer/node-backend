// Test setup file
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.AZURE_TENANT_ID = 'test-tenant-id';
process.env.AZURE_CLIENT_ID = 'test-client-id';
process.env.AZURE_SECRET = 'test-client-secret';
process.env.BACKEND_API_URL = 'https://test-backend.example.com';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.GROUNDX_API_KEY = 'test-groundx-key';
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-supabase-anon-key';

// Set longer timeout for integration tests
jest.setTimeout(30000);

// Mock console methods to reduce test output noise
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
}; 