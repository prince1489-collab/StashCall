import { Tabs, router } from 'expo-router';
import { Text } from 'react-native';
import type { ColorValue } from 'react-native';

import { colors } from '../../ui/theme';

// Text-glyph icons for the tester build, tinted like the labels.
const glyph =
  (g: string) =>
  ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Text style={{ color, fontSize: focused ? 22 : 20, lineHeight: 24 }}>{g}</Text>
  );

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
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
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: glyph('◉') }} />
      <Tabs.Screen name="trip" options={{ title: 'Trip', tabBarIcon: glyph('✈\uFE0E') }} />
      <Tabs.Screen name="items" options={{ title: 'Items', tabBarIcon: glyph('☰') }} />
    </Tabs>
  );
}
