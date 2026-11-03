"use client";

import { useId } from "react";

import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { cx } from "@/lib/cx";

type Tipo = "texto" | "correo" | "telefono" | "parrafo" | "genero";
type Campo = { clave: string; nombre: string; tipo: Tipo; ayuda?: string };

/** Los datos que llenan la plantilla CPS, agrupados como se leen en el contrato. */
export const GRUPOS_CONTRATO: { titulo: string; campos: Campo[] }[] = [
  { titulo: "El cliente", campos: [
    { clave: "nombre", nombre: "Nombres y apellidos", tipo: "texto" },
    { clave: "genero_cliente", nombre: "Se le trata como", tipo: "genero" },
    { clave: "documento", nombre: "Cédula", tipo: "texto", ayuda: "Sin puntos." },
    { clave: "ciudad", nombre: "Domicilio (ciudad)", tipo: "texto" },
  ] },
  { titulo: "Lo que se contrata", campos: [
    { clave: "objeto", nombre: "Objeto del contrato", tipo: "parrafo", ayuda: "Qué hará la firma por el cliente, en una o dos frases." },
    { clave: "honorarios", nombre: "Honorarios", tipo: "parrafo", ayuda: "Viene con el texto de la firma; ajústelo a lo pactado." },
  ] },
  { titulo: "Dónde notificar al cliente", campos: [
    { clave: "direccion", nombre: "Dirección", tipo: "texto" },
    { clave: "correo", nombre: "Correo", tipo: "correo" },
    { clave: "telefono", nombre: "Teléfono", tipo: "telefono" },
  ] },
  { titulo: "El abogado", campos: [
    { clave: "abogado_nombre", nombre: "Nombre", tipo: "texto" },
    { clave: "genero_abogado", nombre: "Se le trata como", tipo: "genero" },
    { clave: "abogado_documento", nombre: "Cédula", tipo: "texto" },
    { clave: "abogado_tarjeta", nombre: "Tarjeta profesional", tipo: "texto" },
    { clave: "abogado_correo", nombre: "Correo", tipo: "correo" },
    { clave: "abogado_telefono", nombre: "Teléfono", tipo: "telefono" },
    { clave: "abogado_domicilio", nombre: "Domicilio", tipo: "texto" },
  ] },
  { titulo: "Fecha de firma", campos: [
    { clave: "dia", nombre: "Día", tipo: "texto" },
    { clave: "mes", nombre: "Mes", tipo: "texto" },
    { clave: "anio", nombre: "Año", tipo: "texto" },
  ] },
];

const CONSERVA_MAYUSCULAS = new Set(["correo", "abogado_correo", "objeto", "honorarios"]);
const GENERO: Record<string, string> = { FEMENINO: "Señora", MASCULINO: "Señor" };

export function FormularioContrato({ campos, onCambio, soloLectura = false }: {
  campos: Record<string, string>;
  onCambio?: (clave: string, valor: string) => void;
  soloLectura?: boolean;
}) {
  const id = useId();

  if (soloLectura) {
    return (
      <div className="divide-y divide-line">
        {GRUPOS_CONTRATO.map((grupo) => (
          <section key={grupo.titulo} className="px-4 py-3.5 sm:px-5">
            <h4 className="text-[13px] font-semibold text-ink-2">{grupo.titulo}</h4>
            <dl className="mt-2 grid gap-x-6 gap-y-2 text-[14px] sm:grid-cols-2">
              {grupo.campos.map((c) => (
                <div key={c.clave} className={cx("min-w-0", c.tipo === "parrafo" && "sm:col-span-2")}>
                  <dt className="text-[12.5px] text-ink-3">{c.nombre}</dt>
                  <dd className="whitespace-pre-wrap text-pretty text-ink">
                    {(c.tipo === "genero" ? GENERO[campos[c.clave]] : campos[c.clave]) || <span className="text-ink-3">Sin llenar</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="divide-y divide-line">
      {GRUPOS_CONTRATO.map((grupo) => (
        <fieldset key={grupo.titulo} className="px-4 py-4 sm:px-5">
          <legend className="float-left mb-3 w-full text-[14px] font-semibold text-ink">{grupo.titulo}</legend>
          <div className={cx("clear-both grid gap-x-4 gap-y-3", grupo.titulo === "Fecha de firma" ? "grid-cols-3" : "sm:grid-cols-2")}>
            {grupo.campos.map((c) => {
              const campoId = `${id}-${c.clave}`;
              const valor = campos[c.clave] ?? "";
              return (
                <div key={c.clave} className={cx("min-w-0", c.tipo === "parrafo" && "sm:col-span-2")}>
                  <label htmlFor={campoId} className={ETIQUETA}>{c.nombre}</label>
                  {c.tipo === "genero" ? (
                    <select id={campoId} value={valor} onChange={(e) => onCambio?.(c.clave, e.target.value)} className={CAMPO}>
                      <option value="">Elija</option>
                      <option value="FEMENINO">Señora</option>
                      <option value="MASCULINO">Señor</option>
                    </select>
                  ) : c.tipo === "parrafo" ? (
                    <textarea
                      id={campoId}
                      value={valor}
                      rows={c.clave === "objeto" ? 3 : 8}
                      maxLength={c.clave === "objeto" ? 1600 : 4000}
                      onChange={(e) => onCambio?.(c.clave, e.target.value)}
                      aria-describedby={c.ayuda ? `${campoId}-ayuda` : undefined}
                      className={cx(CAMPO, "min-h-0 py-2 leading-relaxed")}
                    />
                  ) : (
                    <input
                      id={campoId}
                      type={c.tipo === "correo" ? "email" : c.tipo === "telefono" ? "tel" : "text"}
                      value={valor}
                      maxLength={320}
                      autoComplete="off"
                      onChange={(e) => onCambio?.(c.clave, c.clave.includes("documento") ? e.target.value.replace(/\./g, "") : e.target.value)}
                      aria-describedby={c.ayuda ? `${campoId}-ayuda` : undefined}
                      className={cx(CAMPO, !CONSERVA_MAYUSCULAS.has(c.clave) && "uppercase")}
                    />
                  )}
                  {c.ayuda && <p id={`${campoId}-ayuda`} className="mt-1 text-[12.5px] text-ink-3">{c.ayuda}</p>}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
