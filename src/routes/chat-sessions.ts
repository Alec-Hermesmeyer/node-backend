import { Router } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const router = Router();

// Lazy-initialize Supabase client
let supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required');
    }
    
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
  }
  return supabase;
}

// Helper function to verify authentication
async function verifyUser(req: any): Promise<{ user: any; supabaseClient: SupabaseClient } | null> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const supabaseClient = getSupabaseClient();
    const { data: { user }, error } = await supabaseClient.auth.getUser(token);

    if (error || !user) {
      return null;
    }

    return { user, supabaseClient };
  } catch (error) {
    return null;
  }
}

// GET /chat-sessions - List user's chat sessions
router.get('/sessions', async (req: any, res: any) => {
  try {
    const auth = await verifyUser(req);
    if (!auth) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const { user, supabaseClient } = auth;

    const { data: sessions, error } = await supabaseClient
      .from('chat_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching chat sessions:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch chat sessions'
      });
    }

    res.json({
      success: true,
      sessions: sessions || []
    });

  } catch (error: any) {
    console.error('Error in chat sessions endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Unknown error'
    });
  }
});

// POST /chat-sessions - Create new chat session
router.post('/sessions', async (req: any, res: any) => {
  try {
    const auth = await verifyUser(req);
    if (!auth) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const { user, supabaseClient } = auth;
    const { title } = req.body;

    const { data: session, error } = await supabaseClient
      .from('chat_sessions')
      .insert([{
        user_id: user.id,
        title: title || 'New Chat'
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating chat session:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create chat session'
      });
    }

    res.json({
      success: true,
      session
    });

  } catch (error: any) {
    console.error('Error in create chat session endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Unknown error'
    });
  }
});

// GET /chat-sessions/:sessionId/messages - Get messages for a session
router.get('/sessions/:sessionId/messages', async (req: any, res: any) => {
  try {
    const auth = await verifyUser(req);
    if (!auth) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const { user, supabaseClient } = auth;
    const { sessionId } = req.params;

    // First verify the session belongs to the user
    const { data: session, error: sessionError } = await supabaseClient
      .from('chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({
        success: false,
        error: 'Chat session not found'
      });
    }

    // Get messages for the session
    const { data: messages, error } = await supabaseClient
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('Error fetching chat messages:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch chat messages'
      });
    }

    res.json({
      success: true,
      messages: messages || []
    });

  } catch (error: any) {
    console.error('Error in chat messages endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Unknown error'
    });
  }
});

// POST /chat-sessions/:sessionId/messages - Add message to session
router.post('/sessions/:sessionId/messages', async (req: any, res: any) => {
  try {
    const auth = await verifyUser(req);
    if (!auth) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const { user, supabaseClient } = auth;
    const { sessionId } = req.params;
    const { 
      role, 
      content, 
      search_results, 
      thoughts, 
      supporting_content, 
      enhanced_results, 
      document_excerpts, 
      result, 
      raw_response 
    } = req.body;

    // Verify the session belongs to the user
    const { data: session, error: sessionError } = await supabaseClient
      .from('chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({
        success: false,
        error: 'Chat session not found'
      });
    }

    // Add the message
    const { data: message, error } = await supabaseClient
      .from('chat_messages')
      .insert([{
        session_id: sessionId,
        role,
        content,
        search_results,
        thoughts,
        supporting_content,
        enhanced_results,
        document_excerpts,
        result,
        raw_response
      }])
      .select()
      .single();

    if (error) {
      console.error('Error adding chat message:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to add chat message'
      });
    }

    // Update session's updated_at timestamp
    await supabaseClient
      .from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    res.json({
      success: true,
      message
    });

  } catch (error: any) {
    console.error('Error in add chat message endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Unknown error'
    });
  }
});

// PUT /chat-sessions/:sessionId - Update session (rename, etc.)
router.put('/sessions/:sessionId', async (req: any, res: any) => {
  try {
    const auth = await verifyUser(req);
    if (!auth) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const { user, supabaseClient } = auth;
    const { sessionId } = req.params;
    const { title } = req.body;

    const { data: session, error } = await supabaseClient
      .from('chat_sessions')
      .update({ 
        title,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating chat session:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update chat session'
      });
    }

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Chat session not found'
      });
    }

    res.json({
      success: true,
      session
    });

  } catch (error: any) {
    console.error('Error in update chat session endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Unknown error'
    });
  }
});

// DELETE /chat-sessions/:sessionId - Delete session
router.delete('/sessions/:sessionId', async (req: any, res: any) => {
  try {
    const auth = await verifyUser(req);
    if (!auth) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const { user, supabaseClient } = auth;
    const { sessionId } = req.params;

    // Delete the session (messages will be deleted automatically due to foreign key cascade)
    const { error } = await supabaseClient
      .from('chat_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting chat session:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete chat session'
      });
    }

    res.json({
      success: true,
      message: 'Chat session deleted successfully'
    });

  } catch (error: any) {
    console.error('Error in delete chat session endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Unknown error'
    });
  }
});

export default router; 