// Local SQLite fallback - disabled due to native build issues on Windows
// This file is kept for future use when better-sqlite3 can be installed properly
// or when an alternative pure-JS SQLite library is available

export const LOCAL_DB_AVAILABLE = false;

// Re-export empty stubs so imports don't break
export function getLocalDatabase(): never {
  throw new Error('Local SQLite is not available. Please use Supabase.');
}

export function initializeLocalDatabase(): void {
  // No-op
}

export function isLocalDatabaseAvailable(): boolean {
  return false;
}
