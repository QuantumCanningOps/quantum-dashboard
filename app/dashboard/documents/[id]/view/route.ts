import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", id)
    .single();

  if (!doc) {
    return new NextResponse("Document not found", { status: 404 });
  }

  const { data: signed } = await supabase.storage
    .from("documents")
    .createSignedUrl(doc.storage_path, 60);

  if (!signed) {
    return new NextResponse("Could not generate view URL", { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
