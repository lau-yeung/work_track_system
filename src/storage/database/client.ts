import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getLocalDatabase, initializeLocalDatabase } from './local-sqlite';
import { verifyPassword as verifyLocalPassword, hashPassword as hashLocalPassword } from '@/lib/auth';

let supabaseClient: SupabaseClient | null = null;
let useLocalFallback = false;

interface SupabaseCredentials {
  url: string;
  anonKey: string;
}

function getSupabaseCredentials(): SupabaseCredentials | null {
  const url = process.env.COZE_SUPABASE_URL;
  const anonKey = process.env.COZE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.warn('[DB] Supabase credentials not found, using local SQLite fallback');
    return null;
  }

  return { url, anonKey };
}

function createSupabaseClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    db: {
      timeout: 30000,
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getClient(): SupabaseClient | null {
  if (useLocalFallback) return null;
  if (supabaseClient) return supabaseClient;

  const credentials = getSupabaseCredentials();
  if (!credentials) {
    useLocalFallback = true;
    return null;
  }

  supabaseClient = createSupabaseClient(credentials.url, credentials.anonKey);
  return supabaseClient;
}

/**
 * Check if Supabase is available, fallback to local SQLite if not
 */
export async function ensureDatabaseAvailable(): Promise<'supabase' | 'local'> {
  const client = getClient();
  
  if (!client) {
    initializeLocalDatabase();
    return 'local';
  }

  try {
    // Test connection
    const { error } = await client
      .from('health_check')
      .select('id', { count: 'exact', head: true });

    if (error) {
      console.warn('[DB] Supabase connection failed:', error.message);
      console.warn('[DB] Switching to local SQLite fallback...');
      useLocalFallback = true;
      initializeLocalDatabase();
      return 'local';
    }

    useLocalFallback = false;
    return 'supabase';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('fetch failed') || message.includes('Failed to fetch') || message.includes('network')) {
      console.warn('[DB] Supabase network error, switching to local SQLite...');
      useLocalFallback = true;
      initializeLocalDatabase();
      return 'local';
    }
    throw err;
  }
}

/**
 * Check current database mode
 */
export function getDatabaseMode(): 'supabase' | 'local' {
  return useLocalFallback ? 'local' : 'supabase';
}

/**
 * Reset to Supabase (call after Supabase is back online)
 */
export function resetToSupabase(): boolean {
  const credentials = getSupabaseCredentials();
  if (!credentials) return false;
  
  useLocalFallback = false;
  supabaseClient = createSupabaseClient(credentials.url, credentials.anonKey);
  return true;
}

export { getClient as getSupabaseClient };
