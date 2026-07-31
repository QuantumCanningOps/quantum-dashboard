"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pencil } from "lucide-react";
import { SEL, OPT, NewSkuForm, type SkuOption } from "../shared";
import type { NewSkuResult } from "../new/actions";
import { updateFormulaSku } from "./actions";

export type SkuRow = {
  id: string;
  code: string;
  name: string;
  shelf_life_days: number | null;
};

export function EditableSku({
  formulaId,
  clientId,
  linkedSkus,
  clientSkus: initialClientSkus,
}: {
  formulaId: string;
  clientId: string;
  linkedSkus: SkuRow[];
  clientSkus: SkuOption[];
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentLinkedSkus, setCurrentLinkedSkus] = useState(linkedSkus);
  const [skuId, setSkuId] = useState(linkedSkus[0]?.id ?? "");
  const [creatingSku, setCreatingSku] = useState(false);
  const [extraSkus, setExtraSkus] = useState<SkuOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allClientSkus = [
    ...initialClientSkus,
    ...extraSkus.filter((s) => !initialClientSkus.some((is) => is.id === s.id)),
  ];

  useEffect(() => {
    setCurrentLinkedSkus(linkedSkus);
  }, [linkedSkus]);

  function startEditing() {
    setSkuId(currentLinkedSkus[0]?.id ?? "");
    setCreatingSku(false);
    setError(null);
    setIsEditing(true);
  }

  function handleSkuChange(value: string) {
    if (value === "__new__") {
      setCreatingSku(true);
      return;
    }
    setCreatingSku(false);
    setSkuId(value);
  }

  function handleSkuCreated(sku: NewSkuResult) {
    setCreatingSku(false);
    setExtraSkus((prev) => [...prev, sku]);
    setSkuId(sku.id);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateFormulaSku({
      formulaId,
      newSkuId: skuId || null,
      previousSkuIds: currentLinkedSkus.map((s) => s.id),
    });
    if (!result.success) {
      setError(result.error);
      setSaving(false);
      return;
    }
    const selectedSku = allClientSkus.find((s) => s.id === skuId);
    setCurrentLinkedSkus(
      selectedSku
        ? [
            {
              id: selectedSku.id,
              code: selectedSku.code,
              name: selectedSku.name,
              shelf_life_days: selectedSku.shelf_life_days,
            },
          ]
        : [],
    );
    setSaving(false);
    setIsEditing(false);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">SKU</CardTitle>
        {!isEditing && (
          <button
            type="button"
            onClick={startEditing}
            aria-label="Edit SKU"
            className="text-muted-foreground hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isEditing ? (
          <>
            <select
              className={SEL}
              value={creatingSku ? "__new__" : skuId}
              onChange={(e) => handleSkuChange(e.target.value)}
            >
              <option value="" className={OPT}>No SKU linked</option>
              {allClientSkus.map((s) => (
                <option key={s.id} value={s.id} className={OPT}>
                  {s.code} — {s.name}
                </option>
              ))}
              <option disabled className={OPT}>──────────</option>
              <option value="__new__" className={OPT}>+ Create new SKU…</option>
            </select>

            {creatingSku && (
              <NewSkuForm
                clientId={clientId}
                onCreated={handleSkuCreated}
                onCancel={() => setCreatingSku(false)}
              />
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </>
        ) : (
          <ul className="flex flex-col gap-2">
            {currentLinkedSkus.length === 0 && (
              <li className="text-sm text-muted-foreground">No SKU linked.</li>
            )}
            {currentLinkedSkus.map((sku) => (
              <li key={sku.id} className="flex items-center gap-2 text-sm">
                <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                  {sku.code}
                </span>
                <span className="font-medium">{sku.name}</span>
                <span className="ml-auto text-muted-foreground">
                  {sku.shelf_life_days ?? "--"} days
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
