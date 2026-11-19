import { Tabs, router } from 'expo-router';
import { Text, View } from 'react-native';
import type { ColorValue } from 'react-native';

import { colors } from '../../ui/theme';

// Simple dot icons for the tester build; proper icons come with polish.
const dot = ({ color, focused }: { color: ColorValue; focused: boolean }) => (
  <View style={{ width: focused ? 10 : 8, height: focused ? 10 : 8, borderRadius: 5, backgroundColor: color }} />
);

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarIcon: dot,
        sceneStyle: { backgroundColor: colors.bg },
        headerRight: () => (
          <Text
            onPress={() => router.push('/settings')}
            style={{ color: colors.accent, fontSize: 16, fontWeight: '600', paddingHorizontal: 16 }}
            accessibilityRole="button"
          >
            Settings
          </Text>
        ),
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="trip" options={{ title: 'Trip' }} />
      <Tabs.Screen name="items" options={{ title: 'Items' }} />
    </Tabs>
  );
}
