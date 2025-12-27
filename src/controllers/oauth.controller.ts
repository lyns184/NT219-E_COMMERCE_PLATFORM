import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { sendSuccess, sendError } from '../utils/apiResponse';
import { signAccessToken, signRefreshToken, generateFingerprint } from '../utils/jwt';
import { createRefreshToken } from '../services/refreshToken.service';
import { UserDocument } from '../models/user.model';
import logger from '../utils/logger';
import { securityConfig } from '../config/env';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generic OAuth2 Callback Handler
 * Called after successful OAuth2 authentication
 */
export const oauth2CallbackHandler = async (req: Request, res: Response) => {
  try {
    const user = req.user as UserDocument;

    if (!user) {
      logger.error('OAuth2 callback: No user attached to request');
      return res.redirect(`${securityConfig.clientOrigin}/login?error=auth_failed`);
    }

    logger.info(
      { userId: user._id, email: user.email },
      'Generating tokens for OAuth2 authenticated user'
    );

    // Extract device info
    const userAgent = req.headers['user-agent'] || '';
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 
                       req.socket.remoteAddress || 
                       'unknown';
    const fingerprint = generateFingerprint(userAgent, ipAddress);

    // Generate JWT tokens
    const accessToken = signAccessToken({
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
      fingerprint,
      ip: ipAddress
    });

    const family = uuidv4();
    const refreshTokenString = signRefreshToken({
      sub: user._id.toString(),
      family,
      tokenVersion: user.tokenVersion
    });

    // Persist refresh token (hashed)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await createRefreshToken(
      refreshTokenString,
      user._id.toString(),
      {
        deviceId: 'oauth2',
        deviceName: 'OAuth2 Provider',
        userAgent,
        ipAddress
      },
      family,
      expiresAt
    );

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', refreshTokenString, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    logger.info(
      { userId: user._id },
      'OAuth2 authentication completed successfully'
    );

    // Redirect to frontend with access token
    const redirectUrl = `${securityConfig.clientOrigin}/auth/callback?token=${accessToken}`;
    return res.redirect(redirectUrl);

  } catch (error) {
    logger.error({ err: error }, 'OAuth2 callback failed');
    return res.redirect(`${securityConfig.clientOrigin}/login?error=server_error`);
  }
};

/**
 * Generic OAuth2 failure handler
 */
export const oauth2FailureHandler = (req: Request, res: Response) => {
  logger.warn('OAuth2 authentication failed');
  return res.redirect(`${securityConfig.clientOrigin}/login?error=oauth2_failed`);
};

/**
 * GitHub OAuth Callback Handler
 */
export const githubCallbackHandler = async (req: Request, res: Response) => {
  try {
    const user = req.user as UserDocument;

    if (!user) {
      logger.error('GitHub callback: No user attached to request');
      return res.redirect(`${securityConfig.clientOrigin}/login?error=auth_failed`);
    }

    logger.info(
      { userId: user._id, email: user.email },
      'Generating tokens for GitHub authenticated user'
    );

    const userAgent = req.headers['user-agent'] || '';
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 
                       req.socket.remoteAddress || 
                       'unknown';
    const fingerprint = generateFingerprint(userAgent, ipAddress);

    const accessToken = signAccessToken({
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
      fingerprint,
      ip: ipAddress
    });

    const family = uuidv4();
    const refreshTokenString = signRefreshToken({
      sub: user._id.toString(),
      family,
      tokenVersion: user.tokenVersion
    });

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await createRefreshToken(
      refreshTokenString,
      user._id.toString(),
      {
        deviceId: 'github-oauth',
        deviceName: 'GitHub OAuth',
        userAgent,
        ipAddress
      },
      family,
      expiresAt
    );

    res.cookie('refreshToken', refreshTokenString, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    logger.info({ userId: user._id }, 'GitHub authentication completed successfully');

    const redirectUrl = `${securityConfig.clientOrigin}/auth/callback?token=${accessToken}`;
    return res.redirect(redirectUrl);

  } catch (error) {
    logger.error({ err: error }, 'GitHub callback failed');
    return res.redirect(`${securityConfig.clientOrigin}/login?error=server_error`);
  }
};

/**
 * GitHub OAuth failure handler
 */
export const githubFailureHandler = (req: Request, res: Response) => {
  logger.warn('GitHub authentication failed');
  return res.redirect(`${securityConfig.clientOrigin}/login?error=github_failed`);
};

/**
 * Discord OAuth Callback Handler
 */
export const discordCallbackHandler = async (req: Request, res: Response) => {
  try {
    const user = req.user as UserDocument;

    if (!user) {
      logger.error('Discord callback: No user attached to request');
      return res.redirect(`${securityConfig.clientOrigin}/login?error=auth_failed`);
    }

    logger.info(
      { userId: user._id, email: user.email },
      'Generating tokens for Discord authenticated user'
    );

    const userAgent = req.headers['user-agent'] || '';
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 
                       req.socket.remoteAddress || 
                       'unknown';
    const fingerprint = generateFingerprint(userAgent, ipAddress);

    const accessToken = signAccessToken({
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
      fingerprint,
      ip: ipAddress
    });

    const family = uuidv4();
    const refreshTokenString = signRefreshToken({
      sub: user._id.toString(),
      family,
      tokenVersion: user.tokenVersion
    });

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await createRefreshToken(
      refreshTokenString,
      user._id.toString(),
      {
        deviceId: 'discord-oauth',
        deviceName: 'Discord OAuth',
        userAgent,
        ipAddress
      },
      family,
      expiresAt
    );

    res.cookie('refreshToken', refreshTokenString, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    logger.info({ userId: user._id }, 'Discord authentication completed successfully');

    const redirectUrl = `${securityConfig.clientOrigin}/auth/callback?token=${accessToken}`;
    return res.redirect(redirectUrl);

  } catch (error) {
    logger.error({ err: error }, 'Discord callback failed');
    return res.redirect(`${securityConfig.clientOrigin}/login?error=server_error`);
  }
};

/**
 * Discord OAuth failure handler
 */
export const discordFailureHandler = (req: Request, res: Response) => {
  logger.warn('Discord authentication failed');
  return res.redirect(`${securityConfig.clientOrigin}/login?error=discord_failed`);
};
