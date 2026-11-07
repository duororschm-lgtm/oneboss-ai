/**
 * 管理员平台只读接口。
 *
 * 与 /api/[...path] 并存：静态段 admin 优先于 catch-all，所以 /api/admin/* 走这里。
 * 安全边界：
 * - 每个请求都先 authenticate()，再用 platformAdmin() 校验平台管理员；
 * - 只读，不提供任何改状态的入口（收款/退款仍走既有 commerce 接口）；
 * - 不落任何业务写操作，因此不需要幂等键。
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { authenticate } from '../../../../lib/security/auth';
import { transaction } from '../../../../lib/core/db';
import { AppError, assert } from '../../../../lib/core/errors';
import * as service from '../../../../lib/core/service';
import * as admin from '../../../../lib/admin/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const response = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const requestId = randomUUID();
  try {
    const path = (await context.params).path;
    const route = path.join('/');
    const url = new URL(request.url);
    const query = url.searchParams;

    assert(request.method === 'GET', 'METHOD_NOT_ALLOWED', 405);

    const actor = await authenticate(request);
    await service.rateLimit(actor);

    const data = await transaction(actor, async (tx) => {
      if (route === 'dashboard') return admin.overview(tx, actor);

      if (route === 'revenue') {
        const from = dateOnly.parse(query.get('from'));
        const to = dateOnly.parse(query.get('to'));
        const groupBy = z.enum(['day', 'week', 'month']).parse(query.get('groupBy') ?? 'day');
        return admin.revenue(tx, actor, from, to, groupBy);
      }

      if (route === 'orders') {
        return admin.orders(tx, actor, {
          ...admin.paging(query.get('page') ?? undefined, query.get('pageSize') ?? undefined),
          keyword: query.get('keyword') ?? undefined,
          payState: query.get('payState') ?? undefined,
          from: query.get('from') ?? undefined,
          to: query.get('to') ?? undefined,
        });
      }

      if (path[0] === 'orders' && path[1] && path.length === 2)
        return admin.orderDetail(tx, actor, path[1]);

      if (route === 'approvals') return admin.approvals(tx, actor);

      if (route === 'agents/runs')
        return admin.agentRuns(tx, actor, {
          ...admin.paging(query.get('page') ?? undefined, query.get('pageSize') ?? undefined),
          status: query.get('status') ?? undefined,
          role: query.get('role') ?? undefined,
        });

      if (route === 'works/reviews')
        return admin.workReviews(
          tx,
          actor,
          admin.paging(query.get('page') ?? undefined, query.get('pageSize') ?? undefined),
        );

      if (route === 'customers')
        return admin.customers(tx, actor, {
          ...admin.paging(query.get('page') ?? undefined, query.get('pageSize') ?? undefined),
          keyword: query.get('keyword') ?? undefined,
        });

      if (route === 'audit-logs')
        return admin.auditLogs(
          tx,
          actor,
          admin.paging(query.get('page') ?? undefined, query.get('pageSize') ?? undefined),
        );

      throw new AppError('NOT_FOUND', 404);
    });

    return response(data);
  } catch (error) {
    if (error instanceof z.ZodError)
      return response(
        {
          error: {
            code: 'VALIDATION_FAILED',
            fields: error.issues.map((issue) => issue.path.join('.')),
            requestId,
          },
        },
        400,
      );
    if (error instanceof AppError) return response({ error: { code: error.code, requestId } }, error.status);
    console.error(JSON.stringify({ requestId, errorClass: 'ADMIN_API_FAILED' }));
    return response({ error: { code: 'INTERNAL_ERROR', requestId } }, 500);
  }
}

export const GET = handle;
