"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createDocumentRecord(data: {
  clientId: string;
  skuId?: string;
  documentType: string;
  fileName: string;
  storagePath: string;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.from("documents").insert({
    client_id: data.clientId,
    sku_id: data.skuId || null,
    document_type: data.documentType,
    file_name: data.fileName,
    storage_path: data.storagePath,
    uploaded_by: user.id,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/documents");
}
