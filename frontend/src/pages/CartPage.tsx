import {
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Container,
  Divider,
  Flex,
  Grid,
  Heading,
  Icon,
  IconButton,
  Image,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Skeleton,
  Stack,
  Text,
  useToast,
  Alert,
  AlertIcon,
  AlertDescription,
  useColorModeValue
} from '@chakra-ui/react';
import { DeleteIcon } from '@chakra-ui/icons';
import { FaShoppingCart, FaTrash, FaArrowRight } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../features/cart/CartProvider';
import { formatCurrency } from '../utils/currency';
import { resolveAssetUrl } from '../utils/asset';
import { useAuth } from '../features/auth/AuthProvider';

const MotionBox = motion(Box);
const MotionCard = motion(Card);

export const CartPage = () => {
  const { items, removeItem, updateQuantity, clearCart, totalItems, totalPrice, isLoading, error } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const cardBg = useColorModeValue('white', 'gray.800');
  const summaryBg = useColorModeValue('gray.50', 'gray.900');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textSecondary = useColorModeValue('gray.600', 'gray.400');

  const handleRemoveItem = async (productId: string) => {
    try {
      await removeItem(productId);
      toast({
        id: `cart-remove-${productId}`,
        title: 'Item removed',
        status: 'success',
        duration: 2000,
        position: 'top',
        isClosable: true
      });
    } catch (error) {
      // Error already handled by useApiErrorToast
    }
  };

  const handleUpdateQuantity = async (productId: string, quantity: number) => {
    try {
      await updateQuantity(productId, quantity);
    } catch (error) {
      // Error already handled by useApiErrorToast
    }
  };

  const handleClearCart = async () => {
    try {
      await clearCart();
      toast({
        id: 'cart-cleared',
        title: 'Cart cleared',
        status: 'success',
        duration: 2000,
        position: 'top',
        isClosable: true
      });
    } catch (error) {
      // Error already handled by useApiErrorToast
    }
  };

  const handleCheckout = () => {
    if (!user) {
      navigate('/login', { state: { from: { pathname: '/cart' } } });
      return;
    }

    if (items.length === 0) {
      toast({
        id: 'cart-empty-warning',
        title: 'Cart is empty',
        description: 'Please add items to your cart before checkout',
        status: 'warning',
        duration: 3000,
        position: 'top',
        isClosable: true
      });
      return;
    }

    navigate('/checkout', {
      state: {
        items: items.map(item => ({
          productId: item.productId,
          name: item.name,
          price: item.price,
          currency: item.currency,
          quantity: item.quantity
        }))
      }
    });
  };

  if (!user) {
    return (
      <Box textAlign="center" py={16}>
        <Heading size="md" mb={4}>
          Please log in
        </Heading>
        <Text color={textSecondary} mb={6}>
          You need to be logged in to view your cart
        </Text>
        <Button colorScheme="brand" onClick={() => navigate('/login')}>
          Login
        </Button>
      </Box>
    );
  }

  if (isLoading) {
    return (
      <Stack spacing={4}>
        <Skeleton height="40px" />
        <Skeleton height="200px" />
        <Skeleton height="200px" />
      </Stack>
    );
  }

  if (error) {
    return (
      <Alert status="error" borderRadius="md">
        <AlertIcon />
        <AlertDescription>Failed to load cart. Please try again later.</AlertDescription>
      </Alert>
    );
  }

  if (items.length === 0) {
    return (
      <Container maxW="7xl" py={16}>
        <MotionBox
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          textAlign="center"
        >
          <Icon as={FaShoppingCart} boxSize={20} color="gray.300" mb={6} />
          <Heading size="xl" mb={4}>
            Your cart is empty
          </Heading>
          <Text color={textSecondary} fontSize="lg" mb={8}>
            Discover amazing products and start shopping!
          </Text>
          <Button
            size="lg"
            colorScheme="brand"
            rightIcon={<FaArrowRight />}
            onClick={() => navigate('/products')}
          >
            Browse Products
          </Button>
        </MotionBox>
      </Container>
    );
  }

  const currency = items[0]?.currency ?? 'USD';

  return (
    <Container maxW="7xl" py={8}>
      {/* Header */}
      <Flex justify="space-between" align="center" mb={8}>
        <Box>
          <Heading size="xl" mb={2}>Shopping Cart</Heading>
          <Text color={textSecondary}>
            {totalItems} {totalItems === 1 ? 'item' : 'items'} in your cart
          </Text>
        </Box>
        <Button
          variant="ghost"
          colorScheme="red"
          leftIcon={<FaTrash />}
          onClick={handleClearCart}
        >
          Clear Cart
        </Button>
      </Flex>

      {/* Split Layout */}
      <Grid templateColumns={{ base: '1fr', lg: '2fr 1fr' }} gap={8}>
        {/* Cart Items */}
        <Box>
          <AnimatePresence mode="popLayout">
            <Stack spacing={4}>
              {items.map((item, index) => (
                <MotionCard
                  key={item.productId}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20, height: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  variant="elevated"
                  bg={cardBg}
                >
                  <CardBody>
                    <Flex gap={6} align="center" direction={{ base: 'column', md: 'row' }}>
                      {/* Product Image */}
                      {item.imageUrl && (
                        <Box
                          flexShrink={0}
                          w={{ base: '100%', md: '140px' }}
                          h="140px"
                          borderRadius="lg"
                          overflow="hidden"
                          bg="gray.100"
                        >
                          <Image
                            src={resolveAssetUrl(item.imageUrl)}
                            alt={item.name}
                            objectFit="cover"
                            w="100%"
                            h="100%"
                          />
                        </Box>
                      )}

                      {/* Product Info */}
                      <Stack flex="1" spacing={3} w="100%">
                        <Heading size="md">{item.name}</Heading>
                        <Text fontWeight="bold" fontSize="xl" color="brand.500">
                          {formatCurrency(item.price, item.currency)}
                        </Text>

                        {/* Quantity Controls & Actions */}
                        <Flex
                          justify="space-between"
                          align="center"
                          pt={2}
                          direction={{ base: 'column', sm: 'row' }}
                          gap={4}
                        >
                          <Flex align="center" gap={3}>
                            <Text fontSize="sm" color={textSecondary}>Quantity:</Text>
                            <NumberInput
                              size="md"
                              maxW="120px"
                              min={1}
                              value={item.quantity}
                              onChange={(_, valueAsNumber) => {
                                if (!isNaN(valueAsNumber) && valueAsNumber >= 1) {
                                  handleUpdateQuantity(item.productId, valueAsNumber);
                                }
                              }}
                            >
                              <NumberInputField />
                              <NumberInputStepper>
                                <NumberIncrementStepper />
                                <NumberDecrementStepper />
                              </NumberInputStepper>
                            </NumberInput>
                          </Flex>

                          <Flex align="center" gap={4}>
                            <Text fontWeight="bold" fontSize="lg">
                              {formatCurrency(item.price * item.quantity, item.currency)}
                            </Text>
                            <IconButton
                              aria-label="Remove item"
                              icon={<DeleteIcon />}
                              colorScheme="red"
                              variant="ghost"
                              onClick={() => handleRemoveItem(item.productId)}
                            />
                          </Flex>
                        </Flex>
                      </Stack>
                    </Flex>
                  </CardBody>
                </MotionCard>
              ))}
            </Stack>
          </AnimatePresence>
        </Box>

        {/* Order Summary - Sticky */}
        <Box position="sticky" top="80px" h="fit-content">
          <Card variant="elevated" bg={summaryBg} border="2px" borderColor={borderColor}>
            <CardHeader>
              <Heading size="md">Order Summary</Heading>
            </CardHeader>
            <CardBody>
              <Stack spacing={4}>
                {/* Summary Details */}
                <Flex justify="space-between" color={textSecondary}>
                  <Text>Subtotal ({totalItems} items)</Text>
                  <Text fontWeight="semibold">{formatCurrency(totalPrice, currency)}</Text>
                </Flex>
                
                <Flex justify="space-between" color={textSecondary}>
                  <Text>Shipping</Text>
                  <Text fontWeight="semibold">Calculated at checkout</Text>
                </Flex>

                <Divider />

                {/* Total */}
                <Flex justify="space-between" fontSize="xl">
                  <Text fontWeight="bold">Total</Text>
                  <Text fontWeight="bold" color="brand.500">
                    {formatCurrency(totalPrice, currency)}
                  </Text>
                </Flex>

                {/* Checkout Button */}
                <Button
                  size="lg"
                  colorScheme="brand"
                  rightIcon={<FaArrowRight />}
                  onClick={handleCheckout}
                  width="100%"
                  mt={2}
                >
                  Proceed to Checkout
                </Button>

                <Text fontSize="xs" color={textSecondary} textAlign="center" pt={2}>
                  Secure checkout with SSL encryption
                </Text>
              </Stack>
            </CardBody>
          </Card>

          {/* Trust Badges */}
          <Stack mt={4} spacing={2} fontSize="sm" color={textSecondary}>
            <Flex align="center" gap={2}>
              <Icon as={FaShoppingCart} color="brand.500" />
              <Text>Free shipping on orders over $50</Text>
            </Flex>
            <Flex align="center" gap={2}>
              <Icon as={FaShoppingCart} color="brand.500" />
              <Text>30-day return policy</Text>
            </Flex>
          </Stack>
        </Box>
      </Grid>
    </Container>
  );
};
