import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../../../utils/api';
import { AUTH_ERROR_MESSAGES } from '../constants';
import type {
  AuthContextValue,
  AuthProviderProps,
  AuthUser,
  OnboardingStatusPayload,
} from '../types';
import { parseJsonSafely } from '../utils';

const AuthContext = createContext<AuthContextValue | null>(null);
const LOCAL_USER: AuthUser = { id: 1, username: 'local' };

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkOnboardingStatus = useCallback(async () => {
    try {
      const response = await api.user.onboardingStatus();
      if (!response.ok) {
        return;
      }

      const payload = await parseJsonSafely<OnboardingStatusPayload>(response);
      setHasCompletedOnboarding(Boolean(payload?.hasCompletedOnboarding));
    } catch (caughtError) {
      console.error('Error checking onboarding status:', caughtError);
      // Fail open to avoid blocking access on transient onboarding status errors.
      setHasCompletedOnboarding(true);
    }
  }, []);

  const refreshOnboardingStatus = useCallback(async () => {
    await checkOnboardingStatus();
  }, [checkOnboardingStatus]);

  useEffect(() => {
    void checkOnboardingStatus();
  }, [checkOnboardingStatus]);

  const login = useCallback<AuthContextValue['login']>(async () => {
    try {
      setError(null);
      await checkOnboardingStatus();
      return { success: true };
    } catch (caughtError) {
      console.error('Login error:', caughtError);
      setError(AUTH_ERROR_MESSAGES.networkError);
      return { success: false, error: AUTH_ERROR_MESSAGES.networkError };
    }
  }, [checkOnboardingStatus]);

  const register = useCallback<AuthContextValue['register']>(async () => {
    try {
      setError(null);
      await checkOnboardingStatus();
      return { success: true };
    } catch (caughtError) {
      console.error('Registration error:', caughtError);
      setError(AUTH_ERROR_MESSAGES.networkError);
      return { success: false, error: AUTH_ERROR_MESSAGES.networkError };
    }
  }, [checkOnboardingStatus]);

  const logout = useCallback(() => {
    // No-op in local mode
  }, []);

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      user: LOCAL_USER,
      token: null,
      isLoading: false,
      needsSetup: false,
      hasCompletedOnboarding,
      error,
      login,
      register,
      logout,
      refreshOnboardingStatus,
    }),
    [error, hasCompletedOnboarding, login, logout, refreshOnboardingStatus, register],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
