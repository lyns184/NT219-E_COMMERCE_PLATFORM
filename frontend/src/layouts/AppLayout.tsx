import { ReactNode } from 'react';
import {
  Badge,
  Box,
  Container,
  Flex,
  HStack,
  Link as ChakraLink,
  Button,
  Spacer,
  IconButton,
  Text,
  useColorMode,
  useColorModeValue,
  Icon
} from '@chakra-ui/react';
import { Link, useNavigate } from 'react-router-dom';
import { MoonIcon, SunIcon } from '@chakra-ui/icons';
import { FaShoppingCart, FaUserCircle } from 'react-icons/fa';
import { useAuth } from '../features/auth/AuthProvider';
import { useCart } from '../features/cart/CartProvider';

interface Props {
  children: ReactNode;
}

const navLinkStyles = {
  as: Link,
  px: 3,
  py: 2,
  rounded: 'md',
  fontWeight: 500
} as const;

export const AppLayout = ({ children }: Props) => {
  const { user, logout } = useAuth();
  const { totalItems } = useCart();
  const { colorMode, toggleColorMode } = useColorMode();
  const bg = useColorModeValue('gray.50', 'gray.900');
  const navBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <Flex direction="column" minH="100vh" bg={bg}>
      {/* Enhanced Navbar */}
      <Box
        as="header"
        shadow="sm"
        py={4}
        bg={navBg}
        borderBottom="1px"
        borderColor={borderColor}
        position="sticky"
        top={0}
        zIndex={100}
        backdropFilter="blur(10px)"
      >
        <Container maxW="7xl">
          <Flex align="center" gap={6}>
            {/* Logo */}
            <ChakraLink
              as={Link}
              to="/"
              fontSize="xl"
              fontWeight="bold"
              bgGradient="linear(to-r, brand.500, brand.600)"
              bgClip="text"
              _hover={{ transform: 'scale(1.05)' }}
              transition="transform 0.2s"
            >
              🛍️ Secure Shop
            </ChakraLink>

            {/* Navigation Links */}
            <HStack spacing={1} display={{ base: 'none', md: 'flex' }}>
              <ChakraLink {...navLinkStyles} to="/products">
                Products
              </ChakraLink>
              {user && (
                <ChakraLink {...navLinkStyles} to="/orders">
                  My Orders
                </ChakraLink>
              )}
              {user?.role === 'admin' && (
                <ChakraLink {...navLinkStyles} to="/admin/dashboard">
                  Admin Panel
                </ChakraLink>
              )}
            </HStack>

            <Spacer />

            {/* Right Side Actions */}
            <HStack spacing={3}>
              {/* Cart Button */}
              <Box position="relative">
                <IconButton
                  as={Link}
                  to="/cart"
                  aria-label="Shopping cart"
                  icon={<Icon as={FaShoppingCart} />}
                  variant="ghost"
                  size="lg"
                />
                {totalItems > 0 && (
                  <Badge
                    colorScheme="red"
                    borderRadius="full"
                    position="absolute"
                    top="0"
                    right="0"
                    fontSize="xs"
                    px={2}
                  >
                    {totalItems > 99 ? '99+' : totalItems}
                  </Badge>
                )}
              </Box>

              {/* Dark Mode Toggle */}
              <IconButton
                aria-label="Toggle color mode"
                icon={colorMode === 'light' ? <MoonIcon /> : <SunIcon />}
                onClick={toggleColorMode}
                variant="ghost"
                size="lg"
              />

              {/* User Menu */}
              {user ? (
                <>
                  <Button
                    variant="ghost"
                    as={Link}
                    to="/account"
                    leftIcon={<Icon as={FaUserCircle} />}
                    display={{ base: 'none', md: 'flex' }}
                  >
                    {user.email}
                  </Button>
                  <Button
                    colorScheme="red"
                    variant="solid"
                    size="sm"
                    onClick={handleLogout}
                  >
                    Logout
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    as={Link}
                    to="/login"
                    variant="ghost"
                  >
                    Login
                  </Button>
                  <Button
                    as={Link}
                    to="/register"
                    colorScheme="brand"
                    size="sm"
                  >
                    Sign Up
                  </Button>
                </>
              )}
            </HStack>
          </Flex>
        </Container>
      </Box>

      {/* Main Content */}
      <Box flex="1 0 auto" py={8}>{children}</Box>

      {/* Enhanced Footer */}
      <Box
        as="footer"
        py={8}
        textAlign="center"
        borderTop="1px"
        borderColor={borderColor}
        bg={navBg}
      >
        <Container maxW="7xl">
          <Text color="gray.500">
            © {new Date().getFullYear()} Secure Shop. All rights reserved.
          </Text>
        </Container>
      </Box>
    </Flex>
  );
};
