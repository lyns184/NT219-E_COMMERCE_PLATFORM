import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useToast } from '@chakra-ui/react';
import { apiClient } from '../../api/client';
import { ensureAccessToken, setAccessToken, signOut as signOutSession, clearAccessToken } from './session';
import { login as apiLogin, register as apiRegister, logout as apiLogout } from './api';
import type { AuthResponse, AuthUser, ApiSuccess, ApiError, EmailVerificationRequiredResponse, TwoFactorRequiredResponse } from '../../types/api';

interface AuthContextState {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthResponse | EmailVerificationRequiredResponse | TwoFactorRequiredResponse>;
  register: (email: string, password: string) => Promise<void>;
  refreshMe: () => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (role: 'admin' | 'user') => boolean;
  setAccessToken: (token: string) => void;
}

const AuthContext = createContext<AuthContextState | undefined>(undefined);

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const toast = useToast();

  const showError = useCallback(
    (message: string) => {
      toast({ title: message, status: 'error', duration: 5000, position: 'top' });
    },
    [toast]
  );

  const refreshMe = useCallback(async () => {
    try {
      const response = await apiClient.get<ApiSuccess<{ user: AuthUser }>>('/auth/me');
      setUser(response.data.data.user);
    } catch (error) {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    
    const bootstrap = async () => {
      try {
        try {
          await ensureAccessToken();
        } catch {
          // Ignore missing/expired session; refreshMe will reconcile state.
        }
        if (!cancelled) {
          await refreshMe();
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    
    bootstrap();
    
    return () => {
      cancelled = true;
    };
  }, [refreshMe]);

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const result = await apiLogin(email, password);
        
        // Check if email verification is required
        if ('requiresEmailVerification' in result) {
          return result; // Return email verification response to caller
        }
        
        // Check if 2FA is required
        if ('requiresTwoFactor' in result) {
          return result; // Return 2FA response to caller
        }
        
        // Normal login - set token and user
        setAccessToken(result.tokens.accessToken);
        setUser(result.user);
        return result;
      } catch (error) {
        const message = (error as { response?: { data?: ApiError } }).response?.data?.message ?? 'Login failed';
        showError(message);
        throw error;
      }
    },
    [showError, toast]
  );

  const register = useCallback(
    async (email: string, password: string) => {
      try {
        const result = await apiRegister(email, password);
        // Don't set user or token - email verification required
        toast({ 
          title: 'Registration successful!', 
          description: result.message,
          status: 'success', 
          duration: 8000, 
          position: 'top',
          isClosable: true
        });
      } catch (error) {
        const message = (error as { response?: { data?: ApiError } }).response?.data?.message ?? 'Registration failed';
        showError(message);
        throw error;
      }
    },
    [showError, toast]
  );

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('Failed to logout', error);
      }
    } finally {
      clearAccessToken();
      setUser(null);
    }
  }, []);

  const hasRole = useCallback(
    (role: 'admin' | 'user') => {
      if (!user) return false;
      if (role === 'user') return true;
      return user.role === 'admin';
    },
    [user]
  );

  const handleSetAccessToken = useCallback(
    async (token: string) => {
      setAccessToken(token);
      // Fetch user info after setting token
      await refreshMe();
    },
    [refreshMe]
  );

  const value = useMemo(
    () => ({ user, isLoading, login, register, refreshMe, logout, hasRole, setAccessToken: handleSetAccessToken }),
    [user, isLoading, login, register, refreshMe, logout, hasRole, handleSetAccessToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
