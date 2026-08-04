import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  availableQuantityForItem,
  buildScaledRequirements,
  freeQuantityForOrder,
  hasReservationPriority,
  reservedQuantityForItem,
  type IngredientQuantityBasis,
  type InventoryAvailabilityRow,
  type ReservationLine,
} from "@/lib/material-readiness";

type RawBatchLine = {
  item_id: string;
  planned_quantity: number;
  unit_of_measure: string;
  items: { name: string; item_type: string } | null;
};

type RawFormulaLine = {
  item_id: string;
  quantity: number;
  unit_of_measure: string;
  quantity_basis: IngredientQuantityBasis;
  items: { name: string; item_type: string } | null;
};

type RawPackagingLine = {
  item_id: string;
  quantity: number;
  unit_of_measure: string;
  quantity_basis: string;
  items: { name: string; item_type: string } | null;
};

type MaterialLine = {
  item_id: string;
  item_name: string;
  item_type: string;
  required: number;
  onHand: number;
  reservedOther: number;
  freeForOrder: number;
  uom: string;
  sufficient: boolean;
};

type Props = {
  orderId: string;
};

export async function MaterialReadinessCard({ orderId }: Props) {
  const supabase = await createClient();

  const { data: orderRow } = await supabase
    .from("production_orders")
    .select(
      "id, client_id, formula_id, sku_id, ordered_quantity, unit_of_measure, created_at, skus(sku_packaging(cans_per_tray, can_size_oz)), formulas(base_quantity, base_unit_of_measure, density_lbs_per_gallon), batches(id, status)",
    )
    .eq("id", orderId)
    .single();

  if (!orderRow) {
    return null;
  }

  const order = orderRow as unknown as {
    id: string;
    client_id: string;
    formula_id: string | null;
    sku_id: string | null;
    ordered_quantity: number;
    unit_of_measure: string;
    created_at: string;
    skus: {
      sku_packaging:
        | { cans_per_tray: number; can_size_oz: number | null }
        | { cans_per_tray: number; can_size_oz: number | null }[]
        | null;
    } | null;
    formulas: {
      base_quantity: number | null;
      base_unit_of_measure: string | null;
      density_lbs_per_gallon: number | null;
    } | null;
    batches: { id: string; status: string }[] | null;
  };

  const activeBatch =
    (order.batches ?? []).find((b) =>
      b.status === "draft" ||
      b.status === "scheduled" ||
      b.status === "in_progress",
    ) ??
    (order.batches ?? []).find((b) => b.status !== "cancelled") ??
    null;

  const [
    { data: batchLineRows },
    { data: openOrderRows },
    { data: formulaLineRows },
    { data: packagingLineRows },
  ] = await Promise.all([
    activeBatch?.id
      ? supabase
          .from("batch_lines")
          .select(
            "item_id, planned_quantity, unit_of_measure, items(name, item_type)",
          )
          .eq("batch_id", activeBatch.id)
      : Promise.resolve({ data: [] as RawBatchLine[] }),
    // Other open orders' batch lines — source of "reserved elsewhere".
    // Do not use inventory_item_summary.quantity_reserved here: that view used
    // to attach raw planned qty onto the on-hand UOM row (g reserved → "lbs").
    supabase
      .from("production_orders")
      .select(
        "id, created_at, batches(id, status, batch_lines(item_id, planned_quantity, unit_of_measure))",
      )
      .eq("client_id", order.client_id)
      .in("status", ["pending", "scheduled", "in_progress"]),
    order.formula_id
      ? supabase
          .from("formula_lines")
          .select(
            "item_id, quantity, unit_of_measure, quantity_basis, items(name, item_type)",
          )
          .eq("formula_id", order.formula_id)
          .eq("line_type", "ingredient")
      : Promise.resolve({ data: [] as RawFormulaLine[] }),
    order.sku_id
      ? supabase
          .from("sku_packaging_lines")
          .select(
            "item_id, quantity, unit_of_measure, quantity_basis, items(name, item_type)",
          )
          .eq("packaging_id", order.sku_id)
      : Promise.resolve({ data: [] as RawPackagingLine[] }),
  ]);

  const useBatchLines = ((batchLineRows ?? []) as RawBatchLine[]).length > 0;

  const otherReservationLines: ReservationLine[] = [];
  for (const openOrder of (openOrderRows ?? []) as {
    id: string;
    created_at: string;
    batches:
      | {
          id: string;
          status: string;
          batch_lines:
            | {
                item_id: string;
                planned_quantity: number;
                unit_of_measure: string;
              }[]
            | null;
        }[]
      | null;
  }[]) {
    if (openOrder.id === order.id) continue;
    // First-come-first-served: only orders created before this one hold a
    // claim against it. Otherwise every order in a competing group counts
    // every other one as "using up" the same stock and all show short.
    if (
      !hasReservationPriority(
        { id: openOrder.id, createdAt: openOrder.created_at },
        { id: order.id, createdAt: order.created_at },
      )
    ) {
      continue;
    }
    for (const batch of openOrder.batches ?? []) {
      if (
        batch.status !== "draft" &&
        batch.status !== "scheduled" &&
        batch.status !== "in_progress"
      ) {
        continue;
      }
      for (const line of batch.batch_lines ?? []) {
        otherReservationLines.push({
          itemId: line.item_id,
          quantity: Number(line.planned_quantity),
          unitOfMeasure: line.unit_of_measure,
        });
      }
    }
  }

  let rawLines: {
    item_id: string;
    item_name: string;
    item_type: string;
    required: number;
    uom: string;
  }[];

  if (useBatchLines) {
    rawLines = ((batchLineRows ?? []) as unknown as RawBatchLine[]).map(
      (line) => ({
        item_id: line.item_id,
        item_name: line.items?.name ?? "—",
        item_type: line.items?.item_type ?? "",
        required: Number(line.planned_quantity),
        uom: line.unit_of_measure,
      }),
    );
  } else {
    const baseQty = order.formulas?.base_quantity ?? 0;
    const baseUom = order.formulas?.base_unit_of_measure ?? "";
    const skuPackaging = Array.isArray(order.skus?.sku_packaging)
      ? order.skus?.sku_packaging[0]
      : order.skus?.sku_packaging;

    const formulaLines = (formulaLineRows ?? []) as unknown as RawFormulaLine[];
    const packagingLines = (packagingLineRows ??
      []) as unknown as RawPackagingLine[];

    const requirements = buildScaledRequirements({
      orderQuantity: Number(order.ordered_quantity),
      orderUnitOfMeasure: order.unit_of_measure,
      baseQuantity: Number(baseQty),
      baseUnitOfMeasure: baseUom,
      cansPerTray: skuPackaging?.cans_per_tray,
      canSizeOz:
        skuPackaging?.can_size_oz != null
          ? Number(skuPackaging.can_size_oz)
          : null,
      densityLbsPerGallon:
        order.formulas?.density_lbs_per_gallon != null
          ? Number(order.formulas.density_lbs_per_gallon)
          : null,
      ingredients: formulaLines.map((line) => ({
        itemId: line.item_id,
        itemName: line.items?.name ?? "",
        quantity: Number(line.quantity),
        unitOfMeasure: line.unit_of_measure,
        quantityBasis: line.quantity_basis ?? "per_batch",
      })),
      packaging: packagingLines.map((line) => ({
        itemId: line.item_id,
        itemName: line.items?.name ?? "",
        quantity: Number(line.quantity),
        unitOfMeasure: line.unit_of_measure,
        quantityBasis: line.quantity_basis,
      })),
    });

    const itemTypeById: Record<string, string> = {};
    for (const line of formulaLines) {
      itemTypeById[line.item_id] = line.items?.item_type ?? "raw_ingredient";
    }
    for (const line of packagingLines) {
      itemTypeById[line.item_id] = line.items?.item_type ?? "packaging";
    }

    rawLines = (requirements ?? []).map((req) => ({
      item_id: req.itemId,
      item_name: req.itemName || "—",
      item_type: itemTypeById[req.itemId] ?? req.kind,
      required: req.required,
      uom: req.unitOfMeasure,
    }));
  }

  const itemIds = [...new Set(rawLines.map((l) => l.item_id))];

  const { data: invRows } = itemIds.length
    ? await supabase
        .from("inventory_item_summary")
        .select("item_id, item_name, unit_of_measure, quantity_on_hand")
        .eq("client_id", order.client_id)
        .in("item_id", itemIds)
    : {
        data: [] as {
          item_id: string;
          item_name: string;
          unit_of_measure: string;
          quantity_on_hand: number;
        }[],
      };

  const onHandInventory: InventoryAvailabilityRow[] = (invRows ?? []).map(
    (row) => ({
      itemId: row.item_id,
      itemName: row.item_name,
      unitOfMeasure: row.unit_of_measure,
      quantity: Number(row.quantity_on_hand),
    }),
  );

  const TYPE_ORDER: Record<string, number> = {
    raw_ingredient: 0,
    wip: 1,
    packaging: 2,
    finished_good: 3,
    ingredient: 0,
  };

  const lines: MaterialLine[] = rawLines
    .map((line) => {
      const onHand = availableQuantityForItem(
        onHandInventory,
        line.item_id,
        line.uom,
        line.item_name,
      );
      const reservedOther = reservedQuantityForItem(
        otherReservationLines,
        line.item_id,
        line.uom,
      );
      const freeForOrder = freeQuantityForOrder({ onHand, reservedOther });
      return {
        ...line,
        onHand,
        reservedOther,
        freeForOrder,
        sufficient: freeForOrder >= line.required,
      };
    })
    .sort((a, b) => {
      if (a.sufficient !== b.sufficient) return a.sufficient ? 1 : -1;
      return (TYPE_ORDER[a.item_type] ?? 9) - (TYPE_ORDER[b.item_type] ?? 9);
    });

  const shortCount = lines.filter((l) => !l.sufficient).length;
  const allSufficient = shortCount === 0 && lines.length > 0;

  return (
    <Card id="material-readiness">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">Material readiness</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {useBatchLines
              ? "Requirements from the batch bill of materials. Available is on hand minus materials reserved by open orders created earlier."
              : "Requirements calculated from formula, scaled to ordered quantity. Available is on hand minus materials reserved by open orders created earlier."}
          </p>
        </div>
        {lines.length > 0 && (
          <Badge
            className={
              allSufficient
                ? "bg-green-50 text-green-700 border-green-200"
                : "bg-red-50 text-red-700 border-red-200"
            }
          >
            {allSufficient
              ? "All materials ready"
              : `${shortCount} item${shortCount !== 1 ? "s" : ""} short`}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {lines.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No bill of materials found for this order.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Item</th>
                  <th className="pb-2 text-left font-medium">Type</th>
                  <th className="pb-2 text-right font-medium">Required</th>
                  <th className="pb-2 text-right font-medium">On Hand</th>
                  <th className="pb-2 text-right font-medium">
                    Reserved by earlier orders
                  </th>
                  <th className="pb-2 text-right font-medium">Available</th>
                  <th className="pb-2 pl-4 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const showUnlimited =
                    line.onHand >= Number.MAX_SAFE_INTEGER / 2;
                  return (
                    <tr
                      key={`${line.item_id}:${line.uom}`}
                      className="border-b last:border-0 hover:bg-muted/30"
                    >
                      <td className="py-2 pr-4 font-medium">
                        <Link
                          href={`/dashboard/inventory?clientId=${order.client_id}&itemId=${line.item_id}`}
                          className="hover:underline"
                        >
                          {line.item_name}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">
                        <ItemTypeBadge type={line.item_type} />
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {fmtQty(line.required)}{" "}
                        <span className="text-muted-foreground">{line.uom}</span>
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {showUnlimited ? (
                          <span className="text-muted-foreground">
                            Plant supply
                          </span>
                        ) : (
                          <>
                            {fmtQty(line.onHand)}{" "}
                            <span className="text-muted-foreground">
                              {line.uom}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {showUnlimited ? (
                          <span className="text-muted-foreground">—</span>
                        ) : line.reservedOther > 0 ? (
                          <span className="text-amber-700">
                            {fmtQty(line.reservedOther)}{" "}
                            <span className="font-normal text-muted-foreground">
                              {line.uom}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {showUnlimited ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span
                            className={
                              line.freeForOrder < line.required
                                ? "text-red-600"
                                : line.reservedOther > 0
                                  ? "text-green-700"
                                  : undefined
                            }
                          >
                            {fmtQty(line.freeForOrder)}{" "}
                            <span className="font-normal text-muted-foreground">
                              {line.uom}
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="py-2 pl-4">
                        {line.sufficient ? (
                          <Badge className="bg-green-50 text-green-700 border-green-200">
                            Ready
                          </Badge>
                        ) : (
                          <Badge className="bg-red-50 text-red-700 border-red-200">
                            Short
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function fmtQty(n: number) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function ItemTypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    raw_ingredient: "bg-blue-50 text-blue-700 border-blue-200",
    packaging: "bg-violet-50 text-violet-700 border-violet-200",
    wip: "bg-orange-50 text-orange-700 border-orange-200",
    finished_good: "bg-teal-50 text-teal-700 border-teal-200",
    ingredient: "bg-blue-50 text-blue-700 border-blue-200",
  };
  const labels: Record<string, string> = {
    raw_ingredient: "Ingredient",
    packaging: "Packaging",
    wip: "WIP",
    finished_good: "Finished",
    ingredient: "Ingredient",
  };
  return (
    <Badge className={map[type] ?? "bg-gray-100 text-gray-600 border-gray-200"}>
      {labels[type] ?? type}
    </Badge>
  );
}
