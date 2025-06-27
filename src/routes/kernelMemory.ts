import { Router } from 'express';
import { authenticateSupabaseUser, handleOrganizationOverride } from '../middleware/supabaseAuth';

const router = Router();

// Apply authentication middleware
router.use(authenticateSupabaseUser as any);
router.use(handleOrganizationOverride);

// Kernel Memory configuration
const KERNEL_MEMORY_API_KEY = process.env.KERNEL_MEMORY_API_KEY || '59b1f6a4-a168-47ca-8e6b-f9c9bd066228';
const KERNEL_MEMORY_BASE_URL = process.env.KERNEL_MEMORY_BASE_URL || 'http://20.246.75.167';

// Kernel Memory health check endpoint
router.get('/health', async (req: any, res: any) => {
  try {
    const response = await fetch(`${KERNEL_MEMORY_BASE_URL}/health`, {
      method: 'GET',
      headers: {
        'Authorization': KERNEL_MEMORY_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.text();
      res.json({
        success: true,
        service: 'Kernel Memory',
        status: 'healthy',
        message: data,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(response.status).json({
        success: false,
        error: `Kernel Memory API error: ${response.status}`
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Kernel Memory search endpoint
router.post('/search', async (req: any, res: any) => {
  try {
    const { query, index, filters, minRelevance = 0.0, limit = 10, args } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required'
      });
    }

    const searchPayload = {
      query,
      ...(index && { index }),
      ...(filters && { filters }),
      minRelevance,
      limit,
      ...(args && { args })
    };

    const response = await fetch(`${KERNEL_MEMORY_BASE_URL}/search`, {
      method: 'POST',
      headers: {
        'Authorization': KERNEL_MEMORY_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(searchPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        success: false,
        error: `Kernel Memory API error: ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.json({
      success: true,
      service: 'Kernel Memory',
      data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Kernel Memory search error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Kernel Memory ask endpoint (RAG with question answering)
router.post('/ask', async (req: any, res: any) => {
  try {
    const { question, index, filters, minRelevance = 0.0, stream = false, args } = req.body;

    if (!question) {
      return res.status(400).json({
        success: false,
        error: 'Question parameter is required'
      });
    }

    const askPayload = {
      question,
      ...(index && { index }),
      ...(filters && { filters }),
      minRelevance,
      stream,
      ...(args && { args })
    };

    const response = await fetch(`${KERNEL_MEMORY_BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Authorization': KERNEL_MEMORY_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(askPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        success: false,
        error: `Kernel Memory API error: ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.json({
      success: true,
      service: 'Kernel Memory',
      data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Kernel Memory ask error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Kernel Memory indexes endpoint
router.get('/indexes', async (req: any, res: any) => {
  try {
    const response = await fetch(`${KERNEL_MEMORY_BASE_URL}/indexes`, {
      method: 'GET',
      headers: {
        'Authorization': KERNEL_MEMORY_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        success: false,
        error: `Kernel Memory API error: ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.json({
      success: true,
      service: 'Kernel Memory',
      data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Kernel Memory indexes error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Kernel Memory documents endpoint
router.get('/documents', async (req: any, res: any) => {
  try {
    const { index } = req.query;
    
    let url = `${KERNEL_MEMORY_BASE_URL}/documents`;
    if (index) {
      url += `?index=${encodeURIComponent(index)}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': KERNEL_MEMORY_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        success: false,
        error: `Kernel Memory API error: ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.json({
      success: true,
      service: 'Kernel Memory',
      data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Kernel Memory documents error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Kernel Memory upload status endpoint
router.get('/upload-status', async (req: any, res: any) => {
  try {
    const { documentId } = req.query;
    
    if (!documentId) {
      return res.status(400).json({
        success: false,
        error: 'documentId parameter is required'
      });
    }

    let url = `${KERNEL_MEMORY_BASE_URL}/upload-status?documentId=${encodeURIComponent(documentId)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': KERNEL_MEMORY_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        success: false,
        error: `Kernel Memory API error: ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.json({
      success: true,
      service: 'Kernel Memory',
      data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Kernel Memory upload status error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

export default router; 