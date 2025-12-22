import { FormEvent, useMemo, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Button,
  Divider,
  Heading,
  Stack,
  Text,
  useColorModeValue,
  useToast
} from '@chakra-ui/react';
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { useApiErrorToast } from '../hooks/useApiErrorToast';
import { formatCurrency } from '../utils/currency';
import type { OrderItemDto } from '../types/api';

interface PaymentFormProps {
  items: OrderItemDto[];
  orderId: string;
  onSuccess: () => Promise<void> | void;
}

export const PaymentForm = ({ items, orderId, onSuccess }: PaymentFormProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const toast = useToast();
  const toastError = useApiErrorToast();
  const textSecondary = useColorModeValue('gray.600', 'gray.400');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const totalDisplay = useMemo(() => {
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const currency = items[0]?.currency ?? 'USD';
    return formatCurrency(total, currency);
  }, [items]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) {
      if (import.meta.env.DEV) {
        console.warn('Stripe or Elements not ready');
      }
      return;
    }

    setIsProcessing(true);
    setPaymentMessage(null);
    try {
      // Submit the form to ensure all elements are ready
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setPaymentMessage(submitError.message ?? 'Please complete all payment details');
        setIsProcessing(false);
        return;
      }

      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/orders`
        },
        redirect: 'if_required'
      });

      if (error) {
        const message = error.message ?? 'Payment failed';
        toastError(error, message);
        setPaymentMessage(message);
      } else {
        toast({ title: 'Payment succeeded', status: 'success', duration: 4000, position: 'top' });
        setPaymentMessage('Payment confirmed. Your order is being processed.');
        await onSuccess();
      }
    } catch (error) {
      toastError(error, 'Payment failed');
      setPaymentMessage('Payment failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Stack spacing={5} as="form" onSubmit={handleSubmit}>
      <Stack spacing={2}>
        <Heading size="md">Order summary</Heading>
        <Text color={textSecondary}>Order ID: {orderId}</Text>
        <Stack spacing={1}>
          {items.map(item => (
            <Text key={item.productId} color={textSecondary}>
              {item.name} x {item.quantity}
            </Text>
          ))}
        </Stack>
        <Text fontWeight="bold">Total due: {totalDisplay}</Text>
      </Stack>

      <Divider />

      <PaymentElement 
        id="payment-element"
        onReady={() => setIsReady(true)}
      />

      <Button 
        colorScheme="brand" 
        type="submit" 
        size="lg" 
        isLoading={isProcessing} 
        isDisabled={!stripe || !elements || !isReady}
      >
        Confirm payment
      </Button>

      {paymentMessage && (
        <Alert status="info" borderRadius="md">
          <AlertIcon />
          <AlertDescription>{paymentMessage}</AlertDescription>
        </Alert>
      )}
    </Stack>
  );
};
