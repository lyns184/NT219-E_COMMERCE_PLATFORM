import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

// ============================================
// PROTOTYPE POLLUTION PROTECTION MIDDLEWARE
// ============================================

/**
 * List of dangerous keys that could lead to prototype pollution
 */
const DANGEROUS_KEYS = [
  '__proto__',
  'constructor',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  'toString',
  'valueOf'
];

/**
 * Check if an object has dangerous prototype pollution keys
 */
export const hasDangerousKeys = (obj: any, path: string = ''): string | null => {
  if (obj === null || obj === undefined) {
    return null;
  }

  if (typeof obj !== 'object') {
    return null;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const result = hasDangerousKeys(obj[i], `${path}[${i}]`);
      if (result) return result;
    }
    return null;
  }

  // Check object keys
  for (const key of Object.keys(obj)) {
    const currentPath = path ? `${path}.${key}` : key;
    
    // Check if key itself is dangerous
    if (DANGEROUS_KEYS.includes(key)) {
      return currentPath;
    }

    // Check for keys that start with underscore (potential private property manipulation)
    if (key.startsWith('__')) {
      return currentPath;
    }

    // Recursively check nested objects
    const value = obj[key];
    if (value && typeof value === 'object') {
      const result = hasDangerousKeys(value, currentPath);
      if (result) return result;
    }
  }

  return null;
};

/**
 * Deep sanitize an object by removing dangerous keys
 * Returns a new object without modifying the original
 */
export const sanitizeObject = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  // Create new sanitized object
  const sanitized: Record<string, any> = {};
  
  for (const key of Object.keys(obj)) {
    // Skip dangerous keys
    if (DANGEROUS_KEYS.includes(key) || key.startsWith('__')) {
      continue;
    }

    // Recursively sanitize nested objects
    const value = obj[key];
    if (value && typeof value === 'object') {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
};

/**
 * Middleware to protect against prototype pollution attacks
 * Mode: 'block' - reject request, 'sanitize' - remove dangerous keys
 */
export const prototypePollutionProtection = (mode: 'block' | 'sanitize' = 'block') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Check request body
    if (req.body && typeof req.body === 'object') {
      const dangerousKey = hasDangerousKeys(req.body);
      
      if (dangerousKey) {
        logger.warn({
          ip: req.ip,
          path: req.path,
          method: req.method,
          dangerousKey
        }, 'Prototype pollution attack detected in request body');

        if (mode === 'block') {
          res.status(400).json({
            status: 'error',
            message: 'Invalid request body'
          });
          return;
        } else {
          // Sanitize mode - remove dangerous keys
          req.body = sanitizeObject(req.body);
        }
      }
    }

    // Check query parameters
    if (req.query && typeof req.query === 'object') {
      const dangerousKey = hasDangerousKeys(req.query);
      
      if (dangerousKey) {
        logger.warn({
          ip: req.ip,
          path: req.path,
          method: req.method,
          dangerousKey
        }, 'Prototype pollution attack detected in query params');

        if (mode === 'block') {
          res.status(400).json({
            status: 'error',
            message: 'Invalid query parameters'
          });
          return;
        } else {
          req.query = sanitizeObject(req.query) as typeof req.query;
        }
      }
    }

    // Check URL parameters
    if (req.params && typeof req.params === 'object') {
      const dangerousKey = hasDangerousKeys(req.params);
      
      if (dangerousKey) {
        logger.warn({
          ip: req.ip,
          path: req.path,
          method: req.method,
          dangerousKey
        }, 'Prototype pollution attack detected in URL params');

        if (mode === 'block') {
          res.status(400).json({
            status: 'error',
            message: 'Invalid URL parameters'
          });
          return;
        }
      }
    }

    next();
  };
};

/**
 * Validate that a value is a safe string (no injection attempts)
 */
export const isSafeString = (value: any, maxLength: number = 1000): boolean => {
  if (typeof value !== 'string') {
    return false;
  }
  
  if (value.length > maxLength) {
    return false;
  }

  // Check for null bytes
  if (value.includes('\0')) {
    return false;
  }

  return true;
};

/**
 * Validate MongoDB ObjectId format
 */
export const isValidObjectId = (id: string): boolean => {
  if (typeof id !== 'string') {
    return false;
  }
  return /^[a-fA-F0-9]{24}$/.test(id);
};

/**
 * Middleware to validate ObjectId parameters
 */
export const validateObjectIdParams = (paramNames: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    for (const paramName of paramNames) {
      const value = req.params[paramName];
      
      if (value && !isValidObjectId(value)) {
        logger.warn({
          ip: req.ip,
          path: req.path,
          paramName,
          value: value.substring(0, 50) // Truncate for logging
        }, 'Invalid ObjectId parameter');

        res.status(400).json({
          status: 'error',
          message: `Invalid ${paramName} format`
        });
        return;
      }
    }
    
    next();
  };
};
