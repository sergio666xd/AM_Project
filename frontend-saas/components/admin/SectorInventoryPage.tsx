import AdminResourcePage from "@/components/admin/console/AdminResourcePage";

type Sector = "FIRMA" | "SAAS" | "GLOBAL";

export function SectorInventoryPage({ sector }: { sector: Sector }) {
  return <AdminResourcePage sector={sector} />;
}
