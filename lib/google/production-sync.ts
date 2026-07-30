import { createAdminClient } from "@/lib/supabase/admin";
import {
  createEvent,
  deleteEvent,
  nextDay,
  updateEvent,
} from "@/lib/google/calendar";
import {
  GoogleNeedsReauthError,
  loadGoogleConnection,
} from "@/lib/google/tokens";

export type ProductionSyncEventType = "batch" | "can";

export type ProductionSyncResult = {
  needsConnect?: boolean;
  needsReauth?: boolean;
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  errors: string[];
};

type SyncBatch = {
  id: string;
  batch_number: string | null;
  status: string;
  batching_date: string | null;
  canning_date: string | null;
  planned_quantity: number;
  actual_quantity: number | null;
  unit_of_measure: string;
  tanks: { name: string } | null;
  production_orders: {
    id: string;
    order_number: string;
    clients: { name: string; code: string } | null;
    skus: { code: string; name: string } | null;
  } | null;
};

type MappingRow = {
  id: string;
  batch_id: string;
  event_type: ProductionSyncEventType;
  google_event_id: string;
  google_calendar_id: string;
};

const LOOKBACK_DAYS = 7;
const LOOKAHEAD_DAYS = 90;
const CALENDAR_ID = "primary";

function appOrigin(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.GOOGLE_REDIRECT_URI
    ? new URL(process.env.GOOGLE_REDIRECT_URI).origin
    : "http://localhost:3000";
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function isEligibleStatus(status: string): boolean {
  return status !== "draft" && status !== "cancelled";
}

function dateForType(
  batch: SyncBatch,
  eventType: ProductionSyncEventType,
): string | null {
  return eventType === "batch" ? batch.batching_date : batch.canning_date;
}

function inWindow(dateStr: string, from: string, to: string): boolean {
  return dateStr >= from && dateStr <= to;
}

function buildSummary(
  batch: SyncBatch,
  eventType: ProductionSyncEventType,
): string {
  const kind = eventType === "batch" ? "Batch" : "Can";
  const product =
    batch.production_orders?.skus?.name ||
    batch.batch_number ||
    batch.production_orders?.order_number ||
    "Untitled";
  const client = batch.production_orders?.clients?.code;
  return client ? `[${kind}] ${product} — ${client}` : `[${kind}] ${product}`;
}

function buildDescription(batch: SyncBatch): string {
  const lines: string[] = [];
  if (batch.batch_number) lines.push(`Batch: ${batch.batch_number}`);
  if (batch.production_orders?.order_number) {
    lines.push(`Order: ${batch.production_orders.order_number}`);
  }
  if (batch.tanks?.name) lines.push(`Tank: ${batch.tanks.name}`);
  lines.push(
    `Planned: ${batch.planned_quantity} ${batch.unit_of_measure}`,
  );
  if (batch.actual_quantity != null) {
    lines.push(
      `Actual: ${batch.actual_quantity} ${batch.unit_of_measure}`,
    );
  }
  lines.push(`Status: ${batch.status}`);
  if (batch.production_orders?.id) {
    lines.push(
      `Dashboard: ${appOrigin()}/dashboard/production/${batch.production_orders.id}`,
    );
  }
  return lines.join("\n");
}

function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: number; status?: number; response?: { status?: number } };
  return e.code === 404 || e.status === 404 || e.response?.status === 404;
}

export async function syncProductionCalendar(
  userId: string,
): Promise<ProductionSyncResult> {
  const result: ProductionSyncResult = {
    created: 0,
    updated: 0,
    deleted: 0,
    skipped: 0,
    errors: [],
  };

  const connection = await loadGoogleConnection(userId);
  if (!connection || connection.status === "revoked") {
    return { ...result, needsConnect: true };
  }
  if (connection.status === "needs_reauth") {
    return { ...result, needsReauth: true };
  }

  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);
  const windowFrom = toDateStr(addDays(today, -LOOKBACK_DAYS));
  const windowTo = toDateStr(addDays(today, LOOKAHEAD_DAYS));

  const admin = createAdminClient();

  const { data: batchRows, error: batchError } = await admin
    .from("batches")
    .select(
      "id, batch_number, status, batching_date, canning_date, planned_quantity, actual_quantity, unit_of_measure, tanks(name), production_orders(id, order_number, clients(name, code), skus(code, name))",
    )
    .or(
      `and(batching_date.gte.${windowFrom},batching_date.lte.${windowTo}),and(canning_date.gte.${windowFrom},canning_date.lte.${windowTo})`,
    );

  if (batchError) {
    result.errors.push(`Failed to load batches: ${batchError.message}`);
    return result;
  }

  const batches = (batchRows ?? []) as unknown as SyncBatch[];
  const batchById = new Map(batches.map((b) => [b.id, b]));

  const { data: mappingRows, error: mappingError } = await admin
    .from("google_calendar_events")
    .select("id, batch_id, event_type, google_event_id, google_calendar_id")
    .eq("user_id", userId);

  if (mappingError) {
    result.errors.push(`Failed to load mappings: ${mappingError.message}`);
    return result;
  }

  const mappings = (mappingRows ?? []) as MappingRow[];

  // Ensure cleanup can see dates for mapped batches outside the sync query window
  const missingBatchIds = [
    ...new Set(
      mappings
        .map((m) => m.batch_id)
        .filter((id) => !batchById.has(id)),
    ),
  ];
  if (missingBatchIds.length > 0) {
    const { data: extraBatches } = await admin
      .from("batches")
      .select(
        "id, batch_number, status, batching_date, canning_date, planned_quantity, actual_quantity, unit_of_measure, tanks(name), production_orders(id, order_number, clients(name, code), skus(code, name))",
      )
      .in("id", missingBatchIds);
    for (const row of (extraBatches ?? []) as unknown as SyncBatch[]) {
      batchById.set(row.id, row);
    }
  }

  const mappingKey = (batchId: string, eventType: ProductionSyncEventType) =>
    `${batchId}:${eventType}`;
  const mappingByKey = new Map(
    mappings.map((m) => [mappingKey(m.batch_id, m.event_type), m]),
  );

  const desiredKeys = new Set<string>();

  try {
    for (const batch of batches) {
      for (const eventType of ["batch", "can"] as const) {
        const date = dateForType(batch, eventType);
        if (!date || !inWindow(date, windowFrom, windowTo)) continue;

        if (!isEligibleStatus(batch.status)) {
          result.skipped += 1;
          continue;
        }

        const key = mappingKey(batch.id, eventType);
        desiredKeys.add(key);

        const summary = buildSummary(batch, eventType);
        const description = buildDescription(batch);
        const start = { date };
        const end = { date: nextDay(date) };
        const existing = mappingByKey.get(key);

        try {
          if (existing) {
            try {
              await updateEvent(userId, {
                calendarId: existing.google_calendar_id || CALENDAR_ID,
                eventId: existing.google_event_id,
                summary,
                description,
                start,
                end,
              });
              await admin
                .from("google_calendar_events")
                .update({ synced_at: new Date().toISOString() })
                .eq("id", existing.id);
              result.updated += 1;
            } catch (err) {
              if (!isNotFoundError(err)) throw err;
              const created = await createEvent(userId, {
                calendarId: CALENDAR_ID,
                summary,
                description,
                start,
                end,
              });
              if (!created.id) {
                throw new Error("Google createEvent returned no id");
              }
              await admin
                .from("google_calendar_events")
                .update({
                  google_event_id: created.id,
                  google_calendar_id: CALENDAR_ID,
                  synced_at: new Date().toISOString(),
                })
                .eq("id", existing.id);
              result.created += 1;
            }
          } else {
            const created = await createEvent(userId, {
              calendarId: CALENDAR_ID,
              summary,
              description,
              start,
              end,
            });
            if (!created.id) {
              throw new Error("Google createEvent returned no id");
            }
            const { error: insertError } = await admin
              .from("google_calendar_events")
              .insert({
                user_id: userId,
                batch_id: batch.id,
                event_type: eventType,
                google_event_id: created.id,
                google_calendar_id: CALENDAR_ID,
                synced_at: new Date().toISOString(),
              });
            if (insertError) throw new Error(insertError.message);
            result.created += 1;
          }
        } catch (err) {
          if (err instanceof GoogleNeedsReauthError) {
            return { ...result, needsReauth: true };
          }
          const message =
            err instanceof Error ? err.message : "Unknown sync error";
          result.errors.push(`${batch.id}/${eventType}: ${message}`);
        }
      }
    }

    // Delete mappings that are no longer desired within the sync window
    for (const mapping of mappings) {
      if (desiredKeys.has(mappingKey(mapping.batch_id, mapping.event_type))) {
        continue;
      }

      const batch = batchById.get(mapping.batch_id);
      const dateKey = batch
        ? dateForType(batch, mapping.event_type)
        : null;

      // Leave far-future / far-past mappings alone when we still know the date
      if (dateKey && !inWindow(dateKey, windowFrom, windowTo)) continue;

      try {
        try {
          await deleteEvent(userId, {
            calendarId: mapping.google_calendar_id || CALENDAR_ID,
            eventId: mapping.google_event_id,
          });
        } catch (err) {
          if (!isNotFoundError(err)) throw err;
        }
        await admin
          .from("google_calendar_events")
          .delete()
          .eq("id", mapping.id);
        result.deleted += 1;
      } catch (err) {
        if (err instanceof GoogleNeedsReauthError) {
          return { ...result, needsReauth: true };
        }
        const message =
          err instanceof Error ? err.message : "Unknown delete error";
        result.errors.push(
          `delete ${mapping.batch_id}/${mapping.event_type}: ${message}`,
        );
      }
    }
  } catch (err) {
    if (err instanceof GoogleNeedsReauthError) {
      return { ...result, needsReauth: true };
    }
    const message = err instanceof Error ? err.message : "Sync failed";
    result.errors.push(message);
  }

  return result;
}
