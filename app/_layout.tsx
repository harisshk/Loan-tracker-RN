import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { registerForPushNotificationsAsync } from '../utils/notifications';

export default function RootLayout() {
  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0a0a0a' },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="loans" />
        <Stack.Screen name="add-loan" />
        <Stack.Screen name="edit-loan" />
        <Stack.Screen name="history" />
        <Stack.Screen name="loan-detail" />
        <Stack.Screen name="amortization" />
        <Stack.Screen name="sync" />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}
