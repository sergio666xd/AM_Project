import type { ContactoFirma } from "@/lib/sitioPublico";

/**
 * Responsable del tratamiento de datos que nombran las políticas del sitio.
 * Mientras la firma no tenga personería jurídica responde una persona natural.
 *
 * PROTOTIPO: estos valores aún no se guardan en la base. Cuando se diseñe el
 * almacenamiento pasan a la configuración de la firma y se editan en el admin.
 */
export type DatosResponsable = {
  responsable: string;
  documento: string;
};

export const RESPONSABLE_BASE: DatosResponsable = {
  responsable: "Yeinny Alejandra Muñoz Marín",
  documento: "",
};

type Valores = Record<string, string | null | undefined>;

export function valoresPolitica(contacto: ContactoFirma, datos: DatosResponsable = RESPONSABLE_BASE): Valores {
  return {
    responsable: datos.responsable,
    documento: datos.documento,
    correo_datos: contacto.correo_pqr || contacto.correo_contacto,
    direccion: contacto.direccion,
    telefono: contacto.telefono || contacto.whatsapp,
    ciudad: contacto.ciudad,
  };
}

/**
 * Completa {{campo}} con los datos del responsable. Un tramo entre [[ y ]]
 * se quita entero si alguno de sus campos está vacío, así nunca se publica
 * un marcador ni una frase a medias.
 */
export function completarPolitica(texto: string, valores: Valores): string {
  const valor = (campo: string) => valores[campo]?.trim() ?? "";
  const sinOpcionales = texto.replace(/\[\[([\s\S]*?)\]\]/g, (_, tramo: string) => {
    const campos = [...tramo.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    return campos.every((campo) => valor(campo)) ? tramo : "";
  });
  return sinOpcionales.replace(/\{\{(\w+)\}\}/g, (_, campo: string) => valor(campo));
}
