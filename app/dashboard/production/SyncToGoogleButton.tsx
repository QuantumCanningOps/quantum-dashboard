"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  syncProductionCalendarAction,
  type SyncProductionCalendarActionResult,
} from "./actions";

export function SyncToGoogleButton({
  googleConnected,
}: {
  googleConnected: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SyncProductionCalendarActionResult | null>(
    null,
  );

  if (!googleConnected) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline">
          <Link href="/dashboard/settings">Connect Google to sync</Link>
        </Button>
      </div>
    );
  }

  function onSync() {
    setResult(null);
    startTransition(async () => {
      const res = await syncProductionCalendarAction();
      setResult(res);
    });
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={onSync} disabled={pending}>
        {pending ? "Syncing…" : "Sync to Google"}
      </Button>

      {result?.success === false ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {result.error}{" "}
          {result.needsConnect || result.needsReauth ? (
            <Link href="/dashboard/settings" className="underline">
              Open Settings
            </Link>
          ) : null}
        </div>
      ) : null}

      {result?.success === true ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Synced: {result.created} created, {result.updated} updated,{" "}
          {result.deleted} deleted
          {result.skipped > 0 ? `, ${result.skipped} skipped` : ""}.
          {result.errors.length > 0 ? (
            <p className="mt-1 text-destructive">
              {result.errors.length} error
              {result.errors.length === 1 ? "" : "s"}: {result.errors[0]}
              {result.errors.length > 1 ? "…" : ""}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
