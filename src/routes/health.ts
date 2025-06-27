import express from 'express';

const router = express.Router();

// Convert from your Next.js /api/env-check route
router.get('/health', (req, res) => {
  try {
    const healthData = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      version: '1.0.0',
      services: {
        database: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        openai: !!process.env.OPENAI_API_KEY,
      }
    };

    res.json(healthData);
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Health check failed' 
    });
  }
});

export default router;