import Joi from 'joi';

// Strong password: min 12 chars, uppercase, lowercase, number, special char
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+=\-{};:<>?,.]).{12,}$/;

// Common disposable email domains (basic check)
const disposableEmailDomains = [
  'tempmail.com', 'guerrillamail.com', '10minutemail.com', 'throwaway.email',
  'mailinator.com', 'maildrop.cc', 'yopmail.com'
];

const customEmailValidation = (value: string, helpers: Joi.CustomHelpers) => {
  const domain = value.split('@')[1]?.toLowerCase();
  if (domain && disposableEmailDomains.includes(domain)) {
    return helpers.error('string.disposableEmail');
  }
  return value;
};

// Registration - SECURITY: Block mass assignment attacks
export const registerSchema = Joi.object({  email: Joi.string()
    .email({ minDomainSegments: 2, tlds: { allow: true } })
    .lowercase()
    .trim()
    .max(255)
    .required(),
  password: Joi.string()
    .min(12)
    .max(128)
    .required()
    .pattern(passwordRegex),
  name: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .optional()
    .pattern(/^[a-zA-ZÀ-ỹ\s'-]+$/)
}).options({ stripUnknown: true });

// Email verification
export const verifyEmailSchema = Joi.object({
  token: Joi.string().length(64).hex().required()
});

export const resendVerificationSchema = Joi.object({
  email: Joi.string().email().required()
});

// Login - SECURITY: Enhanced validation
export const loginSchema = Joi.object({
  email: Joi.string()
    .email({ minDomainSegments: 2, tlds: { allow: true } })
    .lowercase()
    .trim()
    .max(255)
    .required()
    .custom(customEmailValidation)
    .messages({
      'string.email': 'Please provide a valid email address',
      'string.empty': 'Email is required',
      'string.max': 'Email must not exceed 255 characters',
      'string.disposableEmail': 'Disposable email addresses are not allowed'
    }),
  password: Joi.string()
    .required()
    .messages({
      'string.empty': 'Password is required'
    }),
  deviceId: Joi.string().max(100).optional(),
  deviceName: Joi.string().max(100).optional()
}).options({ stripUnknown: true });

// 2FA Login
export const login2FASchema = Joi.object({
  tempToken: Joi.string().length(64).hex().required(),
  code: Joi.string().length(6).pattern(/^\d{6}$/).required().messages({
    'string.pattern.base': '2FA code must be 6 digits'
  }),
  deviceId: Joi.string().optional(),
  deviceName: Joi.string().optional()
});

// Refresh token
export const refreshSchema = Joi.object({
  refreshToken: Joi.string().optional() // Can come from cookie
});

// Password reset request
export const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required()
});

// Validate reset token
export const validateResetTokenSchema = Joi.object({
  token: Joi.string().length(64).hex().required()
});

// Reset password
export const resetPasswordSchema = Joi.object({
  token: Joi.string().length(64).hex().required(),
  newPassword: Joi.string()
    .pattern(passwordRegex)
    .required()
    .messages({
      'string.pattern.base': 'Password must be at least 12 characters and include uppercase, lowercase, number, and special character.'
    })
});

// Change password
export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string()
    .pattern(passwordRegex)
    .required()
    .invalid(Joi.ref('currentPassword'))
    .messages({
      'string.pattern.base': 'Password must be at least 12 characters and include uppercase, lowercase, number, and special character.',
      'any.invalid': 'New password must be different from current password'
    })
});

// 2FA verification
export const verify2FACodeSchema = Joi.object({
  code: Joi.string()
    .pattern(/^[0-9A-Z]{6,8}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid verification code format'
    })
});

// Disable 2FA
export const disable2FASchema = Joi.object({
  password: Joi.string().required(),
  code: Joi.string()
    .pattern(/^[0-9A-Z]{6,8}$/)
    .required()
});

// Regenerate backup codes
export const regenerateBackupCodesSchema = Joi.object({
  password: Joi.string().required()
});

// Session management
export const revokeSessionSchema = Joi.object({
  sessionId: Joi.string().required()
});
