import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import GuestOnly from "@/components/auth/GuestOnly";
import { RegistroForm } from "./RegistroForm";

// Página de servidor: así el pie de página puede cargar los datos de contacto del panel.
export default function RegistroPage() {
  return (
    <MarketingLayout>
      <GuestOnly><RegistroForm /></GuestOnly>
    </MarketingLayout>
  );
}
