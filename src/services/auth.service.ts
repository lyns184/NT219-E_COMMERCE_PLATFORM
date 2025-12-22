import { FilterQuery } from 'mongoose';
import { v4 as uuid } from 'uuid';
import { UserModel, UserDocument, UserRole } from '../models/user.model';
import { comparePassword } from '../utils/password';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  generateSecureToken,
  generateFingerprint
} from '../utils/jwt';
import {
  createRefreshToken,
  validateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  getUserSessions,
  revokeSession
} from './refreshToken.service';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  send2FAEnabledEmail,
  sendPasswordChangedEmail,
  sendSuspiciousLoginAlert,
  sendAccountLockedEmail
} from './email.service';
import {
  generate2FASecret,
  verify2FACode,
  generateBackupCodes,
  hashBackupCodes
} from './twoFactor.service';
import { logAuthEvent, logSecurityEvent } from './audit.service';
import { DeviceInfo, RefreshTokenPayload } from '../types';
import logger from '../utils/logger';

const sanitizeUser = (user: UserDocument) => {
  const userObj = user.toObject();
  const { password, twoFactorSecret, twoFactorBackupCodes, emailVerificationToken, passwordResetToken, passwordHistory, loginHistory, trustedDevices, ...safeUser } = userObj;
  return safeUser;
};

/**
 * ============================================
 * REGISTRATION & EMAIL VERIFICATION
 * ============================================
 */

export interface RegisterInput {
  email: string;
  password: string;
  // NOTE: role removed - users cannot self-assign roles
}

export const registerUser = async (input: RegisterInput, deviceInfo: DeviceInfo) => {
  // Check if user already exists
  const existing = await UserModel.findOne({ email: input.email } as FilterQuery<any>);
  if (existing) {
    throw new Error('Email already registered');
  }

  // Generate email verification token
  const verificationToken = generateSecureToken();
  const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  // Create user - role is ALWAYS 'user' for security
  const user = new UserModel({
    email: input.email,
    password: input.password,
    role: 'user', // SECURITY: Always default to 'user', admin must be assigned manually
    provider: 'local',
    isEmailVerified: false,
    emailVerificationToken: verificationToken,
    emailVerificationExpiry: verificationExpiry
  });

  await user.save();

  // Send verification email
  try {
    await sendVerificationEmail(user.email, verificationToken);
  } catch (error) {
    logger.error({ err: error, email: user.email }, 'Failed to send verification email');
    // Don't fail registration if email fails
  }

  // Log registration
  await user.addToLoginHistory({
    ipAddress: deviceInfo.ipAddress,
    userAgent: deviceInfo.userAgent,
    success: true,
    reason: 'Account created',
    location: deviceInfo.location
  });

  // Audit log: User registration
  await logAuthEvent(
    'auth.register',
    user.id,
    {
      email: user.email,
      ip: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
      method: 'local'
    },
    'success'
  );

  logger.info({ userId: user.id, email: user.email }, 'New user registered');

  return {
    user: sanitizeUser(user),
    message: 'Registration successful. Please check your email to verify your account.'
  };
};

export const verifyEmail = async (token: string) => {
  const user = await UserModel.findOne({
    emailVerificationToken: token,
    emailVerificationExpiry: { $gt: new Date() }
  }).select('+emailVerificationToken +emailVerificationExpiry');

  if (!user) {
    throw new Error('Invalid or expired verification token');
  }

  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpiry = undefined;
  await user.save();

  // Audit log: Email verification
  await logAuthEvent(
    'auth.email_verify',
    user.id,
    {
      email: user.email,
      method: 'email_token'
    },
    'success'
  );

  logger.info({ userId: user.id, email: user.email }, 'Email verified');

  return {
    message: 'Email verified successfully. You can now log in.'
  };
};

export const resendVerificationEmail = async (email: string) => {
  const user = await UserModel.findOne({ email, provider: 'local' } as FilterQuery<any>);

  if (!user) {
    // Don't reveal if email exists or not
    return { message: 'If your email is registered, you will receive a verification email.' };
  }

  if (user.isEmailVerified) {
    throw new Error('Email is already verified');
  }

  // Generate new token
  const verificationToken = generateSecureToken();
  const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  user.emailVerificationToken = verificationToken;
  user.emailVerificationExpiry = verificationExpiry;
  await user.save();

  await sendVerificationEmail(user.email, verificationToken);

  logger.info({ userId: user.id, email: user.email }, 'Verification email resent');

  return { message: 'Verification email sent' };
};

/**
 * ============================================
 * LOGIN & AUTHENTICATION
 * ============================================
 */

export interface LoginInput {
  email: string;
  password: string;
}

export const loginUser = async (input: LoginInput, deviceInfo: DeviceInfo) => {
  const user = await UserModel.findOne({ email: input.email, provider: 'local' } as FilterQuery<any>)
    .select('+password +twoFactorSecret +twoFactorEnabled +tokenVersion');

  if (!user) {
    throw new Error('Invalid credentials');
  }

  // Check if account is locked
  if (user.isAccountLocked()) {
    await sendAccountLockedEmail(user.email, user.accountLockedUntil!);
    throw new Error(`Account is locked until ${user.accountLockedUntil!.toLocaleString()}`);
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(input.password);
  
  if (!isPasswordValid) {
    // Log failed attempt
    await user.incrementFailedLogin();
    await user.addToLoginHistory({
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
      success: false,
      reason: 'Invalid password',
      location: deviceInfo.location
    });

    // Audit log: Failed login
    await logSecurityEvent(
      'security.failed_login',
      user.id,
      {
        ip: deviceInfo.ipAddress,
        userAgent: deviceInfo.userAgent,
        reason: 'Invalid password'
      },
      50
    );

    throw new Error('Invalid credentials');
  }

  // Reset failed login attempts on successful password verification
  await user.resetFailedLogin();

  // Check if email is verified
  if (!user.isEmailVerified) {
    return {
      requiresEmailVerification: true,
      email: user.email
    };
  }

  // Check if 2FA is enabled
  if (user.twoFactorEnabled) {
    // Generate temporary token for 2FA flow
    const tempToken = generateSecureToken();
    const tempTokenExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Store temp token (you might want a separate field for this)
    // For simplicity, we'll use emailVerificationToken field temporarily
    user.emailVerificationToken = tempToken;
    user.emailVerificationExpiry = tempTokenExpiry;
    await user.save();

    return {
      requiresTwoFactor: true,
      tempToken,
      message: 'Please enter your 2FA code'
    };
  }

  // Generate tokens
  const fingerprint = generateFingerprint(deviceInfo.userAgent, deviceInfo.ipAddress);
  const family = uuid();

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
    fingerprint
  });

  const refreshToken = signRefreshToken({
    sub: user.id,
    family,
    tokenVersion: user.tokenVersion
  });

  // Calculate expiry (7 days from now)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Store refresh token
  await createRefreshToken(refreshToken, user.id, deviceInfo, family, expiresAt);

  // Log successful login
  await user.addToLoginHistory({
    ipAddress: deviceInfo.ipAddress,
    userAgent: deviceInfo.userAgent,
    success: true,
    reason: 'Login successful',
    location: deviceInfo.location
  });

  // Audit log: Successful login
  await logAuthEvent(
    'auth.login',
    user.id,
    {
      email: user.email,
      ip: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
      method: user.twoFactorEnabled ? '2fa' : 'password'
    },
    'success'
  );

  // Check if this is a new device
  const isNewDevice = deviceInfo.deviceId && 
    (!user.trustedDevices || !user.trustedDevices.some(d => d.deviceId === deviceInfo.deviceId));
  
  if (isNewDevice) {
    try {
      await sendSuspiciousLoginAlert(
        user.email,
        deviceInfo.ipAddress,
        deviceInfo.location || 'Unknown',
        deviceInfo.deviceName
      );
    } catch (error) {
      logger.error({ err: error }, 'Failed to send new device alert');
    }
  }

  logger.info({ userId: user.id, email: user.email }, 'User logged in');

  return {
    user: sanitizeUser(user),
    tokens: {
      accessToken,
      refreshToken
    }
  };
};

export const loginWith2FA = async (tempToken: string, code: string, deviceInfo: DeviceInfo) => {
  const user = await UserModel.findOne({
    emailVerificationToken: tempToken,
    emailVerificationExpiry: { $gt: new Date() }
  }).select('+twoFactorSecret +twoFactorBackupCodes +twoFactorEnabled +tokenVersion +emailVerificationToken');

  if (!user || !user.twoFactorEnabled) {
    throw new Error('Invalid or expired token');
  }

  let isCodeValid = false;

  // Try regular TOTP code first
  if (user.twoFactorSecret) {
    isCodeValid = verify2FACode(user.twoFactorSecret, code);
  }

  // If not valid, try backup code
  if (!isCodeValid) {
    isCodeValid = await user.verifyBackupCode(code);
  }

  if (!isCodeValid) {
    await user.addToLoginHistory({
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
      success: false,
      reason: 'Invalid 2FA code',
      location: deviceInfo.location
    });

    // Audit log: Failed 2FA
    await logSecurityEvent(
      'security.failed_login',
      user.id,
      {
        ip: deviceInfo.ipAddress,
        userAgent: deviceInfo.userAgent,
        reason: 'Invalid 2FA code'
      },
      60
    );

    throw new Error('Invalid 2FA code');
  }

  // Clear temp token
  user.emailVerificationToken = undefined;
  user.emailVerificationExpiry = undefined;
  await user.save();

  // Generate tokens
  const fingerprint = generateFingerprint(deviceInfo.userAgent, deviceInfo.ipAddress);
  const family = uuid();

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
    fingerprint
  });

  const refreshToken = signRefreshToken({
    sub: user.id,
    family,
    tokenVersion: user.tokenVersion
  });

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await createRefreshToken(refreshToken, user.id, deviceInfo, family, expiresAt);

  await user.addToLoginHistory({
    ipAddress: deviceInfo.ipAddress,
    userAgent: deviceInfo.userAgent,
    success: true,
    reason: '2FA login successful',
    location: deviceInfo.location
  });

  logger.info({ userId: user.id, email: user.email }, 'User logged in with 2FA');

  return {
    user: sanitizeUser(user),
    tokens: {
      accessToken,
      refreshToken
    }
  };
};

/**
 * Refresh access token using refresh token
 * Implements automatic token rotation
 */
export const refreshAccessToken = async (refreshTokenString: string, deviceInfo: DeviceInfo) => {
  // Validate and get stored token
  const storedToken = await validateRefreshToken(refreshTokenString);

  // Verify JWT
  const payload = verifyRefreshToken(refreshTokenString) as RefreshTokenPayload;

  // Get user
  const user = await UserModel.findById(payload.sub).select('+tokenVersion');
  
  if (!user) {
    throw new Error('User not found');
  }

  // Check token version
  if (payload.tokenVersion !== user.tokenVersion) {
    logger.warn({ userId: user.id }, 'Token version mismatch - tokens invalidated');
    throw new Error('Token invalidated');
  }

  // Revoke old refresh token FIRST to prevent race conditions
  await revokeRefreshToken(refreshTokenString, 'Token rotated');

  // Generate new tokens (new family to prevent duplicate hash)
  const fingerprint = generateFingerprint(deviceInfo.userAgent, deviceInfo.ipAddress);
  const newFamily = uuid(); // Generate NEW family for each refresh to avoid hash collision

  const newAccessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
    fingerprint
  });

  const newRefreshToken = signRefreshToken({
    sub: user.id,
    family: newFamily, // Use NEW family instead of keeping old one
    tokenVersion: user.tokenVersion
  });

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  
  try {
    await createRefreshToken(newRefreshToken, user.id, deviceInfo, newFamily, expiresAt);
  } catch (error: any) {
    // If duplicate key error, token was already created (race condition)
    if (error.code === 11000) {
      logger.warn({ userId: user.id }, 'Duplicate refresh token detected - race condition handled');
      // Return the existing tokens (this is safe because old token was already revoked)
      throw new Error('Token refresh in progress, please retry');
    }
    throw error;
  }

  logger.debug({ userId: user.id }, 'Access token refreshed');

  return {
    user: sanitizeUser(user),
    tokens: {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    }
  };
};

/**
 * Logout user (revoke refresh token)
 */
export const logoutUser = async (refreshTokenString: string) => {
  await revokeRefreshToken(refreshTokenString, 'User logged out');
  logger.debug('User logged out');

  return { message: 'Logged out successfully' };
};

/**
 * Logout from all devices (revoke all tokens)
 */
export const logoutAllSessions = async (userId: string) => {
  await revokeAllUserTokens(userId, 'User logged out from all devices');
  logger.info({ userId }, 'User logged out from all devices');

  return { message: 'Logged out from all devices' };
};

// ... Continue in next part (password reset, 2FA, etc.)


export const requestPasswordReset = async (email: string) => {
  const user = await UserModel.findOne({ email, provider: 'local' });

  if (!user) {
    // Don't reveal if email exists
    return { message: 'If your email is registered, you will receive a password reset link.' };
  }

  // Generate reset token
  const resetToken = generateSecureToken();
  const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  user.passwordResetToken = resetToken;
  user.passwordResetExpiry = resetExpiry;
  await user.save();

  await sendPasswordResetEmail(user.email, resetToken);

  logger.info({ userId: user.id, email: user.email }, 'Password reset requested');

  return { message: 'Password reset link sent to your email' };
};

export const validateResetToken = async (token: string) => {
  const user = await UserModel.findOne({
    passwordResetToken: token,
    passwordResetExpiry: { $gt: new Date() }
  });

  if (!user) {
    throw new Error('Invalid or expired reset token');
  }

  return { message: 'Token is valid' };
};

export const resetPassword = async (token: string, newPassword: string) => {
  const user = await UserModel.findOne({
    passwordResetToken: token,
    passwordResetExpiry: { $gt: new Date() }
  }).select('+password +passwordHistory +passwordResetToken');

  if (!user) {
    throw new Error('Invalid or expired reset token');
  }

  // Check password history (prevent reuse of last 5 passwords)
  if (user.passwordHistory && user.passwordHistory.length > 0) {
    for (const oldHash of user.passwordHistory) {
      const isSamePassword = await comparePassword(newPassword, oldHash);
      if (isSamePassword) {
        throw new Error('Cannot reuse a recent password. Please choose a different password.');
      }
    }
  }

  // Update password
  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpiry = undefined;
  user.lastPasswordChange = new Date();
  await user.save();

  // Invalidate all tokens (force re-login everywhere)
  await user.invalidateAllTokens();
  await revokeAllUserTokens(user.id, 'Password reset');

  // Send notification
  await sendPasswordChangedEmail(user.email);

  logger.info({ userId: user.id }, 'Password reset completed');

  return { message: 'Password reset successfully. Please log in with your new password.' };
};

export const changePassword = async (userId: string, currentPassword: string, newPassword: string) => {
  const user = await UserModel.findById(userId).select('+password +passwordHistory');

  if (!user) {
    throw new Error('User not found');
  }

  // Verify current password
  const isCurrentPasswordValid = await user.comparePassword(currentPassword);
  if (!isCurrentPasswordValid) {
    throw new Error('Current password is incorrect');
  }

  // Check password history
  if (user.passwordHistory && user.passwordHistory.length > 0) {
    for (const oldHash of user.passwordHistory) {
      const isSamePassword = await comparePassword(newPassword, oldHash);
      if (isSamePassword) {
        throw new Error('Cannot reuse a recent password');
      }
    }
  }

  // Update password
  user.password = newPassword;
  user.lastPasswordChange = new Date();
  await user.save();

  // Invalidate all tokens
  await user.invalidateAllTokens();
  await revokeAllUserTokens(user.id, 'Password changed');

  // Send notification
  await sendPasswordChangedEmail(user.email);

  logger.info({ userId: user.id }, 'Password changed');

  return { message: 'Password changed successfully. Please log in again.' };
};

/**
 * ============================================
 * TWO-FACTOR AUTHENTICATION
 * ============================================
 */

export const enable2FA = async (userId: string) => {
  const user = await UserModel.findById(userId).select('+twoFactorEnabled +twoFactorSecret');

  if (!user) {
    throw new Error('User not found');
  }

  if (user.twoFactorEnabled) {
    throw new Error('2FA is already enabled');
  }

  // Generate secret and QR code
  const { secret, encryptedSecret, qrCode, backupCodes } = await generate2FASecret(user.email);

  // Store ENCRYPTED secret in database (not enabled yet - requires verification)
  user.twoFactorSecret = encryptedSecret;
  await user.save();

  logger.info({ userId: user.id }, '2FA setup initiated');

  return {
    secret,  // Return plain secret for display in response (won't be stored)
    qrCode,
    backupCodes,
    message: 'Scan the QR code with your authenticator app and verify to enable 2FA'
  };
};

export const verify2FASetup = async (userId: string, code: string) => {
  const user = await UserModel.findById(userId).select('+twoFactorSecret +twoFactorEnabled +twoFactorBackupCodes');

  if (!user || !user.twoFactorSecret) {
    throw new Error('2FA setup not initiated');
  }

  if (user.twoFactorEnabled) {
    throw new Error('2FA is already enabled');
  }

  // Verify code
  const isValid = verify2FACode(user.twoFactorSecret, code);
  if (!isValid) {
    throw new Error('Invalid verification code');
  }

  // Enable 2FA
  user.twoFactorEnabled = true;

  // Generate and hash backup codes if not already done
  if (!user.twoFactorBackupCodes || user.twoFactorBackupCodes.length === 0) {
    const { backupCodes } = await generate2FASecret(user.email);
    user.twoFactorBackupCodes = await hashBackupCodes(backupCodes);
  }

  await user.save();

  // Send confirmation email
  await send2FAEnabledEmail(user.email);

  logger.info({ userId: user.id }, '2FA enabled');

  return { message: '2FA enabled successfully' };
};

export const disable2FA = async (userId: string, password: string, code: string) => {
  const user = await UserModel.findById(userId)
    .select('+password +twoFactorSecret +twoFactorEnabled +twoFactorBackupCodes');

  if (!user) {
    throw new Error('User not found');
  }

  if (!user.twoFactorEnabled) {
    throw new Error('2FA is not enabled');
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new Error('Invalid password');
  }

  // Verify 2FA code or backup code
  let isCodeValid = false;
  if (user.twoFactorSecret) {
    isCodeValid = verify2FACode(user.twoFactorSecret, code);
  }

  if (!isCodeValid) {
    isCodeValid = await user.verifyBackupCode(code);
  }

  if (!isCodeValid) {
    throw new Error('Invalid 2FA code');
  }

  // Disable 2FA
  user.twoFactorEnabled = false;
  user.twoFactorSecret = undefined;
  user.twoFactorBackupCodes = undefined;
  await user.save();

  logger.info({ userId: user.id }, '2FA disabled');

  return { message: '2FA disabled successfully' };
};

export const regenerateBackupCodes = async (userId: string, password: string) => {
  const user = await UserModel.findById(userId)
    .select('+password +twoFactorEnabled +twoFactorBackupCodes');

  if (!user) {
    throw new Error('User not found');
  }

  if (!user.twoFactorEnabled) {
    throw new Error('2FA is not enabled');
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new Error('Invalid password');
  }

  // Generate new backup codes
  const { backupCodes } = await generate2FASecret(user.email);
  user.twoFactorBackupCodes = await hashBackupCodes(backupCodes);
  await user.save();

  logger.info({ userId: user.id }, 'Backup codes regenerated');

  return {
    backupCodes,
    message: 'New backup codes generated. Save them securely!'
  };
};

/**
 * ============================================
 * SESSION MANAGEMENT
 * ============================================
 */

export const getActiveSessions = async (userId: string) => {
  const sessions = await getUserSessions(userId);

  return sessions.map(session => ({
    _id: session.id,
    deviceName: session.deviceName,
    deviceId: session.deviceId,
    userAgent: session.userAgent,
    ipAddress: session.ipAddress,
    location: session.location,
    lastUsedAt: session.lastUsedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString()
  }));
};

export const revokeSessionById = async (userId: string, sessionId: string) => {
  await revokeSession(userId, sessionId);
  return { message: 'Session revoked successfully' };
};

/**
 * ============================================
 * UTILITY FUNCTIONS
 * ============================================
 */

export const checkPasswordHistory = async (userId: string, newPassword: string): Promise<boolean> => {
  const user = await UserModel.findById(userId).select('+passwordHistory');
  
  if (!user || !user.passwordHistory || user.passwordHistory.length === 0) {
    return false; // No history, password is OK
  }

  for (const oldHash of user.passwordHistory) {
    const isSamePassword = await comparePassword(newPassword, oldHash);
    if (isSamePassword) {
      return true; // Password was used before
    }
  }

  return false;
};

export default {
  // Password management
  requestPasswordReset,
  validateResetToken,
  resetPassword,
  changePassword,
  checkPasswordHistory,
  
  // 2FA
  enable2FA,
  verify2FASetup,
  disable2FA,
  regenerateBackupCodes,
  
  // Sessions
  getActiveSessions,
  revokeSessionById
};

