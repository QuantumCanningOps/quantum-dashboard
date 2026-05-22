"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export type CalendarOrder = {
  id: string;
  order_number: string;
  status: string;
  batching_date: string | null;
  canning_date: string | null;
  skus: { name: string; code: string } | null;
  clients: { name: string } | null;
};

export type CalendarTank = {
  id: string;
  name: string;
  production_orders: CalendarOrder[];
};

const DAYS = 21;

const STATUS_STYLE: Record<string, string> = {
  scheduled: "bg-blue-500 text-white",
  in_progress: "bg-amber-500 text-white",
  complete: "bg-muted text-muted-foreground",
  draft: "bg-muted/60 text-muted-foreground",
};

function parseLocal(str: string): Date {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

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

export function TankCalendar({ tanks }: { tanks: CalendarTank[] }) {
  const [windowStart, setWindowStart] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 3);
    return d;
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toStr(today);

  const days = Array.from({ length: DAYS }, (_, i) => shiftDays(windowStart, i));
  const windowStartStr = toStr(windowStart);
  const windowEndStr = toStr(days[DAYS - 1]);

  const prev = useCallback(() => setWindowStart((d) => shiftDays(d, -7)), []);
  const next = useCallback(() => setWindowStart((d) => shiftDays(d, 7)), []);
  const goToday = useCallback(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 3);
    setWindowStart(d);
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={prev}>
          ← Prev
        </Button>
        <Button variant="outline" size="sm" onClick={goToday}>
          Today
        </Button>
        <Button variant="outline" size="sm" onClick={next}>
          Next →
        </Button>
        <span className="text-sm text-muted-foreground">
          {days[0].toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}{" "}
          –{" "}
          {days[DAYS - 1].toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <div style={{ minWidth: `${128 + DAYS * 44}px` }}>
          {/* Header row */}
          <div className="flex border-b bg-muted/30">
            <div className="w-32 shrink-0 border-r px-3 py-2 text-xs font-medium text-muted-foreground">
              Tank
            </div>
            <div className="flex flex-1">
              {days.map((day) => {
                const str = toStr(day);
                const isToday = str === todayStr;
                const isFirst = day.getDate() === 1;
                return (
                  <div
                    key={str}
                    className={`flex-1 border-r px-0.5 py-1.5 text-center last:border-r-0 ${isToday ? "bg-blue-50" : ""}`}
                  >
                    <div className="text-[10px] leading-none text-muted-foreground">
                      {isFirst
                        ? day.toLocaleDateString(undefined, { month: "short" })
                        : day.toLocaleDateString(undefined, {
                            weekday: "narrow",
                          })}
                    </div>
                    <div
                      className={`mt-0.5 text-xs font-medium leading-none ${isToday ? "text-blue-600" : ""}`}
                    >
                      {day.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tank rows */}
          {tanks.map((tank) => {
            const visible = tank.production_orders.filter((o) => {
              if (!o.batching_date) return false;
              if (o.status === "cancelled" || o.status === "draft") return false;
              const end = o.canning_date ?? o.batching_date;
              return o.batching_date <= windowEndStr && end >= windowStartStr;
            });

            return (
              <div key={tank.id} className="flex border-b last:border-b-0">
                <div className="flex w-32 shrink-0 items-center border-r px-3 text-sm font-medium">
                  {tank.name}
                </div>
                <div className="relative flex flex-1" style={{ height: 52 }}>
                  {/* Day column backgrounds */}
                  <div className="absolute inset-0 flex">
                    {days.map((day) => {
                      const str = toStr(day);
                      return (
                        <div
                          key={str}
                          className={`flex-1 border-r last:border-r-0 ${str === todayStr ? "bg-blue-50" : ""}`}
                        />
                      );
                    })}
                  </div>

                  {/* Order bars */}
                  {visible.map((order) => {
                    if (!order.batching_date) return null;
                    const batchMs = parseLocal(order.batching_date).getTime();
                    const canningMs = parseLocal(
                      order.canning_date ?? order.batching_date,
                    ).getTime();
                    const startMs = windowStart.getTime();
                    const spanMs = DAYS * 86400000;

                    const startFrac = Math.max(
                      0,
                      (batchMs - startMs) / spanMs,
                    );
                    const endFrac = Math.min(
                      1,
                      (canningMs - startMs) / spanMs + 1 / DAYS,
                    );

                    if (startFrac >= 1 || endFrac <= 0) return null;

                    const style = STATUS_STYLE[order.status] ?? STATUS_STYLE.draft;

                    return (
                      <Link
                        key={order.id}
                        href={`/dashboard/production/${order.id}`}
                        title={`${order.order_number}${order.skus?.name ? ` · ${order.skus.name}` : ""}`}
                        className={`absolute top-2 bottom-2 flex items-center overflow-hidden rounded px-2 text-xs font-medium transition-opacity hover:opacity-80 ${style}`}
                        style={{
                          left: `${startFrac * 100}%`,
                          width: `${(endFrac - startFrac) * 100}%`,
                        }}
                      >
                        <span className="truncate">
                          {order.order_number}
                          {order.skus?.name && (
                            <span className="ml-1 opacity-75">
                              {order.skus.name}
                            </span>
                          )}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
