import { ConfidentialClientApplication, ClientCredentialRequest } from '@azure/msal-node';

interface ClientConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  apiUrl: string;
}

export class AzureAuthService {
  private msalInstance: ConfidentialClientApplication | null = null;
  private config: ClientConfig;

  constructor(config: ClientConfig) {
    this.config = config;
    this.initializeMsal();
  }

  private initializeMsal() {
    const msalConfig = {
      auth: {
        clientId: this.config.clientId,
        authority: `https://login.microsoftonline.com/${this.config.tenantId}`,
        clientSecret: this.config.clientSecret
      }
    };

    this.msalInstance = new ConfidentialClientApplication(msalConfig);
  }

  async getAccessToken(): Promise<string> {
    if (!this.msalInstance) {
      throw new Error('MSAL instance not initialized');
    }

    try {
      console.log('Requesting Azure token...');
      
      const clientCredentialRequest: ClientCredentialRequest = {
        scopes: [`${this.config.clientId}/.default`]
      };

      const response = await this.msalInstance.acquireTokenByClientCredential(clientCredentialRequest);

      if (!response || !response.accessToken) {
        throw new Error('No access token returned from MSAL');
      }

      console.log('Azure token obtained successfully');
      return response.accessToken;
    } catch (error) {
      console.error('Error getting Azure token:', error);
      throw error;
    }
  }

  validateConfig(): { valid: boolean; error?: string } {
    const missingVars = [];
    if (!this.config.tenantId) missingVars.push('tenantId');
    if (!this.config.clientId) missingVars.push('clientId');
    if (!this.config.clientSecret) missingVars.push('clientSecret');
    if (!this.config.apiUrl) missingVars.push('apiUrl');
    
    if (missingVars.length > 0) {
      const errorMsg = `Missing configuration: ${missingVars.join(', ')}`;
      return { valid: false, error: errorMsg };
    }
    
    return { valid: true };
  }
}

// Factory function to create auth service with environment variables
export function createAzureAuthService(): AzureAuthService {
  const config: ClientConfig = {
    tenantId: process.env.AZURE_TENANT_ID || '',
    clientId: process.env.AZURE_CLIENT_ID || '',
    clientSecret: process.env.AZURE_SECRET || '',
    apiUrl: process.env.BACKEND_API_URL || 'https://capps-backend-vakcnm7wmon74.salmonbush-fc2963f0.eastus.azurecontainerapps.io'
  };

  return new AzureAuthService(config);
}