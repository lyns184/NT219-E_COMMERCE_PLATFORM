import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuid } from 'uuid';
import { authConfig } from '../config/env';
import type { AccessTokenPayload, RefreshTokenPayload } from '../types';

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
 * Sign Access Token with enhanced security
 */
interface AccessTokenInput {
  sub: string; // userId
  email: string;
  role: string;
  tokenVersion: number;
  fingerprint?: string;
}

export const signAccessToken = (payload: AccessTokenInput): string => {
  const jti = uuid(); // Unique token ID
  const secret: Secret = authConfig.accessToken.secret;
  const options: SignOptions = {
    expiresIn: authConfig.accessToken.expiresIn as SignOptions['expiresIn']
  };

  return jwt.sign(
    {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      tokenVersion: payload.tokenVersion,
      fingerprint: payload.fingerprint,
      jti
    },
    secret,
    options
  );
};

/**
 * Sign Refresh Token
 */
interface RefreshTokenInput {
  sub: string; // userId
  family: string; // Token family for rotation tracking
  tokenVersion: number;
}

export const signRefreshToken = (payload: RefreshTokenInput): string => {
  const secret: Secret = authConfig.refreshToken.secret;
  const options: SignOptions = {
    expiresIn: authConfig.refreshToken.expiresIn as SignOptions['expiresIn']
  };

  return jwt.sign(
    {
      sub: payload.sub,
      family: payload.family,
      tokenVersion: payload.tokenVersion,
      type: 'refresh'
    },
    secret,
    options
  );
};

/**
 * Verify Access Token with fingerprint validation
 * SECURITY: Explicitly specify allowed algorithms to prevent algorithm confusion attacks
 */
export const verifyAccessToken = (
  token: string,
  fingerprint?: string
): AccessTokenPayload => {
  const secret: Secret = authConfig.accessToken.secret;
  
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
    
    // Only allow HS256 - reject all other algorithms
    if (header.alg !== 'HS256') {
      throw new Error(`Algorithm "${header.alg}" is not allowed. Only HS256 is supported.`);
    }
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error('Invalid token header');
    }
    throw e;
  }
  
  // Now verify with strict options
  const payload = jwt.verify(token, secret, {
    algorithms: ['HS256'],  // SECURITY: Only allow HS256 algorithm
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
 * Verify Refresh Token
 * SECURITY: Explicitly specify allowed algorithms
 */
export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  const secret: Secret = authConfig.refreshToken.secret;
  
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
    
    // Only allow HS256
    if (header.alg !== 'HS256') {
      throw new Error(`Algorithm "${header.alg}" is not allowed`);
    }
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error('Invalid token header');
    }
    throw e;
  }
  
  const payload = jwt.verify(token, secret, {
    algorithms: ['HS256']  // SECURITY: Only allow HS256 algorithm
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
