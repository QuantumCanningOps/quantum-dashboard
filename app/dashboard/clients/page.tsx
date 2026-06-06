import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Suspense } from "react";

export default function ClientsPage() {
  return (
    <Suspense fallback={<ClientsFallback />}>
      <ClientsList />
    </Suspense>
  );
}

async function ClientsList() {
  const supabase = await createClient();

  const [{ data: clients }, { data: skus }, { data: contacts }, { data: lots }, { data: openOrders }] =
    await Promise.all([
      supabase.from("clients").select("id, name, code, active"),
      supabase
        .from("skus")
        .select("id, client_id, code, name, shelf_life_days, formula_id, formulas(version, status)"),
      supabase
        .from("contacts")
        .select("id, party_id, name, email, phone, role, primary_contact")
        .eq("party_type", "client"),
      supabase
        .from("lots")
        .select("id, client_id, status"),
      supabase
        .from("production_orders")
        .select("id, order_number, sku_id, client_id, ordered_quantity, unit_of_measure, status")
        .in("status", ["pending", "scheduled", "in_progress"])
        .order("created_at", { ascending: false }),
    ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Clients</h1>

      <div className="grid md:grid-cols-2 gap-6">
        {(clients ?? []).map((client) => {
          const clientSkus = (skus ?? []).filter(
            (s) => s.client_id === client.id
          );
          const clientContacts = (contacts ?? []).filter(
            (c) => c.party_id === client.id
          );
          const clientLots = (lots ?? []).filter(
            (l) => l.client_id === client.id
          );
          const clientOrders = (openOrders ?? []).filter(
            (o) => o.client_id === client.id
          );
          const ordersBySku = clientOrders.reduce(
            (acc, o) => {
              if (o.sku_id) (acc[o.sku_id] ??= []).push(o);
              return acc;
            },
            {} as Record<string, typeof clientOrders>
          );
          const lotsByStatus = clientLots.reduce(
            (acc, l) => {
              acc[l.status] = (acc[l.status] ?? 0) + 1;
              return acc;
            },
            {} as Record<string, number>
          );

          return (
            <Card key={client.id}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <CardTitle>{client.name}</CardTitle>
                  <Badge className="bg-slate-100 text-slate-600 border-slate-200 font-mono">
                    {client.code}
                  </Badge>
                  {!client.active && (
                    <Badge className="bg-red-100 text-red-700 border-red-200">
                      Inactive
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                {/* Lot status summary */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                    Lots
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(lotsByStatus).map(([status, count]) => (
                      <span
                        key={status}
                        className="text-xs text-muted-foreground"
                      >
                        <StatusBadge status={status} /> {count}
                      </span>
                    ))}
                    {clientLots.length === 0 && (
                      <span className="text-xs text-muted-foreground">
                        No lots
                      </span>
                    )}
                  </div>
                </div>

                {/* SKUs */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                    SKUs
                  </p>
                  <ul className="flex flex-col gap-2">
                    {clientSkus.map((sku) => {
                      const formula = sku.formulas as unknown as {
                        version: number;
                        status: string;
                      } | null;
                      const skuOrders = ordersBySku[sku.id] ?? [];
                      return (
                        <li key={sku.id} className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <Link
                              href={
                                sku.formula_id
                                  ? `/dashboard/formulas/${sku.formula_id}`
                                  : "/dashboard/clients"
                              }
                              className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 hover:bg-muted"
                              aria-disabled={!sku.formula_id}
                            >
                              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                                {sku.code}
                              </span>
                              <span className="truncate text-sm hover:underline">
                                {sku.name}
                              </span>
                            </Link>
                            {formula && (
                              <span className="text-xs text-muted-foreground ml-auto">
                                Formula v{formula.version}
                                {formula.status === "authorized" && (
                                  <span className="ml-1 text-green-600">✓</span>
                                )}
                              </span>
                            )}
                          </div>
                          {skuOrders.length > 0 && (
                            <ul className="ml-4 flex flex-col gap-0.5">
                              {skuOrders.map((order) => (
                                <li key={order.id} className="flex items-center gap-2">
                                  <Link
                                    href={`/dashboard/production/${order.id}`}
                                    className="font-mono text-xs text-muted-foreground hover:underline"
                                  >
                                    {order.order_number}
                                  </Link>
                                  <span className="text-xs text-muted-foreground tabular-nums">
                                    {Number(order.ordered_quantity).toLocaleString()} {order.unit_of_measure}
                                  </span>
                                  <OrderStatusBadge status={order.status} />
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* Contacts */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                    Contacts
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {clientContacts.map((contact) => (
                      <li key={contact.id} className="flex items-center gap-2 text-sm">
                        {contact.primary_contact && (
                          <span className="text-yellow-500" title="Primary">★</span>
                        )}
                        <span className="font-medium">{contact.name}</span>
                        <span className="text-muted-foreground">{contact.role}</span>
                        <a
                          href={`mailto:${contact.email}`}
                          className="text-xs text-muted-foreground hover:underline ml-auto"
                        >
                          {contact.email}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ClientsFallback() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Clients</h1>

      <div className="grid md:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardHeader>
              <div className="h-6 w-40 animate-pulse rounded bg-muted" />
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function OrderStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    scheduled: "bg-blue-50 text-blue-700 border-blue-200",
    in_progress: "bg-violet-50 text-violet-700 border-violet-200",
  };
  const labels: Record<string, string> = {
    pending: "Pending",
    scheduled: "Scheduled",
    in_progress: "In Progress",
  };
  return (
    <Badge className={`ml-auto text-[10px] px-1.5 py-0 ${map[status] ?? ""}`}>
      {labels[status] ?? status}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    released: "bg-green-100 text-green-800 border-green-200",
    quarantine: "bg-yellow-100 text-yellow-800 border-yellow-200",
    on_hold: "bg-red-100 text-red-800 border-red-200",
    consumed: "bg-gray-100 text-gray-600 border-gray-200",
  };
  const labels: Record<string, string> = {
    released: "Released",
    quarantine: "Quarantine",
    on_hold: "On Hold",
    consumed: "Consumed",
  };
  return (
    <Badge className={map[status] ?? ""}>{labels[status] ?? status}</Badge>
  );
}
