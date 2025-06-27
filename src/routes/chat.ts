import { Router } from 'express';
import { createAzureAuthService, AzureAuthService } from '../services/azureAuth';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const router = Router();

// Chat routes use Azure authentication only (not Supabase)
// Supabase auth is used for multitenant frontend organization access
// Azure auth is specifically for chat API access

// Lazy-initialize Azure auth service
let azureAuth: AzureAuthService | null = null;
let supabase: SupabaseClient | null = null;

function getAzureAuthService(): AzureAuthService {
  if (!azureAuth) {
    azureAuth = createAzureAuthService();
    const configCheck = azureAuth.validateConfig();
    if (!configCheck.valid) {
      throw new Error(`Azure configuration error: ${configCheck.error}`);
    }
  }
  return azureAuth;
}

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

// Helper function to verify authentication and get user
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

// Helper function to save chat message to session
async function saveChatMessage(
  supabaseClient: SupabaseClient,
  sessionId: string,
  userId: string,
  role: string,
  content: string,
  additionalData?: any
) {
  try {
    // Verify the session belongs to the user
    const { data: session, error: sessionError } = await supabaseClient
      .from('chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (sessionError || !session) {
      throw new Error('Chat session not found or access denied');
    }

    // Save the message
    const messageData: any = {
      session_id: sessionId,
      role,
      content
    };

    // Add additional data fields if provided
    if (additionalData) {
      Object.assign(messageData, additionalData);
    }

    const { data: message, error } = await supabaseClient
      .from('chat_messages')
      .insert([messageData])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save chat message: ${error.message}`);
    }

    // Update session's updated_at timestamp
    await supabaseClient
      .from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    return message;
  } catch (error) {
    console.error('Error saving chat message:', error);
    throw error;
  }
}

// Regular chat endpoint
router.post('/chat', async (req: any, res: any) => {
  try {
    const { sessionId, messages, ...otherParams } = req.body;
    
    // Verify user authentication if sessionId is provided
    if (sessionId) {
      const auth = await verifyUser(req);
      if (!auth) {
        return res.status(401).json({
          error: 'Authentication required for session storage'
        });
      }

      const { user, supabaseClient } = auth;
      
      // Save user message if it's the latest message and from user
      const latestMessage = messages[messages.length - 1];
      if (latestMessage && latestMessage.role === 'user') {
        try {
          await saveChatMessage(
            supabaseClient,
            sessionId,
            user.id,
            'user',
            latestMessage.content
          );
        } catch (error) {
          console.error('Error saving user message:', error);
          // Continue with the request even if saving fails
        }
      }
    }

    // Get Azure token
    const authService = getAzureAuthService();
    const token = await authService.getAccessToken();
    
    // Forward to Azure backend
    const backendUrl = process.env.BACKEND_API_URL || 'https://capps-backend-vakcnm7wmon74.salmonbush-fc2963f0.eastus.azurecontainerapps.io';
    const targetUrl = `${backendUrl}/chat`;
    
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Express-Backend/1.0'
      },
      body: JSON.stringify({ messages, ...otherParams })
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Backend API error: ${response.status}`,
        message: response.statusText
      });
    }

    const data = await response.json() as any;
    
    // Save assistant response if sessionId is provided
    if (sessionId && data.message?.content) {
      const auth = await verifyUser(req);
      if (auth) {
        const { user, supabaseClient } = auth;
        try {
          await saveChatMessage(
            supabaseClient,
            sessionId,
            user.id,
            'assistant',
            data.message.content,
            {
              search_results: data.context?.search_results,
              thoughts: data.context?.thoughts,
              supporting_content: data.context?.supporting_content,
              enhanced_results: data.context?.enhanced_results,
              document_excerpts: data.context?.document_excerpts,
              result: data.context?.result,
              raw_response: data
            }
          );
        } catch (error) {
          console.error('Error saving assistant message:', error);
          // Continue with the response even if saving fails
        }
      }
    }
    
    res.json(data);

  } catch (error) {
    console.error('Chat endpoint error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message
    });
  }
});

// Streaming chat endpoint
router.post('/chat-stream', async (req: any, res: any) => {
  console.log('Chat stream API request received');
  
  try {
    const { sessionId, messages, ...otherParams } = req.body;
    let authData: { user: any; supabaseClient: SupabaseClient } | null = null;
    
    // Verify user authentication if sessionId is provided
    if (sessionId) {
      authData = await verifyUser(req);
      if (!authData) {
        return res.status(401).json({
          error: 'Authentication required for session storage'
        });
      }

      const { user, supabaseClient } = authData;
      
      // Save user message if it's the latest message and from user
      const latestMessage = messages[messages.length - 1];
      if (latestMessage && latestMessage.role === 'user') {
        try {
          await saveChatMessage(
            supabaseClient,
            sessionId,
            user.id,
            'user',
            latestMessage.content
          );
        } catch (error) {
          console.error('Error saving user message:', error);
          // Continue with the request even if saving fails
        }
      }
    }
    
    // Set up SSE headers immediately
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
      'X-Accel-Buffering': 'no'
    });

    // Get Azure token
    const authService = getAzureAuthService();
    const token = await authService.getAccessToken();
    
    const includeThoughtProcess = otherParams.include_thought_process === true;
    
    // Forward to Azure backend
    const backendUrl = process.env.BACKEND_API_URL || 'https://capps-backend-vakcnm7wmon74.salmonbush-fc2963f0.eastus.azurecontainerapps.io';
    const targetUrl = `${backendUrl}/chat/stream`;
    console.log(`Forwarding request to: ${targetUrl}`);

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Express-MSAL-Chat-Stream',
        'Accept': 'text/event-stream',
        'X-Include-Thought-Process': includeThoughtProcess ? 'true' : 'false'
      },
      body: JSON.stringify({ messages, ...otherParams })
    });

    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
    }

    // Collect the full response for saving
    let fullResponse = '';
    let responseData: any = null;

    // Stream the response back to client
    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;
          
          const chunk = decoder.decode(value);
          res.write(chunk);
          
          // Collect response data for saving
          if (sessionId && authData) {
            // Parse SSE chunks to extract the final response
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const jsonStr = line.substring(6);
                  const parsed = JSON.parse(jsonStr);
                  if (parsed.choices?.[0]?.delta?.content) {
                    fullResponse += parsed.choices[0].delta.content;
                  }
                  // Capture final response data
                  if (parsed.context) {
                    responseData = parsed;
                  }
                } catch (e) {
                  // Ignore parsing errors for chunks
                }
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    }

    // Save assistant response if we have sessionId and collected response
    if (sessionId && authData && fullResponse) {
      const { user, supabaseClient } = authData;
      try {
        await saveChatMessage(
          supabaseClient,
          sessionId,
          user.id,
          'assistant',
          fullResponse,
          {
            search_results: responseData?.context?.search_results,
            thoughts: responseData?.context?.thoughts,
            supporting_content: responseData?.context?.supporting_content,
            enhanced_results: responseData?.context?.enhanced_results,
            document_excerpts: responseData?.context?.document_excerpts,
            result: responseData?.context?.result,
            raw_response: responseData
          }
        );
      } catch (error) {
        console.error('Error saving streamed assistant message:', error);
      }
    }

    res.end();
    
  } catch (error) {
    console.error('Chat stream error:', error);
    res.write(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`);
    res.end();
  }
});

export default router;