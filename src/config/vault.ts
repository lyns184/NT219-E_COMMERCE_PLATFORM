import vault from 'node-vault';
import logger from '../utils/logger';

interface VaultConfig {
  enabled: boolean;
  endpoint: string;
  token?: string;
  roleId?: string;
  secretId?: string;
  namespace?: string;
  secretPath: string;
}

interface SecretData {
  [key: string]: string | undefined;
}

class VaultClient {
  private client: any;
  private config: VaultConfig;
  private isInitialized: boolean = false;
  private cachedSecrets: SecretData = {};

  constructor() {
    this.config = {
      enabled: process.env.VAULT_ENABLED === 'true',
      endpoint: process.env.VAULT_ADDR || 'http://127.0.0.1:8200',
      token: process.env.VAULT_TOKEN,
      roleId: process.env.VAULT_ROLE_ID,
      secretId: process.env.VAULT_SECRET_ID,
      namespace: process.env.VAULT_NAMESPACE,
      secretPath: process.env.VAULT_SECRET_PATH || 'secret/data/demo-nt219'
    };

    if (this.config.enabled) {
      this.initializeClient();
    } else {
      logger.info('Vault is disabled. Using environment variables for secrets.');
    }
  }

  private initializeClient() {
    try {
      const options: any = {
        apiVersion: 'v1',
        endpoint: this.config.endpoint
      };

      if (this.config.token) {
        options.token = this.config.token;
      }

      if (this.config.namespace) {
        options.namespace = this.config.namespace;
      }

      this.client = vault(options);
      logger.info({ endpoint: this.config.endpoint }, 'Vault client initialized');
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize Vault client');
      throw error;
    }
  }

  /**
   * Authenticate with Vault using AppRole
   */
  async authenticateAppRole(): Promise<void> {
    if (!this.config.enabled) return;
    
    if (!this.config.roleId || !this.config.secretId) {
      throw new Error('VAULT_ROLE_ID and VAULT_SECRET_ID are required for AppRole authentication');
    }

    try {
      const result = await this.client.approleLogin({
        role_id: this.config.roleId,
        secret_id: this.config.secretId
      });

      this.client.token = result.auth.client_token;
      this.isInitialized = true;
      
      logger.info('Successfully authenticated with Vault using AppRole');
    } catch (error) {
      logger.error({ err: error }, 'Failed to authenticate with Vault');
      throw error;
    }
  }

  /**
   * Read secrets from Vault
   */
  async readSecrets(): Promise<SecretData> {
    if (!this.config.enabled) {
      return this.getFallbackSecrets();
    }

    if (!this.isInitialized && this.config.roleId && this.config.secretId) {
      await this.authenticateAppRole();
    }

    try {
      // For KV v2, we need to add /data/ to the path
      // Convert: secret/demo-nt219 -> secret/data/demo-nt219
      const kvPath = this.config.secretPath.replace(/^([^\/]+)\/(.+)$/, '$1/data/$2');
      
      const response = await this.client.read(kvPath);
      this.cachedSecrets = response.data.data || response.data;
      
      logger.info({ path: kvPath }, 'Successfully read secrets from Vault');
      return this.cachedSecrets;
    } catch (error) {
      logger.error({ err: error, path: this.config.secretPath }, 'Failed to read secrets from Vault');
      
      // Fallback to environment variables
      logger.warn('Falling back to environment variables');
      return this.getFallbackSecrets();
    }
  }

  /**
   * Get a specific secret by key
   */
  async getSecret(key: string): Promise<string | undefined> {
    if (!this.config.enabled) {
      return process.env[key];
    }

    if (Object.keys(this.cachedSecrets).length === 0) {
      await this.readSecrets();
    }

    return this.cachedSecrets[key] || process.env[key];
  }

  /**
   * Write secrets to Vault (for development/setup)
   */
  async writeSecrets(secrets: SecretData): Promise<void> {
    if (!this.config.enabled) {
      throw new Error('Vault is not enabled');
    }

    if (!this.isInitialized && this.config.roleId && this.config.secretId) {
      await this.authenticateAppRole();
    }

    try {
      // For KV v2, we need to add /data/ to the path
      const kvPath = this.config.secretPath.replace(/^([^\/]+)\/(.+)$/, '$1/data/$2');
      
      await this.client.write(kvPath, {
        data: secrets
      });
      
      this.cachedSecrets = secrets;
      logger.info({ path: kvPath }, 'Successfully wrote secrets to Vault');
    } catch (error) {
      logger.error({ err: error }, 'Failed to write secrets to Vault');
      throw error;
    }
  }

  /**
   * Renew Vault token
   */
  async renewToken(): Promise<void> {
    if (!this.config.enabled || !this.isInitialized) return;

    try {
      await this.client.tokenRenewSelf();
      logger.info('Successfully renewed Vault token');
    } catch (error) {
      logger.error({ err: error }, 'Failed to renew Vault token');
      // Try to re-authenticate
      if (this.config.roleId && this.config.secretId) {
        await this.authenticateAppRole();
      }
    }
  }

  /**
   * Fallback to environment variables when Vault is unavailable
   * Note: For RS256 JWT, keys are loaded from files, not env vars
   */
  private getFallbackSecrets(): SecretData {
    return {
      MONGO_URI: process.env.MONGO_URI,
      // RS256 JWT uses key files, not secrets
      JWT_ACCESS_PRIVATE_KEY_PATH: process.env.JWT_ACCESS_PRIVATE_KEY_PATH,
      JWT_ACCESS_PUBLIC_KEY_PATH: process.env.JWT_ACCESS_PUBLIC_KEY_PATH,
      JWT_REFRESH_PRIVATE_KEY_PATH: process.env.JWT_REFRESH_PRIVATE_KEY_PATH,
      JWT_REFRESH_PUBLIC_KEY_PATH: process.env.JWT_REFRESH_PUBLIC_KEY_PATH,
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
      EMAIL_USER: process.env.EMAIL_USER,
      EMAIL_PASS: process.env.EMAIL_PASS,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET
    };
  }

  /**
   * Check if Vault is healthy
   */
  async healthCheck(): Promise<boolean> {
    if (!this.config.enabled) return true;

    try {
      const health = await this.client.health();
      return health.initialized && !health.sealed;
    } catch (error) {
      logger.error({ err: error }, 'Vault health check failed');
      return false;
    }
  }
}

// Singleton instance
export const vaultClient = new VaultClient();

/**
 * Initialize Vault and load secrets
 * Call this during application startup
 */
export const initializeVault = async (): Promise<SecretData> => {
  try {
    const secrets = await vaultClient.readSecrets();
    
    // Update process.env with Vault secrets
    Object.entries(secrets).forEach(([key, value]) => {
      if (value && !process.env[key]) {
        process.env[key] = value;
      }
    });

    return secrets;
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize Vault');
    throw error;
  }
};

/**
 * Start token renewal loop
 */
export const startTokenRenewal = (intervalMinutes: number = 30): NodeJS.Timeout => {
  return setInterval(async () => {
    try {
      await vaultClient.renewToken();
    } catch (error) {
      logger.error({ err: error }, 'Token renewal failed');
    }
  }, intervalMinutes * 60 * 1000);
};

export default vaultClient;
