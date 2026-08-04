export function inventoryCountCsvTemplate(): string {
  const headers = [
    "client_code",
    "item_code",
    "item_name",
    "lot_number",
    "quantity",
    "unit_of_measure",
    "location_label",
    "lot_status",
    "supplier_code",
    "manufacture_date",
    "expiration_date",
    "notes",
  ];
  const example = [
    "ACME",
    "SUGAR-01",
    "Cane Sugar",
    "ACME-SUGAR-OPEN-001",
    "500",
    "kg",
    "A-01-1",
    "released",
    "",
    "",
    "",
    "Opening balance cutover",
  ];
  return `${headers.join(",")}\n${example.join(",")}\n`;
}
