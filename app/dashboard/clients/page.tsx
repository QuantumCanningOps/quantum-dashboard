import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type ClientsPageProps = {
  searchParams?: Promise<{
    browse?: string;
  }>;
};

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  const params = (await searchParams) ?? {};
  const browsing = params.browse === "1";

  if (!browsing) {
    const supabase = await createClient();
    const { data: clients } = await supabase
      .from("clients")
      .select("id")
      .order("name")
      .limit(1);

    if (clients?.[0]?.id) {
      redirect(`/dashboard/clients/${clients[0].id}`);
    }
  }

  return (
    <div className="flex h-full min-h-[40vh] flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-6 py-16 text-center">
      <p className="text-sm font-medium text-foreground">
        {browsing ? "Select a client" : "No clients"}
      </p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {browsing
          ? "Choose a client from the list to view contacts, SKUs, lots, orders, and inventory."
          : "Clients will appear here once they are added."}
      </p>
    </div>
  );
}
