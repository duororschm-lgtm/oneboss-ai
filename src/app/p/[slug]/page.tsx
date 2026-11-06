import { notFound } from 'next/navigation';
import { creative } from '../../../lib/core/creative';
import { publicProject } from '../../../lib/publishing/service';
export const dynamic = 'force-dynamic';
export default async function PublicSite({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params,
    data = await publicProject(slug);
  if (!data) notFound();
  const renderer = await creative();
  return <main data-oneboss-revision={data.revision}>{await renderer.renderSite(data)}</main>;
}
