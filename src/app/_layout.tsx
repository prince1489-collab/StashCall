import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope/800ExtraBold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ShareIntentProvider } from 'expo-share-intent';
import { StatusBar } from 'expo-status-bar';

import { NotificationActions } from '../reminders/NotificationActions';
import { RemindersProvider } from '../reminders/Reminders';
import { configureNotifications } from '../reminders/schedule';
import { ShareInbox } from '../share/ShareInbox';
import { LandingFiller } from '../tickets/LandingFiller';
import { AppDataProvider } from '../state/AppData';
import { SyncProvider } from '../sync/SyncProvider';
import { colors, fonts } from '../ui/theme';

configureNotifications();
// Keep the navy splash up until the fonts are ready, so text never jumps.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, failed] = useFonts({ Manrope_700Bold, Manrope_800ExtraBold });
  const ready = loaded || !!failed;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return null;

  return (
    <ShareIntentProvider>
      <AppDataProvider>
        <SyncProvider>
          <RemindersProvider>
            <NotificationActions />
            <ShareInbox />
            <LandingFiller />
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                contentStyle: { backgroundColor: colors.bg },
                headerTintColor: colors.accent,
                headerStyle: { backgroundColor: colors.bg },
                headerShadowVisible: false,
                headerTitleStyle: { fontFamily: fonts.bold },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="trip/edit" options={{ presentation: 'modal', title: 'Trip' }} />
              <Stack.Screen name="item/edit" options={{ presentation: 'modal', title: 'Item' }} />
              <Stack.Screen name="settings" options={{ title: 'Settings' }} />
              <Stack.Screen name="people" options={{ title: 'People' }} />
              <Stack.Screen name="household" options={{ title: 'Family sharing' }} />
              <Stack.Screen name="driver-message" options={{ title: 'Driver message' }} />
              <Stack.Screen name="place" options={{ title: 'Pin on the map' }} />
              <Stack.Screen name="checkin" options={{ title: 'Check in' }} />
              <Stack.Screen name="join" options={{ headerShown: false }} />
            </Stack>
          </RemindersProvider>
        </SyncProvider>
      </AppDataProvider>
    </ShareIntentProvider>
  );
}
