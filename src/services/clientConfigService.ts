import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Client Configuration Types (matching your frontend)
export interface ClientConfiguration {
  id: string;
  organization_id: string;
  client_name: string;
  client_type: 'default' | 'premium' | 'enterprise' | 'custom';
  
  // Backend Configuration
  backend_config: {
    api_url: string;
    chat_endpoint?: string;
    content_endpoint?: string;
    analyze_endpoint?: string;
  };
  
  // Azure/Authentication Configuration
  azure_config: {
    tenant_id: string;
    client_id: string;
    client_secret?: string; // Will be encrypted in database
    scope?: string;
  };
  
  // Feature Flags
  features: {
    hands_free_chat?: boolean;
    document_analysis?: boolean;
    contract_search?: boolean;
    custom_branding?: boolean;
    advanced_analytics?: boolean;
  };
  
  // UI/UX Configuration
  ui_config: {
    theme_primary_color?: string;
    theme_secondary_color?: string;
    logo_url?: string;
    custom_css?: string;
    layout_preferences?: Record<string, any>;
  };
  
  // Rate Limiting & Quotas
  limits: {
    requests_per_minute?: number;
    requests_per_day?: number;
    max_file_size_mb?: number;
    max_concurrent_sessions?: number;
  };
  
  // Metadata
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
  environment: 'development' | 'staging' | 'production';
}

export interface ClientSecret {
  id: string;
  client_config_id: string;
  secret_name: string;
  encrypted_value: string;
  created_at: string;
  expires_at?: string;
}

// Default configurations for different client types
export const DEFAULT_CLIENT_CONFIGS: Record<string, Partial<ClientConfiguration>> = {
  default: {
    client_type: 'default',
    features: {
      hands_free_chat: false,
      document_analysis: true,
      contract_search: true,
      custom_branding: false,
      advanced_analytics: false,
    },
    limits: {
      requests_per_minute: 60,
      requests_per_day: 1000,
      max_file_size_mb: 10,
      max_concurrent_sessions: 5,
    },
  },
  premium: {
    client_type: 'premium',
    features: {
      hands_free_chat: true,
      document_analysis: true,
      contract_search: true,
      custom_branding: true,
      advanced_analytics: true,
    },
    limits: {
      requests_per_minute: 120,
      requests_per_day: 5000,
      max_file_size_mb: 50,
      max_concurrent_sessions: 20,
    },
  },
  enterprise: {
    client_type: 'enterprise',
    features: {
      hands_free_chat: true,
      document_analysis: true,
      contract_search: true,
      custom_branding: true,
      advanced_analytics: true,
    },
    limits: {
      requests_per_minute: 300,
      requests_per_day: 25000,
      max_file_size_mb: 100,
      max_concurrent_sessions: 100,
    },
  },
};

class ClientConfigurationService {
  private configCache: Map<string, ClientConfiguration> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private supabase: SupabaseClient;

  constructor() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required');
    }
    
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
  }

  /**
   * Get client configuration by organization ID
   */
  async getClientConfig(organizationId: string): Promise<ClientConfiguration | null> {
    // Check cache first
    const cached = this.getFromCache(organizationId);
    if (cached) {
      return cached;
    }

    try {
      const { data, error } = await this.supabase
        .from('client_configurations')
        .select(`
          *,
          client_secrets (
            secret_name,
            encrypted_value
          )
        `)
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .single();

      if (error) {
        console.error('Error fetching client config:', error);
        return null;
      }

      if (data) {
        // Merge secrets into the config
        const config = this.processConfigWithSecrets(data);
        this.setCache(organizationId, config);
        return config;
      }

      return null;
    } catch (error) {
      console.error('Unexpected error fetching client config:', error);
      return null;
    }
  }

  /**
   * Create a new client configuration
   */
  async createClientConfig(
    organizationId: string,
    clientName: string,
    clientType: 'default' | 'premium' | 'enterprise' | 'custom',
    customConfig?: Partial<ClientConfiguration>
  ): Promise<ClientConfiguration | null> {
    try {
      // Get default config for the client type
      const defaultConfig = DEFAULT_CLIENT_CONFIGS[clientType] || DEFAULT_CLIENT_CONFIGS.default;
      
      // Merge with custom config
      const newConfig = {
        organization_id: organizationId,
        client_name: clientName,
        client_type: clientType,
        backend_config: customConfig?.backend_config || {
          api_url: process.env.DEFAULT_BACKEND_URL || 'http://localhost:3001'
        },
        azure_config: customConfig?.azure_config || {
          tenant_id: '',
          client_id: '',
        },
        features: { ...defaultConfig.features, ...customConfig?.features },
        ui_config: { ...customConfig?.ui_config },
        limits: { ...defaultConfig.limits, ...customConfig?.limits },
        is_active: true,
        environment: (process.env.NODE_ENV as 'development' | 'staging' | 'production') || 'development',
        created_by: organizationId, // You might want to use actual user ID
      };

      const { data, error } = await this.supabase
        .from('client_configurations')
        .insert([newConfig])
        .select()
        .single();

      if (error) {
        console.error('Error creating client config:', error);
        return null;
      }

      // Clear cache to force refresh
      this.clearCache(organizationId);
      
      return data;
    } catch (error) {
      console.error('Unexpected error creating client config:', error);
      return null;
    }
  }

  /**
   * Update client configuration
   */
  async updateClientConfig(
    organizationId: string,
    updates: Partial<ClientConfiguration>
  ): Promise<ClientConfiguration | null> {
    try {
      const { data, error } = await this.supabase
        .from('client_configurations')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (error) {
        console.error('Error updating client config:', error);
        return null;
      }

      // Clear cache to force refresh
      this.clearCache(organizationId);
      
      return data;
    } catch (error) {
      console.error('Unexpected error updating client config:', error);
      return null;
    }
  }

  /**
   * Store encrypted secrets for a client configuration
   */
  async storeClientSecret(
    clientConfigId: string,
    secretName: string,
    secretValue: string,
    expiresAt?: Date
  ): Promise<boolean> {
    try {
      // In a real implementation, you'd encrypt the secret value here
      // For now, we'll just store it (YOU SHOULD ENCRYPT THIS!)
      const { error } = await this.supabase
        .from('client_secrets')
        .upsert([{
          client_config_id: clientConfigId,
          secret_name: secretName,
          encrypted_value: Buffer.from(secretValue).toString('base64'), // Basic encoding - USE PROPER ENCRYPTION!
          expires_at: expiresAt?.toISOString(),
        }]);

      if (error) {
        console.error('Error storing client secret:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Unexpected error storing client secret:', error);
      return false;
    }
  }

  /**
   * Get all client configurations (admin only)
   */
  async getAllConfigs(): Promise<ClientConfiguration[]> {
    try {
      const { data, error } = await this.supabase
        .from('client_configurations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching all configs:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Unexpected error fetching all configs:', error);
      return [];
    }
  }

  /**
   * Validate that a client configuration has all required fields
   */
  validateConfig(config: ClientConfiguration): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.organization_id) errors.push('Organization ID is required');
    if (!config.client_name) errors.push('Client name is required');
    if (!config.backend_config?.api_url) errors.push('Backend API URL is required');
    if (!config.azure_config?.tenant_id) errors.push('Azure tenant ID is required');
    if (!config.azure_config?.client_id) errors.push('Azure client ID is required');

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Cache management methods
  private getFromCache(organizationId: string): ClientConfiguration | null {
    const expiry = this.cacheExpiry.get(organizationId);
    if (expiry && Date.now() > expiry) {
      this.clearCache(organizationId);
      return null;
    }
    return this.configCache.get(organizationId) || null;
  }

  private setCache(organizationId: string, config: ClientConfiguration): void {
    this.configCache.set(organizationId, config);
    this.cacheExpiry.set(organizationId, Date.now() + this.CACHE_TTL);
  }

  private clearCache(organizationId: string): void {
    this.configCache.delete(organizationId);
    this.cacheExpiry.delete(organizationId);
  }

  private processConfigWithSecrets(data: any): ClientConfiguration {
    // Process secrets and merge them into the config
    if (data.client_secrets) {
      const secrets: Record<string, string> = {};
      data.client_secrets.forEach((secret: any) => {
        // In a real implementation, you'd decrypt the secret value here
        secrets[secret.secret_name] = Buffer.from(secret.encrypted_value, 'base64').toString(); // Basic decoding
      });

      // Merge secrets into azure_config
      if (secrets.client_secret) {
        data.azure_config = {
          ...data.azure_config,
          client_secret: secrets.client_secret
        };
      }
    }

    return data;
  }
}

// Export singleton instance (lazy initialization)
let clientConfigServiceInstance: ClientConfigurationService | null = null;

export function getClientConfigService(): ClientConfigurationService {
  if (!clientConfigServiceInstance) {
    clientConfigServiceInstance = new ClientConfigurationService();
  }
  return clientConfigServiceInstance;
}

export default getClientConfigService; 