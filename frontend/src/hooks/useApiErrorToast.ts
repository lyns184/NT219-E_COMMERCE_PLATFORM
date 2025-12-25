import { useToast } from '@chakra-ui/react';
import { AxiosError } from 'axios';
import { useCallback } from 'react';
import type { ApiError } from '../types/api';

export const useApiErrorToast = () => {
  const toast = useToast();

  return useCallback(
    (error: unknown, fallbackTitle = 'Error') => {
      let title = fallbackTitle;
      let description: string | undefined;

      if (error && typeof error === 'object') {
        // Try to extract detailed message from API response
        if ('response' in error) {
          const axiosError = error as AxiosError<ApiError>;
          const apiData = axiosError.response?.data;
          const apiMessage = apiData?.message;
          const apiDetails = typeof apiData?.details === 'string' ? apiData.details : undefined;

          if (apiMessage) {
            title = apiMessage;
            description = apiDetails;
          }
        }
        // Fallback to error.message if available
        else if ('message' in error && typeof (error as Error).message === 'string') {
          const errorMessage = (error as Error).message;
          if (errorMessage && errorMessage !== fallbackTitle) {
            title = errorMessage;
            description = undefined;
          }
        }
      }

      const toastId = `error-${title.substring(0, 30)}`;
      
      // Prevent duplicate error toasts
      if (!toast.isActive(toastId)) {
        toast({ 
          id: toastId,
          title, 
          description,
          status: 'error', 
          duration: 6000, 
          position: 'top',
          isClosable: true
        });
      }
    },
    [toast]
  );
};
