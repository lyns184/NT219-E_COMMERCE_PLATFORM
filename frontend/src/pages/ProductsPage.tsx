import {
  AspectRatio,
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Container,
  Flex,
  Icon,
  IconButton,
  Image,
  Heading,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  useToast,
  useColorModeValue
} from '@chakra-ui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaShoppingCart, FaEye } from 'react-icons/fa';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useProductsQuery } from '../features/products/queries';
import { useCart } from '../features/cart/CartProvider';
import { useAuth } from '../features/auth/AuthProvider';
import { formatCurrency } from '../utils/currency';
import { resolveAssetUrl } from '../utils/asset';
import { useState } from 'react';

const MotionBox = motion(Box);
const MotionCard = motion(Card);

export const ProductsPage = () => {
  const { data: products, isLoading, isError } = useProductsQuery();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const { user } = useAuth();
  const toast = useToast();
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  const heroBg = useColorModeValue(
    'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
    'linear-gradient(135deg, #4F46E5 0%, #4338CA 100%)'
  );
  const cardBg = useColorModeValue('white', 'gray.800');
  const overlayBg = useColorModeValue('rgba(0, 0, 0, 0.5)', 'rgba(0, 0, 0, 0.7)');
  const textSecondary = useColorModeValue('gray.600', 'gray.400');

  if (isLoading) {
    return (
      <Box>
        {/* Hero Skeleton */}
        <Skeleton height="300px" mb={12} />
        
        <Container maxW="7xl">
          <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={8}>
            {Array.from({ length: 8 }).map((_, index) => (
              <Card key={index} variant="elevated">
                <CardBody>
                  <Skeleton height="240px" mb={4} borderRadius="md" />
                  <Skeleton height="24px" mb={2} />
                  <Skeleton height="16px" mb={3} />
                  <Skeleton height="20px" width="40%" />
                </CardBody>
              </Card>
            ))}
          </SimpleGrid>
        </Container>
      </Box>
    );
  }

  if (isError || !products) {
    return (
      <Box textAlign="center" py={16}>
        <Heading size="md" mb={4}>
          We couldn&apos;t load products right now.
        </Heading>
        <Text color={textSecondary}>Please try again later.</Text>
      </Box>
    );
  }

  if (products.length === 0) {
    return (
      <Box textAlign="center" py={16}>
        <Heading size="md" mb={4}>
          No products available.
        </Heading>
        <Text color={textSecondary}>Check back soon for new arrivals.</Text>
      </Box>
    );
  }

  return (
    <Box>
      {/* Hero Section */}
      <Box
        bgGradient={heroBg}
        color="white"
        py={{ base: 16, md: 24 }}
        mb={12}
        position="relative"
        overflow="hidden"
      >
        <Container maxW="7xl" position="relative" zIndex={1}>
          <MotionBox
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            textAlign="center"
          >
            <Heading
              size={{ base: 'xl', md: '2xl' }}
              mb={4}
              fontWeight="extrabold"
              letterSpacing="tight"
            >
              Discover Amazing Products
            </Heading>
            <Text fontSize={{ base: 'lg', md: 'xl' }} opacity={0.9} maxW="2xl" mx="auto">
              Shop our curated collection of premium products with unbeatable prices and quality
            </Text>
          </MotionBox>
        </Container>
        
        {/* Decorative gradient orbs */}
        <Box
          position="absolute"
          top="-50%"
          right="-10%"
          width="400px"
          height="400px"
          borderRadius="full"
          bg="whiteAlpha.100"
          filter="blur(100px)"
        />
        <Box
          position="absolute"
          bottom="-30%"
          left="-5%"
          width="300px"
          height="300px"
          borderRadius="full"
          bg="whiteAlpha.100"
          filter="blur(80px)"
        />
      </Box>

      {/* Products Grid */}
      <Container maxW="7xl" pb={16}>
        <Flex justify="space-between" align="center" mb={8}>
          <Heading size="lg">Featured Products</Heading>
          <Text color={textSecondary}>{products?.length || 0} items</Text>
        </Flex>

        <AnimatePresence>
          <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={8}>
            {products?.map((product, index) => (
              <MotionCard
                key={product._id}
                variant="elevated"
                bg={cardBg}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                whileHover={{ y: -8 }}
                onHoverStart={() => setHoveredCard(product._id)}
                onHoverEnd={() => setHoveredCard(null)}
                cursor="pointer"
                overflow="hidden"
                position="relative"
                onClick={() => navigate(`/products/${product._id}`)}
              >
                {/* Image Section with Overlay */}
                <Box position="relative" overflow="hidden">
                  {product.prototypeImageUrl && (
                    <>
                      <AspectRatio ratio={3 / 4} w="100%">
                        <Box bg="gray.50" display="flex" alignItems="center" justifyContent="center" p={4}>
                          <Image
                            src={resolveAssetUrl(product.prototypeImageUrl)}
                            alt={product.name}
                            objectFit="contain"
                            maxH="100%"
                            maxW="100%"
                            fallbackSrc="https://via.placeholder.com/400x400?text=Image+not+available"
                            loading="lazy"
                            transition="transform 0.3s"
                            _hover={{ transform: 'scale(1.03)' }}
                          />
                        </Box>
                      </AspectRatio>
                      
                      {/* Overlay on hover */}
                      {hoveredCard === product._id && (
                        <MotionBox
                          position="absolute"
                          top={0}
                          left={0}
                          right={0}
                          bottom={0}
                          bg={overlayBg}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.2 }}
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                        >
                          <IconButton
                            aria-label="Quick view"
                            icon={<FaEye />}
                            colorScheme="brand"
                            size="lg"
                            onClick={() => navigate(`/products/${product._id}`)}
                          />
                        </MotionBox>
                      )}
                    </>
                  )}
                  
                  {/* Badges */}
                  {!product.isActive && (
                    <Badge
                      position="absolute"
                      top={3}
                      left={3}
                      colorScheme="yellow"
                      fontSize="xs"
                      px={2}
                      py={1}
                      borderRadius="md"
                    >
                      Inactive
                    </Badge>
                  )}
                  {product.stock < 10 && product.stock > 0 && (
                    <Badge
                      position="absolute"
                      top={3}
                      right={3}
                      colorScheme="red"
                      fontSize="xs"
                      px={2}
                      py={1}
                      borderRadius="md"
                    >
                      Low Stock
                    </Badge>
                  )}
                </Box>

                {/* Content */}
                <CardBody>
                  <Stack spacing={3}>
                    <Heading size="sm" noOfLines={2} minH="40px">
                      {product.name}
                    </Heading>
                    <Text color={textSecondary} fontSize="sm" noOfLines={2}>
                      {product.description}
                    </Text>
                    <Flex justify="space-between" align="center">
                      <Text fontWeight="bold" fontSize="xl" color="brand.500">
                        {formatCurrency(product.price, product.currency)}
                      </Text>
                      <Text fontSize="xs" color={textSecondary}>
                        {product.stock} in stock
                      </Text>
                    </Flex>
                  </Stack>
                </CardBody>

                {/* Actions */}
                <CardFooter pt={0}>
                  <Button
                    leftIcon={<FaShoppingCart />}
                    variant="solid"
                    colorScheme="brand"
                    width="100%"
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        if (!user) {
                          navigate('/login', { state: { from: { pathname: `/products/${product._id}` } } });
                          return;
                        }

                        await addItem(product._id, 1);
                        toast({
                          id: `cart-add-${product._id}`,
                          title: 'Added to cart',
                          description: product.name,
                          status: 'success',
                          duration: 2000,
                          position: 'top',
                          isClosable: true
                        });
                      } catch (err) {
                        if (import.meta.env.DEV) {
                          console.error('Add to cart failed', err);
                        }
                        // Error already handled by useApiErrorToast in mutation
                      }
                    }}
                  >
                    Add to Cart
                  </Button>
                </CardFooter>
              </MotionCard>
            ))}
          </SimpleGrid>
        </AnimatePresence>
      </Container>
    </Box>
  );
};
