import { useEffect, useState } from 'react';

export function useSelectedProvider() {
  const [provider, setProvider] = useState('claude');

  useEffect(() => {
    setProvider('claude');
    return undefined;
  }, []);

  return provider;
}
