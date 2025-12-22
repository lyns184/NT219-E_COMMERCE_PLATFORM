import { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { verifyAccessToken, generateFingerprint } from '../utils/jwt';
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

// Extract device info from request
const extractDeviceInfo = (req: Request) => {
  const userAgent = req.headers['user-agent'] || '';
  const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 
                     req.socket.remoteAddress || 
                     'unknown';
  
  return { userAgent, ipAddress };
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

    // Verify device fingerprint to prevent token theft
    const { userAgent, ipAddress } = extractDeviceInfo(req);
    const currentFingerprint = generateFingerprint(userAgent, ipAddress);
    
    if (payload.fingerprint && payload.fingerprint !== currentFingerprint) {
      logger.warn({
        userId: user.id,
        expectedFingerprint: payload.fingerprint,
        actualFingerprint: currentFingerprint,
        userAgent,
        ipAddress
      }, 'Device fingerprint mismatch - possible token theft');
      
      // SECURITY: Block in production to prevent token theft
      if (appConfig.env === 'production') {
        return sendError(res, StatusCodes.UNAUTHORIZED, 'Session invalid. Please login again.');
      }
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
