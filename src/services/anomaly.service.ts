import { OrderModel } from '../models/order.model';
import { AuditLog } from '../models/auditLog.model';
import { logSecurityEvent } from './audit.service';
import { sendHighRiskOrderAlert, sendFraudAlert, sendFailedLoginAlert } from './alert.service';
import logger from '../utils/logger';

/**
 * Anomaly Detection Service
 * Detects suspicious patterns and fraud indicators
 */

export interface AnomalyResult {
  isAnomalous: boolean;
  riskScore: number;
  reasons: string[];
  recommendations: string[];
}

/**
 * Detect high-value order anomalies
 */
export const detectHighValueOrderAnomaly = async (
  userId: string,
  orderAmount: number,
  shippingAddress: string
): Promise<AnomalyResult> => {
  const reasons: string[] = [];
  let riskScore = 0;
  
  try {
    // Get user's order history
    const userOrders = await OrderModel.find({ userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    
    if (userOrders.length > 0) {
      // Calculate average order value
      const avgOrderValue = userOrders.reduce((sum: number, order: any) => sum + order.totalAmount, 0) / userOrders.length;
      
      // Check if current order is significantly higher than average
      if (orderAmount > avgOrderValue * 3) {
        riskScore += 40;
        reasons.push(`Order value (${orderAmount}) is ${Math.round(orderAmount / avgOrderValue)}x higher than average`);
      }
      
      // Check for shipping address changes
      const recentOrders = userOrders.slice(0, 3);
      const usedAddresses = recentOrders.map((o: any) => o.shippingAddress).filter(Boolean);
      
      if (usedAddresses.length > 0 && !usedAddresses.includes(shippingAddress)) {
        riskScore += 30;
        reasons.push('New shipping address on high-value order');
      }
    } else {
      // First order - higher risk if high value
      if (orderAmount > 1000) {
        riskScore += 50;
        reasons.push('First order with high value');
      }
    }
    
    // Absolute high-value threshold
    if (orderAmount > 10000) {
      riskScore += 25;
      reasons.push('Order exceeds high-value threshold ($10,000)');
    }
    
    const isAnomalous = riskScore >= 60;
    
    if (isAnomalous) {
      await logSecurityEvent(
        'security.suspicious_activity',
        userId,
        {
          reason: `High-value order anomaly: $${orderAmount}`,
          attemptCount: 1
        },
        riskScore
      );
      
      // Send alert for high-risk orders
      if (riskScore >= 70) {
        await sendHighRiskOrderAlert(
          userId,
          'pending', // Will be updated with actual orderId
          orderAmount,
          reasons,
          riskScore
        ).catch(err => logger.error({ err }, 'Failed to send high-risk order alert'));
      }
    }
    
    return {
      isAnomalous,
      riskScore,
      reasons,
      recommendations: isAnomalous ? [
        'Require additional verification',
        'Contact customer to confirm order',
        'Hold order for manual review'
      ] : []
    };
  } catch (error) {
    logger.error({ err: error, userId, orderAmount }, 'Failed to detect high-value anomaly');
    return {
      isAnomalous: false,
      riskScore: 0,
      reasons: [],
      recommendations: []
    };
  }
};

/**
 * Detect rapid order creation (potential bot/fraud)
 */
export const detectRapidOrderCreation = async (userId: string): Promise<AnomalyResult> => {
  const reasons: string[] = [];
  let riskScore = 0;
  
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const [ordersLastHour, ordersLastDay] = await Promise.all([
      OrderModel.countDocuments({
        userId,
        createdAt: { $gte: oneHourAgo }
      }),
      OrderModel.countDocuments({
        userId,
        createdAt: { $gte: oneDayAgo }
      })
    ]);
    
    // More than 5 orders in 1 hour is suspicious
    if (ordersLastHour > 5) {
      riskScore += 70;
      reasons.push(`${ordersLastHour} orders created in the last hour`);
    }
    
    // More than 20 orders in 1 day is suspicious
    if (ordersLastDay > 20) {
      riskScore += 50;
      reasons.push(`${ordersLastDay} orders created in the last 24 hours`);
    }
    
    const isAnomalous = riskScore >= 60;
    
    if (isAnomalous) {
      await logSecurityEvent(
        'security.suspicious_activity',
        userId,
        {
          reason: 'Rapid order creation detected',
          attemptCount: ordersLastHour
        },
        riskScore
      );
    }
    
    return {
      isAnomalous,
      riskScore,
      reasons,
      recommendations: isAnomalous ? [
        'Rate limit user',
        'Require CAPTCHA verification',
        'Flag account for review'
      ] : []
    };
  } catch (error) {
    logger.error({ err: error, userId }, 'Failed to detect rapid order creation');
    return {
      isAnomalous: false,
      riskScore: 0,
      reasons: [],
      recommendations: []
    };
  }
};

/**
 * Detect failed login patterns
 */
export const detectFailedLoginPattern = async (
  userId: string | undefined,
  ip: string
): Promise<AnomalyResult> => {
  const reasons: string[] = [];
  let riskScore = 0;
  
  try {
    const now = new Date();
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    // Query failed login attempts
    const query: any = {
      eventType: 'security.failed_login',
      timestamp: { $gte: fifteenMinutesAgo }
    };
    
    // Check both by user and by IP
    const [failedByUser, failedByIp] = await Promise.all([
      userId ? AuditLog.countDocuments({ ...query, userId }) : Promise.resolve(0),
      AuditLog.countDocuments({ ...query, 'metadata.ip': ip })
    ]);
    
    // More than 5 failed attempts in 15 minutes
    if (failedByUser > 5) {
      riskScore += 60;
      reasons.push(`${failedByUser} failed login attempts for this account in 15 minutes`);
    }
    
    // More than 10 failed attempts from same IP
    if (failedByIp > 10) {
      riskScore += 70;
      reasons.push(`${failedByIp} failed login attempts from IP ${ip} in 15 minutes`);
    }
    
    // Check for brute force pattern
    const recentAttempts = await AuditLog.find({
      eventType: 'security.failed_login',
      'metadata.ip': ip,
      timestamp: { $gte: oneHourAgo }
    })
      .sort({ timestamp: -1 })
      .limit(20)
      .lean();
    
    if (recentAttempts.length >= 10) {
      // Calculate time between attempts
      const timeGaps = [];
      for (let i = 1; i < recentAttempts.length; i++) {
        const gap = recentAttempts[i - 1].timestamp.getTime() - recentAttempts[i].timestamp.getTime();
        timeGaps.push(gap);
      }
      
      const avgGap = timeGaps.reduce((sum, gap) => sum + gap, 0) / timeGaps.length;
      
      // Very consistent timing indicates automated attacks
      if (avgGap < 5000) { // Less than 5 seconds between attempts
        riskScore += 80;
        reasons.push('Automated brute force pattern detected');
      }
    }
    
    const isAnomalous = riskScore >= 60;
    
    if (isAnomalous) {
      await logSecurityEvent(
        'security.fraud_detected',
        userId,
        {
          ip,
          reason: 'Failed login pattern detected',
          attemptCount: failedByIp
        },
        riskScore
      );
      
      // Send alert for brute force attacks
      if (riskScore >= 70) {
        await sendFailedLoginAlert(
          userId,
          ip,
          failedByIp,
          riskScore
        ).catch(err => logger.error({ err }, 'Failed to send failed login alert'));
      }
    }
    
    return {
      isAnomalous,
      riskScore,
      reasons,
      recommendations: isAnomalous ? [
        'Block IP address',
        'Lock user account temporarily',
        'Require CAPTCHA',
        'Send security alert to user'
      ] : []
    };
  } catch (error) {
    logger.error({ err: error, userId, ip }, 'Failed to detect failed login pattern');
    return {
      isAnomalous: false,
      riskScore: 0,
      reasons: [],
      recommendations: []
    };
  }
};

/**
 * Detect payment fraud patterns
 */
export const detectPaymentFraud = async (
  userId: string,
  amount: number,
  metadata: {
    ip?: string;
    userAgent?: string;
    cardBin?: string;
  }
): Promise<AnomalyResult> => {
  const reasons: string[] = [];
  let riskScore = 0;
  
  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Check for multiple payment attempts
    const recentPayments = await AuditLog.find({
      userId,
      eventType: { $in: ['payment.initiated', 'payment.failed'] },
      timestamp: { $gte: oneDayAgo }
    }).lean();
    
    const failedPayments = recentPayments.filter(p => p.eventType === 'payment.failed');
    
    // Multiple failed payments in short time
    if (failedPayments.length > 3) {
      riskScore += 50;
      reasons.push(`${failedPayments.length} failed payment attempts in 24 hours`);
    }
    
    // High-value transaction
    if (amount > 5000) {
      riskScore += 20;
      reasons.push('High-value transaction');
    }
    
    // Check for velocity (too many transactions)
    if (recentPayments.length > 10) {
      riskScore += 40;
      reasons.push('High transaction velocity');
    }
    
    // Check IP consistency
    if (metadata.ip && recentPayments.length > 0) {
      const recentIPs = recentPayments
        .map(p => p.metadata?.ip)
        .filter(Boolean);
      
      const uniqueIPs = new Set(recentIPs);
      if (uniqueIPs.size > 5) {
        riskScore += 30;
        reasons.push('Multiple IPs used for payments');
      }
    }
    
    const isAnomalous = riskScore >= 60;
    
    if (isAnomalous) {
      await logSecurityEvent(
        'security.fraud_detected',
        userId,
        {
          ip: metadata.ip,
          userAgent: metadata.userAgent,
          reason: 'Payment fraud pattern detected'
        },
        riskScore
      );
    }
    
    return {
      isAnomalous,
      riskScore,
      reasons,
      recommendations: isAnomalous ? [
        'Require 3D Secure authentication',
        'Hold payment for manual review',
        'Contact customer to verify',
        'Request additional verification documents'
      ] : []
    };
  } catch (error) {
    logger.error({ err: error, userId, amount }, 'Failed to detect payment fraud');
    return {
      isAnomalous: false,
      riskScore: 0,
      reasons: [],
      recommendations: []
    };
  }
};

/**
 * Comprehensive fraud check
 */
export const performFraudCheck = async (
  userId: string,
  context: {
    action: 'order' | 'payment' | 'login';
    amount?: number;
    ip?: string;
    userAgent?: string;
    shippingAddress?: string;
  }
): Promise<AnomalyResult> => {
  try {
    const checks: AnomalyResult[] = [];
    
    if (context.action === 'order' && context.amount && context.shippingAddress) {
      checks.push(await detectHighValueOrderAnomaly(userId, context.amount, context.shippingAddress));
      checks.push(await detectRapidOrderCreation(userId));
    }
    
    if (context.action === 'payment' && context.amount) {
      checks.push(await detectPaymentFraud(userId, context.amount, {
        ip: context.ip,
        userAgent: context.userAgent
      }));
    }
    
    if (context.action === 'login' && context.ip) {
      checks.push(await detectFailedLoginPattern(userId, context.ip));
    }
    
    // Aggregate results
    const maxRiskScore = Math.max(...checks.map(c => c.riskScore), 0);
    const allReasons = checks.flatMap(c => c.reasons);
    const allRecommendations = [...new Set(checks.flatMap(c => c.recommendations))];
    
    return {
      isAnomalous: maxRiskScore >= 60,
      riskScore: maxRiskScore,
      reasons: allReasons,
      recommendations: allRecommendations
    };
  } catch (error) {
    logger.error({ err: error, userId, context }, 'Failed to perform fraud check');
    return {
      isAnomalous: false,
      riskScore: 0,
      reasons: [],
      recommendations: []
    };
  }
};
