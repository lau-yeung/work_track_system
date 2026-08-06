/**
 * Database table auto-initialization for AI features
 * Uses raw pg client to execute DDL when tables don't exist yet.
 */

import { Client } from 'pg';

const CREATE_WORK_SUMMARIES_SQL = `
CREATE TABLE IF NOT EXISTS work_summaries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  dimension VARCHAR(20) NOT NULL CHECK (dimension IN ('week', 'last_week', 'month', 'last_month', 'year', 'last_year', 'custom')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  summary_content TEXT NOT NULL,
  used_external_ai BOOLEAN DEFAULT FALSE,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, project_id, dimension, period_start)
);

CREATE INDEX IF NOT EXISTS idx_work_summaries_user ON work_summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_work_summaries_period ON work_summaries(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_work_summaries_dimension ON work_summaries(dimension);
`;

/**
 * SQL to update existing table's CHECK constraint (for upgrades)
 */
export const ALTER_DIMENSION_CHECK_SQL = `
ALTER TABLE work_summaries 
  DROP CONSTRAINT IF EXISTS work_summaries_dimension_check;
  
ALTER TABLE work_summaries 
  ADD CONSTRAINT work_summaries_dimension_check 
  CHECK (dimension IN ('week', 'last_week', 'month', 'last_month', 'year', 'last_year', 'custom'));
`;

/**
 * SQL to add used_external_ai column to existing table
 */
export const ALTER_ADD_USED_EXTERNAL_AI_SQL = `
ALTER TABLE work_summaries 
  ADD COLUMN IF NOT EXISTS used_external_ai BOOLEAN DEFAULT FALSE;
`;

let initialized = false;

/**
 * Ensure the AI-related tables exist. Uses pg directly since
 * Supabase JS client doesn't support DDL statements.
 * Tries multiple connection methods in order.
 */
export async function ensureAITables(): Promise<void> {
  if (initialized) return;

  // Try DATABASE_URL first (set in .env.local or production env)
  let connectionString = process.env.DATABASE_URL;
  
  // Fallback: derive from Supabase URL + service role key
  if (!connectionString) {
    const supabaseUrl = process.env.COZE_SUPABASE_URL;
    const serviceKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && serviceKey) {
      // Extract project ref from URL: https://<project-ref>.supabase.co/
      const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
      if (match) {
        const projectRef = match[1];
        // Use Supabase's direct Postgres connection
        connectionString = `postgresql://postgres.${projectRef}:${serviceKey}@db.${projectRef}.supabase.co:5432/postgres`;
      }
    }
  }

  if (!connectionString) {
    console.warn('No database connection available, cannot auto-create work_summaries table');
    console.warn('Set DATABASE_URL environment variable or ensure Supabase connection is configured');
    return;
  }

  try {
    const client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });

    await client.connect();
    await client.query(CREATE_WORK_SUMMARIES_SQL);
    // Add used_external_ai column to existing table if not exists
    await client.query(ALTER_ADD_USED_EXTERNAL_AI_SQL);
    await client.end();

    initialized = true;
    console.log('work_summaries table initialized successfully');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Failed to initialize work_summaries table:', msg);
    console.warn('Please create the table manually in Supabase SQL Editor with:');
    console.warn(CREATE_WORK_SUMMARIES_SQL);
  }
}