import Link from "next/link";
import { ArrowRight, Bell, FileUp, FolderOpen, MessageSquare, ShieldCheck, Wallet } from "lucide-react";

import { PageHeader } from "@/components/ui/PageHeader";

const C = "/gestion-procesos/cliente";

const PREGUNTAS = [
  {
    pregunta: "¿Cómo le envío un documento a la firma?",
    respuesta: "Entre a Pendientes. Allí está cada documento que le pedimos, con su fecha límite. Toque «Elegir archivo», escoja el documento en su celular o computador y envíelo. Sirven PDF, fotos (JPG o PNG) y Word, de hasta 15 MB.",
    icono: FileUp,
    enlace: { texto: "Ver mis pendientes", href: `${C}/pendientes` },
  },
  {
    pregunta: "¿Cómo sé en qué va mi proceso?",
    respuesta: "En Mis procesos abra el proceso que le interesa. Arriba verá en qué etapa está, explicado en palabras sencillas, y debajo las novedades del juzgado con lo que significan para usted.",
    icono: FolderOpen,
    enlace: { texto: "Ver mis procesos", href: `${C}/procesos` },
  },
  {
    pregunta: "¿Cómo le escribo a mi abogada o abogado?",
    respuesta: "En Mensajes puede escribirle a quien lleva su caso. Le responderán por el mismo medio y le avisaremos cuando llegue la respuesta.",
    icono: MessageSquare,
    enlace: { texto: "Abrir mensajes", href: `${C}/chat` },
  },
  {
    pregunta: "¿Dónde veo lo que he pagado y lo que debo?",
    respuesta: "En Pagos están las cuentas de cobro, lo que ya pagó y lo que queda pendiente, con sus fechas. Los datos para pagar vienen en el PDF de cada cuenta.",
    icono: Wallet,
    enlace: { texto: "Ver mis pagos", href: `${C}/pagos` },
  },
  {
    pregunta: "¿Cómo elijo por dónde me llegan los avisos?",
    respuesta: "En Mi perfil y avisos puede escoger si quiere recibirlos por correo, por WhatsApp o en este dispositivo al instante.",
    icono: Bell,
    enlace: { texto: "Elegir mis avisos", href: `${C}/perfil` },
  },
  {
    pregunta: "¿Cómo cambio mi correo, mi WhatsApp o mi contraseña?",
    respuesta: "En Mi perfil y avisos. Por seguridad, le enviaremos un código de seis números a su correo o a su WhatsApp para confirmar que es usted. No comparta ese código con nadie.",
    icono: ShieldCheck,
    enlace: { texto: "Ir a mi perfil", href: `${C}/perfil` },
  },
] as const;

export default function AyudaClientePage() {
  return (
    <div className="max-w-3xl">
      <PageHeader title="Ayuda" description="Respuestas cortas a lo que más nos preguntan sobre este portal." />

      <ul className="divide-y divide-line overflow-hidden rounded-xl bg-sheet shadow-sheet">
        {PREGUNTAS.map(({ pregunta, respuesta, icono: Icono, enlace }) => (
          <li key={pregunta} className="flex gap-4 px-5 py-5 sm:px-6">
            <Icono aria-hidden size={20} className="mt-0.5 shrink-0 text-ink-2" />
            <div className="min-w-0 flex-1">
              <h2 className="text-balance text-[16px] font-semibold text-ink">{pregunta}</h2>
              <p className="mt-1 max-w-[65ch] text-pretty text-[15px] leading-relaxed text-ink-2">{respuesta}</p>
              <Link
                href={enlace.href}
                className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-navy-ink underline-offset-2 hover:underline"
              >
                {enlace.texto}
                <ArrowRight aria-hidden size={16} />
              </Link>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-pretty text-[14.5px] text-ink-2">
        ¿No encontró lo que buscaba? Escríbale a quien lleva su caso desde{" "}
        <Link href={`${C}/chat`} className="font-semibold text-navy-ink underline underline-offset-2">Mensajes</Link>.
      </p>
    </div>
  );
}
