import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Browsers have no SecureStore equivalent. Native devices use the encrypted
// platform store; the fallback also handles an unavailable Expo Go bridge.
const canUseSecureStore = Platform.OS !== 'web' && typeof SecureStore.getItemAsync === 'function';

export const secureStoreAdapter = {
  getItem: async (key: string) => {
    if (!canUseSecureStore) return AsyncStorage.getItem(key);
    try { return await SecureStore.getItemAsync(key); } catch { return AsyncStorage.getItem(key); }
  },
  setItem: async (key: string, value: string) => {
    if (!canUseSecureStore) return AsyncStorage.setItem(key, value);
    try { await SecureStore.setItemAsync(key, value); } catch { await AsyncStorage.setItem(key, value); }
  },
  removeItem: async (key: string) => {
    if (!canUseSecureStore) return AsyncStorage.removeItem(key);
    try { await SecureStore.deleteItemAsync(key); } catch { await AsyncStorage.removeItem(key); }
  },
};
