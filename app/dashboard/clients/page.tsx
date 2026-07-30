export default function ClientsPage() {
  return (
    <div className="flex h-full min-h-[40vh] flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-6 py-16 text-center">
      <p className="text-sm font-medium text-foreground">Select a client</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Choose a client from the list to view contacts, SKUs, lots, orders, and
        inventory.
      </p>
    </div>
  );
}
