import 'dotenv/config';
import { z } from 'zod';

// Vault configuration (optional - for secret management)
export const vaultConfig = {
  enabled: process.env.VAULT_ENABLED === 'true',
  addr: process.env.VAULT_ADDR || 'http://127.0.0.1:8200',
  token: process.env.VAULT_TOKEN,
  roleId: process.env.VAULT_ROLE_ID,
  secretId: process.env.VAULT_SECRET_ID,
  namespace: process.env.VAULT_NAMESPACE,
  secretPath: process.env.VAULT_SECRET_PATH || 'secret/data/demo-nt219'
};

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().regex(/^\d+$/).default('5000'),
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  CLIENT_ORIGIN: z.string().url('CLIENT_ORIGIN must be a valid URL').optional(),
  // RS256 JWT Configuration - Using RSA key files instead of secrets
  JWT_ACCESS_PRIVATE_KEY_PATH: z.string().default('./keys/jwt-private.pem'),
  JWT_ACCESS_PUBLIC_KEY_PATH: z.string().default('./keys/jwt-public.pem'),
  JWT_REFRESH_PRIVATE_KEY_PATH: z.string().default('./keys/jwt-refresh-private.pem'),
  JWT_REFRESH_PUBLIC_KEY_PATH: z.string().default('./keys/jwt-refresh-public.pem'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  STRIPE_SECRET_KEY: z.string().min(1, 'STRIPE_SECRET_KEY is required'),
  STRIPE_WEBHOOK_SECRET: z.string().min(1, 'STRIPE_WEBHOOK_SECRET is required'),
  RATE_LIMIT_WINDOW_MINUTES: z.string().regex(/^\d+$/).default('15'),
  RATE_LIMIT_MAX_REQUESTS: z.string().regex(/^\d+$/).default('100'),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(12, 'ADMIN_PASSWORD must be at least 12 characters').optional(),
  // Google OAuth Configuration
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required').optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required').optional(),
  GOOGLE_CALLBACK_URL: z.string().url('GOOGLE_CALLBACK_URL must be a valid URL').optional(),
  // Generic OAuth2 Configuration
  OAUTH2_CLIENT_ID: z.string().optional(),
  OAUTH2_CLIENT_SECRET: z.string().optional(),
  OAUTH2_AUTHORIZATION_URL: z.string().url().optional(),
  OAUTH2_TOKEN_URL: z.string().url().optional(),
  OAUTH2_USER_PROFILE_URL: z.string().url().optional(),
  OAUTH2_CALLBACK_URL: z.string().url().optional(),
  OAUTH2_SCOPE: z.string().optional(),
  // GitHub OAuth2 Configuration
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_CALLBACK_URL: z.string().url().optional(),
  // Discord OAuth2 Configuration
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  DISCORD_CALLBACK_URL: z.string().url().optional(),
  // Email Configuration
  EMAIL_HOST: z.string().default('smtp.gmail.com'),
  EMAIL_PORT: z.string().regex(/^\d+$/).default('587'),
  EMAIL_USER: z.string().email().optional(),
  EMAIL_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('noreply@yourapp.com'),
  // Frontend URL for email links
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  // Encryption key for sensitive data (AES-256 requires 32+ chars)
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters'),
  // Redis configuration for distributed rate limiting
  REDIS_URL: z.string().url().optional(),
  REDIS_ENABLED: z.enum(['true', 'false']).default('false')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  throw new Error('Environment validation failed');
}

const env = parsed.data;

export const appConfig = {
  env: env.NODE_ENV,
  isDev: env.NODE_ENV === 'development',
  port: Number(env.PORT),
  encryptionKey: env.ENCRYPTION_KEY
};

export const databaseConfig = {
  uri: env.MONGO_URI
};

export const securityConfig = {
  clientOrigin: env.CLIENT_ORIGIN,
  rateLimit: {
    windowMs: Number(env.RATE_LIMIT_WINDOW_MINUTES) * 60 * 1000,
    max: Number(env.RATE_LIMIT_MAX_REQUESTS)
  }
};

export const authConfig = {
  accessToken: {
    privateKeyPath: env.JWT_ACCESS_PRIVATE_KEY_PATH,
    publicKeyPath: env.JWT_ACCESS_PUBLIC_KEY_PATH,
    expiresIn: env.JWT_ACCESS_EXPIRY
  },
  refreshToken: {
    privateKeyPath: env.JWT_REFRESH_PRIVATE_KEY_PATH,
    publicKeyPath: env.JWT_REFRESH_PUBLIC_KEY_PATH,
    expiresIn: env.JWT_REFRESH_EXPIRY
  }
};

export const stripeConfig = {
  secretKey: env.STRIPE_SECRET_KEY,
  webhookSecret: env.STRIPE_WEBHOOK_SECRET
};

export const adminConfig = {
  email: env.ADMIN_EMAIL,
  password: env.ADMIN_PASSWORD
};

export const oauthConfig = {
  google: {
    clientId: env.GOOGLE_CLIENT_ID || '',
    clientSecret: env.GOOGLE_CLIENT_SECRET || '',
    callbackURL: env.GOOGLE_CALLBACK_URL || ''
  }
};

export const emailConfig = {
  host: env.EMAIL_HOST,
  port: Number(env.EMAIL_PORT),
  secure: Number(env.EMAIL_PORT) === 465,
  auth: {
    user: env.EMAIL_USER || '',
    pass: env.EMAIL_PASS || ''
  },
  from: env.EMAIL_FROM
};

export const urlConfig = {
  frontend: env.FRONTEND_URL,
  backend: `http://localhost:${env.PORT}`
};

export const redisConfig = {
  enabled: env.REDIS_ENABLED === 'true',
  url: env.REDIS_URL || 'redis://localhost:6379'
};

export { env };
