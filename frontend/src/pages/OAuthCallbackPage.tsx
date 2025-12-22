import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Spinner, Text, Alert, AlertIcon, AlertDescription, useColorModeValue } from '@chakra-ui/react';
import { useAuth } from '../features/auth/AuthProvider';

/**
 * OAuth Callback Handler Page
 * Receives access token from OAuth callback and stores it
 * Then redirects to appropriate page
 */
export const OAuthCallbackPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setAccessToken } = useAuth();
  const textSecondary = useColorModeValue('gray.600', 'gray.400');

  useEffect(() => {
    let cancelled = false;
    
    const handleCallback = async () => {
      // Get access token from URL
      const token = searchParams.get('token');
      const error = searchParams.get('error');

      if (error) {
        // Handle error
        if (import.meta.env.DEV) {
          console.error('OAuth error:', error);
        }
        setTimeout(() => {
          if (!cancelled) {
            navigate('/login', { 
              state: { error: getErrorMessage(error) } 
            });
          }
        }, 2000);
        return;
      }

      if (!token) {
        if (import.meta.env.DEV) {
          console.error('No token received from OAuth callback');
        }
        setTimeout(() => {
          if (!cancelled) {
            navigate('/login', { 
              state: { error: 'Authentication failed. Please try again.' } 
            });
          }
        }, 2000);
        return;
      }

      // Store access token in memory (via AuthProvider)
      setAccessToken(token);

      // Redirect to products page
      setTimeout(() => {
        if (!cancelled) {
          navigate('/products', { replace: true });
        }
      }, 1000);
    };

    handleCallback();
    
    return () => {
      cancelled = true;
    };
  }, [searchParams, navigate, setAccessToken]);

  const error = searchParams.get('error');

  if (error) {
    return (
      <Box 
        display="flex" 
        justifyContent="center" 
        alignItems="center" 
        minHeight="100vh"
        p={4}
      >
        <Alert
          status="error"
          variant="subtle"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          textAlign="center"
          borderRadius="lg"
          maxWidth="md"
          p={8}
        >
          <AlertIcon boxSize="40px" mr={0} />
          <AlertDescription mt={4} fontSize="lg">
            {getErrorMessage(error)}
          </AlertDescription>
          <Text mt={2} fontSize="sm" color={textSecondary}>
            Redirecting to login page...
          </Text>
        </Alert>
      </Box>
    );
  }

  return (
    <Box 
      display="flex" 
      flexDirection="column"
      justifyContent="center" 
      alignItems="center" 
      minHeight="100vh"
      gap={4}
    >
      <Spinner size="xl" color="brand.500" thickness="4px" />
      <Text fontSize="lg" color={textSecondary}>
        Completing authentication...
      </Text>
    </Box>
  );
};

function getErrorMessage(error: string): string {
  const errorMessages: Record<string, string> = {
    'auth_failed': 'Authentication failed. Please try again.',
    'oauth_failed': 'Failed to authenticate with Google. Please try again.',
    'server_error': 'Server error occurred. Please try again later.',
  };

  return errorMessages[error] || 'An unexpected error occurred. Please try again.';
}
