import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import path from 'path';
import { authConfig } from '../config/env';
import type { AccessTokenPayload, RefreshTokenPayload } from '../types';

// Load RSA keys at startup
const loadKey = (keyPath: string): string => {
  try {
    const fullPath = path.resolve(process.cwd(), keyPath);
    return fs.readFileSync(fullPath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to load RSA key from ${keyPath}: ${error}`);
  }
};

// Access Token Keys
const ACCESS_PRIVATE_KEY = loadKey(authConfig.accessToken.privateKeyPath);
const ACCESS_PUBLIC_KEY = loadKey(authConfig.accessToken.publicKeyPath);

// Refresh Token Keys
const REFRESH_PRIVATE_KEY = loadKey(authConfig.refreshToken.privateKeyPath);
const REFRESH_PUBLIC_KEY = loadKey(authConfig.refreshToken.publicKeyPath);

// Re-export enhanced fingerprint functions from dedicated module
export { 
  generateEnhancedFingerprint,
  generateFingerprintFromComponents,
  generateLegacyFingerprint,
  extractFingerprintComponents,
  detectAutomation,
  isSuspiciousUserAgent,
  logFingerprintEvent
} from './fingerprint';

/**
 * Generate device fingerprint from user-agent and other data
 * 
 * @deprecated Use generateEnhancedFingerprint from './fingerprint' for better security
 * This function is kept for backward compatibility but now uses the enhanced module internally
 */
export const generateFingerprint = (userAgent: string, ipAddress: string): string => {
  // Import the enhanced fingerprint function
  const { generateFingerprintFromComponents } = require('./fingerprint');
  return generateFingerprintFromComponents(userAgent, ipAddress);
};

/**
 * Sign Access Token with RS256 (RSA + SHA256)
 * Uses asymmetric encryption - private key to sign, public key to verify
 */
interface AccessTokenInput {
  sub: string; // userId
  email: string;
  role: string;
  tokenVersion: number;
  fingerprint?: string;
  ip?: string; // Store IP for device verification
}

export const signAccessToken = (payload: AccessTokenInput): string => {
  const jti = uuid(); // Unique token ID
  const options: SignOptions = {
    expiresIn: authConfig.accessToken.expiresIn as SignOptions['expiresIn'],
    algorithm: 'RS256' // Use RS256 algorithm
  };

  return jwt.sign(
    {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      tokenVersion: payload.tokenVersion,
      fingerprint: payload.fingerprint,
      ip: payload.ip,
      jti
    },
    ACCESS_PRIVATE_KEY, // Use private key to sign
    options
  );
};

/**
 * Sign Refresh Token with RS256
 * Uses separate key pair for refresh tokens
 */
interface RefreshTokenInput {
  sub: string; // userId
  family: string; // Token family for rotation tracking
  tokenVersion: number;
}

export const signRefreshToken = (payload: RefreshTokenInput): string => {
  const options: SignOptions = {
    expiresIn: authConfig.refreshToken.expiresIn as SignOptions['expiresIn'],
    algorithm: 'RS256' // Use RS256 algorithm
  };

  return jwt.sign(
    {
      sub: payload.sub,
      family: payload.family,
      tokenVersion: payload.tokenVersion,
      type: 'refresh'
    },
    REFRESH_PRIVATE_KEY, // Use refresh private key to sign
    options
  );
};

/**
 * Verify Access Token with RS256 and fingerprint validation
 * SECURITY: Uses public key to verify signature - prevents algorithm confusion attacks
 */
export const verifyAccessToken = (
  token: string,
  fingerprint?: string
): AccessTokenPayload => {
  // SECURITY: Validate token format first
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token format');
  }
  
  // SECURITY: Check algorithm in header BEFORE verification to prevent "none" algorithm attack
  try {
    const headerJson = Buffer.from(parts[0], 'base64url').toString('utf8');
    const header = JSON.parse(headerJson);
    
    // CRITICAL: Reject "none" algorithm immediately
    if (!header.alg || header.alg.toLowerCase() === 'none') {
      throw new Error('Algorithm "none" is not allowed');
    }
    
    // Only allow RS256 - reject all other algorithms
    if (header.alg !== 'RS256') {
      throw new Error(`Algorithm "${header.alg}" is not allowed. Only RS256 is supported.`);
    }
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error('Invalid token header');
    }
    throw e;
  }
  
  // Now verify with RS256 using public key
  const payload = jwt.verify(token, ACCESS_PUBLIC_KEY, {
    algorithms: ['RS256'],  // SECURITY: Only allow RS256 algorithm
    complete: false
  }) as AccessTokenPayload;

  // SECURITY: Validate required claims exist
  if (!payload.sub || !payload.email || !payload.role) {
    throw new Error('Invalid token payload: missing required claims');
  }

  // Validate fingerprint if provided
  if (fingerprint && payload.fingerprint && payload.fingerprint !== fingerprint) {
    throw new Error('Token fingerprint mismatch');
  }

  return payload;
};

/**
 * Verify Refresh Token with RS256
 * SECURITY: Uses public key to verify - prevents algorithm confusion attacks
 */
export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  // SECURITY: Validate token format first
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token format');
  }
  
  // SECURITY: Check algorithm in header BEFORE verification
  try {
    const headerJson = Buffer.from(parts[0], 'base64url').toString('utf8');
    const header = JSON.parse(headerJson);
    
    // CRITICAL: Reject "none" algorithm
    if (!header.alg || header.alg.toLowerCase() === 'none') {
      throw new Error('Algorithm "none" is not allowed');
    }
    
    // Only allow RS256
    if (header.alg !== 'RS256') {
      throw new Error(`Algorithm "${header.alg}" is not allowed. Only RS256 is supported.`);
    }
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error('Invalid token header');
    }
    throw e;
  }
  
  // Verify with RS256 using refresh public key
  const payload = jwt.verify(token, REFRESH_PUBLIC_KEY, {
    algorithms: ['RS256']  // SECURITY: Only allow RS256 algorithm
  }) as RefreshTokenPayload;
  
  // SECURITY: Validate required claims
  if (!payload.sub || !payload.family || payload.type !== 'refresh') {
    throw new Error('Invalid refresh token payload');
  }
  
  return payload;
};

/**
 * Hash token for storage (SHA-256)
 * Never store raw tokens in database!
 */
export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Generate secure random token for email verification, password reset, etc.
 */
export const generateSecureToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Decode token without verification (for debugging/logging)
 */
export const decodeToken = (token: string): any => {
  return jwt.decode(token);
};

export default {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  generateSecureToken,
  generateFingerprint,
  decodeToken
};
