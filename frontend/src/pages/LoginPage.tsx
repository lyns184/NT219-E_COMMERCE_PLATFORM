import { useCallback } from 'react';
import {
  Box,
  Button,
  Card,
  CardBody,
  Container,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Heading,
  Input,
  Stack,
  Text,
  Divider,
  HStack,
  Icon,
  useColorModeValue,
  useToast,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  CloseButton
} from '@chakra-ui/react';
import { FaGoogle, FaLock } from 'react-icons/fa';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocation, useNavigate, Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { useApiErrorToast } from '../hooks/useApiErrorToast';

const MotionBox = motion(Box);

type LoginFormValues = z.infer<typeof loginSchema>;

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

export const LoginPage = () => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema)
  });
  const { login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const toastError = useApiErrorToast();
  const toast = useToast();

  const cardBg = useColorModeValue('white', 'gray.800');
  const textSecondary = useColorModeValue('gray.600', 'gray.400');
  const heroBg = useColorModeValue(
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #4c51bf 0%, #553c9a 100%)'
  );

  const onSubmit = useCallback(
    async (values: LoginFormValues) => {
      try {
        const result = await login(values.email, values.password);
        
        // Check if email verification is required
        if ('requiresEmailVerification' in result && result.requiresEmailVerification) {
          toast({
            title: 'Email Verification Required',
            description: 'Please verify your email before logging in. Check your inbox for the verification link.',
            status: 'warning',
            duration: 6000,
            isClosable: true,
          });
          navigate('/resend-verification', { 
            state: { 
              email: result.email,
              fromLogin: true 
            }
          });
          return;
        }
        
        // Check if 2FA is required
        if ('requiresTwoFactor' in result && result.requiresTwoFactor) {
          navigate('/login/2fa', { 
            state: { tempToken: result.tempToken },
            replace: true 
          });
          return;
        }
        
        // Normal login - redirect to intended page
        const redirectPath = (location.state as { from?: { pathname?: string } } | undefined)?.from?.pathname ?? '/';
        navigate(redirectPath, { replace: true });
      } catch (error) {
        toastError(error, 'Login failed');
      }
    },
    [login, location.state, navigate, toastError, toast]
  );

  const handleGoogleLogin = () => {
    // Redirect to backend Google OAuth endpoint
    const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';
    window.location.href = `${apiUrl}/auth/google`;
  };

  return (
    <Box minH="100vh" display="flex" alignItems="center" position="relative" overflow="hidden">
      {/* Background Gradient Orbs */}
      <Box
        position="absolute"
        top="-20%"
        right="-10%"
        width="500px"
        height="500px"
        borderRadius="full"
        bgGradient={heroBg}
        opacity={0.15}
        filter="blur(100px)"
      />
      <Box
        position="absolute"
        bottom="-15%"
        left="-10%"
        width="400px"
        height="400px"
        borderRadius="full"
        bgGradient={heroBg}
        opacity={0.15}
        filter="blur(100px)"
      />

      <Container maxW="md" position="relative" zIndex={1} py={10}>
        <MotionBox
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Header */}
          <Stack textAlign="center" spacing={3} mb={8}>
            <Icon as={FaLock} boxSize={12} color="brand.500" mx="auto" />
            <Heading size="xl" bgGradient="linear(to-r, brand.500, brand.600)" bgClip="text">
              Welcome back
            </Heading>
            <Text color={textSecondary} fontSize="lg">
              Sign in to manage your orders and checkout faster
            </Text>
          </Stack>

          {/* Login Card */}
          <Card shadow="xl" borderRadius="2xl" bg={cardBg} border="1px" borderColor={useColorModeValue('gray.200', 'gray.700')}>
            <CardBody p={8}>
              <Stack spacing={6}>
                {/* Google Sign-In Button */}
                <Button
                  leftIcon={<Icon as={FaGoogle} />}
                  onClick={handleGoogleLogin}
                  variant="outline"
                  size="lg"
                  width="full"
                  colorScheme="red"
                  borderWidth="2px"
                  _hover={{
                    transform: 'translateY(-2px)',
                    shadow: 'lg'
                  }}
                >
                  Continue with Google
                </Button>

                <HStack>
                  <Divider />
                  <Text fontSize="sm" color={textSecondary} whiteSpace="nowrap" px={2}>
                    or sign in with email
                  </Text>
                  <Divider />
                </HStack>

                {/* Email/Password Form */}
                <Stack as="form" onSubmit={handleSubmit(onSubmit)} spacing={5}>
                  <FormControl isInvalid={Boolean(errors.email)}>
                    <FormLabel fontWeight="semibold">Email</FormLabel>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      size="lg"
                      {...register('email')}
                    />
                    <FormErrorMessage>{errors.email?.message}</FormErrorMessage>
                  </FormControl>

                  <FormControl isInvalid={Boolean(errors.password)}>
                    <FormLabel fontWeight="semibold">Password</FormLabel>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      size="lg"
                      {...register('password')}
                    />
                    <FormErrorMessage>{errors.password?.message}</FormErrorMessage>
                  </FormControl>

                  <Box textAlign="right">
                    <Button
                      as={RouterLink}
                      to="/forgot-password"
                      variant="link"
                      colorScheme="brand"
                      size="sm"
                    >
                      Forgot password?
                    </Button>
                  </Box>

                  <Button
                    type="submit"
                    colorScheme="brand"
                    size="lg"
                    isLoading={isSubmitting}
                    width="full"
                  >
                    Sign in
                  </Button>
                </Stack>
              </Stack>
            </CardBody>
          </Card>

          {/* Footer */}
          <Box textAlign="center" mt={6}>
            <Text color={textSecondary}>
              Don&apos;t have an account?{' '}
              <Button
                as={RouterLink}
                to="/register"
                variant="link"
                colorScheme="brand"
                fontWeight="bold"
              >
                Create one
              </Button>
            </Text>
          </Box>
        </MotionBox>
      </Container>
    </Box>
  );
};
