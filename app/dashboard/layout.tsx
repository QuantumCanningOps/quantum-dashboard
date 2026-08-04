import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";

const navLinks = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/production-orders", label: "Production Orders" },
  { href: "/dashboard/production", label: "Batch Schedule" },
  { href: "/dashboard/tanks", label: "Tanks" },
  { href: "/dashboard/lots", label: "Lots" },
  { href: "/dashboard/inventory/summary", label: "Inventory" },
  { href: "/dashboard/inventory", label: "Lot Detail" },
  { href: "/dashboard/inventory/counts", label: "Counts" },
  { href: "/dashboard/receiving", label: "Receiving" },
  { href: "/dashboard/clients", label: "Clients" },
  { href: "/dashboard/formulas/new", label: "New Formula" },
  { href: "/dashboard/documents", label: "Documents" },
  { href: "/dashboard/needs-attention", label: "Needs Attention" },
  { href: "/dashboard/settings", label: "Settings" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect("/auth/login");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b h-14 flex items-center px-6 gap-6 shrink-0">
        <span className="font-semibold text-sm">QuantumCanning</span>
        <nav className="flex gap-4 text-sm">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
          <span>{data.claims.email}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto">{children}</main>
    </div>
  );
}
