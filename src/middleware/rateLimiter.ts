import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { securityConfig } from '../config/env';
import logger from '../utils/logger';
import { detectAutomation, isSuspiciousUserAgent, logFingerprintEvent } from '../utils/fingerprint';

// ============================================
// IN-MEMORY FAILED LOGIN TRACKING
// For production, use Redis for distributed systems
// ============================================

interface FailedLoginRecord {
  count: number;
  firstAttempt: number;
  lastAttempt: number;
  blocked: boolean;
  blockedUntil?: number;
}

const failedLogins = new Map<string, FailedLoginRecord>();

// Configuration
const LOGIN_ATTEMPT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_ATTEMPTS = 5;
const BLOCK_DURATION = 30 * 60 * 1000; // 30 minutes block
const PROGRESSIVE_DELAYS = [0, 1000, 2000, 5000, 10000]; // Progressive delay in ms

/**
 * Get client identifier for tracking (IP + optional email hash)
 */
const getClientKey = (req: Request, email?: string): string => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (email) {
    // Combine IP + email for more accurate tracking
    const crypto = require('crypto');
    const emailHash = crypto.createHash('sha256').update(email.toLowerCase()).digest('hex').substring(0, 16);
    return `${ip}:${emailHash}`;
  }
  return ip;
};

/**
 * Track failed login attempt
 */
export const trackFailedLogin = (req: Request, email?: string): void => {
  const key = getClientKey(req, email);
  const now = Date.now();
  const record = failedLogins.get(key);

  if (!record) {
    failedLogins.set(key, {
      count: 1,
      firstAttempt: now,
      lastAttempt: now,
      blocked: false
    });
    return;
  }

  // Reset if window expired
  if (now - record.firstAttempt > LOGIN_ATTEMPT_WINDOW) {
    failedLogins.set(key, {
      count: 1,
      firstAttempt: now,
      lastAttempt: now,
      blocked: false
    });
    return;
  }

  record.count++;
  record.lastAttempt = now;

  // Block if exceeded max attempts
  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.blocked = true;
    record.blockedUntil = now + BLOCK_DURATION;
    logger.warn({ key, attempts: record.count }, 'Login blocked due to too many failed attempts');
  }

  failedLogins.set(key, record);
};

/**
 * Reset failed login counter (call on successful login)
 */
export const resetFailedLogin = (req: Request, email?: string): void => {
  const key = getClientKey(req, email);
  failedLogins.delete(key);
};

/**
 * Check if login is blocked
 */
export const isLoginBlocked = (req: Request, email?: string): { blocked: boolean; remainingTime?: number; attempts?: number } => {
  const key = getClientKey(req, email);
  const record = failedLogins.get(key);
  const now = Date.now();

  if (!record) {
    return { blocked: false };
  }

  // Check if block expired
  if (record.blocked && record.blockedUntil) {
    if (now >= record.blockedUntil) {
      failedLogins.delete(key);
      return { blocked: false };
    }
    return {
      blocked: true,
      remainingTime: Math.ceil((record.blockedUntil - now) / 1000),
      attempts: record.count
    };
  }

  // Check if window expired (cleanup)
  if (now - record.firstAttempt > LOGIN_ATTEMPT_WINDOW) {
    failedLogins.delete(key);
    return { blocked: false };
  }

  return { blocked: false, attempts: record.count };
};

/**
 * Get progressive delay based on failed attempts
 */
export const getProgressiveDelay = (req: Request, email?: string): number => {
  const key = getClientKey(req, email);
  const record = failedLogins.get(key);
  
  if (!record) return 0;
  
  const delayIndex = Math.min(record.count, PROGRESSIVE_DELAYS.length - 1);
  return PROGRESSIVE_DELAYS[delayIndex];
};

/**
 * Middleware to check login block status
 */
export const checkLoginBlock = (req: Request, res: Response, next: NextFunction): void => {
  const email = req.body?.email;
  const blockStatus = isLoginBlocked(req, email);

  if (blockStatus.blocked) {
    logger.warn({ ip: req.ip, email }, 'Blocked login attempt');
    res.status(429).json({
      status: 'error',
      message: `Too many failed login attempts. Please try again in ${blockStatus.remainingTime} seconds.`,
      retryAfter: blockStatus.remainingTime
    });
    return;
  }

  // Apply progressive delay
  const delay = getProgressiveDelay(req, email);
  if (delay > 0) {
    setTimeout(() => next(), delay);
    return;
  }

  next();
};

/**
 * Cleanup expired records (run periodically)
 */
export const cleanupExpiredRecords = (): void => {
  const now = Date.now();
  for (const [key, record] of failedLogins.entries()) {
    if (now - record.firstAttempt > LOGIN_ATTEMPT_WINDOW) {
      failedLogins.delete(key);
    }
  }
};

// Cleanup every 5 minutes
setInterval(cleanupExpiredRecords, 5 * 60 * 1000);

// ============================================
// EXPRESS RATE LIMITERS
// ============================================

export const generalRateLimiter = rateLimit({
  windowMs: securityConfig.rateLimit.windowMs,
  max: securityConfig.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    // Use X-Forwarded-For if behind proxy, otherwise use IP
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  skip: (req: Request): boolean => {
    // Skip rate limiting for health check endpoints
    return req.path === '/health' || req.path === '/api/v1/health';
  },
  handler: (req: Request, res: Response): void => {
    logger.warn({ ip: req.ip, path: req.path }, 'Rate limit exceeded');
    res.status(429).json({
      status: 'error',
      message: 'Too many requests, please try again later.',
      retryAfter: Math.ceil(securityConfig.rateLimit.windowMs / 1000)
    });
  }
});

export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    // Combine IP with email for more accurate limiting
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const email = req.body?.email;
    if (email && typeof email === 'string') {
      const crypto = require('crypto');
      const emailHash = crypto.createHash('sha256').update(email.toLowerCase()).digest('hex').substring(0, 8);
      return `${ip}:${emailHash}`;
    }
    return ip;
  },
  handler: (req: Request, res: Response): void => {
    logger.warn({ ip: req.ip, path: req.path }, 'Auth rate limit exceeded');
    res.status(429).json({
      status: 'error',
      message: 'Too many authentication attempts, please slow down.',
      retryAfter: 60
    });
  }
});

// Stricter rate limiter for sensitive operations (password reset, etc.)
export const strictRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // only 3 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  handler: (req: Request, res: Response): void => {
    logger.warn({ ip: req.ip, path: req.path }, 'Strict rate limit exceeded');
    res.status(429).json({
      status: 'error',
      message: 'Too many requests for this sensitive operation. Please try again later.',
      retryAfter: 900 // 15 minutes
    });
  }
});

// ============================================
// AUTOMATION DETECTION MIDDLEWARE
// ============================================

/**
 * Middleware to detect and log suspicious automation attempts
 * 
 * SECURITY: Detects requests that appear to be from automation tools
 * (Python requests, curl, etc.) that may be attempting to bypass
 * device fingerprint checks.
 * 
 * @see VULNERABILITY REPORT: Device Fingerprint Bypass (27 December 2025)
 */
export const detectSuspiciousAutomation = (options: {
  blockSuspicious?: boolean;
  logOnly?: boolean;
  minConfidence?: number;
} = {}) => {
  const { 
    blockSuspicious = false, 
    logOnly = true,
    minConfidence = 70 
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const userAgent = req.headers['user-agent'] || '';
    
    // Quick check for known automation UAs
    if (isSuspiciousUserAgent(userAgent)) {
      logger.warn({
        ip: req.ip,
        path: req.path,
        userAgent,
        type: 'known_automation_ua'
      }, 'Suspicious automation user agent detected');

      if (blockSuspicious) {
        res.status(403).json({
          status: 'error',
          message: 'Request blocked due to suspicious client'
        });
        return;
      }
    }

    // Deep automation detection
    const automationResult = detectAutomation(req);
    
    if (automationResult.isAutomated && automationResult.confidence >= minConfidence) {
      logFingerprintEvent('suspicious', req, {
        automationDetection: automationResult
      });

      logger.warn({
        ip: req.ip,
        path: req.path,
        userAgent,
        confidence: automationResult.confidence,
        reasons: automationResult.reasons
      }, 'Automated request detected');

      if (blockSuspicious && !logOnly) {
        res.status(403).json({
          status: 'error',
          message: 'Request blocked due to suspicious automation patterns'
        });
        return;
      }
    }

    next();
  };
};

/**
 * Stricter rate limiter for auth endpoints with automation detection
 * 
 * SECURITY: More aggressive rate limiting for authentication endpoints
 * to prevent credential stuffing and brute force attacks.
 */
export const enhancedAuthRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: (req: Request): number => {
    // Check if request appears automated
    const automationResult = detectAutomation(req);
    
    // More restrictive limits for suspicious requests
    if (automationResult.isAutomated) {
      logger.warn({
        ip: req.ip,
        confidence: automationResult.confidence,
        reasons: automationResult.reasons
      }, 'Applying stricter rate limit due to automation detection');
      return 3; // Only 3 attempts for automated requests
    }
    
    return 10; // 10 attempts for normal requests
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const email = req.body?.email;
    const userAgent = req.headers['user-agent'] || 'no-ua';
    
    // Include user-agent hash to differentiate between clients from same IP
    const crypto = require('crypto');
    const uaHash = crypto.createHash('sha256').update(userAgent).digest('hex').substring(0, 8);
    
    if (email && typeof email === 'string') {
      const emailHash = crypto.createHash('sha256').update(email.toLowerCase()).digest('hex').substring(0, 8);
      return `${ip}:${emailHash}:${uaHash}`;
    }
    return `${ip}:${uaHash}`;
  },
  skip: (req: Request): boolean => {
    // Don't skip auth endpoints
    return false;
  },
  handler: (req: Request, res: Response): void => {
    const automationResult = detectAutomation(req);
    
    logger.warn({
      ip: req.ip,
      path: req.path,
      isAutomated: automationResult.isAutomated,
      confidence: automationResult.confidence
    }, 'Enhanced auth rate limit exceeded');
    
    res.status(429).json({
      status: 'error',
      message: 'Too many authentication attempts. Please try again later.',
      retryAfter: 900 // 15 minutes
    });
  }
});
