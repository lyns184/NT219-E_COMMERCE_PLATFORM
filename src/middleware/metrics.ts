// ============================================
// PROMETHEUS METRICS MIDDLEWARE
// ============================================

import { Request, Response, NextFunction } from 'express';
import promClient from 'prom-client';

// Create a Registry
export const register = new promClient.Registry();

// Add default metrics (CPU, memory, event loop, etc.)
promClient.collectDefaultMetrics({ register });

// ============================================
// CUSTOM METRICS
// ============================================

// HTTP Request Duration
export const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});

// HTTP Request Total Counter
export const httpRequestTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status']
});

// Active Connections Gauge
export const activeConnections = new promClient.Gauge({
  name: 'active_connections',
  help: 'Number of active connections'
});

// Rate Limit Exceeded Counter
export const rateLimitExceeded = new promClient.Counter({
  name: 'rate_limit_exceeded_total',
  help: 'Total number of rate limit exceeded',
  labelNames: ['endpoint', 'ip']
});

// Failed Login Attempts Counter
export const failedLoginAttempts = new promClient.Counter({
  name: 'failed_login_attempts_total',
  help: 'Total number of failed login attempts',
  labelNames: ['ip', 'reason']
});

// Successful Logins Counter
export const successfulLogins = new promClient.Counter({
  name: 'successful_logins_total',
  help: 'Total number of successful logins',
  labelNames: ['method']
});

// Database Query Duration
export const databaseQueryDuration = new promClient.Histogram({
  name: 'database_query_duration_seconds',
  help: 'Duration of database queries',
  labelNames: ['operation', 'collection'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5]
});

// Cache Metrics
export const cacheHits = new promClient.Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type']
});

export const cacheMisses = new promClient.Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type']
});

// Payment Transactions Counter
export const paymentTransactions = new promClient.Counter({
  name: 'payment_transactions_total',
  help: 'Total number of payment transactions',
  labelNames: ['status', 'payment_method']
});

// Payment Amount Histogram
export const paymentAmount = new promClient.Histogram({
  name: 'payment_amount_dollars',
  help: 'Payment transaction amounts in dollars',
  labelNames: ['payment_method'],
  buckets: [10, 50, 100, 500, 1000, 5000, 10000]
});

// Security Events Counter
export const securityEvents = new promClient.Counter({
  name: 'security_events_total',
  help: 'Total number of security events',
  labelNames: ['event_type', 'severity']
});

// Account Lockout Counter
export const accountLockouts = new promClient.Counter({
  name: 'account_lockouts_total',
  help: 'Total number of account lockouts',
  labelNames: ['reason']
});

// JWT Token Metrics
export const jwtTokensIssued = new promClient.Counter({
  name: 'jwt_tokens_issued_total',
  help: 'Total number of JWT tokens issued',
  labelNames: ['token_type']
});

export const jwtTokensRejected = new promClient.Counter({
  name: 'jwt_tokens_rejected_total',
  help: 'Total number of JWT tokens rejected',
  labelNames: ['reason']
});

// Register all custom metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(activeConnections);
register.registerMetric(rateLimitExceeded);
register.registerMetric(failedLoginAttempts);
register.registerMetric(successfulLogins);
register.registerMetric(databaseQueryDuration);
register.registerMetric(cacheHits);
register.registerMetric(cacheMisses);
register.registerMetric(paymentTransactions);
register.registerMetric(paymentAmount);
register.registerMetric(securityEvents);
register.registerMetric(accountLockouts);
register.registerMetric(jwtTokensIssued);
register.registerMetric(jwtTokensRejected);

// ============================================
// MIDDLEWARE
// ============================================

/**
 * Metrics middleware - tracks request duration and counts
 */
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const start = process.hrtime.bigint();
  
  activeConnections.inc();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1e9; // Convert to seconds
    
    // Get route pattern instead of actual path (to avoid high cardinality)
    const route = req.route?.path || req.baseUrl + (req.route?.path || '') || 'unknown';
    
    httpRequestDuration.observe(
      { method: req.method, route, status: res.statusCode.toString() },
      duration
    );
    
    httpRequestTotal.inc({
      method: req.method,
      route,
      status: res.statusCode.toString()
    });
    
    activeConnections.dec();
  });

  next();
};

/**
 * Metrics endpoint handler
 */
export const metricsEndpoint = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    res.status(500).end('Error collecting metrics');
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Track database query duration
 */
export const trackDatabaseQuery = async <T>(
  operation: string,
  collection: string,
  queryFn: () => Promise<T>
): Promise<T> => {
  const start = process.hrtime.bigint();
  try {
    return await queryFn();
  } finally {
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1e9;
    databaseQueryDuration.observe({ operation, collection }, duration);
  }
};

/**
 * Track security event
 */
export const trackSecurityEvent = (eventType: string, severity: 'low' | 'medium' | 'high' | 'critical'): void => {
  securityEvents.inc({ event_type: eventType, severity });
};

/**
 * Track payment
 */
export const trackPayment = (status: 'success' | 'failed' | 'pending', paymentMethod: string, amount: number): void => {
  paymentTransactions.inc({ status, payment_method: paymentMethod });
  if (status === 'success') {
    paymentAmount.observe({ payment_method: paymentMethod }, amount);
  }
};

/**
 * Track login attempt
 */
export const trackLogin = (success: boolean, method: string = 'password', ip?: string, reason?: string): void => {
  if (success) {
    successfulLogins.inc({ method });
  } else {
    failedLoginAttempts.inc({ ip: ip || 'unknown', reason: reason || 'invalid_credentials' });
  }
};

/**
 * Track JWT token
 */
export const trackJwtToken = (issued: boolean, tokenType: 'access' | 'refresh', reason?: string): void => {
  if (issued) {
    jwtTokensIssued.inc({ token_type: tokenType });
  } else {
    jwtTokensRejected.inc({ reason: reason || 'unknown' });
  }
};
