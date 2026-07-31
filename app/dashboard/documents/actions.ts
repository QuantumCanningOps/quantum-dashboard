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
  revalidatePath("/dashboard/needs-attention");
  if (data.formulaId) {
    revalidatePath(`/dashboard/formulas/${data.formulaId}`);
  }
  if (data.lotId) {
    revalidatePath(`/dashboard/lots/${data.lotId}`);
  }
}

/** Replace an existing document's file (keeps the same document id). */
export async function replaceDocumentRecord(data: {
  documentId: string;
  fileName: string;
  storagePath: string;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: existing, error: loadError } = await supabase
    .from("documents")
    .select("id, storage_path, document_type, formula_id, client_id")
    .eq("id", data.documentId)
    .single();

  if (loadError || !existing) {
    throw new Error(loadError?.message ?? "Document not found");
  }

  const { error: updateError } = await supabase
    .from("documents")
    .update({
      file_name: data.fileName,
      storage_path: data.storagePath,
      uploaded_by: user.id,
      uploaded_at: new Date().toISOString(),
      artwork_status:
        existing.document_type === "artwork" ? "pending_review" : null,
      artwork_reviewed_by: null,
      artwork_reviewed_at: null,
      artwork_approved_by: null,
      artwork_approved_at: null,
    })
    .eq("id", data.documentId);

  if (updateError) throw new Error(updateError.message);

  if (
    existing.storage_path &&
    existing.storage_path !== data.storagePath
  ) {
    await supabase.storage.from("documents").remove([existing.storage_path]);
  }

  // Keep one file per formula doc type if legacy duplicates remain.
  if (existing.formula_id) {
    const { data: duplicates } = await supabase
      .from("documents")
      .select("id, storage_path")
      .eq("formula_id", existing.formula_id)
      .eq("document_type", existing.document_type)
      .neq("id", data.documentId);

    if (duplicates && duplicates.length > 0) {
      const paths = duplicates
        .map((d) => d.storage_path)
        .filter((path): path is string => Boolean(path));
      await supabase
        .from("documents")
        .delete()
        .in(
          "id",
          duplicates.map((d) => d.id),
        );
      if (paths.length > 0) {
        await supabase.storage.from("documents").remove(paths);
      }
    }
  }

  revalidatePath("/dashboard/documents");
  revalidatePath("/dashboard/needs-attention");
  if (existing.formula_id) {
    revalidatePath(`/dashboard/formulas/${existing.formula_id}`);
  }
}
