import { Router } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const router = Router();

// Lazy-initialize Supabase client (same as middleware)
let supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    if (!process.env.SUPABASE_URL) {
      throw new Error('SUPABASE_URL environment variable is required');
    }
    if (!process.env.SUPABASE_ANON_KEY) {
      throw new Error('SUPABASE_ANON_KEY environment variable is required');
    }
    
    console.log('Initializing Supabase client for auth...');
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
  }
  return supabase;
}

// POST /api/auth/login - Login with email/password and get JWT token
router.post('/login', async (req: any, res: any) => {
  try {
    console.log('Login attempt received');
    const { email, password } = req.body;

    if (!email || !password) {
      console.log('Missing email or password');
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    console.log('Initializing Supabase client...');
    const supabaseClient = getSupabaseClient();

    if (!supabaseClient) {
      console.error('Failed to initialize Supabase client');
      return res.status(500).json({
        success: false,
        error: 'Failed to initialize authentication client'
      });
    }

    console.log('Attempting Supabase authentication...');
    // Authenticate with Supabase
    try {
      console.log('Making auth request to Supabase...');
      const authResponse = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });
      
      console.log('Auth response received:', {
        hasData: !!authResponse.data,
        hasError: !!authResponse.error,
        errorMessage: authResponse.error?.message,
        hasSession: !!authResponse.data?.session,
        hasUser: !!authResponse.data?.user
      });

      if (authResponse.error) {
        console.error('Supabase auth error:', {
          message: authResponse.error.message,
          name: authResponse.error.name,
          status: authResponse.error.status
        });
        return res.status(401).json({
          success: false,
          error: authResponse.error.message
        });
      }

      if (!authResponse.data || !authResponse.data.session) {
        console.error('No session data returned from Supabase');
        return res.status(401).json({
          success: false,
          error: 'Authentication failed - no session created'
        });
      }

      console.log('Authentication successful, fetching user profile...');
      // Fetch user profile and organization info
      const { data: profile, error: profileError } = await supabaseClient
        .from('profiles')
        .select(`
          *,
          organizations!inner(*)
        `)
        .eq('id', authResponse.data.user.id)
        .single();

      if (profileError) {
        console.warn('Could not fetch user profile:', profileError);
      }

      const response = {
        success: true,
        message: 'Login successful',
        token: authResponse.data.session.access_token,
        user: {
          id: authResponse.data.user.id,
          email: authResponse.data.user.email,
          organization: profile?.organizations || null,
          isQIG: profile?.organizations?.name === 'QIG'
        },
        expiresAt: authResponse.data.session.expires_at
      };

      console.log('Login successful for user:', authResponse.data.user.email);
      res.json(response);

    } catch (supabaseError: any) {
      console.error('Supabase operation error:', supabaseError);
      return res.status(500).json({
        success: false,
        error: 'Authentication service error',
        details: supabaseError.message
      });
    }

  } catch (error: any) {
    console.error('Login route error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// GET /api/auth/verify - Verify a JWT token and get user info
router.get('/verify', async (req: any, res: any) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Missing or invalid authorization header'
      });
    }

    const token = authHeader.substring(7);
    const supabaseClient = getSupabaseClient();

    // Verify the JWT token
    const { data: { user }, error } = await supabaseClient.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }

    // Fetch user profile and organization
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select(`
        *,
        organizations!inner(*)
      `)
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.warn('Could not fetch user profile:', profileError);
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        organization: profile?.organizations || null,
        isQIG: profile?.organizations?.name === 'QIG'
      },
      tokenValid: true
    });

  } catch (error: any) {
    console.error('Token verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// POST /api/auth/signup - Create new user (if needed for testing)
router.post('/signup', async (req: any, res: any) => {
  try {
    const { email, password, organizationName } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    const supabaseClient = getSupabaseClient();

    // Create user account
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password
    });

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      message: 'Signup successful. Check your email for verification.',
      user: {
        id: data.user?.id,
        email: data.user?.email
      },
      note: organizationName 
        ? `You'll need to set up organization "${organizationName}" in your Supabase database`
        : 'You may need to set up user profile and organization in Supabase'
    });

  } catch (error: any) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// POST /api/auth/logout - Logout and invalidate session
router.post('/logout', async (req: any, res: any) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Missing or invalid authorization header'
      });
    }

    const token = authHeader.substring(7);
    const supabaseClient = getSupabaseClient();

    // Verify the token first to ensure it's valid
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }

    // Sign out the user - this invalidates the session server-side
    const { error: signOutError } = await supabaseClient.auth.signOut();

    if (signOutError) {
      console.error('Logout error:', signOutError);
      return res.status(500).json({
        success: false,
        error: 'Failed to logout',
        details: signOutError.message
      });
    }

    console.log(`User ${user.email} logged out successfully`);
    res.json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error: any) {
    console.error('Logout route error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// GET /api/auth/test - Simple test endpoint to verify auth routes work
router.get('/test', (req: any, res: any) => {
  res.json({
    success: true,
    message: 'Auth routes are working!',
    endpoints: {
      login: 'POST /api/auth/login - Login with email/password',
      verify: 'GET /api/auth/verify - Verify JWT token',
      signup: 'POST /api/auth/signup - Create new user',
      logout: 'POST /api/auth/logout - Logout and invalidate session',
      test: 'GET /api/auth/test - This endpoint'
    },
    example: {
      login: {
        method: 'POST',
        url: '/api/auth/login',
        body: {
          email: 'user@example.com',
          password: 'your-password'
        }
      }
    }
  });
});

export default router; 