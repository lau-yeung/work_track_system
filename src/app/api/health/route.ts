import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const startTime = Date.now();
    const client = getSupabaseClient();

    // Query the health_check table to keep database active
    const { data, error } = await client
      .from('health_check')
      .select('id, updated_at')
      .order('id', { ascending: false })
      .limit(1);

    const responseTime = Date.now() - startTime;

    if (error) {
      return NextResponse.json({
        status: 'degraded',
        database: 'supabase',
        message: `查询异常: ${error.message}`,
        responseTime: `${responseTime}ms`,
        timestamp: new Date().toISOString(),
      }, { status: 200 });
    }

    // If table doesn't exist yet, try a simple query to verify connection
    if (!data || data.length === 0) {
      try {
        const { data: userCount, error: countError } = await client
          .from('users')
          .select('id', { count: 'exact', head: true });
        
        if (!countError) {
          return NextResponse.json({
            status: 'healthy',
            database: 'supabase',
            message: '数据库连接正常',
            tables: {
              health_check: data?.length || 0,
            },
            responseTime: `${responseTime}ms`,
            timestamp: new Date().toISOString(),
          });
        }
      } catch {
        // Tables might not exist yet
      }
    }

    return NextResponse.json({
      status: 'healthy',
      database: 'supabase',
      message: '数据库连接正常',
      lastCheck: data?.[0]?.updated_at || 'N/A',
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({
      status: 'unhealthy',
      database: 'supabase',
      message: `连接失败: ${message}`,
      timestamp: new Date().toISOString(),
    }, { status: 503 });
  }
}

/**
 * POST endpoint - forces a write operation to prevent database pause
 * This should be called periodically (every 24 hours) to keep the database active
 */
export async function POST() {
  try {
    const client = getSupabaseClient();
    const now = new Date().toISOString();

    // Insert a heartbeat record to keep database active
    const { data, error } = await client
      .from('health_check')
      .insert({ updated_at: now })
      .select();

    if (error) {
      // If table doesn't exist, try to create it via RPC or just do a simple select
      const { data: testData, error: testError } = await client
        .from('users')
        .select('id', { count: 'exact', head: true });
      
      if (testError) {
        return NextResponse.json({
          status: 'error',
          message: `心跳写入失败: ${error.message}, 备用查询也失败: ${testError.message}`,
        }, { status: 500 });
      }

      return NextResponse.json({
        status: 'partial',
        message: `心跳记录写入失败（表可能不存在），但数据库连接正常`,
        error: error.message,
      });
    }

    // Clean old records (keep only last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    try {
      await client
        .from('health_check')
        .delete()
        .lt('updated_at', thirtyDaysAgo);
    } catch {
      // Ignore cleanup errors
    }

    return NextResponse.json({
      status: 'healthy',
      message: '心跳成功，数据库保持活跃',
      heartbeatId: data?.[0]?.id,
      timestamp: now,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({
      status: 'error',
      message: `心跳失败: ${message}`,
    }, { status: 500 });
  }
}
