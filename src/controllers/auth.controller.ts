import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import {
  registerUser,
  verifyEmail,
  resendVerificationEmail,
  loginUser,
  loginWith2FA,
  refreshAccessToken,
  logoutUser,
  requestPasswordReset,
  validateResetToken,
  resetPassword,
  changePassword,
  enable2FA,
  verify2FASetup,
  disable2FA,
  regenerateBackupCodes,
  getActiveSessions,
  revokeSessionById
} from '../services/auth.service';
import { UserModel } from '../models/user.model';
import { sendSuccess, sendError } from '../utils/apiResponse';
import { authConfig, appConfig } from '../config/env';
import { durationToMs } from '../utils/time';
import { generateFingerprint, generateEnhancedFingerprint } from '../utils/jwt';
import { extractFingerprintComponents, detectAutomation } from '../utils/fingerprint';
import { trackFailedLogin, resetFailedLogin } from '../middleware/rateLimiter';
import logger from '../utils/logger';

const REFRESH_COOKIE_NAME = 'refreshToken';

const setRefreshCookie = (res: Response, token: string) => {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: appConfig.env === 'production',
    sameSite: 'strict',
    maxAge: durationToMs(authConfig.refreshToken.expiresIn)
  });
};

const clearRefreshCookie = (res: Response) => {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: appConfig.env === 'production',
    sameSite: 'strict'
  });
};

// Extract device info from request (enhanced with fingerprint components)
const extractDeviceInfo = (req: Request) => {
  const deviceId = req.body.deviceId || req.headers['x-device-id'] as string;
  const deviceName = req.body.deviceName || 'Unknown Device';
  
  // Use enhanced fingerprint components extraction
  const components = extractFingerprintComponents(req);
  
  // Detect automation attempts during login
  const automationResult = detectAutomation(req);
  if (automationResult.isAutomated && automationResult.confidence >= 70) {
    logger.warn({
      ip: components.ipAddress,
      userAgent: components.userAgent,
      confidence: automationResult.confidence,
      reasons: automationResult.reasons
    }, 'Potential automation/bot detected during login');
  }
  
  return { 
    deviceId, 
    deviceName, 
    userAgent: components.userAgent, 
    ipAddress: components.ipAddress,
    // Pass additional components for enhanced fingerprint generation
    fingerprintComponents: components
  };
};

// ============= Registration & Email Verification =============

export const registerHandler = async (req: Request, res: Response) => {
  try {
    const deviceInfo = extractDeviceInfo(req);
    
    const result = await registerUser(req.body, deviceInfo);

    // Don't set refresh token until email is verified
    return sendSuccess(res, StatusCodes.CREATED, {
      message: result.message,
      user: result.user
    });
  } catch (error) {
    logger.warn({ err: error, email: req.body.email }, 'Registration failed');
    return sendError(res, StatusCodes.BAD_REQUEST, (error as Error).message);
  }
};

export const verifyEmailHandler = async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    const result = await verifyEmail(token);
    
    return sendSuccess(res, StatusCodes.OK, {
      message: result.message
    });
  } catch (error) {
    logger.warn({ err: error }, 'Email verification failed');
    return sendError(res, StatusCodes.BAD_REQUEST, (error as Error).message);
  }
};

export const resendVerificationHandler = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    await resendVerificationEmail(email);
    
    return sendSuccess(res, StatusCodes.OK, {
      message: 'Verification email sent. Please check your inbox.'
    });
  } catch (error) {
    logger.warn({ err: error, email: req.body.email }, 'Resend verification failed');
    return sendError(res, StatusCodes.BAD_REQUEST, (error as Error).message);
  }
};

// ============= Login & 2FA =============

export const loginHandler = async (req: Request, res: Response) => {
  try {
    const deviceInfo = extractDeviceInfo(req);

    const result = await loginUser(req.body, deviceInfo);

    // If email verification is required
    if ('requiresEmailVerification' in result) {
      return sendSuccess(res, StatusCodes.FORBIDDEN, {
        message: 'Please verify your email before logging in',
        requiresEmailVerification: true,
        email: result.email
      });
    }

    // If 2FA is required, return temp token
    if ('tempToken' in result) {
      return sendSuccess(res, StatusCodes.OK, {
        message: '2FA required',
        requiresTwoFactor: true,
        tempToken: result.tempToken
      });
    }

    // SECURITY: Reset failed login tracking on successful login
    resetFailedLogin(req, req.body.email);

    // Normal login without 2FA
    setRefreshCookie(res, result.tokens.refreshToken);
    
    return sendSuccess(res, StatusCodes.OK, {
      message: 'Login successful',
      user: result.user,
      tokens: {
        accessToken: result.tokens.accessToken
      }
    });
  } catch (error) {
    // SECURITY: Track failed login attempt
    trackFailedLogin(req, req.body.email);
    
    logger.warn({ err: error, email: req.body.email }, 'Login failed');
    return sendError(res, StatusCodes.UNAUTHORIZED, (error as Error).message);
  }
};

export const login2FAHandler = async (req: Request, res: Response) => {
  try {
    const { tempToken, code } = req.body;
    const deviceInfo = extractDeviceInfo(req);

    const result = await loginWith2FA(tempToken, code, deviceInfo);
    
    // SECURITY: Reset failed login tracking on successful 2FA login
    resetFailedLogin(req);
    
    setRefreshCookie(res, result.tokens.refreshToken);
    
    return sendSuccess(res, StatusCodes.OK, {
      message: 'Login successful',
      user: result.user,
      tokens: {
        accessToken: result.tokens.accessToken
      }
    });
  } catch (error) {
    // SECURITY: Track failed 2FA attempt
    trackFailedLogin(req);
    
    logger.warn({ err: error }, '2FA login failed');
    return sendError(res, StatusCodes.UNAUTHORIZED, (error as Error).message);
  }
};

// ============= Token Refresh & Logout =============

export const refreshHandler = async (req: Request, res: Response) => {
  try {
    // SECURITY: Only accept refresh token from HttpOnly cookie, not from body
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!refreshToken) {
      return sendError(res, StatusCodes.UNAUTHORIZED, 'Refresh token missing');
    }

    const deviceInfo = extractDeviceInfo(req);

    const result = await refreshAccessToken(refreshToken, deviceInfo);
    
    setRefreshCookie(res, result.tokens.refreshToken);

    return sendSuccess(res, StatusCodes.OK, {
      user: result.user,
      tokens: {
        accessToken: result.tokens.accessToken
      }
    });
  } catch (error) {
    logger.warn({ err: error }, 'Token refresh failed');
    clearRefreshCookie(res);
    return sendError(res, StatusCodes.UNAUTHORIZED, (error as Error).message);
  }
};

export const logoutHandler = async (req: Request, res: Response) => {
  try {
    if (!req.authUser) {
      return sendError(res, StatusCodes.UNAUTHORIZED, 'Not authenticated');
    }

    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (refreshToken) {
      await logoutUser(refreshToken);
    }
    
    clearRefreshCookie(res);
    return sendSuccess(res, StatusCodes.OK, { message: 'Logged out successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Logout failed');
    clearRefreshCookie(res);
    return sendSuccess(res, StatusCodes.OK, { message: 'Logged out' });
  }
};

// ============= Password Reset =============

export const forgotPasswordHandler = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    await requestPasswordReset(email);
    
    // Always return success to prevent email enumeration
    return sendSuccess(res, StatusCodes.OK, {
      message: 'If the email exists, a password reset link has been sent.'
    });
  } catch (error) {
    logger.warn({ err: error, email: req.body.email }, 'Password reset request failed');
    // Still return success to prevent email enumeration
    return sendSuccess(res, StatusCodes.OK, {
      message: 'If the email exists, a password reset link has been sent.'
    });
  }
};

export const validateResetTokenHandler = async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    const isValid = await validateResetToken(token);
    
    if (!isValid) {
      return sendError(res, StatusCodes.BAD_REQUEST, 'Invalid or expired reset token');
    }
    
    return sendSuccess(res, StatusCodes.OK, { message: 'Token is valid' });
  } catch (error) {
    logger.warn({ err: error }, 'Reset token validation failed');
    return sendError(res, StatusCodes.BAD_REQUEST, 'Invalid or expired reset token');
  }
};

export const resetPasswordHandler = async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    await resetPassword(token, newPassword);
    
    return sendSuccess(res, StatusCodes.OK, {
      message: 'Password reset successful. Please login with your new password.'
    });
  } catch (error) {
    logger.warn({ err: error }, 'Password reset failed');
    return sendError(res, StatusCodes.BAD_REQUEST, (error as Error).message);
  }
};

export const changePasswordHandler = async (req: Request, res: Response) => {
  try {
    if (!req.authUser) {
      return sendError(res, StatusCodes.UNAUTHORIZED, 'Not authenticated');
    }

    const { currentPassword, newPassword } = req.body;
    await changePassword(req.authUser.id, currentPassword, newPassword);
    
    clearRefreshCookie(res);
    
    return sendSuccess(res, StatusCodes.OK, {
      message: 'Password changed successfully. Please login again with your new password.'
    });
  } catch (error) {
    logger.warn({ err: error, userId: req.authUser?.id }, 'Password change failed');
    return sendError(res, StatusCodes.BAD_REQUEST, (error as Error).message);
  }
};

// ============= Two-Factor Authentication =============

export const enable2FAHandler = async (req: Request, res: Response) => {
  try {
    if (!req.authUser) {
      return sendError(res, StatusCodes.UNAUTHORIZED, 'Not authenticated');
    }

    const result = await enable2FA(req.authUser.id);
    
    return sendSuccess(res, StatusCodes.OK, {
      message: 'Scan the QR code with your authenticator app',
      secret: result.secret,
      qrCode: result.qrCode,
      backupCodes: result.backupCodes
    });
  } catch (error) {
    logger.error({ err: error, userId: req.authUser?.id }, 'Enable 2FA failed');
    return sendError(res, StatusCodes.BAD_REQUEST, (error as Error).message);
  }
};

export const verify2FASetupHandler = async (req: Request, res: Response) => {
  try {
    if (!req.authUser) {
      return sendError(res, StatusCodes.UNAUTHORIZED, 'Not authenticated');
    }

    const { code } = req.body;
    await verify2FASetup(req.authUser.id, code);
    
    return sendSuccess(res, StatusCodes.OK, {
      message: '2FA enabled successfully'
    });
  } catch (error) {
    logger.warn({ err: error, userId: req.authUser?.id }, '2FA verification failed');
    return sendError(res, StatusCodes.BAD_REQUEST, (error as Error).message);
  }
};

export const disable2FAHandler = async (req: Request, res: Response) => {
  try {
    if (!req.authUser) {
      return sendError(res, StatusCodes.UNAUTHORIZED, 'Not authenticated');
    }

    const { password, code } = req.body;
    await disable2FA(req.authUser.id, password, code);
    
    return sendSuccess(res, StatusCodes.OK, {
      message: '2FA disabled successfully'
    });
  } catch (error) {
    logger.warn({ err: error, userId: req.authUser?.id }, 'Disable 2FA failed');
    return sendError(res, StatusCodes.BAD_REQUEST, (error as Error).message);
  }
};

export const regenerateBackupCodesHandler = async (req: Request, res: Response) => {
  try {
    if (!req.authUser) {
      return sendError(res, StatusCodes.UNAUTHORIZED, 'Not authenticated');
    }

    const { password } = req.body;
    const backupCodes = await regenerateBackupCodes(req.authUser.id, password);
    
    return sendSuccess(res, StatusCodes.OK, {
      message: 'New backup codes generated',
      backupCodes
    });
  } catch (error) {
    logger.warn({ err: error, userId: req.authUser?.id }, 'Regenerate backup codes failed');
    return sendError(res, StatusCodes.BAD_REQUEST, (error as Error).message);
  }
};

// ============= Session Management =============

export const getSessionsHandler = async (req: Request, res: Response) => {
  try {
    if (!req.authUser) {
      return sendError(res, StatusCodes.UNAUTHORIZED, 'Not authenticated');
    }

    const sessions = await getActiveSessions(req.authUser.id);
    
    return sendSuccess(res, StatusCodes.OK, { sessions });
  } catch (error) {
    logger.error({ err: error, userId: req.authUser?.id }, 'Get sessions failed');
    return sendError(res, StatusCodes.INTERNAL_SERVER_ERROR, 'Failed to retrieve sessions');
  }
};

export const revokeSessionHandler = async (req: Request, res: Response) => {
  try {
    if (!req.authUser) {
      return sendError(res, StatusCodes.UNAUTHORIZED, 'Not authenticated');
    }

    const { sessionId } = req.body;
    await revokeSessionById(req.authUser.id, sessionId);
    
    return sendSuccess(res, StatusCodes.OK, {
      message: 'Session revoked successfully'
    });
  } catch (error) {
    logger.warn({ err: error, userId: req.authUser?.id }, 'Revoke session failed');
    return sendError(res, StatusCodes.BAD_REQUEST, (error as Error).message);
  }
};

// ============= User Info =============

export const meHandler = async (req: Request, res: Response) => {
  try {
    if (!req.authUser) {
      return sendError(res, StatusCodes.UNAUTHORIZED, 'Not authenticated');
    }

    // Get full user info from database
    const user = await UserModel.findById(req.authUser.id)
      .select('email role tokenVersion isEmailVerified twoFactorEnabled');
    
    if (!user) {
      return sendError(res, StatusCodes.NOT_FOUND, 'User not found');
    }

    return sendSuccess(res, StatusCodes.OK, {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tokenVersion: user.tokenVersion,
        isEmailVerified: user.isEmailVerified,
        twoFactorEnabled: user.twoFactorEnabled
      }
    });
  } catch (error) {
    logger.error({ err: error, userId: req.authUser?.id }, 'Failed to get user info');
    return sendError(res, StatusCodes.INTERNAL_SERVER_ERROR, 'Failed to get user info');
  }
};

