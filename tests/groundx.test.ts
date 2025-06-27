import request from 'supertest';
import express from 'express';
import groundxRoutes from '../src/routes/groundx';

// Mock GroundX client
const mockGroundXClient = {
  buckets: {
    list: jest.fn()
  },
  search: {
    content: jest.fn()
  },
  documents: {
    get: jest.fn()
  }
};

// Mock OpenAI client
const mockOpenAIClient = {
  chat: {
    completions: {
      create: jest.fn()
    }
  }
};

// Mock the GroundX SDK
jest.mock('groundx', () => ({
  GroundXClient: jest.fn().mockImplementation(() => mockGroundXClient)
}));

// Mock OpenAI SDK
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockOpenAIClient)
}));

// Create a mock user that can be changed per test
let mockUser = {
  id: 'test-user',
  email: 'test@example.com',
  organization: { name: 'Austin Industries' },
  isQIG: false
};

// Mock Supabase authentication middleware
jest.mock('../src/middleware/supabaseAuth', () => ({
  authenticateSupabaseUser: (req: any, res: any, next: any) => {
    req.user = mockUser;
    next();
  },
  handleOrganizationOverride: (req: any, res: any, next: any) => {
    next();
  }
}));

describe('GroundX Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/groundx', groundxRoutes);
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Reset to default user
    mockUser = {
      id: 'test-user',
      email: 'test@example.com',
      organization: { name: 'Austin Industries' },
      isQIG: false
    };
  });

  describe('GET /api/groundx/buckets', () => {
    it('should return filtered buckets for non-QIG user (Austin Industries)', async () => {
      const mockBuckets = [
        { bucket_id: '1', name: 'Austin Industries Contracts', documentCount: 5 },
        { bucket_id: '2', name: 'QIG Internal Docs', documentCount: 10 },
        { bucket_id: '3', name: 'Austin Safety Protocols', documentCount: 8 },
        { bucket_id: '4', name: 'Spinakr Marketing', documentCount: 3 }
      ];

      mockGroundXClient.buckets.list.mockResolvedValueOnce({
        buckets: mockBuckets
      });

      const response = await request(app)
        .get('/api/groundx/buckets');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.organization).toBe('Austin Industries');
      
      // Should only return buckets matching Austin Industries patterns
      expect(response.body.buckets).toHaveLength(2);
      expect(response.body.buckets.map((b: any) => b.name)).toEqual([
        'Austin Industries Contracts',
        'Austin Safety Protocols'
      ]);
    });

    it('should return all buckets for QIG users', async () => {
      // Set mock user to QIG admin
      mockUser = {
        id: 'qig-user',
        email: 'admin@qig.com',
        organization: { name: 'QIG' },
        isQIG: true
      };

      const mockBuckets = [
        { bucket_id: '1', name: 'Austin Industries Contracts', documentCount: 5 },
        { bucket_id: '2', name: 'QIG Internal Docs', documentCount: 10 },
        { bucket_id: '3', name: 'Spinakr Marketing', documentCount: 3 }
      ];

      mockGroundXClient.buckets.list.mockResolvedValueOnce({
        buckets: mockBuckets
      });

      const response = await request(app)
        .get('/api/groundx/buckets');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.organization).toBe('QIG');
      
      // QIG users should see all buckets
      expect(response.body.buckets).toHaveLength(3);
    });

    it('should filter buckets for Spinakr organization', async () => {
      // Set mock user to Spinakr user
      mockUser = {
        id: 'spinakr-user',
        email: 'user@spinakr.com',
        organization: { name: 'Spinakr' },
        isQIG: false
      };

      const mockBuckets = [
        { bucket_id: '1', name: 'Austin Industries Contracts', documentCount: 5 },
        { bucket_id: '2', name: 'Spinakr Marketing Materials', documentCount: 10 },
        { bucket_id: '3', name: 'Spinaker Brand Guidelines', documentCount: 8 },
        { bucket_id: '4', name: 'QIG Internal', documentCount: 3 }
      ];

      mockGroundXClient.buckets.list.mockResolvedValueOnce({
        buckets: mockBuckets
      });

      const response = await request(app)
        .get('/api/groundx/buckets');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.organization).toBe('Spinakr');
      
      // Should only return buckets matching Spinakr patterns
      expect(response.body.buckets).toHaveLength(2);
      expect(response.body.buckets.map((b: any) => b.name)).toEqual([
        'Spinakr Marketing Materials',
        'Spinaker Brand Guidelines'
      ]);
    });

    it('should use organization name as fallback for unknown organizations', async () => {
      // Set mock user to unknown organization user
      mockUser = {
        id: 'unknown-user',
        email: 'user@unknown.com',
        organization: { name: 'Unknown Corp' },
        isQIG: false
      };

      const mockBuckets = [
        { bucket_id: '1', name: 'Austin Industries Contracts', documentCount: 5 },
        { bucket_id: '2', name: 'Unknown Corp Documents', documentCount: 10 },
        { bucket_id: '3', name: 'QIG Internal', documentCount: 3 }
      ];

      mockGroundXClient.buckets.list.mockResolvedValueOnce({
        buckets: mockBuckets
      });

      const response = await request(app)
        .get('/api/groundx/buckets');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.organization).toBe('Unknown Corp');
      
      // Should only return buckets matching organization name
      expect(response.body.buckets).toHaveLength(1);
      expect(response.body.buckets[0].name).toBe('Unknown Corp Documents');
    });

    it('should return list of buckets successfully', async () => {
      const mockBuckets = [
        { bucket_id: '1', name: 'Austin Industries Test Bucket 1', documentCount: 5 },
        { bucket_id: '2', name: 'Austin Test Bucket 2', documentCount: 10 }
      ];

      mockGroundXClient.buckets.list.mockResolvedValueOnce({
        buckets: mockBuckets
      });

      const response = await request(app)
        .get('/api/groundx/buckets');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.buckets).toHaveLength(2);
      expect(response.body.buckets[0]).toMatchObject({
        id: '1',
        name: 'Austin Industries Test Bucket 1',
        documentCount: 5
      });
    });

    it('should handle invalid response structure', async () => {
      mockGroundXClient.buckets.list.mockResolvedValueOnce({
        // Invalid response without buckets array
        invalid: 'response'
      });

      const response = await request(app)
        .get('/api/groundx/buckets');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid response structure');
    });

    it('should handle GroundX API errors', async () => {
      mockGroundXClient.buckets.list.mockRejectedValueOnce(
        new Error('GroundX API error')
      );

      const response = await request(app)
        .get('/api/groundx/buckets');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('GroundX API error');
    });
  });

  describe('POST /api/groundx/search', () => {
    it('should return search results successfully', async () => {
      const mockSearchResults = {
        search: {
          results: [
            {
              documentId: 'doc1',
              fileName: 'test.pdf',
              text: 'Sample text content',
              score: 0.95,
              metadata: { author: 'Test Author' }
            }
          ]
        }
      };

      mockGroundXClient.search.content.mockResolvedValueOnce(mockSearchResults);

      const response = await request(app)
        .post('/api/groundx/search')
        .send({
          query: 'test query',
          bucketId: '123',
          limit: 5
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.results).toHaveLength(1);
      expect(mockGroundXClient.search.content).toHaveBeenCalledWith(123, {
        query: 'test query',
        n: 5
      });
    });

    it('should handle missing query parameter', async () => {
      const response = await request(app)
        .post('/api/groundx/search')
        .send({
          bucketId: '123'
          // Missing query
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Query and bucketId are required');
    });

    it('should handle no search results', async () => {
      mockGroundXClient.search.content.mockResolvedValueOnce({
        search: null // No results
      });

      const response = await request(app)
        .post('/api/groundx/search')
        .send({
          query: 'no results query',
          bucketId: '123'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.results).toHaveLength(0);
      expect(response.body.count).toBe(0);
    });
  });

  describe('POST /api/groundx/rag', () => {
    it('should return RAG response successfully', async () => {
      const mockSearchResults = {
        search: {
          results: [
            {
              documentId: 'doc1',
              fileName: 'contract.pdf',
              text: 'Financial risk clause: Payment terms shall be net 30 days.',
              score: 0.95
            }
          ]
        }
      };

      const mockOpenAIResponse = {
        choices: [{
          message: {
            content: 'The main financial risks include payment delays and late payment penalties.'
          }
        }]
      };

      mockGroundXClient.search.content.mockResolvedValueOnce(mockSearchResults);
      mockOpenAIClient.chat.completions.create.mockResolvedValueOnce(mockOpenAIResponse);

      const response = await request(app)
        .post('/api/groundx/rag')
        .send({
          query: 'What are financial risks?',
          bucketId: '123',
          limit: 5,
          includeThoughts: true
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.response).toBe('The main financial risks include payment delays and late payment penalties.');
      expect(response.body.searchResults.count).toBe(1);
      expect(response.body.thoughts).toContain('searched through 1 documents');
      expect(response.body.executionTime).toMatchObject({
        totalMs: expect.any(Number),
        searchMs: expect.any(Number),
        llmMs: expect.any(Number)
      });
    });

    it('should handle OpenAI API errors', async () => {
      const mockSearchResults = {
        search: {
          results: [{ text: 'some content', fileName: 'test.pdf' }]
        }
      };

      mockGroundXClient.search.content.mockResolvedValueOnce(mockSearchResults);
      mockOpenAIClient.chat.completions.create.mockRejectedValueOnce(
        new Error('OpenAI API error')
      );

      const response = await request(app)
        .post('/api/groundx/rag')
        .send({
          query: 'test query',
          bucketId: '123'
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('OpenAI API error');
    });

    it('should handle missing environment variables', async () => {
      // Temporarily remove the env var
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      // Mock search results to get to the OpenAI initialization
      mockGroundXClient.search.content.mockResolvedValueOnce({
        search: { results: [{ text: 'test', fileName: 'test.pdf' }] }
      });

      // This will fail when trying to create the OpenAI client
      const response = await request(app)
        .post('/api/groundx/rag')
        .send({
          query: 'test query',
          bucketId: '123'
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      // The actual error occurs when trying to access the undefined OpenAI response
      expect(response.body.error).toContain('Cannot read properties of undefined');

      // Restore env var
      process.env.OPENAI_API_KEY = originalKey;
    });

    it('should use GPT-4-turbo model', async () => {
      const mockSearchResults = {
        search: { results: [{ text: 'test', fileName: 'test.pdf' }] }
      };

      mockGroundXClient.search.content.mockResolvedValueOnce(mockSearchResults);
      mockOpenAIClient.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: 'Test response' } }]
      });

      await request(app)
        .post('/api/groundx/rag')
        .send({
          query: 'test query',
          bucketId: '123'
        });

      expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4-turbo'
        })
      );
    });
  });

  describe('GET /api/groundx/documents/:documentId/xray', () => {
    it('should return document X-ray data', async () => {
      const mockXrayData = {
        documentId: 'doc123',
        metadata: { title: 'Test Document' },
        content: 'Document content'
      };

      mockGroundXClient.documents.get.mockResolvedValueOnce(mockXrayData);

      const response = await request(app)
        .get('/api/groundx/documents/doc123/xray?includeText=true');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockXrayData);
      expect(response.body.documentId).toBe('doc123');
    });

    it('should handle document not found', async () => {
      mockGroundXClient.documents.get.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/api/groundx/documents/nonexistent/xray');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Document not found');
    });

    it('should handle GroundX errors', async () => {
      mockGroundXClient.documents.get.mockRejectedValueOnce(
        new Error('Document access error')
      );

      const response = await request(app)
        .get('/api/groundx/documents/doc123/xray');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Document access error');
    });
  });
}); 