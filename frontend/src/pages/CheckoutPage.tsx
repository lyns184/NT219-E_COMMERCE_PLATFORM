import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Heading,
  Spinner,
  Stack,
  Text,
  useColorModeValue,
  useToast
} from '@chakra-ui/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { createPaymentIntent } from '../features/payments/api';
import { completePaymentDev } from '../features/orders/api';
import { useApiErrorToast } from '../hooks/useApiErrorToast';
import { formatCurrency } from '../utils/currency';
import { useCart } from '../features/cart/CartProvider';
import { PaymentForm } from '../components/PaymentForm';
import { stripePromise } from '../utils/stripe';
import type { OrderItemDto } from '../types/api';

interface CheckoutLocationState {
  items?: OrderItemDto[];
}

export const CheckoutPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const toastError = useApiErrorToast();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const { clearCart } = useCart();

  const items = (location.state as CheckoutLocationState | undefined)?.items ?? [];

  useEffect(() => {
    const initializeCheckout = async () => {
      if (!items.length) {
        return;
      }
      setIsInitializing(true);
      try {
        const result = await createPaymentIntent(items.map(item => ({ productId: item.productId, quantity: item.quantity })));
        setClientSecret(result.clientSecret);
        setOrderId(result.orderId);
      } catch (error) {
        toastError(error, 'Failed to initialize checkout');
      } finally {
        setIsInitializing(false);
      }
    };

    initializeCheckout();
  }, [items, toastError]);

  const handleSuccess = async () => {
    try {
      // In development mode, manually complete the payment since webhooks don't work on localhost
      if (orderId && import.meta.env.DEV) {
        try {
          await completePaymentDev(orderId);
          if (import.meta.env.DEV) {
            console.log('[DEV] Order marked as paid');
          }
        } catch (devError) {
          if (import.meta.env.DEV) {
            console.error('[DEV] Failed to mark order as paid:', devError);
          }
          // Don't fail the whole flow if dev endpoint fails
        }
      }
      
      await clearCart();
      toast({ 
        id: 'order-success',
        title: 'Order placed successfully', 
        status: 'success', 
        duration: 4000, 
        position: 'top',
        isClosable: true
      });
    } catch (error) {
      toastError(error, 'Order placed but failed to refresh cart');
    } finally {
      navigate('/orders');
    }
  };

  if (!items.length) {
    return (
      <Alert status="warning" borderRadius="md">
        <AlertIcon />
        <AlertDescription>
          Your cart is empty. Please select a product before proceeding to checkout.
        </AlertDescription>
      </Alert>
    );
  }

  if (!stripePromise) {
    return (
      <Alert status="error" borderRadius="md">
        <AlertIcon />
        <AlertDescription>Missing Stripe publishable key. Please contact the administrator.</AlertDescription>
      </Alert>
    );
  }

  if (isInitializing || !clientSecret || !orderId) {
    return (
      <Stack align="center" py={16} spacing={4}>
        <Spinner size="lg" />
        <Text>Preparing your secure checkout...</Text>
      </Stack>
    );
  }

  return (
    <Card maxW="2xl" mx="auto" shadow="md" borderRadius="lg">
      <CardHeader>
        <Heading size="lg">Checkout</Heading>
      </CardHeader>
      <CardBody>
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <PaymentForm items={items} orderId={orderId} onSuccess={handleSuccess} />
        </Elements>
      </CardBody>
    </Card>
  );
};
