import { notFound } from 'next/navigation';
import { creative } from '../../../../lib/core/creative';
import { publicProject } from '../../../../lib/publishing/service';
export const dynamic = 'force-dynamic';
export default async function PublicSubpage({
  params,
}: {
  params: Promise<{ slug: string; page: string[] }>;
}) {
  const { slug, page } = await params;
  if (page.length !== 1) notFound();
  const data = await publicProject(slug);
  if (!data || !data.site.pages.some((p) => p.slug === page[0])) notFound();
  return (
    <main data-oneboss-revision={data.revision}>
      {await (await creative()).renderSite({ ...data, pageSlug: page[0] })}
    </main>
  );
}
