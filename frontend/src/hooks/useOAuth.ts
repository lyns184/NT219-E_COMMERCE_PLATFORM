import { useCallback, useState } from 'react';

export const useOAuth = (provider: 'google' | 'github' | 'discord' | 'oauth2') => {
  const [isLoading, setIsLoading] = useState(false);

  const login = useCallback(() => {
    setIsLoading(true);
    const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';
    
    // Map provider to correct endpoint
    const endpoint = provider === 'google' 
      ? '/auth/google' 
      : `/oauth/${provider}`;
    
    window.location.href = `${apiUrl}${endpoint}`;
  }, [provider]);

  return { login, isLoading };
};
