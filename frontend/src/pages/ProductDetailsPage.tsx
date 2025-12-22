import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AspectRatio,
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  Container,
  Divider,
  Flex,
  Grid,
  HStack,
  Icon,
  Image,
  Heading,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Skeleton,
  Stack,
  Text,
  useToast,
  useColorModeValue,
  VStack
} from '@chakra-ui/react';
import { FaShoppingCart, FaBolt, FaShieldAlt, FaTruck, FaStar } from 'react-icons/fa';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { useProductQuery } from '../features/products/queries';
import { formatCurrency } from '../utils/currency';
import { useAuth } from '../features/auth/AuthProvider';
import { useCart } from '../features/cart/CartProvider';
import { resolveAssetUrl } from '../utils/asset';

const MotionBox = motion(Box);

export const ProductDetailsPage = () => {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addItem } = useCart();
  const toast = useToast();
  const [quantity, setQuantity] = useState(1);

  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const badgeBg = useColorModeValue('green.50', 'green.900');
  const imageBg = useColorModeValue('white', 'whiteAlpha.200');
  const textSecondary = useColorModeValue('gray.600', 'gray.400');

  const { data: product, isLoading, isError } = useProductQuery(productId ?? '', Boolean(productId));

  // Debug log
  useEffect(() => {
    if (product) {
      console.log('Product loaded:', {
        _id: product._id,
        idType: typeof product._id,
        idLength: product._id?.length,
        name: product.name
      });
    }
  }, [product]);

  useEffect(() => {
    if (product && product.stock > 0 && quantity === 0) {
      setQuantity(1);
    }
    if (product && product.stock === 0) {
      setQuantity(0);
    }
    if (product && product.stock > 0 && quantity > product.stock) {
      setQuantity(product.stock);
    }
  }, [product, quantity]);

  const subtotal = useMemo(() => {
    if (!product) return 0;
    return product.price * quantity;
  }, [product, quantity]);

  if (!productId) {
    return (
      <Alert status="error" borderRadius="md">
        <AlertIcon />
        <AlertDescription>Product identifier is missing.</AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <Container maxW="7xl" py={8}>
        <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={12}>
          <Skeleton height="500px" borderRadius="2xl" />
          <Stack spacing={6}>
            <Skeleton height="40px" width="70%" />
            <Skeleton height="20px" width="40%" />
            <Skeleton height="100px" />
            <Skeleton height="60px" />
            <Skeleton height="50px" />
          </Stack>
        </Grid>
      </Container>
    );
  }

  if (isError || !product) {
    return (
      <Alert status="error" borderRadius="md">
        <AlertIcon />
        <AlertDescription>We couldn&apos;t load this product right now. Please try again later.</AlertDescription>
      </Alert>
    );
  }

  const handleCheckout = () => {
    if (!user) {
      navigate('/login', { state: { from: { pathname: `/products/${product._id}` } } });
      return;
    }

    navigate('/checkout', {
      state: {
        items: [
          {
            productId: product._id,
            name: product.name,
            price: product.price,
            currency: product.currency,
            quantity
          }
        ]
      }
    });
  };

  const handleAddToCart = async () => {
    if (!user) {
      navigate('/login', { state: { from: { pathname: `/products/${product._id}` } } });
      return;
    }

    console.log('Adding to cart:', { productId: product._id, quantity });

    try {
      await addItem(product._id, quantity);

      toast({
        title: 'Added to cart',
        description: `${quantity} x ${product.name}`,
        status: 'success',
        duration: 2000,
        position: 'top',
        isClosable: true
      });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Add to cart error:', error);
      }
      // Error already handled by mutation
    }
  };

  const isOutOfStock = product.stock <= 0;

  return (
    <Container maxW="7xl" py={8}>
      <MotionBox
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={12}>
          {/* Left Column - Image */}
          <Box>
            {product.prototypeImageUrl && (
              <Card variant="elevated" overflow="hidden" bg={cardBg}>
                <CardBody p={0}>
                  <Box position="relative">
                    <AspectRatio ratio={3 / 4}>
                      <Box bg={imageBg} display="flex" alignItems="center" justifyContent="center" p={{ base: 6, md: 10 }}>
                        <Image
                          src={resolveAssetUrl(product.prototypeImageUrl)}
                          alt={product.name}
                          objectFit="contain"
                          maxH="100%"
                          maxW="100%"
                          fallbackSrc="https://via.placeholder.com/600x600?text=Image+not+available"
                          loading="lazy"
                          transition="transform 0.4s ease"
                          _hover={{ transform: 'scale(1.02)' }}
                        />
                      </Box>
                    </AspectRatio>
                  </Box>
                </CardBody>
              </Card>
            )}
          </Box>

          {/* Right Column - Details */}
          <Stack spacing={6}>
            {/* Product Info */}
            <Stack spacing={3}>
              {/* Badges */}
              <HStack>
                {!product.isActive && (
                  <Badge colorScheme="yellow" fontSize="sm" px={3} py={1}>
                    Inactive
                  </Badge>
                )}
                {product.stock > 0 && product.stock < 10 && (
                  <Badge colorScheme="orange" fontSize="sm" px={3} py={1}>
                    Only {product.stock} left!
                  </Badge>
                )}
                {isOutOfStock && (
                  <Badge colorScheme="red" fontSize="sm" px={3} py={1}>
                    Out of Stock
                  </Badge>
                )}
              </HStack>

              {/* Title */}
              <Heading size="2xl" lineHeight="1.2">
                {product.name}
              </Heading>

              {/* Rating (Mock) */}
              <HStack>
                {[...Array(5)].map((_, i) => (
                  <Icon key={i} as={FaStar} color={i < 4 ? 'yellow.400' : 'gray.300'} />
                ))}
                <Text color={textSecondary} ml={2}>
                  4.0 (128 reviews)
                </Text>
              </HStack>

              {/* Price */}
              <HStack align="baseline" spacing={3}>
                <Text fontSize="4xl" fontWeight="bold" color="brand.500">
                  {formatCurrency(product.price, product.currency)}
                </Text>
                {product.stock < 10 && product.stock > 0 && (
                  <Badge colorScheme="green" fontSize="md" px={3} py={1}>
                    In Stock
                  </Badge>
                )}
              </HStack>
            </Stack>

            <Divider />

            {/* Description */}
            <Box>
              <Heading size="sm" mb={3}>
                Description
              </Heading>
              <Text color={textSecondary} fontSize="lg" lineHeight="1.8">
                {product.description}
              </Text>
            </Box>

            <Divider />

            {/* Quantity Selector */}
            <Card variant="outline" bg={badgeBg} border="2px" borderColor={borderColor}>
              <CardBody>
                <Stack spacing={4}>
                  <Flex justify="space-between" align="center">
                    <VStack align="start" spacing={1}>
                      <Text fontWeight="semibold" fontSize="lg">
                        Quantity
                      </Text>
                      <Text fontSize="sm" color={textSecondary}>
                        {product.stock} available
                      </Text>
                    </VStack>
                    <NumberInput
                      size="lg"
                      maxW="150px"
                      min={isOutOfStock ? 0 : 1}
                      max={product.stock}
                      value={quantity}
                      isDisabled={isOutOfStock}
                      onChange={(_, valueAsNumber) => setQuantity(valueAsNumber || (isOutOfStock ? 0 : 1))}
                    >
                      <NumberInputField />
                      <NumberInputStepper>
                        <NumberIncrementStepper />
                        <NumberDecrementStepper />
                      </NumberInputStepper>
                    </NumberInput>
                  </Flex>

                  <Divider />

                  {/* Subtotal */}
                  <Flex justify="space-between" align="center">
                    <Text fontSize="lg" fontWeight="semibold">
                      Subtotal
                    </Text>
                    <Text fontSize="2xl" fontWeight="bold" color="brand.500">
                      {formatCurrency(subtotal, product.currency)}
                    </Text>
                  </Flex>
                </Stack>
              </CardBody>
            </Card>

            {/* Action Buttons */}
            <Stack spacing={3}>
              <Button
                size="lg"
                colorScheme="brand"
                leftIcon={<Icon as={FaBolt} />}
                onClick={handleCheckout}
                isDisabled={!product.isActive || isOutOfStock}
                height="60px"
                fontSize="lg"
              >
                Buy Now
              </Button>
              <Button
                size="lg"
                variant="outline"
                colorScheme="brand"
                leftIcon={<Icon as={FaShoppingCart} />}
                onClick={handleAddToCart}
                isDisabled={!product.isActive || isOutOfStock}
                height="60px"
                fontSize="lg"
              >
                Add to Cart
              </Button>
            </Stack>

            {/* Features */}
            <Card variant="outline">
              <CardBody>
                <Stack spacing={3}>
                  <HStack>
                    <Icon as={FaTruck} color="brand.500" boxSize={5} />
                    <Text fontWeight="medium">Free shipping on orders over $50</Text>
                  </HStack>
                  <HStack>
                    <Icon as={FaShieldAlt} color="brand.500" boxSize={5} />
                    <Text fontWeight="medium">30-day money-back guarantee</Text>
                  </HStack>
                  <HStack>
                    <Icon as={FaBolt} color="brand.500" boxSize={5} />
                    <Text fontWeight="medium">Fast delivery in 2-3 business days</Text>
                  </HStack>
                </Stack>
              </CardBody>
            </Card>
          </Stack>
        </Grid>
      </MotionBox>
    </Container>
  );
};
