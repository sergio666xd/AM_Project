import Link from "next/link";
import { clasesBoton } from "@/components/ui/Button";
import { Carpeta, Entrada, RELLENO, TituloPagina } from "@/components/sitio/Caratula";
import { MarcoSitio } from "@/components/sitio/MarcoSitio";

export default function PaginaNoEncontrada() {
  return (
    <MarcoSitio>
      <Carpeta
        actual={null}
        caratula={
          <div>
            <TituloPagina>No encontramos esta página</TituloPagina>
            <Entrada>El enlace pudo cambiar o ya no existe. Desde aquí puede volver al inicio o escribirnos su consulta.</Entrada>
          </div>
        }
      >
        <div className={`${RELLENO} flex flex-col gap-3 sm:flex-row`}>
          <Link href="/" className={clasesBoton("primary", "lg")}>Volver al inicio</Link>
          <Link href="/areas-de-practica" className={clasesBoton("secondary", "lg")}>Ver áreas de práctica</Link>
        </div>
      </Carpeta>
    </MarcoSitio>
  );
}
