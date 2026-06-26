"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pencil } from "lucide-react";
import { updateFormulaSpecs } from "./actions";

export type FormulaSpec = {
  id: string;
  name: string;
  target_value: number | null;
  min_value: number | null;
  max_value: number | null;
  unit: string | null;
  notes: string | null;
};

type SpecDraft = {
  key: string;
  name: string;
  minValue: string;
  targetValue: string;
  maxValue: string;
  unit: string;
  notes: string;
};

function toDraft(spec: FormulaSpec): SpecDraft {
  return {
    key: spec.id,
    name: spec.name,
    minValue: spec.min_value === null ? "" : String(spec.min_value),
    targetValue: spec.target_value === null ? "" : String(spec.target_value),
    maxValue: spec.max_value === null ? "" : String(spec.max_value),
    unit: spec.unit ?? "",
    notes: spec.notes ?? "",
  };
}

function newSpecDraft(): SpecDraft {
  return {
    key: crypto.randomUUID(),
    name: "",
    minValue: "",
    targetValue: "",
    maxValue: "",
    unit: "",
    notes: "",
  };
}

function formatSpecValue(value: number | null, unit: string | null) {
  if (value === null) {
    return "-";
  }
  return `${Number(value).toLocaleString()}${unit ? ` ${unit}` : ""}`;
}

export function EditableSpecs({
  formulaId,
  specs,
}: {
  formulaId: string;
  specs: FormulaSpec[];
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentSpecs, setCurrentSpecs] = useState(specs);
  const [drafts, setDrafts] = useState<SpecDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentSpecs(specs);
  }, [specs]);

  function startEditing() {
    setDrafts(currentSpecs.length > 0 ? currentSpecs.map(toDraft) : [newSpecDraft()]);
    setError(null);
    setIsEditing(true);
  }

  function updateDraft(key: string, updates: Partial<SpecDraft>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...updates } : d)));
  }

  function removeDraft(key: string) {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  }

  function addDraft() {
    setDrafts((prev) => [...prev, newSpecDraft()]);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const nextSpecs = drafts
      .filter((d) => d.name.trim())
      .map((d) => ({
        id: d.key,
        name: d.name.trim(),
        min_value: d.minValue.trim() ? Number(d.minValue) : null,
        target_value: d.targetValue.trim() ? Number(d.targetValue) : null,
        max_value: d.maxValue.trim() ? Number(d.maxValue) : null,
        unit: d.unit.trim() || null,
        notes: d.notes.trim() || null,
      }));
    const result = await updateFormulaSpecs(
      formulaId,
      nextSpecs.map((spec) => ({
        name: spec.name,
        minValue: spec.min_value,
        targetValue: spec.target_value,
        maxValue: spec.max_value,
        unit: spec.unit,
        notes: spec.notes,
      }))
    );
    if (!result.success) {
      setError(result.error);
      setSaving(false);
      return;
    }
    setCurrentSpecs(nextSpecs);
    setSaving(false);
    setIsEditing(false);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Specs</CardTitle>
        {!isEditing && (
          <button
            type="button"
            onClick={startEditing}
            aria-label="Edit specs"
            className="text-muted-foreground hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isEditing ? (
          <>
            {drafts.map((draft, i) => (
              <div key={draft.key} className="rounded-lg border p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    Spec {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeDraft(draft.key)}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    Remove
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5 col-span-2">
                    <Label className="text-xs">Name *</Label>
                    <Input
                      placeholder="e.g. Brix"
                      value={draft.name}
                      onChange={(e) => updateDraft(draft.key, { name: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Min</Label>
                    <Input
                      type="number"
                      step="any"
                      value={draft.minValue}
                      onChange={(e) => updateDraft(draft.key, { minValue: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Target</Label>
                    <Input
                      type="number"
                      step="any"
                      value={draft.targetValue}
                      onChange={(e) => updateDraft(draft.key, { targetValue: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Max</Label>
                    <Input
                      type="number"
                      step="any"
                      value={draft.maxValue}
                      onChange={(e) => updateDraft(draft.key, { maxValue: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Unit</Label>
                    <Input
                      placeholder="e.g. °Bx"
                      value={draft.unit}
                      onChange={(e) => updateDraft(draft.key, { unit: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 col-span-2">
                    <Label className="text-xs">Notes</Label>
                    <Input
                      placeholder="Optional"
                      value={draft.notes}
                      onChange={(e) => updateDraft(draft.key, { notes: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            ))}

            <Button type="button" variant="outline" size="sm" className="self-start" onClick={addDraft}>
              + Add Spec
            </Button>

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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Name</th>
                  <th className="pb-2 text-right font-medium">Min</th>
                  <th className="pb-2 text-right font-medium">Target</th>
                  <th className="pb-2 text-right font-medium">Max</th>
                  <th className="pb-2 text-left font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {currentSpecs.map((spec) => (
                  <tr key={spec.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{spec.name}</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatSpecValue(spec.min_value, spec.unit)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatSpecValue(spec.target_value, spec.unit)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatSpecValue(spec.max_value, spec.unit)}
                    </td>
                    <td className="py-2 pl-4 text-muted-foreground">
                      {spec.notes ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
