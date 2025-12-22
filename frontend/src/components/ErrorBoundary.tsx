import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Box, Button, Container, Heading, Text, VStack } from '@chakra-ui/react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <Container maxW="md" py={20}>
          <VStack spacing={6} textAlign="center">
            <Box fontSize="6xl">😵</Box>
            <Heading size="lg">Oops! Something went wrong</Heading>
            <Text color="gray.600">
              We're sorry, but something unexpected happened. Please try refreshing the page.
            </Text>
            {import.meta.env.DEV && this.state.error && (
              <Box
                p={4}
                bg="red.50"
                borderRadius="md"
                fontSize="sm"
                textAlign="left"
                w="full"
                maxH="200px"
                overflowY="auto"
              >
                <Text fontWeight="bold" color="red.600" mb={2}>
                  Error Details:
                </Text>
                <Text fontFamily="mono" color="red.700">
                  {this.state.error.message}
                </Text>
              </Box>
            )}
            <Button colorScheme="brand" onClick={this.handleReset}>
              Go to Home
            </Button>
          </VStack>
        </Container>
      );
    }

    return this.props.children;
  }
}
