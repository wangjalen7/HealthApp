import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Never downgrade native credentials to unencrypted application storage.
// The browser preview has no Keychain and is not the native release target.
const canUseSecureStore = Platform.OS !== 'web';

export const secureStoreAdapter = {
  getItem: async (key: string) => {
    if (!canUseSecureStore) return AsyncStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  setItem: async (key: string, value: string) => {
    if (!canUseSecureStore) return AsyncStorage.setItem(key, value);
    await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    await AsyncStorage.removeItem(key);
  },
  removeItem: async (key: string) => {
    if (!canUseSecureStore) return AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
    await AsyncStorage.removeItem(key);
  },
};
