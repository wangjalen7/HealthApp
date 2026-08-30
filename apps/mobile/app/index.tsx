import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../src/features/auth/auth-provider';

export default function Index() {
  const { configured, loading, session } = useAuth();
  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
  return <Redirect href={configured && session ? '/(app)' : '/(auth)/sign-in'} />;
}
