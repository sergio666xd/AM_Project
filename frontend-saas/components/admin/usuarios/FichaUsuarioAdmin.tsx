"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, KeyRound, LogOut, Mail, PauseCircle, Pencil, PlayCircle, RefreshCw, Trash2 } from "lucide-react";

import { ConfirmarAccionCuenta, type AccionCuenta } from "@/components/admin/usuarios/ConfirmarAccionCuenta";
import { UsuarioFormModal } from "@/components/admin/usuarios/UsuarioFormModal";
import { Button } from "@/components/ui/Button";
import { Initials } from "@/components/ui/Initials";
import { LoadingState } from "@/components/ui/LoadingState";
import { Sheet, SheetHeader } from "@/components/ui/Sheet";
import { Tag } from "@/components/ui/Tag";
import { api, mensajeDeError } from "@/lib/api-v2/cliente";
import { fechaConHora, fechaCorta, fechaRelativa } from "@/lib/fechas";
import { useLoadEffect } from "@/lib/useLoadEffect";
import { PAPEL, ROL, RUTA_USUARIOS, estadoCuenta, plural, type FichaUsuario } from "@/lib/usuariosAdmin";

const ADMIN = "/gestion-procesos/admin";

function Volver() {
  return (
    <Link href={RUTA_USUARIOS} className="mb-3 inline-flex min-h-10 items-center gap-1.5 text-[14px] font-semibold text-ink-2 hover:text-ink">
      <ArrowLeft aria-hidden="true" className="size-4" /> Usuarios
    </Link>
  );
}

function BotonAccion({ icono: Icono, children, onClick, peligro }: {
  icono: typeof Mail;
  children: string;
  onClick: () => void;
  peligro?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 w-full items-center gap-2.5 px-4 text-left text-[14px] font-medium transition-colors hover:bg-sheet-2 ${peligro ? "text-bad" : "text-ink"}`}
    >
      <Icono aria-hidden="true" className={`size-4 shrink-0 ${peligro ? "" : "text-ink-3"}`} />
      {children}
    </button>
  );
}

export function FichaUsuarioAdmin({ usuarioId }: { usuarioId: number }) {
  const router = useRouter();
  const [ficha, setFicha] = useState<FichaUsuario | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [accion, setAccion] = useState<AccionCuenta | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/admin/usuarios/{usuario_id}", { params: { path: { usuario_id: usuarioId } } });
    if (fallo || !data) setError(mensajeDeError(fallo));
    else setFicha(data);
    setCargando(false);
  }, [usuarioId]);
  useLoadEffect(cargar);

  if (!ficha) {
    return (
      <div className="mx-auto max-w-6xl">
        <Volver />
        {cargando ? <LoadingState label="Cargando la cuenta" rows={4} /> : (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-bad-soft px-4 py-3 text-bad">
            <p className="flex-1 text-[14px]">{error ?? "No encontramos esta cuenta."}</p>
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
          </div>
        )}
      </div>
    );
  }

  const estado = estadoCuenta(ficha);
  const editable = ficha.rol !== "ADMIN";
  const esCliente = ficha.rol === "CLIENTE";
  const totales = [
    plural(ficha.totales.procesos, "proceso", "procesos"),
    plural(ficha.totales.tareas_abiertas, "tarea abierta", "tareas abiertas"),
    plural(ficha.totales.documentos, "documento", "documentos"),
    ficha.totales.cuentas_cobro ? plural(ficha.totales.cuentas_cobro, "cuenta de cobro", "cuentas de cobro") : null,
  ].filter(Boolean).join(" · ");

  const datos: [string, string | null][] = [
    ["Correo", ficha.email],
    ["WhatsApp", ficha.whatsapp || "Sin número"],
    ["Rol", ROL[ficha.rol]],
    ...(esCliente ? [["Abogado responsable", ficha.responsable?.nombre ?? "Sin asignar"] as [string, string]] : []),
    ["Cuenta creada", ficha.creado_en ? fechaCorta(ficha.creado_en) : null],
    ["Último ingreso", ficha.ultimo_acceso ? fechaConHora(ficha.ultimo_acceso) : "Nunca ha entrado"],
    ...(ficha.debe_cambiar_password && ficha.estado === "activo" ? [["Contraseña", "Debe crear una nueva al entrar"] as [string, string]] : []),
  ];

  return (
    <div className="motion-swap mx-auto max-w-6xl">
      <Volver />
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <Initials name={ficha.nombre} size={48} className="shrink-0" />
          <div className="min-w-0">
            <h1 className="text-balance font-display text-[26px] font-normal leading-tight text-ink sm:text-[30px]">{ficha.nombre}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[14px] text-ink-2">
              {ROL[ficha.rol]}
              <Tag tone={estado.tono}>{estado.nombre}</Tag>
            </p>
          </div>
        </div>
        {editable && <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => setEditando(true)}>Editar</Button>}
      </header>

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
          <Sheet aria-labelledby="ficha-procesos" className="order-2 lg:order-none">
            <SheetHeader title={<span id="ficha-procesos">Procesos</span>} count={ficha.procesos_detalle.length || undefined} />
            <p className="border-b border-line px-4 py-2.5 text-[13px] text-ink-2">{totales}</p>
            {ficha.procesos_detalle.length ? (
              <ul className="divide-y divide-line">
                {ficha.procesos_detalle.map((proceso) => (
                  <li key={`${proceso.id}-${proceso.papel}`}>
                    <Link href={`${ADMIN}/procesos/${proceso.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-sheet-2">
                      <span className="min-w-0 flex-1">
                        <span className="block text-pretty text-[14px] font-semibold text-ink">{proceso.nombre}</span>
                        <span className="block text-[13px] text-ink-2">
                          {PAPEL[proceso.papel]}
                          {proceso.papel !== "responsable" && proceso.responsable ? ` · Lo lleva ${proceso.responsable}` : ""}
                        </span>
                      </span>
                      {proceso.archivado && <Tag>Archivado</Tag>}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-5 text-[14px] text-ink-2">
                {esCliente ? "Aún no está vinculado a ningún proceso." : "Aún no lleva ni colabora en ningún proceso."}
              </p>
            )}
          </Sheet>

          <Sheet aria-labelledby="ficha-actividad" className="order-4 lg:order-none">
            <SheetHeader
              title={<span id="ficha-actividad">Lo que ha hecho</span>}
              action={ficha.actividad.length ? (
                <Link href={`/gestion-procesos/admin/actividad?actor=${ficha.id}`} className="text-[13px] font-semibold text-navy hover:underline dark:text-navy-ink">Ver todo</Link>
              ) : undefined}
            />
            {ficha.actividad.length ? (
              <ol className="divide-y divide-line">
                {ficha.actividad.map((evento) => {
                  const contenido = (
                    <>
                      <span className="min-w-0 flex-1 text-pretty text-[14px] text-ink first-letter:uppercase">{evento.frase}</span>
                      <time dateTime={evento.fecha ?? undefined} className="shrink-0 text-[12.5px] tabular-nums text-ink-3">{fechaRelativa(evento.fecha)}</time>
                    </>
                  );
                  return (
                    <li key={evento.id}>
                      {evento.enlace
                        ? <Link href={evento.enlace} className="flex items-baseline gap-3 px-4 py-2.5 transition-colors hover:bg-sheet-2">{contenido}</Link>
                        : <div className="flex items-baseline gap-3 px-4 py-2.5">{contenido}</div>}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="px-4 py-5 text-[14px] text-ink-2">Todavía no hay movimientos de esta cuenta.</p>
            )}
          </Sheet>
        </div>

        <aside className="contents lg:flex lg:flex-col lg:gap-5">
          <Sheet aria-labelledby="ficha-datos" className="order-1 lg:order-none">
            <SheetHeader title={<span id="ficha-datos">Datos de la cuenta</span>} />
            <dl className="divide-y divide-line">
              {datos.filter(([, valor]) => valor).map(([etiqueta, valor]) => (
                <div key={etiqueta} className="px-4 py-2.5">
                  <dt className="text-[12.5px] font-semibold text-ink-2">{etiqueta}</dt>
                  <dd className="mt-0.5 break-words text-[14px] text-ink">{valor}</dd>
                </div>
              ))}
            </dl>
          </Sheet>

          {editable && (
            <Sheet aria-labelledby="ficha-acceso" className="order-3 lg:order-none">
              <SheetHeader title={<span id="ficha-acceso">Acceso</span>} />
              <div className="py-1">
                {ficha.acceso === "sin_ingreso" && <BotonAccion icono={Mail} onClick={() => setAccion("acceso")}>Reenviar el acceso</BotonAccion>}
                {ficha.acceso === "activo" && <BotonAccion icono={KeyRound} onClick={() => setAccion("enlace")}>Enviar enlace para cambiar la contraseña</BotonAccion>}
                {ficha.estado === "activo" && <BotonAccion icono={LogOut} onClick={() => setAccion("cerrar")}>Cerrar sus sesiones</BotonAccion>}
                {ficha.estado === "activo"
                  ? <BotonAccion icono={PauseCircle} onClick={() => setAccion("suspender")} peligro>Suspender la cuenta</BotonAccion>
                  : <BotonAccion icono={PlayCircle} onClick={() => setAccion("reactivar")}>Reactivar la cuenta</BotonAccion>}
              </div>
              <div className="border-t border-line px-4 py-3">
                {ficha.puede_eliminarse ? (
                  <button type="button" onClick={() => setAccion("eliminar")} className="inline-flex min-h-10 items-center gap-2 text-[14px] font-semibold text-bad hover:underline">
                    <Trash2 aria-hidden="true" className="size-4" /> Eliminar la cuenta
                  </button>
                ) : (
                  <p className="text-[13px] text-ink-2">
                    Esta cuenta tiene información de la firma, así que no se elimina. Si ya no debe entrar, suspéndala.
                  </p>
                )}
              </div>
            </Sheet>
          )}
        </aside>
      </div>

      <UsuarioFormModal open={editando} ficha={ficha} onClose={() => setEditando(false)} onGuardado={setFicha} />
      <ConfirmarAccionCuenta
        accion={accion}
        cuenta={ficha}
        onClose={() => setAccion(null)}
        onHecho={(hecha) => {
          setAccion(null);
          if (hecha === "eliminar") router.push(RUTA_USUARIOS);
          else void cargar();
        }}
      />
    </div>
  );
}
