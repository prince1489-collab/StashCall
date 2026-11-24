import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

/**
 * The Supabase project behind family sharing. Its address and public key
 * live in app.json (extra.supabaseUrl, extra.supabaseAnonKey); the public
 * key is meant to ship inside the app, and row-level security on the
 * server keeps each household's records to its own members.
 */
const extra = (Constants.expoConfig?.extra ?? {}) as { supabaseUrl?: string; supabaseAnonKey?: string };

export const SHARING_SET_UP = !!(extra.supabaseUrl && extra.supabaseAnonKey);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!SHARING_SET_UP) return null;
  client ??= createClient(extra.supabaseUrl!, extra.supabaseAnonKey!, {
    auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

/**
 * Signs this phone in without an email or password. The account only
 * links this phone to its household; the invite code is what grants access.
 */
export async function ensureSignedIn(sb: SupabaseClient): Promise<void> {
  const { data } = await sb.auth.getSession();
  if (data.session) return;
  const { error } = await sb.auth.signInAnonymously();
  if (error) throw error;
}
