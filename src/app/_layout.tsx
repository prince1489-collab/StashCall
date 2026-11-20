import { Stack } from 'expo-router';
import { ShareIntentProvider } from 'expo-share-intent';
import { StatusBar } from 'expo-status-bar';

import { NotificationActions } from '../reminders/NotificationActions';
import { RemindersProvider } from '../reminders/Reminders';
import { configureNotifications } from '../reminders/schedule';
import { ShareInbox } from '../share/ShareInbox';
import { AppDataProvider } from '../state/AppData';
import { colors } from '../ui/theme';

configureNotifications();

export default function RootLayout() {
  return (
    <ShareIntentProvider>
      <AppDataProvider>
        <RemindersProvider>
          <NotificationActions />
          <ShareInbox />
          <StatusBar style="dark" />
          <Stack screenOptions={{ contentStyle: { backgroundColor: colors.bg }, headerTintColor: colors.accent }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="trip/edit" options={{ presentation: 'modal', title: 'Trip' }} />
            <Stack.Screen name="item/edit" options={{ presentation: 'modal', title: 'Item' }} />
            <Stack.Screen name="settings" options={{ title: 'Settings' }} />
          </Stack>
        </RemindersProvider>
      </AppDataProvider>
    </ShareIntentProvider>
  );
}
