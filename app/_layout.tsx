import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { registerForPushNotificationsAsync } from '../utils/notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = await AsyncStorage.getItem('@auth_user');
        setIsAuthenticated(!!user);
      } catch (e) {
        setIsAuthenticated(false);
      } finally {
        setIsReady(true);
      }
    };
    checkAuth();
  }, [segments]);

  useEffect(() => {
    if (!isReady) return;

    const inAuthGroup = segments[0] === 'login';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isReady, isAuthenticated, segments]);

  return (
    <SafeAreaProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#f8fafc' },
        }}
      >
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="loans" />
        <Stack.Screen name="insurances" />
        <Stack.Screen name="add-loan" />
        <Stack.Screen name="add-insurance" />
        <Stack.Screen name="edit-insurance" />
        <Stack.Screen name="edit-loan" />
        <Stack.Screen name="history" />
        <Stack.Screen name="loan-detail" />
        <Stack.Screen name="amortization" />
        <Stack.Screen name="sync" />
        <Stack.Screen name="financial-plan" />
        <Stack.Screen name="maturity-alerts" />
        <Stack.Screen name="debt-free" />
        <Stack.Screen name="compare-loans" />
        <Stack.Screen name="add-transaction" />
      </Stack>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
