import { notFound } from 'next/navigation';
import { cache } from 'react';
import { creative } from '../../../lib/core/creative';
import { publicProject } from '../../../lib/publishing/service';
export const dynamic = 'force-dynamic';
const loadProject = cache(publicProject);
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadProject(slug);
  return data
    ? { title: data.site.seo.title, description: data.site.seo.description }
    : { robots: { index: false, follow: false } };
}
export default async function PublicSite({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params,
    data = await loadProject(slug);
  if (!data) notFound();
  const renderer = await creative();
  return <main data-oneboss-revision={data.revision}>{await renderer.renderSite(data)}</main>;
}
