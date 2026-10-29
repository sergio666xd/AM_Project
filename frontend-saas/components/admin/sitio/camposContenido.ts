import type { PublicPageSlug } from "@/lib/sitePageDefaults";

/**
 * Qué se edita en cada página del sitio y con qué nombre. Solo aparecen los
 * textos que el sitio muestra hoy; lo demás que traiga el contenido guardado
 * se conserva tal cual al guardar.
 */

export type Campo =
  /** `bloques`: admite párrafos, listas y citas además del formato en línea. */
  | { tipo: "texto"; clave: string; etiqueta: string; ayuda?: string; largo?: boolean; bloques?: boolean; requerido?: boolean }
  /** Lista de textos cortos, uno por línea. */
  | { tipo: "lineas"; clave: string; etiqueta: string; ayuda?: string }
  /** El área de práctica a la que lleva el elemento (se guarda en `icon`). */
  | { tipo: "tema"; clave: string; etiqueta: string; ayuda?: string }
  | { tipo: "interruptor"; clave: string; etiqueta: string; ayuda?: string }
  | {
      tipo: "lista";
      clave: string;
      etiqueta: string;
      /** Para «Agregar servicio» y «Servicio 2». */
      singular: string;
      campos: Campo[];
      nuevo: () => Record<string, unknown>;
      ayuda?: string;
    };

export type Grupo = { titulo: string; descripcion?: string; dentroDe?: string; campos: Campo[] };

export const TEMAS: { valor: string; nombre: string }[] = [
  { valor: "family", nombre: "Familia y patrimonio" },
  { valor: "business", nombre: "Empresas" },
  { valor: "building", nombre: "Propiedad horizontal" },
  { valor: "government", nombre: "Entidades públicas" },
  { valor: "", nombre: "Otro tema" },
];

const titulo = (etiqueta = "Título", ayuda?: string): Campo => ({ tipo: "texto", clave: "title", etiqueta, ayuda, requerido: true });
const texto = (clave: string, etiqueta: string, ayuda?: string): Campo => ({ tipo: "texto", clave, etiqueta, ayuda });
const largo = (clave: string, etiqueta: string, ayuda?: string): Campo => ({ tipo: "texto", clave, etiqueta, ayuda, largo: true });
const bloques = (clave: string, etiqueta: string, ayuda?: string): Campo => ({ tipo: "texto", clave, etiqueta, ayuda, largo: true, bloques: true });

const BUSCADORES: Grupo = {
  titulo: "Cómo aparece en Google",
  descripcion: "El título y la descripción que muestran los buscadores y la pestaña del navegador.",
  dentroDe: "seo",
  campos: [
    { tipo: "texto", clave: "title", etiqueta: "Título en los buscadores", ayuda: "Hasta unos 60 caracteres; lo que pase de ahí Google lo corta." },
    largo("description", "Descripción en los buscadores", "Hasta unos 155 caracteres."),
    texto("keywords", "Palabras clave", "Separadas por comas."),
    { tipo: "interruptor", clave: "noIndex", etiqueta: "Ocultar esta página de los buscadores", ayuda: "La página sigue abierta para quien tenga el enlace." },
  ],
};

const SECCIONES_LEGALES: Grupo[] = [
  {
    titulo: "Encabezado",
    campos: [titulo(), texto("updatedAt", "Fecha de actualización", "Como se lee en la página, por ejemplo «27 de septiembre de 2026».")],
  },
  {
    titulo: "Secciones",
    descripcion: "Se numeran solas y forman el índice de la página.",
    campos: [{
      tipo: "lista", clave: "sections", etiqueta: "Secciones", singular: "sección",
      campos: [titulo("Título de la sección"), bloques("body", "Texto")],
      nuevo: () => ({ title: "", body: "" }),
    }],
  },
];

export const GRUPOS: Record<PublicPageSlug, Grupo[]> = {
  inicio: [
    {
      titulo: "Portada",
      campos: [
        { tipo: "texto", clave: "heroTitle", etiqueta: "Título", requerido: true },
        largo("heroDescription", "Texto bajo el título"),
        largo("heroAside", "Frase junto al formulario"),
      ],
    },
    {
      titulo: "Servicios",
      campos: [
        texto("servicesTitle", "Título de la sección"),
        texto("servicesLink", "Texto del enlace a Áreas de práctica"),
        {
          tipo: "lista", clave: "services", etiqueta: "Servicios", singular: "servicio",
          ayuda: "También forman la línea «Asuntos» de la portada.",
          campos: [
            titulo("Nombre"),
            largo("description", "Descripción"),
            { tipo: "tema", clave: "icon", etiqueta: "Lleva a", ayuda: "Al tocarlo se abre esta área en Áreas de práctica." },
          ],
          nuevo: () => ({ icon: "", title: "", description: "" }),
        },
      ],
    },
    {
      titulo: "Enfoque preventivo",
      campos: [
        texto("preventionTitle", "Título de la sección"),
        largo("preventionDescription", "Texto"),
        { tipo: "lineas", clave: "preventionItems", etiqueta: "Momentos para consultar", ayuda: "Uno por línea." },
      ],
    },
    {
      titulo: "Presentación de la firma",
      campos: [texto("aboutTitle", "Título"), largo("aboutDescription", "Texto"), texto("aboutLink", "Texto del enlace a Quiénes somos")],
    },
    BUSCADORES,
  ],
  "quienes-somos": [
    {
      titulo: "Encabezado",
      campos: [
        titulo(),
        bloques("intro", "Presentación", "Si el texto empieza con una cita («> …»), la cita se muestra destacada a la izquierda."),
      ],
    },
    {
      titulo: "Secciones",
      campos: [{
        tipo: "lista", clave: "sections", etiqueta: "Secciones", singular: "sección",
        campos: [titulo("Título de la sección"), bloques("body", "Texto")],
        nuevo: () => ({ title: "", body: "" }),
      }],
    },
    BUSCADORES,
  ],
  "areas-de-practica": [
    { titulo: "Encabezado", campos: [titulo(), largo("description", "Texto bajo el título")] },
    {
      titulo: "Áreas",
      descripcion: "Cada área tiene su propio botón «Consultar sobre este tema».",
      campos: [{
        tipo: "lista", clave: "areas", etiqueta: "Áreas", singular: "área",
        campos: [
          titulo("Nombre del área"),
          largo("description", "Descripción"),
          { tipo: "tema", clave: "icon", etiqueta: "Tema del formulario", ayuda: "El formulario de consulta llega con este tema marcado." },
          {
            tipo: "lista", clave: "sections", etiqueta: "Grupos de servicios", singular: "grupo",
            campos: [titulo("Nombre del grupo"), { tipo: "lineas", clave: "items", etiqueta: "Servicios", ayuda: "Uno por línea." }],
            nuevo: () => ({ title: "", items: [] }),
          },
        ],
        nuevo: () => ({ icon: "", title: "", description: "", sections: [] }),
      }],
    },
    {
      titulo: "Cierre",
      campos: [texto("closingTitle", "Título"), largo("closingDescription", "Texto"), texto("closingCta", "Texto del botón")],
    },
    BUSCADORES,
  ],
  filosofia: [
    { titulo: "Encabezado", campos: [titulo(), largo("intro", "Texto bajo el título")] },
    {
      titulo: "Principios",
      campos: [{
        tipo: "lista", clave: "values", etiqueta: "Principios", singular: "principio",
        campos: [titulo("Nombre"), largo("description", "Descripción")],
        nuevo: () => ({ title: "", description: "" }),
      }],
    },
    {
      titulo: "Metodología",
      campos: [
        texto("methodologyTitle", "Título de la sección"),
        largo("methodologyDescription", "Texto"),
        {
          tipo: "lista", clave: "steps", etiqueta: "Pasos", singular: "paso", ayuda: "Se numeran solos, en este orden.",
          campos: [titulo("Nombre del paso"), largo("description", "Descripción")],
          nuevo: () => ({ title: "", description: "" }),
        },
      ],
    },
    BUSCADORES,
  ],
  contacto: [
    { titulo: "Encabezado", campos: [titulo(), largo("intro", "Texto bajo el título")] },
    {
      titulo: "Datos de atención",
      descripcion: "Aparecen junto al título. El WhatsApp y el correo salen de los datos de la firma.",
      campos: [{
        tipo: "lista", clave: "contactOptions", etiqueta: "Datos", singular: "dato",
        campos: [titulo("Nombre del dato"), texto("description", "Texto")],
        nuevo: () => ({ icon: "info", title: "", description: "" }),
      }],
    },
    {
      titulo: "Preguntas frecuentes",
      campos: [
        texto("faqEyebrow", "Título de la sección"),
        {
          tipo: "lista", clave: "faqs", etiqueta: "Preguntas", singular: "pregunta",
          campos: [{ tipo: "texto", clave: "question", etiqueta: "Pregunta", requerido: true }, largo("answer", "Respuesta")],
          nuevo: () => ({ question: "", answer: "" }),
        },
      ],
    },
    BUSCADORES,
  ],
  "poliza-juridica": [
    {
      titulo: "Encabezado",
      campos: [titulo(), largo("intro", "Texto bajo el título"), texto("asideTitle", "Título del recuadro"), largo("asideDescription", "Texto del recuadro")],
    },
    {
      titulo: "Cobertura",
      campos: [
        texto("coverageTitle", "Título de la sección"),
        largo("coverageDescription", "Texto"),
        {
          tipo: "lista", clave: "benefits", etiqueta: "Servicios incluidos", singular: "servicio",
          campos: [titulo("Nombre"), largo("description", "Descripción")],
          nuevo: () => ({ icon: "document", title: "", description: "" }),
        },
      ],
    },
    {
      titulo: "Cierre",
      campos: [texto("closingTitle", "Título"), largo("closingDescription", "Texto"), texto("closingCta", "Texto del botón")],
    },
    BUSCADORES,
  ],
  "politica-de-privacidad": [...SECCIONES_LEGALES, BUSCADORES],
  "tratamiento-de-datos": [...SECCIONES_LEGALES, BUSCADORES],
};

type Objeto = Record<string, unknown>;

/**
 * Deja el contenido como lo edita el formulario: el texto de las políticas en
 * un solo campo y sin el correo de Contacto, que ya sale de los datos de la firma.
 */
export function prepararContenido(slug: PublicPageSlug, contenido: Objeto): Objeto {
  const copia = structuredClone(contenido);
  if ((slug === "politica-de-privacidad" || slug === "tratamiento-de-datos") && Array.isArray(copia.sections)) {
    copia.sections = (copia.sections as Objeto[]).map((s) => (Array.isArray(s.body) ? { ...s, body: s.body.join("\n\n") } : s));
  }
  if (slug === "contacto" && Array.isArray(copia.contactOptions)) {
    copia.contactOptions = (copia.contactOptions as Objeto[]).filter((o) => o.icon !== "email");
  }
  return copia;
}

/** Busca el primer campo obligatorio vacío; devuelve su ruta y una frase para la persona. */
export function primerFaltante(grupos: Grupo[], contenido: Objeto): { ruta: string; mensaje: string } | null {
  function revisar(campos: Campo[], valor: Objeto, ruta: string[], donde: string): { ruta: string; mensaje: string } | null {
    for (const campo of campos) {
      const actual = valor[campo.clave];
      if (campo.tipo === "texto" && campo.requerido && !(typeof actual === "string" && actual.trim())) {
        return { ruta: [...ruta, campo.clave].join("."), mensaje: `Falta llenar «${campo.etiqueta}»${donde}.` };
      }
      if (campo.tipo === "lista" && Array.isArray(actual)) {
        for (let i = 0; i < actual.length; i++) {
          const hallado = revisar(campo.campos, actual[i] as Objeto, [...ruta, campo.clave, String(i)], ` en ${campo.singular} ${i + 1}`);
          if (hallado) return hallado;
        }
      }
    }
    return null;
  }
  for (const grupo of grupos) {
    const base = grupo.dentroDe ? ((contenido[grupo.dentroDe] as Objeto) ?? {}) : contenido;
    const hallado = revisar(grupo.campos, base, grupo.dentroDe ? [grupo.dentroDe] : [], "");
    if (hallado) return hallado;
  }
  return null;
}
