import nodemailer from 'nodemailer';
import { emailConfig, urlConfig } from '../config/env';
import logger from '../utils/logger';

// Create reusable transporter
const transporter = nodemailer.createTransport({
  host: emailConfig.host,
  port: emailConfig.port,
  secure: emailConfig.secure,
  auth: {
    user: emailConfig.auth.user,
    pass: emailConfig.auth.pass
  }
});

// Verify connection on startup
if (emailConfig.auth.user && emailConfig.auth.pass) {
  transporter.verify((error) => {
    if (error) {
      logger.error({ err: error }, '❌ Email service connection failed');
      console.error('\n⚠️  Email Configuration Error:');
      console.error('Please check your .env file:');
      console.error('- EMAIL_USER:', emailConfig.auth.user ? '✓ Set' : '✗ Not set');
      console.error('- EMAIL_PASS:', emailConfig.auth.pass ? '✓ Set' : '✗ Not set');
      console.error('- EMAIL_HOST:', emailConfig.host);
      console.error('- EMAIL_PORT:', emailConfig.port);
      console.error('\nSee EMAIL_SETUP.md for configuration guide\n');
    } else {
      logger.info('✅ Email service is ready');
      console.log('\n✅ Email Service Configuration:');
      console.log('   From:', emailConfig.from);
      console.log('   User:', emailConfig.auth.user);
      console.log('   Host:', emailConfig.host);
      console.log('   Port:', emailConfig.port);
      console.log('   Secure:', emailConfig.secure);
      console.log('');
    }
  });
} else {
  logger.warn('⚠️  Email credentials not configured - email features will not work');
  console.warn('\n⚠️  WARNING: Email not configured!');
  console.warn('   Set EMAIL_USER and EMAIL_PASS in your .env file');
  console.warn('   See EMAIL_SETUP.md for instructions\n');
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

const sendEmail = async (options: EmailOptions): Promise<void> => {
  try {
    logger.info({ 
      to: options.to, 
      subject: options.subject,
      from: emailConfig.from 
    }, 'Attempting to send email');

    const info = await transporter.sendMail({
      from: emailConfig.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text
    });

    logger.info({ 
      messageId: info.messageId, 
      to: options.to,
      response: info.response,
      accepted: info.accepted,
      rejected: info.rejected,
      previewURL: nodemailer.getTestMessageUrl(info) || 'N/A'
    }, '✅ Email sent successfully');

    // Log preview URL for development
    if (process.env.NODE_ENV === 'development') {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        console.log('\n📧 Email Preview URL:', previewUrl);
      }
    }
  } catch (error) {
    logger.error({ err: error, to: options.to }, '❌ Failed to send email');
    throw error;
  }
};

/**
 * Send email verification link
 */
export const sendVerificationEmail = async (email: string, token: string): Promise<void> => {
  const verificationUrl = `${urlConfig.frontend}/verify-email?token=${token}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .button { 
            display: inline-block; 
            padding: 12px 24px; 
            background-color: #4F46E5; 
            color: white; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 20px 0;
          }
          .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Verify Your Email Address</h2>
          <p>Thank you for registering! Please click the button below to verify your email address:</p>
          <a href="${verificationUrl}" class="button">Verify Email</a>
          <p>Or copy and paste this link into your browser:</p>
          <p><a href="${verificationUrl}">${verificationUrl}</a></p>
          <p>This link will expire in 24 hours.</p>
          <div class="footer">
            <p>If you didn't create an account, please ignore this email.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: 'Verify Your Email Address',
    html,
    text: `Please verify your email by visiting: ${verificationUrl}`
  });
};

/**
 * Send password reset email
 */
export const sendPasswordResetEmail = async (email: string, token: string): Promise<void> => {
  const resetUrl = `${urlConfig.frontend}/reset-password?token=${token}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .button { 
            display: inline-block; 
            padding: 12px 24px; 
            background-color: #DC2626; 
            color: white; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 20px 0;
          }
          .warning { background-color: #FEF3C7; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Reset Your Password</h2>
          <p>We received a request to reset your password. Click the button below to proceed:</p>
          <a href="${resetUrl}" class="button">Reset Password</a>
          <p>Or copy and paste this link into your browser:</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <div class="warning">
            <strong>⚠️ Security Notice:</strong> This link will expire in 1 hour for security reasons.
          </div>
          <div class="footer">
            <p>If you didn't request a password reset, please ignore this email and ensure your account is secure.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: 'Reset Your Password',
    html,
    text: `Reset your password by visiting: ${resetUrl}`
  });
};

/**
 * Send 2FA setup confirmation email
 */
export const send2FAEnabledEmail = async (email: string): Promise<void> => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .success { background-color: #D1FAE5; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Two-Factor Authentication Enabled</h2>
          <div class="success">
            <strong>✓ Success!</strong> Two-factor authentication has been enabled on your account.
          </div>
          <p>Your account is now protected with an additional layer of security. You'll need to enter a verification code from your authenticator app each time you log in.</p>
          <p><strong>Important:</strong> Make sure you've saved your backup codes in a secure location. You can use them to access your account if you lose access to your authenticator app.</p>
          <div class="footer">
            <p>If you didn't enable 2FA, please contact support immediately.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: 'Two-Factor Authentication Enabled',
    html,
    text: 'Two-factor authentication has been enabled on your account.'
  });
};

/**
 * Send suspicious login alert
 */
export const sendSuspiciousLoginAlert = async (
  email: string,
  ipAddress: string,
  location: string,
  deviceName: string
): Promise<void> => {
  const securityUrl = `${urlConfig.frontend}/account/security`;
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .alert { background-color: #FEE2E2; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .details { background-color: #F3F4F6; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .button { 
            display: inline-block; 
            padding: 12px 24px; 
            background-color: #DC2626; 
            color: white; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 20px 0;
          }
          .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>New Login Detected</h2>
          <div class="alert">
            <strong>⚠️ Security Alert:</strong> We detected a new login to your account from an unrecognized device.
          </div>
          <div class="details">
            <h3>Login Details:</h3>
            <p><strong>Device:</strong> ${deviceName}</p>
            <p><strong>Location:</strong> ${location}</p>
            <p><strong>IP Address:</strong> ${ipAddress}</p>
            <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
          </div>
          <p>If this was you, you can ignore this email. Otherwise, please secure your account immediately.</p>
          <a href="${securityUrl}" class="button">Review Security Settings</a>
          <div class="footer">
            <p>For your security, we recommend enabling two-factor authentication.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: '⚠️ New Login to Your Account',
    html,
    text: `New login detected from ${deviceName} at ${location} (${ipAddress})`
  });
};

/**
 * Send password changed notification
 */
export const sendPasswordChangedEmail = async (email: string): Promise<void> => {
  const securityUrl = `${urlConfig.frontend}/account/security`;
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .alert { background-color: #FEE2E2; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .button { 
            display: inline-block; 
            padding: 12px 24px; 
            background-color: #DC2626; 
            color: white; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 20px 0;
          }
          .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Password Changed</h2>
          <div class="alert">
            <strong>⚠️ Security Notice:</strong> Your password was recently changed.
          </div>
          <p>If you made this change, you can safely ignore this email.</p>
          <p>If you did NOT change your password, your account may be compromised. Please reset your password immediately and review your security settings.</p>
          <a href="${securityUrl}" class="button">Secure My Account</a>
          <div class="footer">
            <p>All active sessions have been logged out for security.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: 'Your Password Was Changed',
    html,
    text: 'Your password was recently changed. If this wasn\'t you, please contact support immediately.'
  });
};

/**
 * Send account locked notification
 */
export const sendAccountLockedEmail = async (email: string, unlockTime: Date): Promise<void> => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .alert { background-color: #FEE2E2; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Account Temporarily Locked</h2>
          <div class="alert">
            <strong>⚠️ Security Alert:</strong> Your account has been temporarily locked due to multiple failed login attempts.
          </div>
          <p>Your account will be automatically unlocked at: <strong>${unlockTime.toLocaleString()}</strong></p>
          <p>If you forgot your password, you can reset it using the "Forgot Password" option on the login page.</p>
          <div class="footer">
            <p>This is an automated security measure to protect your account.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: 'Account Temporarily Locked',
    html,
    text: `Your account has been locked until ${unlockTime.toLocaleString()} due to multiple failed login attempts.`
  });
};

/**
 * Send test email (for debugging)
 */
export const sendTestEmail = async (email: string): Promise<void> => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .success { background: #10B981; color: white; padding: 20px; border-radius: 8px; text-align: center; }
          .info { background: #F3F4F6; padding: 15px; border-radius: 5px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">
            <h2>✅ Email Service Working!</h2>
          </div>
          <div class="info">
            <p><strong>Configuration Details:</strong></p>
            <ul>
              <li>Host: ${emailConfig.host}</li>
              <li>Port: ${emailConfig.port}</li>
              <li>From: ${emailConfig.from}</li>
              <li>Sent at: ${new Date().toLocaleString()}</li>
            </ul>
          </div>
          <p>If you received this email, your email configuration is working correctly! 🎉</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            This is a test email from NT219 Demo App
          </p>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: '✅ Test Email - NT219 Demo',
    html,
    text: 'If you received this, your email configuration is working!'
  });
};

/**
 * Send 2FA disabled notification
 */
export const send2FADisabledEmail = async (email: string): Promise<void> => {
  const securityUrl = `${urlConfig.frontend}/account/security`;
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .alert { background-color: #FEF3C7; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .button { 
            display: inline-block; 
            padding: 12px 24px; 
            background-color: #F59E0B; 
            color: white; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 20px 0;
          }
          .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Two-Factor Authentication Disabled</h2>
          <div class="alert">
            <strong>⚠️ Security Notice:</strong> Two-factor authentication has been disabled on your account.
          </div>
          <p>If you made this change, no further action is needed.</p>
          <p>If you did NOT disable 2FA, your account may be compromised. Please:</p>
          <ol>
            <li>Change your password immediately</li>
            <li>Re-enable two-factor authentication</li>
            <li>Review your account activity</li>
          </ol>
          <a href="${securityUrl}" class="button">Review Security Settings</a>
          <div class="footer">
            <p>Time: ${new Date().toLocaleString()}</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: '⚠️ Two-Factor Authentication Disabled',
    html,
    text: '2FA has been disabled on your account. If this wasn\'t you, please secure your account immediately.'
  });
};

/**
 * Send backup codes regenerated notification
 */
export const sendBackupCodesRegeneratedEmail = async (email: string): Promise<void> => {
  const securityUrl = `${urlConfig.frontend}/account/security`;
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .info { background-color: #DBEAFE; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Backup Codes Regenerated</h2>
          <div class="info">
            <strong>ℹ️ Notice:</strong> Your 2FA backup codes have been regenerated.
          </div>
          <p>Your old backup codes are no longer valid. Make sure to save your new backup codes in a safe place.</p>
          <p>If you did NOT regenerate these codes, please change your password immediately and contact support.</p>
          <div class="footer">
            <p>Time: ${new Date().toLocaleString()}</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: 'ℹ️ Backup Codes Regenerated',
    html,
    text: 'Your 2FA backup codes have been regenerated. Old codes are no longer valid.'
  });
};

/**
 * Send order confirmation email
 */
export const sendOrderConfirmationEmail = async (
  email: string,
  orderDetails: {
    orderId: string;
    items: Array<{ name: string; quantity: number; price: number }>;
    total: number;
    shippingAddress?: string;
  }
): Promise<void> => {
  const ordersUrl = `${urlConfig.frontend}/orders`;
  
  const itemsHtml = orderDetails.items.map(item => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #E5E7EB;">${item.name}</td>
      <td style="padding: 8px; border-bottom: 1px solid #E5E7EB; text-align: center;">${item.quantity}</td>
      <td style="padding: 8px; border-bottom: 1px solid #E5E7EB; text-align: right;">$${item.price.toFixed(2)}</td>
    </tr>
  `).join('');
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .success { background-color: #D1FAE5; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .order-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          .order-table th { background-color: #F3F4F6; padding: 10px; text-align: left; }
          .total { font-size: 18px; font-weight: bold; margin: 20px 0; }
          .button { 
            display: inline-block; 
            padding: 12px 24px; 
            background-color: #10B981; 
            color: white; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 20px 0;
          }
          .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Order Confirmation</h2>
          <div class="success">
            <strong>✅ Thank you for your order!</strong>
          </div>
          <p><strong>Order ID:</strong> ${orderDetails.orderId}</p>
          
          <table class="order-table">
            <thead>
              <tr>
                <th>Item</th>
                <th style="text-align: center;">Qty</th>
                <th style="text-align: right;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          
          <p class="total">Total: $${orderDetails.total.toFixed(2)}</p>
          
          ${orderDetails.shippingAddress ? `<p><strong>Shipping to:</strong> ${orderDetails.shippingAddress}</p>` : ''}
          
          <a href="${ordersUrl}" class="button">View Order</a>
          
          <div class="footer">
            <p>Thank you for shopping with us!</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: `✅ Order Confirmed - #${orderDetails.orderId.slice(-8).toUpperCase()}`,
    html,
    text: `Your order #${orderDetails.orderId} has been confirmed. Total: $${orderDetails.total.toFixed(2)}`
  });
};

export default {
  sendVerificationEmail,
  sendPasswordResetEmail,
  send2FAEnabledEmail,
  sendSuspiciousLoginAlert,
  sendPasswordChangedEmail,
  sendAccountLockedEmail,
  sendTestEmail,
  send2FADisabledEmail,
  sendBackupCodesRegeneratedEmail,
  sendOrderConfirmationEmail
};
