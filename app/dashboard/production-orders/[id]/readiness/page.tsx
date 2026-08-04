import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ id: string }> };

/** Legacy readiness URL — material readiness now lives on the order detail page. */
export default async function ReadinessRedirectPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/dashboard/production/${id}#material-readiness`);
}
