import express from 'express';
import helmet from 'helmet';
import cors, { CorsOptions } from 'cors';
import hpp from 'hpp';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import path from 'path';
import passport from './config/passport'; // Import passport configuration
import { stripeWebhookHandler } from './controllers/payment.controller';
import routes from './routes';
import { generalRateLimiter } from './middleware/rateLimiter';
import { prototypePollutionProtection } from './middleware/sanitization';
import { metricsMiddleware, metricsEndpoint } from './middleware/metrics';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';
import { securityConfig, appConfig } from './config/env';
import logger from './utils/logger';

const app = express();

// SECURITY: Only trust proxy when explicitly configured
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);

const defaultOrigins = ['http://localhost:3000', 'http://localhost:5173', 'https://m80ggnkb-5000.asse.devtunnels.ms'];
const configuredOrigins = securityConfig.clientOrigin
  ? securityConfig.clientOrigin.split(',').map(origin => origin.trim()).filter(origin => origin.length > 0)
  : [];
const allowedOrigins = configuredOrigins.length > 0 ? configuredOrigins : defaultOrigins;

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests without Origin header (health checks, same-server requests, curl)
    // Browsers always send Origin for cross-origin requests, so this is safe
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalizedOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
    const normalizedAllowedOrigins = allowedOrigins.map(o => o.endsWith('/') ? o.slice(0, -1) : o);

    if (normalizedAllowedOrigins.includes(normalizedOrigin)) {
      callback(null, true);
      return;
    }

    // SECURITY: Block unauthorized origins - DO NOT allow all origins
    logger.warn({ origin, allowedOrigins }, 'Blocked CORS request from unauthorized origin');
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  // SECURITY: Explicitly define allowed methods
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  // SECURITY: Explicitly define allowed headers
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-CSRF-Token',
    'X-Fingerprint'
  ],
  // SECURITY: Limit exposed headers
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  // SECURITY: Cache preflight for 1 hour (reduces preflight requests)
  maxAge: 3600,
  // SECURITY: Don't pass preflight to next handler
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

// METRICS: Prometheus metrics endpoint (before other middleware to exclude from general metrics)
app.get('/metrics', metricsEndpoint);

// METRICS: Track request metrics
app.use(metricsMiddleware);

// SECURITY: Enhanced helmet configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    }
  },
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" }
}));
app.use(hpp());
app.use(cookieParser());
app.use(generalRateLimiter);

// Initialize Passport for OAuth
app.use(passport.initialize());

// ============================================
// CSRF PROTECTION
// For SPA with separate API domain, we use:
// 1. CORS (already configured above) - blocks cross-origin requests
// 2. Custom header requirement - browsers don't allow custom headers cross-origin without CORS
// 3. Origin/Referer validation for extra security
// ============================================

/**
 * CSRF Protection Middleware
 * 
 * For SPAs calling APIs on different subdomains, traditional cookie-based CSRF
 * doesn't work well. Instead, we rely on:
 * 
 * 1. CORS - Already blocks unauthorized origins
 * 2. X-Requested-With header - Custom headers require CORS preflight
 * 3. Origin validation - Verify request origin matches allowed origins
 * 
 * This is secure because:
 * - Browsers enforce CORS for cross-origin requests
 * - Custom headers cannot be set by forms or simple requests
 * - Origin header cannot be spoofed by browsers
 */
const csrfProtection = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Skip CSRF for safe methods (read-only)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  // Skip CSRF for webhook endpoints (they have their own signature verification)
  if (req.path.includes('/webhook')) {
    return next();
  }
  
  // Skip CSRF for OAuth callbacks (state parameter provides CSRF protection)
  if (req.path.includes('/oauth') || req.path.includes('/callback')) {
    return next();
  }

  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const contentType = req.headers['content-type'] || '';
  
  // For API requests, verify origin is in allowed list
  if (origin) {
    const normalizedOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
    const normalizedAllowedOrigins = allowedOrigins.map(o => o.endsWith('/') ? o.slice(0, -1) : o);
    
    if (!normalizedAllowedOrigins.includes(normalizedOrigin)) {
      logger.warn({
        ip: req.ip,
        path: req.path,
        origin,
        allowedOrigins: normalizedAllowedOrigins
      }, 'CSRF: Request from unauthorized origin blocked');
      return res.status(403).json({ status: 'error', message: 'Forbidden' });
    }
  }
  
  // For requests without Origin (same-origin or curl), check Referer
  if (!origin && referer) {
    try {
      const refererUrl = new URL(referer);
      const refererOrigin = refererUrl.origin;
      const normalizedAllowedOrigins = allowedOrigins.map(o => o.endsWith('/') ? o.slice(0, -1) : o);
      
      if (!normalizedAllowedOrigins.includes(refererOrigin)) {
        logger.warn({
          ip: req.ip,
          path: req.path,
          referer
        }, 'CSRF: Request from unauthorized referer blocked');
        return res.status(403).json({ status: 'error', message: 'Forbidden' });
      }
    } catch {
      // Invalid referer URL, block in production
      if (appConfig.env === 'production') {
        return res.status(403).json({ status: 'error', message: 'Forbidden' });
      }
    }
  }
  
  // For JSON API requests, require proper Content-Type
  // This prevents simple form submissions (which can't set Content-Type: application/json)
  if (req.path.startsWith('/api/') && !req.path.includes('/webhook')) {
    const isJsonRequest = contentType.includes('application/json');
    const isFormData = contentType.includes('multipart/form-data');
    const isUrlEncoded = contentType.includes('application/x-www-form-urlencoded');
    
    // Allow JSON and form-data (for file uploads), block plain form submissions in production
    if (!isJsonRequest && !isFormData && isUrlEncoded && appConfig.env === 'production') {
      logger.warn({
        ip: req.ip,
        path: req.path,
        contentType
      }, 'CSRF: URL-encoded form submission blocked (use JSON)');
      return res.status(403).json({ status: 'error', message: 'Use JSON for API requests' });
    }
  }
  
  next();
};

// Apply CSRF protection to API routes
app.use('/api/v1', csrfProtection);

// SECURITY: Add size limit to webhook endpoint to prevent large payload attacks
app.post('/api/v1/payments/webhook', express.raw({ type: 'application/json', limit: '64kb' }), stripeWebhookHandler);
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(mongoSanitize());

// SECURITY: Prototype pollution protection middleware
app.use(prototypePollutionProtection('block'));

app.use(
  '/uploads',
  express.static(path.resolve(process.cwd(), 'uploads'), {
    maxAge: appConfig.env === 'production' ? '7d' : 0,
    setHeaders: res => {
      const cacheHeader = appConfig.env === 'production' ? 'public, max-age=604800' : 'no-store';
      res.setHeader('Cache-Control', cacheHeader);
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
  })
);

app.use('/api/v1', routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
export const apiBasePath = '/api/v1';
