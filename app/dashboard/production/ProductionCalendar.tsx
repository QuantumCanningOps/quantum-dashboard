"use client";

import { useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { BatchScheduleRow } from "./ProductionOrdersTable";

const DAYS = 21;

type DayEvent = {
  batch: BatchScheduleRow;
  type: "batch" | "can";
};

const TYPE_STYLE: Record<DayEvent["type"], string> = {
  batch: "bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200",
  can:   "bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200",
};

const TYPE_RING: Record<DayEvent["type"], string> = {
  batch: "ring-blue-400",
  can:   "ring-emerald-400",
};

function toStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shiftDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function ProductionCalendar({
  batches,
  windowStart,
  onWindowChange,
  hoveredId,
  onHoverChange,
}: {
  batches: BatchScheduleRow[];
  windowStart: Date;
  onWindowChange: (d: Date) => void;
  hoveredId: string | null;
  onHoverChange: (id: string | null) => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toStr(today);

  const days = Array.from({ length: DAYS }, (_, i) => shiftDays(windowStart, i));

  const prev = useCallback(() => onWindowChange(shiftDays(windowStart, -7)), [windowStart, onWindowChange]);
  const next = useCallback(() => onWindowChange(shiftDays(windowStart, 7)), [windowStart, onWindowChange]);
  const goToday = useCallback(() => onWindowChange(mondayOf(new Date())), [onWindowChange]);

  // Build event map — dates are top-level on the batch row
  const eventsByDay: Record<string, DayEvent[]> = {};
  for (const batch of batches) {
    if (batch.status === "cancelled" || batch.status === "draft") continue;
    if (batch.batching_date) {
      (eventsByDay[batch.batching_date] ??= []).push({ batch, type: "batch" });
    }
    if (batch.canning_date) {
      (eventsByDay[batch.canning_date] ??= []).push({ batch, type: "can" });
    }
  }

  const weeks = [days.slice(0, 7), days.slice(7, 14), days.slice(14, 21)];
  const rangeStart = days[0];
  const rangeEnd = days[DAYS - 1];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={prev}>← Prev</Button>
        <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
        <Button variant="outline" size="sm" onClick={next}>Next →</Button>
        <span className="text-sm text-muted-foreground">
          {rangeStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          {" – "}
          {rangeEnd.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
        </span>
        <span className="ml-4 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border border-blue-300 bg-blue-100" />
            Batch
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border border-emerald-300 bg-emerald-100" />
            Can
          </span>
        </span>
      </div>

      <div className="rounded-lg border">
        {/* Day-of-week header */}
        <div className="grid grid-cols-7 border-b bg-muted/30">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="border-r px-2 py-1.5 text-center text-xs font-medium text-muted-foreground last:border-r-0">
              {d}
            </div>
          ))}
        </div>

        {/* Week rows */}
        {weeks.map((week, wi) => (
          <div key={wi} className={`grid grid-cols-7 ${wi < weeks.length - 1 ? "border-b" : ""}`}>
            {week.map((day) => {
              const str = toStr(day);
              const isToday = str === todayStr;
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              const events = eventsByDay[str] ?? [];

              return (
                <div
                  key={str}
                  className={`min-h-[90px] border-r p-1.5 last:border-r-0 ${
                    isToday ? "bg-blue-50" : isWeekend ? "bg-muted/20" : ""
                  }`}
                >
                  <div
                    className={`mb-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-0.5 text-xs font-medium ${
                      isToday ? "bg-blue-600 text-white" : "text-muted-foreground"
                    }`}
                  >
                    {day.getDate() === 1
                      ? day.toLocaleDateString(undefined, { month: "short", day: "numeric" })
                      : day.getDate()}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {events.map((event, ei) => {
                      const isHighlighted = hoveredId === event.batch.id;
                      const isDimmed = hoveredId !== null && !isHighlighted;
                      const po = event.batch.production_orders;
                      return (
                        <Link
                          key={`${event.batch.id}-${event.type}-${ei}`}
                          href={po?.id ? `/dashboard/production/${po.id}` : "#"}
                          title={`${event.type === "batch" ? "Batch" : "Can"}: ${event.batch.batch_number ?? po?.order_number ?? ""}${po?.skus?.name ? ` · ${po.skus.name}` : ""}`}
                          className={`flex items-center gap-1 rounded border px-1 py-0.5 text-[10px] leading-tight transition-all ${TYPE_STYLE[event.type]} ${
                            isHighlighted ? `ring-2 ${TYPE_RING[event.type]}` : ""
                          } ${isDimmed ? "opacity-30" : ""}`}
                          onMouseEnter={() => onHoverChange(event.batch.id)}
                          onMouseLeave={() => onHoverChange(null)}
                        >
                          <span className="shrink-0 font-semibold">
                            {event.type === "batch" ? "Batch" : "Can"}
                          </span>
                          <span className="truncate">
                            {po?.skus?.name ?? event.batch.batch_number ?? po?.order_number}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
