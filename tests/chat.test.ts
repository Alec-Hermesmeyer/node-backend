import request from 'supertest';
import express from 'express';
import chatRoutes from '../src/routes/chat';

// Mock the Azure auth service
jest.mock('../src/services/azureAuth', () => ({
  createAzureAuthService: () => ({
    validateConfig: () => ({ valid: true }),
    getAccessToken: jest.fn().mockResolvedValue('mock-token')
  })
}));

// Chat routes use Azure authentication only (not Supabase)
// Supabase auth is for multitenant frontend, Azure auth is for chat APIs

// Mock fetch globally
global.fetch = jest.fn();

describe('Chat Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api', chatRoutes);
    
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('POST /api/chat', () => {
    it('should return success response with valid request', async () => {
      // Mock successful backend response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: 'Mock AI response',
          context: { followup_questions: [] }
        })
      });

      const response = await request(app)
        .post('/api/chat')
        .send({
          messages: [{ role: 'user', content: 'Hello test' }],
          stream: false
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('content');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/chat'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer mock-token'
          })
        })
      );
    });

    it('should handle backend API errors', async () => {
      // Mock backend error response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const response = await request(app)
        .post('/api/chat')
        .send({
          messages: [{ role: 'user', content: 'Hello test' }]
        });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Backend API error: 500');
    });

    it('should handle network errors', async () => {
      // Mock network error
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const response = await request(app)
        .post('/api/chat')
        .send({
          messages: [{ role: 'user', content: 'Hello test' }]
        });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toBe('Network error');
    });

    it('should use fallback URL when BACKEND_API_URL is not set', async () => {
      // Temporarily remove the env var
      const originalUrl = process.env.BACKEND_API_URL;
      delete process.env.BACKEND_API_URL;

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: 'Mock response' })
      });

      await request(app)
        .post('/api/chat')
        .send({
          messages: [{ role: 'user', content: 'Hello test' }]
        });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('capps-backend-vakcnm7wmon74'),
        expect.any(Object)
      );

      // Restore env var
      process.env.BACKEND_API_URL = originalUrl;
    });
  });

  describe('POST /api/chat-stream', () => {
    it('should handle streaming requests', async () => {
      // Mock ReadableStream for streaming response
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"content": "Hello"}\n\n') })
          .mockResolvedValueOnce({ done: true }),
        releaseLock: jest.fn() // Add the missing method
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => mockReader
        }
      });

      const response = await request(app)
        .post('/api/chat-stream')
        .send({
          messages: [{ role: 'user', content: 'Hello streaming test' }]
        });

      expect(response.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/chat/stream'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Accept': 'text/event-stream'
          })
        })
      );
    });

    it('should handle streaming errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request'
      });

      const response = await request(app)
        .post('/api/chat-stream')
        .send({
          messages: [{ role: 'user', content: 'Hello test' }]
        });

      expect(response.status).toBe(200); // SSE response starts with 200
      expect(response.text).toContain('Stream failed');
    });

    it('should include thought process header when requested', async () => {
      const mockReader = {
        read: jest.fn().mockResolvedValueOnce({ done: true }),
        releaseLock: jest.fn()
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader }
      });

      await request(app)
        .post('/api/chat-stream')
        .send({
          messages: [{ role: 'user', content: 'Hello test' }],
          include_thought_process: true
        });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Include-Thought-Process': 'true'
          })
        })
      );
    });
  });
}); 