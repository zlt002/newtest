export type CliProvider = 'claude';

export type ProviderAuthStatus = {
  authenticated: boolean;
  email: string | null;
  loading: boolean;
  error: string | null;
};

export type ProviderStatusMap = Record<CliProvider, ProviderAuthStatus>;
