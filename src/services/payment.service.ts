import Stripe from 'stripe';
import { stripeConfig } from '../config/env';
import { ProductModel, ProductDocument } from '../models/product.model';
import { createOrder, updateOrderStatusByPaymentIntent, getOrderDetails } from './order.service';
import { clearCartIfExists } from './cart.service';
import { logPaymentEvent } from './audit.service';
import { detectPaymentFraud } from './anomaly.service';
import { sendOrderConfirmationEmail } from './email.service';
import { UserModel } from '../models/user.model';
import logger from '../utils/logger';

const stripe = new Stripe(stripeConfig.secretKey, {
  apiVersion: '2024-04-10'
});

interface PaymentItemInput {
  productId: string;
  quantity: number;
}

export const createPaymentIntent = async (userId: string, items: PaymentItemInput[], metadata?: { ip?: string; userAgent?: string }) => {
  const productIds = items.map(item => item.productId);
  const products = await ProductModel.find({ _id: { $in: productIds }, isActive: true });

  if (products.length !== productIds.length) {
    throw new Error('One or more products are unavailable');
  }

  const orderItems = products.map((product: ProductDocument) => {
    const matchedItem = items.find(item => item.productId === product.id);
    if (!matchedItem) {
      throw new Error('Product selection mismatch');
    }
    const quantity = matchedItem.quantity;
    return {
      productId: product.id,
      name: product.name,
      price: product.price,
      currency: product.currency,
      quantity
    };
  });

  const totalAmount = orderItems.reduce(
    (sum: number, item: (typeof orderItems)[number]) => sum + item.price * item.quantity,
    0
  );

  if (totalAmount <= 0) {
    throw new Error('Total amount must be greater than zero');
  }

  // Run fraud checks
  const fraudCheck = await detectPaymentFraud(userId, totalAmount, {
    ip: metadata?.ip,
    userAgent: metadata?.userAgent
  });
  
  if (fraudCheck.riskScore >= 80) {
    logger.warn({
      userId,
      amount: totalAmount,
      riskScore: fraudCheck.riskScore,
      reasons: fraudCheck.reasons
    }, 'High-risk payment blocked');
    throw new Error('Payment flagged for review. Please contact support.');
  }

  const order = await createOrder({
    userId,
    items: orderItems,
    totalAmount,
    currency: orderItems[0]?.currency ?? 'USD'
  }, {
    ip: metadata?.ip,
    userAgent: metadata?.userAgent
  });

  // Audit log: Payment initiated
  await logPaymentEvent(
    'payment.initiated',
    userId,
    order.id,
    {
      amount: totalAmount,
      currency: order.currency,
      ip: metadata?.ip,
      userAgent: metadata?.userAgent
    },
    'success'
  );

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(totalAmount * 100),
    currency: order.currency,
    metadata: {
      orderId: order.id,
      userId
    },
    automatic_payment_methods: {
      enabled: true
    }
  });

  order.paymentIntentId = paymentIntent.id;
  order.status = 'processing';
  order.clientSecret = paymentIntent.client_secret ?? undefined;
  await order.save();

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    orderId: order.id
  };
};

export const constructStripeEvent = (payload: Buffer, signature: string): Stripe.Event => {
  return stripe.webhooks.constructEvent(payload, signature, stripeConfig.webhookSecret);
};

export const handleStripeEvent = async (event: Stripe.Event): Promise<void> => {
  logger.info({ eventType: event.type, eventId: event.id }, 'Handling Stripe event');
  
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      logger.info({ 
        paymentIntentId: paymentIntent.id, 
        orderId: paymentIntent.metadata?.orderId,
        userId: paymentIntent.metadata?.userId 
      }, 'Payment intent succeeded');
      
      if (paymentIntent.metadata?.orderId) {
        await updateOrderStatusByPaymentIntent(paymentIntent.id, 'paid');
        logger.info({ paymentIntentId: paymentIntent.id, orderId: paymentIntent.metadata.orderId }, 'Order marked as paid');
        
        // Audit log: Payment completed
        if (paymentIntent.metadata.userId) {
          await logPaymentEvent(
            'payment.completed',
            paymentIntent.metadata.userId,
            paymentIntent.metadata.orderId,
            {
              amount: paymentIntent.amount / 100,
              currency: paymentIntent.currency.toUpperCase(),
              paymentMethod: paymentIntent.payment_method as string
            },
            'success'
          );
          
          await clearCartIfExists(paymentIntent.metadata.userId);
          logger.info({ userId: paymentIntent.metadata.userId }, 'Cart cleared after successful payment');

          // Send order confirmation email
          try {
            const order = await getOrderDetails(paymentIntent.metadata.orderId);
            if (order) {
              const user = await UserModel.findById(paymentIntent.metadata.userId);
              if (user) {
                await sendOrderConfirmationEmail(user.email, {
                  orderId: order._id.toString(),
                  items: order.items.map(item => ({
                    name: item.name,
                    quantity: item.quantity,
                    price: item.price
                  })),
                  total: order.totalAmount
                });
                logger.info({ userId: user.id, orderId: order._id }, 'Order confirmation email sent');
              }
            }
          } catch (error) {
            logger.error({ err: error, orderId: paymentIntent.metadata.orderId }, 'Failed to send order confirmation email');
          }
        }
      } else {
        logger.warn({ paymentIntentId: paymentIntent.id }, 'Payment intent succeeded but no orderId in metadata');
      }
      break;
    }
    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      logger.warn({ 
        paymentIntentId: paymentIntent.id,
        orderId: paymentIntent.metadata?.orderId 
      }, 'Payment intent failed');
      
      if (paymentIntent.metadata?.orderId) {
        await updateOrderStatusByPaymentIntent(paymentIntent.id, 'cancelled');
        logger.info({ paymentIntentId: paymentIntent.id, orderId: paymentIntent.metadata.orderId }, 'Order marked as cancelled');
        
        // Audit log: Payment failed
        if (paymentIntent.metadata.userId) {
          await logPaymentEvent(
            'payment.failed',
            paymentIntent.metadata.userId,
            paymentIntent.metadata.orderId,
            {
              amount: paymentIntent.amount / 100,
              currency: paymentIntent.currency.toUpperCase(),
              paymentMethod: paymentIntent.payment_method as string
            },
            'failure',
            paymentIntent.last_payment_error?.message || 'Payment failed'
          );
        }
      }
      break;
    }
    default:
      logger.debug({ eventType: event.type }, 'Unhandled Stripe event type');
  }
};
