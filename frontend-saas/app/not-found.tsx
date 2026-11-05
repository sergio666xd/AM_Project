import { ArrowRight, House } from "lucide-react";
import Link from "next/link";
import { clasesBoton } from "@/components/ui/Button";
import { Carpeta, Entrada, RELLENO, TituloPagina } from "@/components/sitio/Caratula";
import { MarcoSitio } from "@/components/sitio/MarcoSitio";

export default function PaginaNoEncontrada() {
  return (
    <MarcoSitio>
      <Carpeta
        caratula={
          <div>
            <TituloPagina>No encontramos esta página</TituloPagina>
            <Entrada>El enlace pudo cambiar o ya no existe. Desde aquí puede volver al inicio o escribirnos su consulta.</Entrada>
          </div>
        }
      >
        <div className={`${RELLENO} flex flex-col gap-3 sm:flex-row`}>
          <Link href="/" className={clasesBoton("primary", "lg")}><House aria-hidden="true" size={18} strokeWidth={2} />Volver al inicio</Link>
          <Link href="/servicios" className={clasesBoton("secondary", "lg")}>Ver servicios<ArrowRight aria-hidden="true" size={18} strokeWidth={2} /></Link>
        </div>
      </Carpeta>
    </MarcoSitio>
  );
}
