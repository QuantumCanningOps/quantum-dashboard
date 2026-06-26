"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createDocumentRecord(data: {
  clientId: string;
  documentType: string;
  fileName: string;
  storagePath: string;
  lotId?: string;
  formulaId?: string;
  thirdPartyLogisticsId?: string;
  carrierName?: string;
  lotIds?: string[];
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: doc, error } = await supabase
    .from("documents")
    .insert({
      client_id: data.clientId,
      document_type: data.documentType,
      file_name: data.fileName,
      storage_path: data.storagePath,
      uploaded_by: user.id,
      lot_id: data.lotId ?? null,
      formula_id: data.formulaId ?? null,
      third_party_logistics_id: data.thirdPartyLogisticsId ?? null,
      carrier_name: data.carrierName ?? null,
      artwork_status: data.documentType === "artwork" ? "pending_review" : null,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  if (data.lotIds && data.lotIds.length > 0) {
    const { error: joinError } = await supabase.from("document_lots").insert(
      data.lotIds.map((lotId) => ({ document_id: doc.id, lot_id: lotId }))
    );
    if (joinError) throw new Error(joinError.message);
  }

  revalidatePath("/dashboard/documents");
}
