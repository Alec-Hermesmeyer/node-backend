import request from 'supertest';
import express from 'express';
import healthRoutes from '../src/routes/health';

describe('Health Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api', healthRoutes);
  });

  describe('GET /api/health', () => {
    it('should return health status successfully', async () => {
      const response = await request(app)
        .get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'ok',
        timestamp: expect.any(String),
        environment: 'test',
        version: '1.0.0',
        services: expect.any(Object)
      });
      
      // Verify timestamp is valid ISO string
      expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
    });

    it('should return consistent response structure', async () => {
      const response = await request(app)
        .get('/api/health');

      expect(response.headers['content-type']).toMatch(/json/);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('environment');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('services');
      expect(typeof response.body.status).toBe('string');
      expect(typeof response.body.timestamp).toBe('string');
      expect(typeof response.body.environment).toBe('string');
      expect(typeof response.body.version).toBe('string');
      expect(typeof response.body.services).toBe('object');
    });
  });
}); 