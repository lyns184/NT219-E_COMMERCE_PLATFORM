import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { securityConfig, redisConfig, appConfig } from '../config/env';
import logger from '../utils/logger';
import { detectAutomation, isSuspiciousUserAgent, logFingerprintEvent } from '../utils/fingerprint';
import Redis from 'ioredis';
import RedisStore from 'rate-limit-redis';

// ============================================
// REDIS CLIENT FOR DISTRIBUTED RATE LIMITING
// ============================================

let redisClient: Redis | null = null;

/**
 * Initialize Redis client for distributed rate limiting
 * Falls back to in-memory if Redis is not available
 */
const initRedisClient = (): Redis | null => {
  if (!redisConfig.enabled) {
    logger.info('Redis rate limiting disabled, using in-memory store');
    return null;
  }

  try {
    const client = new Redis(redisConfig.url, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          logger.warn('Redis connection failed after 3 retries, falling back to in-memory');
          return null; // Stop retrying
        }
        return Math.min(times * 100, 3000);
      },
      lazyConnect: true
    });

    client.on('connect', () => {
      logger.info('Redis connected for rate limiting');
    });

    client.on('error', (err) => {
      logger.error({ err }, 'Redis connection error');
    });

    // Try to connect
    client.connect().catch((err) => {
      logger.warn({ err }, 'Failed to connect to Redis, using in-memory fallback');
      redisClient = null;
    });

    return client;
  } catch (err) {
    logger.warn({ err }, 'Failed to initialize Redis client');
    return null;
  }
};

// Initialize on module load
redisClient = initRedisClient();

// ============================================
// DISTRIBUTED FAILED LOGIN TRACKING (Redis/Memory)
// ============================================

interface FailedLoginRecord {
  count: number;
  firstAttempt: number;
  lastAttempt: number;
  blocked: boolean;
  blockedUntil?: number;
}

// In-memory fallback (used when Redis is unavailable)
const failedLoginsMemory = new Map<string, FailedLoginRecord>();

// Configuration
const LOGIN_ATTEMPT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_ATTEMPTS = 5;
const BLOCK_DURATION = 30 * 60 * 1000; // 30 minutes block
const PROGRESSIVE_DELAYS = [0, 1000, 2000, 5000, 10000]; // Progressive delay in ms
const REDIS_KEY_PREFIX = 'ratelimit:login:';

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
 * Get failed login record from Redis or memory
 */
const getFailedLoginRecord = async (key: string): Promise<FailedLoginRecord | null> => {
  if (redisClient) {
    try {
      const data = await redisClient.get(`${REDIS_KEY_PREFIX}${key}`);
      if (data) {
        return JSON.parse(data);
      }
    } catch (err) {
      logger.warn({ err, key }, 'Redis get failed, falling back to memory');
    }
  }
  return failedLoginsMemory.get(key) || null;
};

/**
 * Set failed login record in Redis or memory
 */
const setFailedLoginRecord = async (key: string, record: FailedLoginRecord): Promise<void> => {
  if (redisClient) {
    try {
      // Set with TTL matching the login window + block duration
      const ttl = Math.ceil((LOGIN_ATTEMPT_WINDOW + BLOCK_DURATION) / 1000);
      await redisClient.setex(`${REDIS_KEY_PREFIX}${key}`, ttl, JSON.stringify(record));
      return;
    } catch (err) {
      logger.warn({ err, key }, 'Redis set failed, falling back to memory');
    }
  }
  failedLoginsMemory.set(key, record);
};

/**
 * Delete failed login record from Redis or memory
 */
const deleteFailedLoginRecord = async (key: string): Promise<void> => {
  if (redisClient) {
    try {
      await redisClient.del(`${REDIS_KEY_PREFIX}${key}`);
      return;
    } catch (err) {
      logger.warn({ err, key }, 'Redis del failed, falling back to memory');
    }
  }
  failedLoginsMemory.delete(key);
};

/**
 * Track failed login attempt (async with Redis support)
 */
export const trackFailedLogin = async (req: Request, email?: string): Promise<void> => {
  const key = getClientKey(req, email);
  const now = Date.now();
  const record = await getFailedLoginRecord(key);

  if (!record) {
    await setFailedLoginRecord(key, {
      count: 1,
      firstAttempt: now,
      lastAttempt: now,
      blocked: false
    });
    return;
  }

  // Reset if window expired
  if (now - record.firstAttempt > LOGIN_ATTEMPT_WINDOW) {
    await setFailedLoginRecord(key, {
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

  await setFailedLoginRecord(key, record);
};

/**
 * Reset failed login counter (call on successful login)
 */
export const resetFailedLogin = async (req: Request, email?: string): Promise<void> => {
  const key = getClientKey(req, email);
  await deleteFailedLoginRecord(key);
};

/**
 * Check if login is blocked
 */
export const isLoginBlocked = async (req: Request, email?: string): Promise<{ blocked: boolean; remainingTime?: number; attempts?: number }> => {
  const key = getClientKey(req, email);
  const record = await getFailedLoginRecord(key);
  const now = Date.now();

  if (!record) {
    return { blocked: false };
  }

  // Check if block expired
  if (record.blocked && record.blockedUntil) {
    if (now >= record.blockedUntil) {
      await deleteFailedLoginRecord(key);
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
    await deleteFailedLoginRecord(key);
    return { blocked: false };
  }

  return { blocked: false, attempts: record.count };
};

/**
 * Get progressive delay based on failed attempts
 */
export const getProgressiveDelay = async (req: Request, email?: string): Promise<number> => {
  const key = getClientKey(req, email);
  const record = await getFailedLoginRecord(key);
  
  if (!record) return 0;
  
  const delayIndex = Math.min(record.count, PROGRESSIVE_DELAYS.length - 1);
  return PROGRESSIVE_DELAYS[delayIndex];
};

/**
 * Middleware to check login block status (async)
 */
export const checkLoginBlock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const email = req.body?.email;
  const blockStatus = await isLoginBlocked(req, email);

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
  const delay = await getProgressiveDelay(req, email);
  if (delay > 0) {
    setTimeout(() => next(), delay);
    return;
  }

  next();
};

/**
 * Cleanup expired records from memory (Redis handles TTL automatically)
 */
export const cleanupExpiredRecords = (): void => {
  const now = Date.now();
  for (const [key, record] of failedLoginsMemory.entries()) {
    if (now - record.firstAttempt > LOGIN_ATTEMPT_WINDOW) {
      failedLoginsMemory.delete(key);
    }
  }
};

// Cleanup every 5 minutes (only for in-memory fallback)
setInterval(cleanupExpiredRecords, 5 * 60 * 1000);

// ============================================
// EXPRESS RATE LIMITERS WITH REDIS STORE
// ============================================

/**
 * Create Redis store for rate limiting if Redis is available
 */
const createRateLimitStore = () => {
  if (redisClient) {
    try {
      return new RedisStore({
        // @ts-expect-error - Types mismatch but works at runtime
        sendCommand: (...args: string[]) => redisClient!.call(...args),
        prefix: 'rl:'
      });
    } catch (err) {
      logger.warn({ err }, 'Failed to create Redis store, using memory');
      return undefined;
    }
  }
  return undefined;
};

const rateLimitStore = createRateLimitStore();

export const generalRateLimiter = rateLimit({
  windowMs: securityConfig.rateLimit.windowMs,
  max: securityConfig.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  store: rateLimitStore, // Use Redis store if available
  keyGenerator: (req: Request): string => {
    // Use X-Forwarded-For if behind proxy, otherwise use IP
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  skip: (req: Request): boolean => {
    // Skip rate limiting for health check endpoints
    return req.path === '/health' || req.path === '/api/v1/health';
  },
  handler: (req: Request, res: Response): void => {
    logger.warn({ ip: req.ip, path: req.path, usingRedis: !!redisClient }, 'Rate limit exceeded');
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
  store: rateLimitStore, // Use Redis store if available
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
  store: rateLimitStore, // Use Redis store if available
  keyGenerator: (req: Request): string => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  handler: (req: Request, res: Response): void => {
    logger.warn({ ip: req.ip, path: req.path, usingRedis: !!redisClient }, 'Strict rate limit exceeded');
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
 * Uses Redis for distributed rate limiting across multiple instances.
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
  store: rateLimitStore, // Use Redis store if available
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
      confidence: automationResult.confidence,
      usingRedis: !!redisClient
    }, 'Enhanced auth rate limit exceeded');
    
    res.status(429).json({
      status: 'error',
      message: 'Too many authentication attempts. Please try again later.',
      retryAfter: 900 // 15 minutes
    });
  }
});

/**
 * Export Redis client status for health checks
 */
export const getRateLimitStatus = () => ({
  redisEnabled: redisConfig.enabled,
  redisConnected: redisClient?.status === 'ready',
  usingDistributedStore: !!rateLimitStore
});
