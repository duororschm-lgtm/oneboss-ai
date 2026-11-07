import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { authenticate } from '../../../lib/security/auth';
import { registerAccount } from '../../../lib/security/registration';
import { AppError, assert } from '../../../lib/core/errors';
import { database, transaction, type Tx } from '../../../lib/core/db';
import * as service from '../../../lib/core/service';
import { Id, Revision, DesignChoices, ChangeRequest } from '../../../contracts';
import { signed, uploadAsset } from '../../../lib/core/storage';
import { approveArtifact, previewProject } from '../../../lib/publishing/service';
import { accountWorkspace, projectWorkspace, adminWorkspace } from '../../../lib/core/workspace';
import { posterPreview } from '../../../lib/publishing/poster-preview';
import { wechatAvailable } from '../../../lib/commerce/wechat-provider';
import { manualPaymentDetails } from '../../../lib/commerce/manual-payment';
import {
  createWechatCheckout,
  receiveWechatNotification,
  reconcileWechatOrder,
  closeWechatOrder,
} from '../../../lib/commerce/wechat-service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const response = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
async function readBytes(request: Request, max: number) {
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      assert(size <= max, 'BODY_TOO_LARGE', 413);
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}
async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const requestId = randomUUID();
  try {
    const path = (await context.params).path,
      route = path.join('/'),
      method = request.method;
    if (route === 'health' && method === 'GET')
      return response({
        service: 'oneboss-core',
        status: 'running',
        configured: {
          database: !!process.env.DATABASE_URL,
          auth: !!(
            process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
          ),
          mimo: !!(process.env.MIMO_API_KEY && process.env.MIMO_MODEL),
          creative: !!process.env.CREATIVE_ADAPTER_MODULE,
        },
      });
    if (route === 'core/plans' && method === 'GET')
      return response({
        plans:
          await database()`select code,name,price_minor,currency,product_limit,poster_count,revision_rounds,hosting_days from service_plans where is_active`,
        addons:
          await database()`select code,name,price_minor,entitlement from service_addons where is_active`,
      });
    if (route === 'commerce/payment-methods' && method === 'GET')
      return response({
        wechatNative: wechatAvailable(),
        manualVerified: !!manualPaymentDetails(),
        manual: manualPaymentDetails(),
        sandbox: false,
      });
    if (route === 'commerce/payments/webhook/wechat' && method === 'POST') {
      await receiveWechatNotification(
        request.headers,
        (await readBytes(request, 1024 * 1024)).toString('utf8'),
      );
      return new Response(null, { status: 204 });
    }
    // Every unsupported provider fails closed; browser JSON never counts as payment evidence.
    if (route.startsWith('commerce/payments/webhook/'))
      throw new AppError('LIVE_PROVIDER_NOT_CONFIGURED', 503);
    if (route === 'auth/register' && method === 'POST') {
      let body: unknown;
      try {
        body = JSON.parse((await readBytes(request, 4096)).toString('utf8'));
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError('INVALID_JSON', 400);
      }
      return response(await registerAccount(request, body), 201);
    }
    const actor = await authenticate(request);
    await service.rateLimit(actor);
    if (route === 'core/admin' && method === 'GET')
      return response(await transaction(actor, (tx) => adminWorkspace(tx, actor)));
    if (route === 'core/account' && method === 'GET')
      return response(await transaction(actor, (tx) => accountWorkspace(tx, actor)));
    if (
      path[0] === 'core' &&
      path[1] === 'projects' &&
      path[2] &&
      path[3] === 'assets' &&
      method === 'POST'
    ) {
      const id = Id.parse(path[2]);
      // Authorize before processing potentially expensive image input.
      await transaction(actor, (tx) => service.project(tx, actor, id));
      return response(
        await uploadAsset(
          actor,
          id,
          await readBytes(request, 10 * 1024 * 1024),
          request.headers.get('x-asset-license') === 'customer_authorized',
        ),
        201,
      );
    }
    let body: unknown = {};
    if (method === 'POST') {
      assert(
        request.headers.get('content-type')?.split(';')[0] === 'application/json',
        'JSON_REQUIRED',
        415,
      );
      try {
        body = JSON.parse((await readBytes(request, 256 * 1024)).toString('utf8'));
      } catch (e) {
        if (e instanceof AppError) throw e;
        throw new AppError('INVALID_JSON');
      }
    }
    if (route === 'core/organizations' && method === 'POST') {
      const input = z
        .object({ name: z.string().min(1).max(100) })
        .strict()
        .parse(body);
      // Bootstrap has no tenant yet; serialize by actor and return the existing owned organization.
      return response(
        await transaction(actor, async (tx) => {
          await tx`select pg_advisory_xact_lock(hashtextextended(${actor.userId},0))`;
          const [old] =
            await tx`select * from organizations where owner_user_id=${actor.userId} order by id limit 1`;
          if (old) return old;
          const [o] =
            await tx`insert into organizations(name,owner_user_id) values(${input.name},${actor.userId}) returning *`;
          await tx`insert into memberships(org_id,user_id,role) values(${o.id},${actor.userId},'owner')`;
          return o;
        }),
        201,
      );
    }
    let orgId: string | undefined;
    let adminAction = false;
    if (method === 'POST' && ['commerce/quotes', 'commerce/orders'].includes(route))
      orgId = Id.parse((body as { orgId?: string }).orgId);
    if (path[0] === 'commerce' && path[1] === 'orders' && path[2]) {
      const id = Id.parse(path[2]);
      adminAction =
        method === 'POST' &&
        path.length === 4 &&
        ['confirm-manual', 'finalize-refund'].includes(path[3]);
      const o = await transaction(actor, (tx) =>
        adminAction ? service.adminOrder(tx, actor, id) : service.order(tx, actor, id),
      );
      orgId = o.org_id;
      if (method === 'GET' && path.length === 3) {
        const report = await transaction(actor, async (tx) => {
          const [r] =
            await tx`select id,details,created_at from manual_payment_reports where order_id=${id} and org_id=${o.org_id} order by created_at desc limit 1`;
          return r;
        });
        return response({ ...o, manualPaymentReport: report });
      }
    }
    if (route === 'core/projects' && method === 'POST') {
      const input = z.object({ orderId: Id }).strict().parse(body);
      const o = await transaction(actor, (tx) => service.order(tx, actor, input.orderId));
      orgId = o.org_id;
    }
    if (path[0] === 'core' && path[1] === 'projects' && path[2]) {
      const id = Id.parse(path[2]);
      const p = await transaction(actor, (tx) => service.project(tx, actor, id));
      orgId = p.org_id;
      if (method === 'GET') {
        if (path.length === 3) return response(p);
        if (path[3] === 'poster-preview' && path.length === 4) {
          const params = new URL(request.url).searchParams;
          const bytes = await posterPreview(
            actor,
            id,
            Revision.parse(Number(params.get('revision'))),
            z
              .number()
              .int()
              .min(0)
              .max(19)
              .parse(Number(params.get('index'))),
          );
          return new Response(new Uint8Array(bytes), {
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': 'no-store',
              'X-OneBoss-Draft': 'true',
            },
          });
        }
        if (path[3] === 'assets' && path.length === 4)
          return response({
            assets: await transaction(actor, async (tx) => {
              await service.project(tx, actor, id);
              const assets =
                await tx`select id,storage_path,width,height,license_status from media_assets where project_id=${id}`;
              return Promise.all(
                assets.map(async (a) => ({
                  id: a.id,
                  width: a.width,
                  height: a.height,
                  license_status: a.license_status,
                  url: await signed(a.storage_path),
                })),
              );
            }),
          });
        if (path[3] === 'workspace' && path.length === 4)
          return response(await transaction(actor, (tx) => projectWorkspace(tx, actor, id)));
        if (path[3] === 'preview' && path.length === 4) {
          const revision = Revision.parse(
            Number(new URL(request.url).searchParams.get('revision')),
          );
          return response(await previewProject(actor, id, revision));
        }
        if (path[3] === 'delivery')
          return response(
            await transaction(actor, async (tx) => {
              const current = await service.project(tx, actor, id);
              const [d] =
                await tx`select * from deliveries where project_id=${id} and revision=${current.published_revision}`;
              assert(d, 'DELIVERY_NOT_READY', 404);
              assert(d.manifest.factVersion === current.fact_version, 'STALE_DELIVERY', 409);
              return {
                id: d.id,
                manifest: d.manifest,
                status: d.status,
                acceptedAt: d.accepted_at,
                zipDownloadUrl: await signed(d.zip_path),
                posterDownloads: await Promise.all(
                  (d.manifest.posters as { path: string }[]).map(async (poster) => ({
                    path: poster.path,
                    url: await signed(
                      `${d.zip_path.slice(0, d.zip_path.lastIndexOf('/'))}/${poster.path}`,
                    ),
                  })),
                ),
                qrDownloads: await Promise.all(
                  ((d.manifest.files || []) as { path: string; storagePath?: string }[])
                    .filter(
                      (file) =>
                        /^qrcode\/qr-[0-9]+\.png$/.test(file.path) &&
                        file.storagePath ===
                          `${d.zip_path.slice(0, d.zip_path.lastIndexOf('/'))}/${file.path}`,
                    )
                    .map(async (file) => ({
                      path: file.path,
                      url: await signed(file.storagePath!),
                    })),
                ),
                expiresIn: 300,
              };
            }),
          );
        if (path[3] === 'data')
          return response(
            await transaction(actor, async (tx) => {
              const p = await service.project(tx, actor, id);
              return {
                project: p,
                facts: await service.facts(tx, p),
                assets:
                  await tx`select id,width,height,license_status,is_concept from media_assets where project_id=${p.id}`,
              };
            }),
          );
      }
    }
    if (path[0] === 'core' && path[1] === 'runs' && path.length === 3 && method === 'GET')
      return response(
        await transaction(actor, async (tx) => {
          const [run] =
            await tx`select id,org_id,project_id,role,status,attempt,error_class,usage,output,created_at,completed_at from agent_runs where id=${Id.parse(path[2])}`;
          assert(run, 'NOT_FOUND', 404);
          await service.member(tx, actor, run.org_id);
          return run;
        }),
      );
    assert(method === 'POST' && orgId, 'NOT_FOUND', 404);
    if (path[0] === 'commerce' && path[1] === 'orders' && path.length === 4) {
      if (path[3] === 'checkout' && (body as { channel?: string }).channel === 'wechat_native') {
        z.object({ channel: z.literal('wechat_native') })
          .strict()
          .parse(body);
        return response(await createWechatCheckout(actor, path[2]));
      }
      if (path[3] === 'reconcile-wechat') {
        z.object({}).strict().parse(body);
        return response(await reconcileWechatOrder(actor, path[2]));
      }
      if (path[3] === 'close') {
        z.object({}).strict().parse(body);
        return response(await closeWechatOrder(actor, path[2]));
      }
    }
    // Approval includes external QA and gets its own revalidated transaction.
    if (path[0] === 'core' && path[1] === 'projects' && path[3] === 'approve-revision') {
      const { revision } = z.object({ revision: Revision }).strict().parse(body);
      return response(
        await approveArtifact(
          actor,
          path[2],
          revision,
          request.headers.get('idempotency-key') ?? '',
        ),
      );
    }
    return response(
      await service.idempotent(
        actor,
        request.headers.get('idempotency-key') ?? '',
        route,
        body,
        orgId,
        async (tx) => {
          if (route === 'commerce/quotes') {
            const b = z
              .object({
                orgId: Id,
                planCode: z.string().max(100),
                addons: z
                  .array(
                    z
                      .object({ code: z.string().max(100), qty: z.number().int().min(1).max(10) })
                      .strict(),
                  )
                  .max(10)
                  .default([]),
              })
              .strict()
              .parse(body);
            return service.createQuote(tx, b.orgId, b.planCode, b.addons);
          }
          if (route === 'commerce/orders') {
            const b = z
              .object({ orgId: Id, quoteId: Id, isDemo: z.boolean() })
              .strict()
              .parse(body);
            return service.createOrder(tx, b.orgId, b.quoteId, b.isDemo);
          }
          if (route === 'core/projects') {
            const b = z.object({ orderId: Id }).strict().parse(body);
            return service.createProject(tx, actor, b.orderId);
          }
          if (path[0] === 'commerce' && path[1] === 'orders') {
            const id = path[2],
              action = path[3];
            if (action === 'checkout') {
              const b = z
                .object({ channel: z.enum(['sandbox', 'manual_verified']) })
                .strict()
                .parse(body);
              return service.checkout(tx, actor, id, b.channel);
            }
            if (action === 'report-manual-payment') {
              const b = z
                .object({ attemptId: Id, details: z.string().trim().min(1).max(1000) })
                .strict()
                .parse(body);
              return service.reportManualPayment(tx, actor, id, b.attemptId, b.details);
            }
            if (action === 'confirm-sandbox' || action === 'confirm-manual')
              return service.confirmPayment(
                tx,
                actor,
                id,
                service.Confirmation.parse(body),
                action === 'confirm-sandbox' ? 'sandbox' : 'manual_verified',
              );
            if (action === 'refunds') {
              const b = z.object({ amountMinor: z.number().int().positive() }).strict().parse(body);
              return service.requestRefund(tx, actor, id, b.amountMinor);
            }
            if (action === 'finalize-refund') {
              const b = z
                .object({
                  refundId: Id,
                  reference: z.string().min(8).max(200),
                  confirmed: z.boolean(),
                })
                .strict()
                .parse(body);
              return service.finalizeRefund(tx, actor, id, b.refundId, b.reference, b.confirmed);
            }
            if (action === 'close') {
              z.object({}).strict().parse(body);
              const o = await service.order(tx, actor, id);
              assert(
                ['UNPAID', 'PENDING_CONFIRMATION'].includes(o.pay_state),
                'ORDER_CANNOT_CLOSE',
                409,
              );
              await tx`update service_orders set pay_state='CLOSED' where id=${o.id}`;
              return { payState: 'CLOSED' };
            }
          }
          if (path[0] === 'core' && path[1] === 'projects') {
            const id = path[2],
              action = path[3];
            if (action === 'intake')
              return service.saveIntake(tx, actor, id, service.Intake.parse(body));
            if (action === 'analyze-intake') {
              const b = z
                .object({ customerInput: z.string().min(1).max(10000) })
                .strict()
                .parse(body);
              return service.enqueue(tx, actor, id, 'intake', b);
            }
            if (action === 'approve-brief') {
              const b = z.object({ revision: Revision }).strict().parse(body);
              return service.approveBrief(tx, actor, id, b.revision);
            }
            if (action === 'design-options') {
              z.object({}).strict().parse(body);
              return service.enqueue(tx, actor, id, 'design', {});
            }
            if (action === 'approve-design') {
              const b = z
                  .object({
                    runId: Id,
                    directionId: z.uuid().optional(),
                    styleId: z.string().max(100).optional(),
                  })
                  .strict()
                  .refine((v) => v.directionId || v.styleId, {
                    message: 'directionId or styleId required',
                  })
                  .parse(body),
                p = await service.project(tx, actor, id);
              await service.entitlement(tx, p);
              const [run] =
                await tx`select output,input from agent_runs where id=${b.runId} and project_id=${id} and role='design' and status='SUCCEEDED'`;
              assert(run && run.input.factVersion === p.fact_version, 'DESIGN_NOT_READY');
              const choices = DesignChoices.parse(run.output);
              // directionId (server-assigned) is the primary selection key; styleId remains for legacy runs.
              const choice = b.directionId
                ? choices.choices.find((c) => c.directionId === b.directionId)
                : choices.choices.find((c) => c.styleId === b.styleId);
              assert(choice, 'STYLE_NOT_FOUND');
              const [{ revision }] =
                await tx`select coalesce(max(revision),0)+1 revision from design_systems where project_id=${id}`;
              const value = { ...choice, version: revision, approvedByClient: true };
              await tx`insert into design_systems(org_id,project_id,revision,body,approved_at) values(${p.org_id},${id},${revision},${tx.json(value)},now())`;
              await tx`update projects set status='READY_TO_GENERATE' where id=${id}`;
              return { approved: true, design: value };
            }
            if (action === 'generate') {
              z.object({}).strict().parse(body);
              return service.enqueue(tx, actor, id, 'generate', {});
            }
            if (action === 'revisions')
              return service.requestChange(tx, actor, id, ChangeRequest.parse(body));
            if (action === 'publish' || action === 'rollback') {
              const b = z.object({ revision: Revision }).strict().parse(body);
              return service.enqueue(tx, actor, id, 'publish', b);
            }
            if (action === 'delivery') {
              z.object({}).strict().parse(body);
              return service.enqueue(tx, actor, id, 'delivery', {});
            }
            if (action === 'accept') {
              const b = z.object({ manifestVersion: Revision }).strict().parse(body),
                p = await service.project(tx, actor, id);
              await service.entitlement(tx, p);
              assert(p.published_revision === b.manifestVersion, 'STALE_DELIVERY', 409);
              assert(
                p.published_verified && p.browser_verified_revision === p.published_revision,
                'VERIFIED_SITE_REQUIRED',
                409,
              );
              const rows =
                await tx`update deliveries set status='ACCEPTED',accepted_at=now() where project_id=${id} and revision=${b.manifestVersion} and (manifest->>'factVersion')::int=${p.fact_version} returning id`;
              assert(rows.length, 'DELIVERY_NOT_READY', 409);
              await tx`update projects set status='ACCEPTED' where id=${id}`;
              return { accepted: true };
            }
          }
          throw new AppError('NOT_FOUND', 404);
        },
        adminAction ? 'platform' : 'member',
      ),
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return response(
        {
          error: {
            code: 'VALIDATION_FAILED',
            fields: error.issues.map((i) => i.path.join('.')),
            requestId,
          },
        },
        400,
      );
    if (error instanceof AppError)
      return response({ error: { code: error.code, requestId } }, error.status);
    const code = (error as { code?: string })?.code;
    if (code === '23505') return response({ error: { code: 'CONFLICT', requestId } }, 409);
    // Do not return SQL, tokens, model responses or customer input in error logs.
    console.error(JSON.stringify({ requestId, errorClass: code ?? 'INTERNAL_ERROR' }));
    return response({ error: { code: 'INTERNAL_ERROR', requestId } }, 500);
  }
}
export const GET = handle;
export const POST = handle;
