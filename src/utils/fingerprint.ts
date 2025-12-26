/**
 * Enhanced Device Fingerprint Module
 * 
 * SECURITY: Multi-layer device fingerprinting to prevent bypass attacks
 * 
 * Layers:
 * 1. Network Layer: IP address, proxy detection
 * 2. HTTP Layer: Headers with high entropy
 * 3. TLS Layer: TLS fingerprint (JA3-like) when available
 * 4. Behavioral Layer: Request patterns and timing
 * 
 * @see VULNERABILITY REPORT: Device Fingerprint Bypass (27 December 2025)
 */

import crypto from 'crypto';
import { Request } from 'express';
import { TLSSocket } from 'tls';
import logger from './logger';

// ============================================
// SUSPICIOUS PATTERNS DETECTION
// ============================================

/**
 * Known automation tool User-Agent patterns
 */
const SUSPICIOUS_UA_PATTERNS: RegExp[] = [
  /python-requests/i,
  /python-urllib/i,
  /curl\//i,
  /wget\//i,
  /postman/i,
  /insomnia/i,
  /^python\//i,
  /httpie\//i,
  /axios\//i,
  /node-fetch/i,
  /got\//i,
  /^java\//i,
  /apache-httpclient/i,
  /okhttp/i,
  /go-http-client/i,
  /php\//i,
  /guzzle/i,
  /scrapy/i,
  /selenium/i,
  /headless/i,
  /phantomjs/i,
  /puppeteer/i,
  /playwright/i,
];

/**
 * Check if User-Agent appears to be from automation tool
 */
export function isSuspiciousUserAgent(userAgent: string): boolean {
  if (!userAgent || userAgent.length === 0) {
    return true; // Empty UA is suspicious
  }
  
  return SUSPICIOUS_UA_PATTERNS.some(pattern => pattern.test(userAgent));
}

/**
 * Detect if request is likely from a bot/automation
 */
export function detectAutomation(req: Request): {
  isAutomated: boolean;
  confidence: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let suspicionScore = 0;

  const userAgent = req.headers['user-agent'] || '';
  const accept = req.headers['accept'] || '';
  const acceptLanguage = req.headers['accept-language'] || '';
  const acceptEncoding = req.headers['accept-encoding'] || '';

  // Check 1: Empty or missing User-Agent (HIGH confidence)
  if (!userAgent || userAgent.length === 0) {
    suspicionScore += 40;
    reasons.push('missing_user_agent');
  }

  // Check 2: Known automation User-Agent (HIGH confidence)
  if (isSuspiciousUserAgent(userAgent)) {
    suspicionScore += 35;
    reasons.push('automation_user_agent');
  }

  // Check 3: Missing common browser headers (MEDIUM confidence)
  if (!acceptLanguage) {
    suspicionScore += 15;
    reasons.push('missing_accept_language');
  }

  if (!accept || accept === '*/*') {
    suspicionScore += 10;
    reasons.push('generic_accept_header');
  }

  if (!acceptEncoding) {
    suspicionScore += 10;
    reasons.push('missing_accept_encoding');
  }

  // Check 4: Missing Sec-Fetch headers (browsers always send these)
  const secFetchSite = req.headers['sec-fetch-site'];
  const secFetchMode = req.headers['sec-fetch-mode'];
  const secFetchDest = req.headers['sec-fetch-dest'];

  if (!secFetchSite && !secFetchMode && !secFetchDest) {
    suspicionScore += 15;
    reasons.push('missing_sec_fetch_headers');
  }

  // Check 5: User-Agent claims to be browser but missing browser-specific headers
  const claimsBrowser = /Mozilla|Chrome|Safari|Firefox|Edge/i.test(userAgent);
  if (claimsBrowser && reasons.includes('missing_sec_fetch_headers')) {
    suspicionScore += 20;
    reasons.push('browser_ua_without_browser_headers');
  }

  // Check 6: Connection header patterns
  const connection = req.headers['connection'];
  if (connection === 'close') {
    suspicionScore += 5;
    reasons.push('connection_close');
  }

  return {
    isAutomated: suspicionScore >= 50,
    confidence: Math.min(suspicionScore, 100),
    reasons
  };
}

// ============================================
// TLS FINGERPRINTING
// ============================================

/**
 * Extract TLS fingerprint components from socket
 * This provides a JA3-like fingerprint that's harder to spoof
 */
export function extractTLSInfo(req: Request): string {
  try {
    const socket = req.socket as TLSSocket;
    
    if (!socket || typeof socket.getCipher !== 'function') {
      return 'no-tls';
    }

    const cipher = socket.getCipher?.();
    const protocol = socket.getProtocol?.();
    
    // Get available cipher info
    const components = [
      protocol || 'unknown-protocol',
      cipher?.name || 'unknown-cipher',
      cipher?.version || 'unknown-version',
    ];

    // Note: Full JA3 fingerprinting requires access to TLS handshake details
    // which may need additional configuration or middleware (like ja3 npm package)
    // This is a simplified version that still provides some entropy
    
    return components.join(':');
  } catch (error) {
    logger.debug({ err: error }, 'Failed to extract TLS info');
    return 'tls-error';
  }
}

// ============================================
// ENHANCED FINGERPRINT GENERATION
// ============================================

export interface FingerprintComponents {
  // Network layer
  ipAddress: string;
  forwardedFor?: string;
  
  // HTTP layer
  userAgent: string;
  accept: string;
  acceptLanguage: string;
  acceptEncoding: string;
  
  // Security headers (browsers always send these)
  secFetchSite?: string;
  secFetchMode?: string;
  secFetchDest?: string;
  
  // TLS layer
  tlsInfo: string;
}

/**
 * Extract all fingerprint components from request
 */
export function extractFingerprintComponents(req: Request): FingerprintComponents {
  // Get IP address (handle proxies)
  const forwardedFor = req.headers['x-forwarded-for'] as string;
  const ipAddress = forwardedFor?.split(',')[0]?.trim() || 
                    req.socket.remoteAddress || 
                    'unknown';

  return {
    ipAddress,
    forwardedFor,
    userAgent: req.headers['user-agent'] || '',
    accept: req.headers['accept'] || '',
    acceptLanguage: req.headers['accept-language'] || '',
    acceptEncoding: req.headers['accept-encoding'] || '',
    secFetchSite: req.headers['sec-fetch-site'] as string,
    secFetchMode: req.headers['sec-fetch-mode'] as string,
    secFetchDest: req.headers['sec-fetch-dest'] as string,
    tlsInfo: extractTLSInfo(req),
  };
}

/**
 * Generate enhanced device fingerprint
 * 
 * SECURITY: This fingerprint combines multiple layers of signals
 * that are harder to replicate than simple header-based fingerprints.
 */
export function generateEnhancedFingerprint(req: Request): string {
  const components = extractFingerprintComponents(req);
  
  // Build fingerprint string with all components
  // Order matters for consistency!
  const fingerprintData = [
    // Network (HIGH priority - hardest to spoof without proxy)
    components.ipAddress,
    
    // TLS (MEDIUM-HIGH priority - requires TLS library matching)
    components.tlsInfo,
    
    // HTTP Headers (MEDIUM priority - can be spoofed but adds entropy)
    components.userAgent,
    components.acceptLanguage,
    components.acceptEncoding,
    
    // Browser-specific headers (MEDIUM priority)
    components.secFetchSite || 'none',
    components.secFetchMode || 'none',
    components.secFetchDest || 'none',
  ].join('|');

  return crypto
    .createHash('sha256')
    .update(fingerprintData)
    .digest('hex');
}

/**
 * Generate fingerprint from individual components (for auth.service compatibility)
 */
export function generateFingerprintFromComponents(
  userAgent: string,
  ipAddress: string,
  additionalData?: Partial<FingerprintComponents>
): string {
  const fingerprintData = [
    ipAddress,
    additionalData?.tlsInfo || 'no-tls',
    userAgent,
    additionalData?.acceptLanguage || '',
    additionalData?.acceptEncoding || '',
    additionalData?.secFetchSite || 'none',
    additionalData?.secFetchMode || 'none',
    additionalData?.secFetchDest || 'none',
  ].join('|');

  return crypto
    .createHash('sha256')
    .update(fingerprintData)
    .digest('hex');
}

/**
 * Legacy fingerprint for backward compatibility
 * DEPRECATED: Use generateEnhancedFingerprint instead
 */
export function generateLegacyFingerprint(userAgent: string, ipAddress: string): string {
  return crypto
    .createHash('sha256')
    .update(`${userAgent}:${ipAddress}`)
    .digest('hex');
}

// ============================================
// CLIENT-SIDE FINGERPRINT VALIDATION
// ============================================

/**
 * Validate client-provided fingerprint format
 */
export function isValidClientFingerprint(fingerprint: string): boolean {
  // Should be a hex string of appropriate length (e.g., from FingerprintJS)
  if (!fingerprint || typeof fingerprint !== 'string') {
    return false;
  }
  
  // Accept various fingerprint formats
  // FingerprintJS: ~32 character alphanumeric
  // SHA256: 64 character hex
  return /^[a-zA-Z0-9]{16,64}$/.test(fingerprint);
}

// ============================================
// FINGERPRINT COMPARISON
// ============================================

/**
 * Compare fingerprints with tolerance for minor variations
 * 
 * Returns match score between 0 and 1
 */
export function compareFingerprints(
  stored: string,
  current: string,
  options: { strict?: boolean } = {}
): { match: boolean; score: number } {
  if (!stored || !current) {
    return { match: false, score: 0 };
  }

  // Exact match
  if (stored === current) {
    return { match: true, score: 1.0 };
  }

  // For strict mode, only exact match is acceptable
  if (options.strict) {
    return { match: false, score: 0 };
  }

  // For non-strict mode, we could implement fuzzy matching
  // based on fingerprint components if needed
  return { match: false, score: 0 };
}

// ============================================
// LOGGING & MONITORING
// ============================================

/**
 * Log fingerprint event for security monitoring
 */
export function logFingerprintEvent(
  eventType: 'match' | 'mismatch' | 'suspicious',
  req: Request,
  details: {
    userId?: string;
    storedFingerprint?: string;
    currentFingerprint?: string;
    automationDetection?: ReturnType<typeof detectAutomation>;
  }
): void {
  const components = extractFingerprintComponents(req);
  
  logger.warn({
    event: `fingerprint.${eventType}`,
    userId: details.userId,
    ip: components.ipAddress,
    userAgent: components.userAgent,
    storedFingerprint: details.storedFingerprint?.substring(0, 16) + '...',
    currentFingerprint: details.currentFingerprint?.substring(0, 16) + '...',
    automation: details.automationDetection,
    secHeaders: {
      fetchSite: components.secFetchSite,
      fetchMode: components.secFetchMode,
      fetchDest: components.secFetchDest,
    },
    tlsInfo: components.tlsInfo,
  }, `Fingerprint ${eventType} detected`);
}
