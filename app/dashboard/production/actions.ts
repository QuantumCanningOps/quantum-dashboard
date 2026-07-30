"use server";

import { createClient } from "@/lib/supabase/server";
import {
  syncProductionCalendar,
  type ProductionSyncResult,
} from "@/lib/google/production-sync";

export type SyncProductionCalendarActionResult =
  | ({ success: true } & ProductionSyncResult)
  | { success: false; error: string; needsConnect?: boolean; needsReauth?: boolean };

export async function syncProductionCalendarAction(): Promise<SyncProductionCalendarActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    const result = await syncProductionCalendar(user.id);
    if (result.needsConnect) {
      return {
        success: false,
        error: "Connect Google in Settings before syncing.",
        needsConnect: true,
      };
    }
    if (result.needsReauth) {
      return {
        success: false,
        error: "Google access expired. Reconnect in Settings.",
        needsReauth: true,
      };
    }
    return { success: true, ...result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return { success: false, error: message };
  }
}
