import { Router } from 'express';
import { authenticateSupabaseUser, handleOrganizationOverride, optionalSupabaseAuth } from '../middleware/supabaseAuth';

const router = Router();

// Database Manager has its own API key authentication
// Using optional Supabase auth for user tracking when available
router.use(optionalSupabaseAuth as any);
router.use(handleOrganizationOverride);

// Database Manager configuration
const DATABASE_MANAGER_BASE_URL = process.env.DATABASE_MANAGER_BASE_URL || 'https://databasemanager2.azurewebsites.net';
const DATABASE_MANAGER_API_KEY = process.env.DATABASE_MANAGER_API_KEY; // May be required

// Database Manager health check endpoint
router.get('/health', async (req: any, res: any) => {
  try {
    // Use query parameter authentication with the new API key format
    const url = DATABASE_MANAGER_API_KEY 
      ? `${DATABASE_MANAGER_BASE_URL}/api/health?code=${DATABASE_MANAGER_API_KEY}`
      : `${DATABASE_MANAGER_BASE_URL}/api/health`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      res.json({
        success: true,
        service: 'Database Manager',
        data,
        timestamp: new Date().toISOString()
      });
    } else {
      const errorText = await response.text();
      res.status(response.status).json({
        success: false,
        error: `Database Manager API error: ${response.status}`,
        details: errorText
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Database Manager chat endpoint
router.post('/chat', async (req: any, res: any) => {
  try {
    const { user_input, message, session_id, context } = req.body;

    // Accept either 'message' (preferred) or 'user_input' for backwards compatibility
    const input = message || user_input;

    if (!input) {
      return res.status(400).json({
        success: false,
        error: 'message or user_input parameter is required'
      });
    }

    const chatPayload = {
      message: input,
      ...(session_id && { session_id }),
      ...(context && { context })
    };

    // Use query parameter authentication with the new API key format
    const url = DATABASE_MANAGER_API_KEY 
      ? `${DATABASE_MANAGER_BASE_URL}/api/chat?code=${DATABASE_MANAGER_API_KEY}`
      : `${DATABASE_MANAGER_BASE_URL}/api/chat`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(chatPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        success: false,
        error: `Database Manager API error: ${response.status}`,
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
      service: 'Database Manager',
      data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Database Manager chat error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Database Manager query endpoint (alias for chat with clearer naming)
router.post('/query', async (req: any, res: any) => {
  try {
    const { query, user_input, message, session_id, context } = req.body;

    // Accept 'query', 'message', or 'user_input' for flexibility
    const input = query || message || user_input;

    if (!input) {
      return res.status(400).json({
        success: false,
        error: 'query, message, or user_input parameter is required'
      });
    }

    const queryPayload = {
      message: input,
      ...(session_id && { session_id }),
      ...(context && { context })
    };

    // Use query parameter authentication with the new API key format
    const url = DATABASE_MANAGER_API_KEY 
      ? `${DATABASE_MANAGER_BASE_URL}/api/chat?code=${DATABASE_MANAGER_API_KEY}`
      : `${DATABASE_MANAGER_BASE_URL}/api/chat`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(queryPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        success: false,
        error: `Database Manager API error: ${response.status}`,
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
      service: 'Database Manager',
      data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Database Manager query error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Database Manager test endpoint to check connectivity
router.get('/test', async (req: any, res: any) => {
  try {
    const testPayload = {
      message: "Hello, can you help me analyze my database?"
    };

    // Use query parameter authentication with the new API key format
    const url = DATABASE_MANAGER_API_KEY 
      ? `${DATABASE_MANAGER_BASE_URL}/api/chat?code=${DATABASE_MANAGER_API_KEY}`
      : `${DATABASE_MANAGER_BASE_URL}/api/chat`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(testPayload)
    });

    const data = await response.json();
    
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.json({
      success: true,
      service: 'Database Manager',
      test_query: testPayload.message,
      response_status: response.status,
      data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Database Manager test error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

export default router; 