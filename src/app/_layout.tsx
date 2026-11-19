import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppDataProvider } from '../state/AppData';
import { colors } from '../ui/theme';

export default function RootLayout() {
  return (
    <AppDataProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ contentStyle: { backgroundColor: colors.bg }, headerTintColor: colors.accent }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="trip/edit" options={{ presentation: 'modal', title: 'Trip' }} />
      </Stack>
    </AppDataProvider>
  );
}
