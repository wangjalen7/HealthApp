import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

import { supabaseConfig } from './config';
import { secureStoreAdapter } from './secure-store';

export const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
  auth: {
    storage: secureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
