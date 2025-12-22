import { Button, Icon } from '@chakra-ui/react';
import { FaKey } from 'react-icons/fa';
import { useOAuth } from '../hooks/useOAuth';

interface OAuth2ButtonProps {
  provider?: string;
  label?: string;
}

export const OAuth2Button = ({ provider = 'OAuth2', label }: OAuth2ButtonProps) => {
  const { login, isLoading } = useOAuth('oauth2');

  return (
    <Button
      width="100%"
      leftIcon={<Icon as={FaKey} />}
      onClick={login}
      isLoading={isLoading}
      variant="outline"
      colorScheme="purple"
      size="lg"
    >
      {label || `Sign in with ${provider}`}
    </Button>
  );
};
