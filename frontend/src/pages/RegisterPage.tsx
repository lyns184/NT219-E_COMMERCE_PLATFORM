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
  Icon,
  Input,
  Stack,
  Text,
  Divider,
  HStack,
  useColorModeValue
} from '@chakra-ui/react';
import { FaGoogle, FaUserPlus } from 'react-icons/fa';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { useApiErrorToast } from '../hooks/useApiErrorToast';
import { useOAuth } from '../hooks/useOAuth';

const MotionBox = motion(Box);

type RegisterFormValues = z.infer<typeof registerSchema>;

const registerSchema = z
  .object({
    email: z.string().email('Please provide a valid email'),
    password: z
      .string()
      .min(12, 'Password must be at least 12 characters')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/\d/, 'Password must contain at least one number')
      .regex(/[!@#$%^&*()_+=\-{};:<>?.,]/, 'Password must contain at least one special character'),
    confirmPassword: z.string()
  })
  .refine(values => values.password === values.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword']
  });

export const RegisterPage = () => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema)
  });
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const toastError = useApiErrorToast();
  const { login: loginGoogle, isLoading: isGoogleLoading } = useOAuth('google');

  const cardBg = useColorModeValue('white', 'gray.800');
  const textSecondary = useColorModeValue('gray.600', 'gray.400');
  const heroBg = useColorModeValue(
    'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
    'linear-gradient(135deg, #4F46E5 0%, #4338CA 100%)'
  );

  const onSubmit = useCallback(
    async (values: RegisterFormValues) => {
      try {
        await registerUser(values.email, values.password);
        // After registration, redirect to verification notice
        navigate('/resend-verification', { 
          replace: true,
          state: { email: values.email, justRegistered: true }
        });
      } catch (error) {
        toastError(error);
      }
    },
    [navigate, registerUser, toastError]
  );

  return (
    <Box minH="100vh" display="flex" alignItems="center" position="relative" overflow="hidden">
      {/* Background Gradient Orbs */}
      <Box
        position="absolute"
        top="-20%"
        left="-10%"
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
        right="-10%"
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
            <Icon as={FaUserPlus} boxSize={12} color="brand.500" mx="auto" />
            <Heading size="xl" bgGradient="linear(to-r, brand.500, brand.600)" bgClip="text">
              Create your account
            </Heading>
            <Text color={textSecondary} fontSize="lg">
              Shop securely with instant access to your orders
            </Text>
          </Stack>

          {/* Register Card */}
          <Card shadow="xl" borderRadius="2xl" bg={cardBg} border="1px" borderColor={useColorModeValue('gray.200', 'gray.700')}>
            <CardBody p={8}>
              <Stack spacing={6}>
                {/* Google Sign-Up Button */}
                <Button
                  leftIcon={<Icon as={FaGoogle} />}
                  onClick={loginGoogle}
                  isLoading={isGoogleLoading}
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
                    or register with email
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

                  <FormControl isInvalid={Boolean(errors.confirmPassword)}>
                    <FormLabel fontWeight="semibold">Confirm Password</FormLabel>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      size="lg"
                      {...register('confirmPassword')}
                    />
                    <FormErrorMessage>{errors.confirmPassword?.message}</FormErrorMessage>
                  </FormControl>

                  <Button
                    type="submit"
                    colorScheme="brand"
                    size="lg"
                    isLoading={isSubmitting}
                    width="full"
                  >
                    Create Account
                  </Button>
                </Stack>
              </Stack>
            </CardBody>
          </Card>

          {/* Footer */}
          <Box textAlign="center" mt={6}>
            <Text color={textSecondary}>
              Already have an account?{' '}
              <Button
                as={RouterLink}
                to="/login"
                variant="link"
                colorScheme="brand"
                fontWeight="bold"
              >
                Sign in
              </Button>
            </Text>
          </Box>
        </MotionBox>
      </Container>
    </Box>
  );
};
