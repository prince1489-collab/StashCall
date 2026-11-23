import { Tabs, router } from 'expo-router';
import { Text } from 'react-native';

import { ClockIcon, PlaneIcon, PocketIcon } from '../../ui/Icons';
import { colors, fonts } from '../../ui/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        sceneStyle: { backgroundColor: colors.bg },
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
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
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: ClockIcon }} />
      <Tabs.Screen name="trip" options={{ title: 'Trip', tabBarIcon: PlaneIcon }} />
      <Tabs.Screen name="items" options={{ title: 'Items', tabBarIcon: PocketIcon }} />
    </Tabs>
  );
}
