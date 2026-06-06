import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { Suspense } from "react";

const navLinks = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/production-orders", label: "Production Orders" },
  { href: "/dashboard/production", label: "Batch Schedule" },
  { href: "/dashboard/tanks", label: "Tanks" },
  { href: "/dashboard/lots", label: "Lots" },
  { href: "/dashboard/inventory/summary", label: "Inventory" },
  { href: "/dashboard/inventory", label: "Lot Detail" },
  { href: "/dashboard/receiving", label: "Receiving" },
  { href: "/dashboard/clients", label: "Clients" },
  { href: "/dashboard/documents", label: "Documents" },
  { href: "/dashboard/needs-attention", label: "Needs Attention" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<DashboardLayoutFallback />}>
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  );
}

async function DashboardShell({ children }: { children: React.ReactNode }) {
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

function DashboardLayoutFallback() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b h-14 flex items-center px-6 gap-6 shrink-0">
        <span className="font-semibold text-sm">QuantumCanning</span>
        <nav className="flex gap-4 text-sm">
          {navLinks.map((link) => (
            <span key={link.href} className="text-muted-foreground">
              {link.label}
            </span>
          ))}
        </nav>
        <div className="ml-auto h-4 w-40 animate-pulse rounded bg-muted" />
      </header>
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
        <div className="h-6 w-48 animate-pulse rounded bg-muted" />
      </main>
    </div>
  );
}
