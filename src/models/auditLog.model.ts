import crypto from 'crypto';
import { model, Schema, Document } from 'mongoose';
import logger from '../utils/logger';

/**
 * Audit Log Entry Interface
 * Immutable, cryptographically signed logs for compliance
 */
export interface IAuditLog extends Document {
  timestamp: Date;
  eventType: string;
  userId?: string;
  sessionId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  changes?: {
    before?: any;
    after?: any;
  };
  metadata: {
    ip?: string;
    userAgent?: string;
    location?: string;
    [key: string]: any;
  };
  result: 'success' | 'failure' | 'partial';
  errorMessage?: string;
  riskScore?: number;
  signature: string; // HMAC signature for integrity
  previousHash?: string; // Link to previous log for chain integrity
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      immutable: true
    },
    eventType: {
      type: String,
      required: true,
      enum: [
        // Authentication events
        'auth.login',
        'auth.logout',
        'auth.register',
        'auth.password_reset',
        'auth.email_verify',
        'auth.2fa_enable',
        'auth.2fa_disable',
        'auth.session_revoke',
        
        // Payment events
        'payment.initiated',
        'payment.completed',
        'payment.failed',
        'payment.refunded',
        
        // Order events
        'order.created',
        'order.updated',
        'order.cancelled',
        'order.shipped',
        
        // User events
        'user.profile_update',
        'user.address_change',
        'user.role_change',
        'user.account_locked',
        
        // Admin events
        'admin.user_access',
        'admin.config_change',
        'admin.data_export',
        'admin.product_created',
        'admin.product_updated',
        'admin.product_deleted',
        
        // Security events
        'security.failed_login',
        'security.rate_limit_exceeded',
        'security.suspicious_activity',
        'security.fraud_detected',
        
        // System events
        'system.backup',
        'system.restore',
        'system.maintenance'
      ],
      immutable: true
    },
    userId: {
      type: String,
      index: true,
      immutable: true
    },
    sessionId: {
      type: String,
      immutable: true
    },
    action: {
      type: String,
      required: true,
      immutable: true
    },
    resource: {
      type: String,
      required: true,
      immutable: true
    },
    resourceId: {
      type: String,
      immutable: true
    },
    changes: {
      before: Schema.Types.Mixed,
      after: Schema.Types.Mixed
    },
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {}
    },
    result: {
      type: String,
      enum: ['success', 'failure', 'partial'],
      required: true,
      immutable: true
    },
    errorMessage: {
      type: String,
      immutable: true
    },
    riskScore: {
      type: Number,
      min: 0,
      max: 100,
      immutable: true
    },
    signature: {
      type: String,
      required: true,
      immutable: true
    },
    previousHash: {
      type: String,
      immutable: true
    }
  },
  {
    timestamps: false, // We manage timestamp manually
    collection: 'audit_logs'
  }
);

// Indexes for efficient querying
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ eventType: 1, timestamp: -1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ result: 1, timestamp: -1 });
auditLogSchema.index({ riskScore: -1, timestamp: -1 });

// Prevent modification of audit logs
auditLogSchema.pre('save', function (next) {
  if (!this.isNew) {
    const error = new Error('Audit logs are immutable and cannot be modified');
    return next(error);
  }
  next();
});

// Prevent deletion and updates (handled by application layer)
// Note: Mongoose doesn't support 'remove' hook on schema in newer versions

// Prevent updates
auditLogSchema.pre('updateOne', function (next) {
  const error = new Error('Audit logs are immutable');
  return next(error);
});

auditLogSchema.pre('findOneAndUpdate', function (next) {
  const error = new Error('Audit logs are immutable');
  return next(error);
});

export const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema);

/**
 * Create cryptographic signature for audit log entry
 */
export const createAuditSignature = (data: any, secret: string): string => {
  const payload = JSON.stringify({
    timestamp: data.timestamp,
    eventType: data.eventType,
    userId: data.userId,
    action: data.action,
    resource: data.resource,
    result: data.result
  });
  
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
};

/**
 * Verify audit log signature
 */
export const verifyAuditSignature = (log: IAuditLog, secret: string): boolean => {
  const expectedSignature = createAuditSignature(log, secret);
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(log.signature)
  );
};

/**
 * Get hash of previous log for chain integrity
 */
export const getPreviousLogHash = async (): Promise<string | undefined> => {
  try {
    const lastLog = await AuditLog.findOne().sort({ timestamp: -1 }).exec();
    if (!lastLog) return undefined;
    
    return crypto
      .createHash('sha256')
      .update(lastLog.signature + lastLog.timestamp.toISOString())
      .digest('hex');
  } catch (error) {
    logger.error({ err: error }, 'Failed to get previous log hash');
    return undefined;
  }
};
