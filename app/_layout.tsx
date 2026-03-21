import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { registerForPushNotificationsAsync } from '../utils/notifications';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RootLayout() {
  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#f8fafc' },
        }}
      >
        <Stack.Screen name="index" />
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
      </Stack>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}
