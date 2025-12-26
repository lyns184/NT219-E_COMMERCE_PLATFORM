import { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { verifyAccessToken } from '../utils/jwt';
import { 
  generateEnhancedFingerprint, 
  extractFingerprintComponents,
  detectAutomation,
  logFingerprintEvent 
} from '../utils/fingerprint';
import { sendError } from '../utils/apiResponse';
import { UserModel, UserRole } from '../models/user.model';
import { appConfig } from '../config/env';
import logger from '../utils/logger';

const getTokenFromHeader = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return null;
  }
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }
  return token;
};

// Extract device info from request (enhanced)
const extractDeviceInfo = (req: Request) => {
  const components = extractFingerprintComponents(req);
  return { 
    userAgent: components.userAgent, 
    ipAddress: components.ipAddress,
    components 
  };
};

export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
  try {
    const token = getTokenFromHeader(req);
    if (!token) {
      return sendError(res, StatusCodes.UNAUTHORIZED, 'Authentication token missing');
    }

    // Verify token and get payload
    const payload = verifyAccessToken(token);

    // Check user exists and get security fields
    const user = await UserModel.findById(payload.sub)
      .select('email role tokenVersion isEmailVerified accountLockedUntil twoFactorEnabled');
    
    if (!user) {
      return sendError(res, StatusCodes.UNAUTHORIZED, 'User not found');
    }

    // Check token version (invalidates all old tokens after password change)
    if (payload.tokenVersion !== user.tokenVersion) {
      logger.warn({ userId: user.id }, 'Token version mismatch - possible replay attack');
      return sendError(res, StatusCodes.UNAUTHORIZED, 'Token has been revoked');
    }

    // Check account lock
    if (user.isAccountLocked()) {
      return sendError(res, StatusCodes.FORBIDDEN, 'Account is temporarily locked');
    }

    // SECURITY: Enhanced device fingerprint validation
    // Uses multiple layers: IP, TLS, headers, browser-specific signals
    const { userAgent, ipAddress, components } = extractDeviceInfo(req);
    const currentEnhancedFingerprint = generateEnhancedFingerprint(req);
    
    // Detect automation attempts
    const automationResult = detectAutomation(req);
    
    if (payload.fingerprint && payload.fingerprint !== currentEnhancedFingerprint) {
      // BACKWARD COMPATIBILITY: Try legacy fingerprint format
      // This allows tokens created before the fix to still work
      const { generateLegacyFingerprint } = require('../utils/fingerprint');
      const currentLegacyFingerprint = generateLegacyFingerprint(userAgent, ipAddress);
      
      const matchesLegacy = payload.fingerprint === currentLegacyFingerprint;
      
      if (matchesLegacy) {
        // Token uses old fingerprint format - allow but log for monitoring
        logger.info({
          userId: user.id,
          fingerprintType: 'legacy'
        }, 'Legacy fingerprint detected - user should re-login for enhanced security');
      } else {
        // Neither enhanced nor legacy fingerprint matches - possible attack
        logFingerprintEvent('mismatch', req, {
          userId: user.id,
          storedFingerprint: payload.fingerprint,
          currentFingerprint: currentEnhancedFingerprint,
          automationDetection: automationResult
        });

        logger.warn({
          userId: user.id,
          expectedFingerprint: payload.fingerprint?.substring(0, 16) + '...',
          enhancedFingerprint: currentEnhancedFingerprint.substring(0, 16) + '...',
          legacyFingerprint: currentLegacyFingerprint.substring(0, 16) + '...',
          userAgent,
          ipAddress,
          isAutomated: automationResult.isAutomated,
          automationConfidence: automationResult.confidence,
          automationReasons: automationResult.reasons
        }, 'Device fingerprint mismatch - possible token theft or automation bypass');
        
        // SECURITY: Block fingerprint mismatch in production
        // This prevents the device fingerprint bypass vulnerability
        if (appConfig.env === 'production') {
          return sendError(res, StatusCodes.UNAUTHORIZED, 'Session invalid. Please login again.');
        }
        
        // In development, also warn about high-confidence automation detection
        if (automationResult.isAutomated && automationResult.confidence >= 70) {
          logger.warn({
            userId: user.id,
            confidence: automationResult.confidence
          }, 'High confidence automation detected with fingerprint mismatch');
        }
      }
    }

    // Additional check: Warn about automation even if fingerprint matches
    // (attacker using same headers as login)
    if (automationResult.isAutomated && automationResult.confidence >= 80) {
      logFingerprintEvent('suspicious', req, {
        userId: user.id,
        automationDetection: automationResult
      });
      
      logger.warn({
        userId: user.id,
        confidence: automationResult.confidence,
        reasons: automationResult.reasons
      }, 'High confidence automation detected - possible fingerprint bypass attack');
    }

    // Attach user to request
    req.authUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion
    };

    return next();
  } catch (error) {
    logger.warn({ err: error }, 'Failed to authenticate request');
    return sendError(res, StatusCodes.UNAUTHORIZED, 'Invalid or expired token');
  }
};

// Middleware to require email verification
export const requireEmailVerified = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
  try {
    if (!req.authUser) {
      return sendError(res, StatusCodes.UNAUTHORIZED, 'Authentication required');
    }

    const user = await UserModel.findById(req.authUser.id).select('isEmailVerified');
    if (!user || !user.isEmailVerified) {
      return sendError(res, StatusCodes.FORBIDDEN, 'Email verification required');
    }

    return next();
  } catch (error) {
    logger.error({ err: error }, 'Error checking email verification');
    return sendError(res, StatusCodes.INTERNAL_SERVER_ERROR, 'Error verifying account status');
  }
};

// Role-based authorization
export const authorize = (...roles: UserRole[]) =>
  (req: Request, res: Response, next: NextFunction): Response | void => {
    if (!req.authUser) {
      return sendError(res, StatusCodes.FORBIDDEN, 'Access denied');
    }

    if (!roles.includes(req.authUser.role as UserRole)) {
      return sendError(res, StatusCodes.FORBIDDEN, 'Insufficient privileges');
    }

    return next();
  };
