import { Redirect, Tabs } from 'expo-router';

import { useAuth } from '../../src/features/auth/auth-provider';

export default function AppLayout() {
  const { session } = useAuth();
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  return <Tabs screenOptions={{ headerShadowVisible: false, tabBarActiveTintColor: '#16776A' }}>
    <Tabs.Screen name="index" options={{ title: 'Summary' }} />
    <Tabs.Screen name="track" options={{ title: 'Health Log' }} />
    <Tabs.Screen name="workout" options={{ title: 'Exercise' }} />
    <Tabs.Screen name="history" options={{ title: 'History' }} />
    <Tabs.Screen name="history/[id]" options={{ href: null, title: 'Edit workout' }} />
    <Tabs.Screen name="nutrition" options={{ title: 'Food' }} />
    <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
  </Tabs>;
}
