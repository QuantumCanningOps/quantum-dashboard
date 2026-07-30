"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type ActionResult =
  | { success: true; contacts: ContactRow[] }
  | { success: false; error: string };

export type ContactRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  primary_contact: boolean;
};

export type ContactInput = {
  id?: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  primaryContact: boolean;
};

async function requireInternalUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function saveClientContacts(
  clientId: string,
  contacts: ContactInput[],
): Promise<ActionResult> {
  const { supabase, user } = await requireInternalUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .single();
  if (clientError || !client) {
    return { success: false, error: "Client not found" };
  }

  const normalized = contacts
    .map((c) => ({
      id: c.id,
      name: c.name.trim(),
      email: c.email?.trim() || null,
      phone: c.phone?.trim() || null,
      role: c.role?.trim() || null,
      primaryContact: Boolean(c.primaryContact),
    }))
    .filter((c) => c.name.length > 0);

  // Enforce a single primary contact (first marked wins).
  let sawPrimary = false;
  const withSinglePrimary = normalized.map((c) => {
    if (!c.primaryContact) return { ...c, primaryContact: false };
    if (sawPrimary) return { ...c, primaryContact: false };
    sawPrimary = true;
    return c;
  });

  const { data: existing, error: existingError } = await supabase
    .from("contacts")
    .select("id")
    .eq("party_type", "client")
    .eq("party_id", clientId);
  if (existingError) return { success: false, error: existingError.message };

  const existingIds = new Set((existing ?? []).map((row) => row.id));
  const keptIds = new Set(
    withSinglePrimary
      .map((c) => c.id)
      .filter((id): id is string => typeof id === "string" && existingIds.has(id)),
  );

  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("contacts")
      .delete()
      .eq("party_type", "client")
      .eq("party_id", clientId)
      .in("id", toDelete);
    if (error) return { success: false, error: error.message };
  }

  for (const contact of withSinglePrimary) {
    if (contact.id && existingIds.has(contact.id)) {
      const { error } = await supabase
        .from("contacts")
        .update({
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          role: contact.role,
          primary_contact: contact.primaryContact,
        })
        .eq("id", contact.id)
        .eq("party_type", "client")
        .eq("party_id", clientId);
      if (error) return { success: false, error: error.message };
    } else {
      const { error } = await supabase.from("contacts").insert({
        party_type: "client",
        party_id: clientId,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        role: contact.role,
        primary_contact: contact.primaryContact,
        active: true,
      });
      if (error) return { success: false, error: error.message };
    }
  }

  const { data: saved, error: reloadError } = await supabase
    .from("contacts")
    .select("id, name, email, phone, role, primary_contact")
    .eq("party_type", "client")
    .eq("party_id", clientId)
    .order("primary_contact", { ascending: false })
    .order("name");
  if (reloadError) return { success: false, error: reloadError.message };

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath("/dashboard/clients");
  return { success: true, contacts: saved ?? [] };
}
