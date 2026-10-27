import { connection } from "next/server";
import { serverApiUrl } from "@/lib/publicPageContent";

export type PublicContact = {
  nombre: string;
  mostrar_contacto: boolean;
  correo_contacto?: string | null;
  correo_pqr?: string | null;
  telefono?: string | null;
  whatsapp?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  pais?: string | null;
};

// Valores de respaldo si la API no responde; coinciden con los valores base del panel.
export const PUBLIC_CONTACT_DEFAULTS: PublicContact = {
  nombre: "Alejandra Muñoz Abogada y Asociados",
  mostrar_contacto: true,
  correo_contacto: "contacto@alejandramunozabogada.com",
  correo_pqr: "pqr@alejandramunozabogada.com",
  telefono: null,
  whatsapp: "3508809878",
  direccion: null,
  ciudad: "Sabaneta, Antioquia",
  pais: "Colombia",
};

export async function loadPublicContact(): Promise<PublicContact> {
  try {
    await connection();
    const url = serverApiUrl("/contacto-publico");
    if (!url) return PUBLIC_CONTACT_DEFAULTS;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return PUBLIC_CONTACT_DEFAULTS;
    const data = (await response.json()) as PublicContact;
    return data.mostrar_contacto ? { ...PUBLIC_CONTACT_DEFAULTS, ...data } : data;
  } catch (error) {
    console.error("[publicContact] No se pudieron cargar los datos de contacto.", error);
    return PUBLIC_CONTACT_DEFAULTS;
  }
}

// "3508809878" o "+57 350..." → número internacional sin símbolos para wa.me.
export function whatsappDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 ? `57${digits}` : digits;
}

export function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const local = digits.length === 12 && digits.startsWith("57") ? digits.slice(2) : digits;
  if (local.length === 10) return `+57 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  return value;
}
