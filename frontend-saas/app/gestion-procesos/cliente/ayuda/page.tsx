import Link from "next/link";
import { BookOpen, FileText, MessageCircle, Bell, FolderOpen, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";

const faqs = [
  {
    q: "¿Cómo entrego un documento solicitado?",
    a: "Abre la sección Documentos, busca la solicitud pendiente en la lista, selecciona el archivo desde tu dispositivo y pulsa Entregar archivo. Se aceptan formatos PDF, JPG, PNG y DOCX de hasta 15 MB.",
    icon: FileText,
    href: "/gestion-procesos/cliente/documentos",
  },
  {
    q: "¿Cómo consulto el avance de mi proceso judicial?",
    a: "En Mis procesos selecciona el expediente de tu interés para ver el estado explicado en lenguaje claro, las novedades judiciales de la Rama Judicial, tareas, documentos y fechas clave compartidas por el despacho.",
    icon: FolderOpen,
    href: "/gestion-procesos/cliente/procesos",
  },
  {
    q: "¿Dónde encuentro mis avisos y notificaciones?",
    a: "El centro de notificaciones reúne avisos en tiempo real sobre nuevas actuaciones, solicitudes de documentos, tareas y eventos. Puedes consultarlos y marcarlos como leídos.",
    icon: Bell,
    href: "/gestion-procesos/cliente/notificaciones",
  },
  {
    q: "¿Cómo contacto a mi abogado responsable?",
    a: "En el detalle de tu proceso y en la sección Mensajes verás el correo y el botón de WhatsApp directo del abogado asignado. También puedes usar el chat integrado del portal.",
    icon: MessageCircle,
    href: "/gestion-procesos/cliente/mensajes",
  },
];

export default function AyudaClientePage() {
  return (
    <section className="mx-auto max-w-4xl space-y-6 pb-24">
      <PageHeader
        overline="Portal del cliente"
        title="Centro de ayuda"
        description="Respuestas y guías rápidas para utilizar tu portal de expedientes."
      />

      <div className="grid gap-4">
        {faqs.map(({ q, a, icon: Icon, href }) => (
          <article
            key={q}
            className="rounded-xl border border-border bg-surface p-5 shadow-xs transition hover:border-brand-500/50"
          >
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                <Icon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-foreground text-base">{q}</h2>
                <p className="mt-1 text-xs text-muted leading-relaxed">{a}</p>
                <div className="mt-3">
                  <Link href={href}>
                    <Button variant="outline" size="sm" icon={<BookOpen className="size-3.5" />}>
                      Abrir sección
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-surface-secondary/60 p-4 text-center">
        <p className="text-xs text-muted">
          ¿Necesitas asistencia adicional? Comunícate directamente con tu abogado a través del chat del proceso o los canales de contacto de tu expediente.
        </p>
      </div>
    </section>
  );
}
