import { Request, Response, NextFunction } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Organization context interface
interface OrganizationContext {
  userOrganizationId: string;
  userOrganizationName: string;
  activeOrganizationId: string;
  activeOrganizationName: string;
  isQIGAdmin: boolean;
  canAccessOrganization: (orgId: string) => boolean;
}

// Simple in-memory session store for organization switching
// In production, you'd use Redis or database-backed sessions
const organizationSessions = new Map<string, {
  activeOrganizationId: string;
  timestamp: number;
}>();

// Lazy-initialize Supabase client
let supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    if (!process.env.SUPABASE_URL) {
      throw new Error('SUPABASE_URL environment variable is required');
    }
    if (!process.env.SUPABASE_ANON_KEY) {
      throw new Error('SUPABASE_ANON_KEY environment variable is required');
    }
    
    console.log('Initializing Supabase client...');
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true
        }
      }
    );
  }
  return supabase;
}

// Extend Express Request type to include user data and organization context
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        profile?: any;
        organization?: any;
        isQIG?: boolean;
      };
      organizationContext?: OrganizationContext;
      organization?: any; // Keep for backward compatibility
    }
  }
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  profile: any;
  organization: any;
  isQIG: boolean;
}

export async function authenticateSupabaseUser(
  req: Request, 
  res: Response, 
  next: NextFunction
) {
  try {
    // Get the Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Missing or invalid authorization header'
      });
    }

    // Extract the JWT token
    const token = authHeader.substring(7);

    // Get Supabase client and verify the JWT token
    const supabaseClient = getSupabaseClient();
    const { data: { user }, error } = await supabaseClient.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }

    // Check if user is QIG admin first
    const isQIG: boolean = !!(user.email && (
      user.email.includes('@qig.') || 
      user.email.includes('@qualityimprovementgroup.')
    ));

    let userOrganizationInfo = null;

    if (isQIG) {
      // If user is QIG, always set QIG organization
      userOrganizationInfo = { 
        name: 'QIG', 
        id: 'qig-org',
        type: 'enterprise' 
      };
    } else {
      // Only check client configurations for non-QIG users
      const { data: clientConfigs, error: configError } = await supabaseClient
        .from('client_configurations')
        .select('*')
        .eq('created_by', user.id)
        .eq('is_active', true)
        .limit(1);

      if (configError) {
        console.warn('Could not fetch client configurations:', configError);
      } else if (clientConfigs && clientConfigs.length > 0) {
        // Use the first active client configuration
        const config = clientConfigs[0];
        userOrganizationInfo = {
          id: config.organization_id,
          name: config.client_name,
          type: config.client_type
        };
      }
    }

    // Determine active organization (what the user is "acting as")
    let activeOrganization = userOrganizationInfo;

    // Check for organization switching session (QIG admins only)
    if (isQIG && userOrganizationInfo) {
      const sessionKey = `${user.id}`;
      const orgSession = organizationSessions.get(sessionKey);
      
      if (orgSession) {
        // Check if session is still valid (24 hours)
        const sessionAge = Date.now() - orgSession.timestamp;
        if (sessionAge < 24 * 60 * 60 * 1000) {
          // Get the switched organization details from client_configurations
          const { data: switchedOrg, error: switchedOrgError } = await supabaseClient
            .from('client_configurations')
            .select('organization_id, client_name, client_type')
            .eq('organization_id', orgSession.activeOrganizationId)
            .eq('is_active', true)
            .limit(1)
            .single();
          
          if (switchedOrg && !switchedOrgError) {
            activeOrganization = {
              id: switchedOrg.organization_id,
              name: switchedOrg.client_name,
              type: switchedOrg.client_type
            };
            console.log(`QIG admin ${user.email} acting as organization: ${switchedOrg.client_name}`);
          }
        } else {
          // Session expired, remove it
          organizationSessions.delete(sessionKey);
        }
      }
    }

    // Create organization context
    const organizationContext: OrganizationContext = {
      userOrganizationId: userOrganizationInfo?.id || '',
      userOrganizationName: userOrganizationInfo?.name || '',
      activeOrganizationId: activeOrganization?.id || '',
      activeOrganizationName: activeOrganization?.name || '',
      isQIGAdmin: isQIG,
      canAccessOrganization: (orgId: string) => {
        return isQIG || orgId === userOrganizationInfo?.id;
      }
    };

    // Add user data and organization context to request object
    req.user = {
      id: user.id,
      email: user.email || '',
      profile: {
        client_config: null  // Only set for non-QIG users
      },
      organization: activeOrganization, // Keep for backward compatibility
      isQIG: isQIG
    };

    // Add organization context to request
    req.organizationContext = organizationContext;

    console.log(`Authenticated user: ${user.email} (${activeOrganization?.name || 'No organization'}) [${isQIG ? 'QIG Admin' : 'Regular User'}]`);
    next();

  } catch (error) {
    console.error('Authentication middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
}

// Optional authentication (doesn't fail if no auth provided)
export async function optionalSupabaseAuth(
  req: Request, 
  res: Response, 
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No auth provided, continue without user context
      return next();
    }

    // Try to authenticate, but don't fail if it doesn't work
    await authenticateSupabaseUser(req, res, next);
  } catch (error) {
    // Log the error but continue
    console.warn('Optional auth failed:', error);
    next();
  }
}

// QIG-only middleware
export function requireQIGUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  if (!req.user.isQIG) {
    return res.status(403).json({
      success: false,
      error: 'QIG access required'
    });
  }

  next();
}

// Organization override for QIG users (legacy - use organization switching instead)
export function handleOrganizationOverride(req: Request, res: Response, next: NextFunction) {
  const organizationOverride = req.headers['x-organization-override'] as string;
  
  if (organizationOverride && req.user?.isQIG) {
    console.log(`QIG user ${req.user.email} acting as organization: ${organizationOverride}`);
    // You can fetch the override organization here if needed
    req.user.organization = { ...req.user.organization, override_id: organizationOverride };
  }

  next();
}

// Helper functions for session management
export function setOrganizationSession(userId: string, organizationId: string) {
  organizationSessions.set(userId, {
    activeOrganizationId: organizationId,
    timestamp: Date.now()
  });
}

export function clearOrganizationSession(userId: string) {
  organizationSessions.delete(userId);
}

export function getOrganizationSession(userId: string) {
  const session = organizationSessions.get(userId);
  if (session) {
    // Check if session is still valid (24 hours)
    const sessionAge = Date.now() - session.timestamp;
    if (sessionAge < 24 * 60 * 60 * 1000) {
      return session;
    } else {
      // Session expired, remove it
      organizationSessions.delete(userId);
      return null;
    }
  }
  return null;
}