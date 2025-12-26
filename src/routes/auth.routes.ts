import { Router } from 'express';
import {
  registerHandler,
  verifyEmailHandler,
  resendVerificationHandler,
  loginHandler,
  login2FAHandler,
  refreshHandler,
  logoutHandler,
  forgotPasswordHandler,
  validateResetTokenHandler,
  resetPasswordHandler,
  changePasswordHandler,
  enable2FAHandler,
  verify2FASetupHandler,
  disable2FAHandler,
  regenerateBackupCodesHandler,
  getSessionsHandler,
  revokeSessionHandler,
  meHandler
} from '../controllers/auth.controller';
import { validateRequest } from '../middleware/validateRequest';
import {
  registerSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  loginSchema,
  login2FASchema,
  refreshSchema,
  forgotPasswordSchema,
  validateResetTokenSchema,
  resetPasswordSchema,
  changePasswordSchema,
  verify2FACodeSchema,
  disable2FASchema,
  regenerateBackupCodesSchema,
  revokeSessionSchema
} from '../validators/auth.validator';
import { 
  authRateLimiter, 
  strictRateLimiter, 
  checkLoginBlock,
  enhancedAuthRateLimiter,
  detectSuspiciousAutomation
} from '../middleware/rateLimiter';
import { authenticate, requireEmailVerified } from '../middleware/authMiddleware';

const router = Router();

// ============= Registration & Email Verification =============
router.post('/register', authRateLimiter, validateRequest(registerSchema), registerHandler);
router.post('/verify-email', validateRequest(verifyEmailSchema), verifyEmailHandler);
router.post('/resend-verification', authRateLimiter, validateRequest(resendVerificationSchema), resendVerificationHandler);

// ============= Login & 2FA =============
// SECURITY: Enhanced protection against device fingerprint bypass attacks
// - detectSuspiciousAutomation: Logs and optionally blocks automation tools
// - enhancedAuthRateLimiter: Stricter limits for suspicious requests
// - checkLoginBlock: IP+email based blocking beyond rate limiting
router.post('/login', 
  detectSuspiciousAutomation({ logOnly: true, minConfidence: 60 }),
  enhancedAuthRateLimiter, 
  checkLoginBlock, 
  validateRequest(loginSchema), 
  loginHandler
);
router.post('/login/2fa', 
  detectSuspiciousAutomation({ logOnly: true, minConfidence: 60 }),
  enhancedAuthRateLimiter, 
  checkLoginBlock, 
  validateRequest(login2FASchema), 
  login2FAHandler
);

// ============= Token Management =============
router.post('/refresh', validateRequest(refreshSchema), refreshHandler);
router.post('/logout', authenticate, logoutHandler);

// ============= Password Reset (no auth required) =============
router.post('/forgot-password', strictRateLimiter, validateRequest(forgotPasswordSchema), forgotPasswordHandler);
router.post('/validate-reset-token', validateRequest(validateResetTokenSchema), validateResetTokenHandler);
router.post('/reset-password', strictRateLimiter, validateRequest(resetPasswordSchema), resetPasswordHandler);

// ============= Password Change (auth required) =============
router.post('/change-password', authenticate, requireEmailVerified, validateRequest(changePasswordSchema), changePasswordHandler);

// ============= Two-Factor Authentication =============
router.post('/2fa/enable', authenticate, requireEmailVerified, enable2FAHandler);
router.post('/2fa/verify-setup', authenticate, requireEmailVerified, validateRequest(verify2FACodeSchema), verify2FASetupHandler);
router.post('/2fa/disable', authenticate, validateRequest(disable2FASchema), disable2FAHandler);
router.post('/2fa/backup-codes', authenticate, requireEmailVerified, validateRequest(regenerateBackupCodesSchema), regenerateBackupCodesHandler);

// ============= Session Management =============
router.get('/sessions', authenticate, getSessionsHandler);
router.post('/sessions/revoke', authenticate, validateRequest(revokeSessionSchema), revokeSessionHandler);

// ============= User Info =============
router.get('/me', authenticate, meHandler);

export default router;
