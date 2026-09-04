import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * React Native reports `'unspecified'` when the platform has no preference;
 * this app treats that as light, so consumers only ever see 'light' | 'dark'.
 */
export function useColorScheme(): 'light' | 'dark' {
  return useRNColorScheme() === 'dark' ? 'dark' : 'light';
}
