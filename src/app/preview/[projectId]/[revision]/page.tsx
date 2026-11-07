import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Id, Revision } from '../../../../contracts';
import { authenticate } from '../../../../lib/security/auth';
import { creative } from '../../../../lib/core/creative';
import { AppError } from '../../../../lib/core/errors';
import { previewProject } from '../../../../lib/publishing/service';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };
export default async function Preview({
  params,
}: {
  params: Promise<{ projectId: string; revision: string }>;
}) {
  const input = await params;
  const id = Id.safeParse(input.projectId),
    revision = Revision.safeParse(Number(input.revision));
  if (!id.success || !revision.success) notFound();
  try {
    const actor = await authenticate(
      new Request('http://internal/preview', { headers: await headers() }),
    );
    const data = await previewProject(actor, id.data, revision.data);
    const renderer = await creative();
    return (
      <main data-oneboss-preview data-oneboss-revision={data.revision}>
        <aside style={{ padding: '12px 20px', background: '#fff8dd', color: '#5b4400' }}>
          私有预览 · 尚未正式发布
        </aside>
        {await renderer.renderSite(data)}
      </main>
    );
  } catch (error) {
    if (error instanceof AppError && [401, 403, 404, 409].includes(error.status)) notFound();
    throw error;
  }
}
