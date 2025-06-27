import { Router } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  authenticateSupabaseUser, 
  setOrganizationSession, 
  clearOrganizationSession 
} from '../middleware/supabaseAuth';

const router = Router();

// Lazy-initialize Supabase client (same as other routes)
let supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    if (!process.env.SUPABASE_URL) {
      throw new Error('SUPABASE_URL environment variable is required');
    }
    if (!process.env.SUPABASE_ANON_KEY) {
      throw new Error('SUPABASE_ANON_KEY environment variable is required');
    }
    
    console.log('Initializing Supabase client for organizations...');
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
  }
  return supabase;
}

// Note: Auth middleware will be applied when registering routes in main server

// GET /organizations - List available organizations for switching
router.get('/', async (req: any, res: any) => {
  try {
    const { organizationContext } = req;
    
    if (!organizationContext?.isQIGAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Only QIG administrators can list organizations'
      });
    }

    const supabaseClient = getSupabaseClient();

    // Get all client configurations (organizations) for QIG admins
    const { data: organizations, error } = await supabaseClient
      .from('client_configurations')
      .select('organization_id, client_name, client_type, created_at, is_active')
      .eq('is_active', true)
      .order('client_name');

    if (error) {
      console.error('Error fetching organizations:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch organizations'
      });
    }

    // Transform the data to match expected format
    const formattedOrganizations = organizations?.map(org => ({
      id: org.organization_id,
      name: org.client_name,
      type: org.client_type,
      created_at: org.created_at
    })) || [];

    res.json({
      success: true,
      organizations: formattedOrganizations,
      currentContext: {
        userOrganization: {
          id: organizationContext.userOrganizationId,
          name: organizationContext.userOrganizationName
        },
        activeOrganization: {
          id: organizationContext.activeOrganizationId,
          name: organizationContext.activeOrganizationName
        },
        isQIGAdmin: organizationContext.isQIGAdmin
      }
    });
  } catch (error) {
    console.error('Error in organizations list:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// POST /organizations/switch - Switch active organization
router.post('/switch', async (req: any, res: any) => {
  try {
    const { organizationContext, user } = req;
    const { organizationId } = req.body;
    
    if (!organizationContext?.isQIGAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Only QIG administrators can switch organizations'
      });
    }

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required'
      });
    }

    const supabaseClient = getSupabaseClient();

    // Verify the target organization exists
    const { data: targetOrg, error } = await supabaseClient
      .from('client_configurations')
      .select('organization_id, client_name, client_type')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .single();

    if (error || !targetOrg) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    // Set the organization session
    setOrganizationSession(user.id, organizationId);

    console.log(`QIG admin ${user.email} switched to organization: ${targetOrg.client_name}`);

    res.json({
      success: true,
      message: `Successfully switched to ${targetOrg.client_name}`,
      activeOrganization: {
        id: targetOrg.organization_id,
        name: targetOrg.client_name,
        type: targetOrg.client_type
      },
      userOrganization: {
        id: organizationContext.userOrganizationId,
        name: organizationContext.userOrganizationName
      }
    });
  } catch (error) {
    console.error('Error in organization switch:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// POST /organizations/reset - Reset to user's own organization
router.post('/reset', async (req: any, res: any) => {
  try {
    const { organizationContext, user } = req;
    
    if (!organizationContext?.isQIGAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Only QIG administrators can reset organizations'
      });
    }

    // Clear the organization session
    clearOrganizationSession(user.id);

    console.log(`QIG admin ${user.email} reset to their organization: ${organizationContext.userOrganizationName}`);

    res.json({
      success: true,
      message: `Reset to your organization: ${organizationContext.userOrganizationName}`,
      activeOrganization: {
        id: organizationContext.userOrganizationId,
        name: organizationContext.userOrganizationName
      }
    });
  } catch (error) {
    console.error('Error in organization reset:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// GET /organizations/current - Get current organization context
router.get('/current', async (req: any, res: any) => {
  try {
    const { organizationContext } = req;
    
    if (!organizationContext) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    res.json({
      success: true,
      currentContext: {
        userOrganization: {
          id: organizationContext.userOrganizationId,
          name: organizationContext.userOrganizationName
        },
        activeOrganization: {
          id: organizationContext.activeOrganizationId,
          name: organizationContext.activeOrganizationName
        },
        isQIGAdmin: organizationContext.isQIGAdmin,
        isActingAsOtherOrg: organizationContext.activeOrganizationId !== organizationContext.userOrganizationId
      }
    });
  } catch (error) {
    console.error('Error getting current organization context:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router; 