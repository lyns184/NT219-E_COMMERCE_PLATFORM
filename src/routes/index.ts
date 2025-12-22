import { Router } from 'express';
import authRoutes from './auth.routes';
import productRoutes from './product.routes';
import orderRoutes from './order.routes';
import paymentRoutes from './payment.routes';
import cartRoutes from './cart.routes';
import oauthRoutes from './oauth.routes';
import analyticsRoutes from './analytics.routes';
import userRoutes from './user.routes';
import auditRoutes from './audit.routes';
import healthRoutes from './health.routes';

const router = Router();

// Health check routes (no /api prefix needed)
router.use('/', healthRoutes);

router.use('/auth', authRoutes);
router.use('/oauth', oauthRoutes); // OAuth routes under /oauth prefix
router.use('/products', productRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);
router.use('/cart', cartRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/users', userRoutes);
router.use('/admin', auditRoutes); // Admin audit routes

export default router;
