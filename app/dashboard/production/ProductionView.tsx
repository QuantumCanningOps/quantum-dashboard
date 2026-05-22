"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductionCalendar } from "./ProductionCalendar";
import { ProductionOrdersTable, type ProductionOrderRow } from "./ProductionOrdersTable";
import { ProductionFilters } from "./ProductionFilters";

type Client = { id: string; name: string };

function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function ProductionView({
  orders,
  clients,
  clientId,
  status,
  q,
}: {
  orders: ProductionOrderRow[];
  clients: Client[];
  clientId: string;
  status: string;
  q: string;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [windowStart, setWindowStart] = useState<Date>(() => mondayOf(new Date()));

  return (
    <>
      <ProductionCalendar
        orders={orders}
        windowStart={windowStart}
        onWindowChange={setWindowStart}
        hoveredId={hoveredId}
        onHoverChange={setHoveredId}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Orders</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ProductionFilters clientId={clientId} status={status} q={q} clients={clients} />
          <ProductionOrdersTable
            orders={orders}
            hoveredId={hoveredId}
            onHoverChange={setHoveredId}
          />
        </CardContent>
      </Card>
    </>
  );
}
