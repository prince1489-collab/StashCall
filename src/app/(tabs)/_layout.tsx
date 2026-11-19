import { Tabs } from 'expo-router';
import { View } from 'react-native';
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
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="trip" options={{ title: 'Trip' }} />
      <Tabs.Screen name="items" options={{ title: 'Items' }} />
    </Tabs>
  );
}
