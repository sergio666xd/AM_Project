import { cache } from "react";
import { connection } from "next/server";
import { API_URL } from "@/lib/api";
import { mezclarContenido } from "@/lib/mezclarContenido";
import type { PublicPageSlug } from "@/lib/sitePageDefaults";

/**
 * Lectura del sitio público desde la API v2, en el servidor. Si la API no
 * responde, cada página se muestra con su texto base y el contacto con los
 * valores base del panel: el sitio nunca queda en blanco.
 */

export type ContactoFirma = {
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

// Coinciden con los valores base de ConfiguracionFirma en el backend.
export const CONTACTO_BASE: ContactoFirma = {
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

function urlApi(ruta: string): URL | null {
  const base = process.env.BACKEND_SERVICE_URL || API_URL;
  if (!base) return null;
  const url = new URL(base);
  url.pathname = `${url.pathname.replace(/\/+$/, "").replace(/\/api$/, "")}/api/v2${ruta}`;
  url.search = "";
  return url;
}

// Una sola lectura por visita aunque la pidan el marco, la página y sus metadatos.
const leer = cache(async function leer<T>(ruta: string): Promise<T | null> {
  // Los enlaces de servicio de Vercel existen al atender la visita, no al compilar.
  await connection();
  const url = urlApi(ruta);
  if (!url) return null;
  try {
    const respuesta = await fetch(url, { cache: "no-store" });
    if (!respuesta.ok) {
      console.error(`[sitio] La API respondió ${respuesta.status} en ${ruta}.`);
      return null;
    }
    return (await respuesta.json()) as T;
  } catch (error) {
    console.error(`[sitio] No se pudo leer ${ruta}.`, error);
    return null;
  }
}) as <T>(ruta: string) => Promise<T | null>;

export async function cargarPagina<T>(slug: PublicPageSlug, base: T): Promise<T> {
  const pagina = await leer<{ contenido: unknown }>(`/sitio/paginas/${encodeURIComponent(slug)}`);
  return mezclarContenido(base, pagina?.contenido ?? null);
}

export async function cargarContacto(): Promise<ContactoFirma> {
  return (await leer<ContactoFirma>("/sitio/contacto")) ?? CONTACTO_BASE;
}
