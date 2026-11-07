import { notFound } from 'next/navigation';
import { cache } from 'react';
import { creative } from '../../../../lib/core/creative';
import { publicProject } from '../../../../lib/publishing/service';
import { DemoNotice } from '../../../../lib/publishing/demo-notice';
export const dynamic = 'force-dynamic';
const loadProject = cache(publicProject);
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; page: string[] }>;
}) {
  const { slug, page } = await params;
  const data = page.length === 1 ? await loadProject(slug) : undefined;
  const selected = data?.site.pages.find((p) => p.slug === page[0]);
  return data && selected
    ? { title: selected.title, description: data.site.seo.description }
    : { robots: { index: false, follow: false } };
}
export default async function PublicSubpage({
  params,
}: {
  params: Promise<{ slug: string; page: string[] }>;
}) {
  const { slug, page } = await params;
  if (page.length !== 1) notFound();
  const data = await loadProject(slug);
  if (!data || !data.site.pages.some((p) => p.slug === page[0])) notFound();
  return (
    <>
      <DemoNotice demo={data.demo} />
      <main data-oneboss-revision={data.revision}>
        {await (await creative()).renderSite({ ...data, pageSlug: page[0] })}
      </main>
    </>
  );
}
