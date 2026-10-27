"use client";

import { useCallback, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLoadEffect } from "@/lib/useLoadEffect";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bell,
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  RefreshCw,
  UserCheck,
  X,
} from "lucide-react";

import { fetchApi, iniciarWorkflowConsultaRadicado } from "@/lib/api";
import { useSession } from "@/context/SessionContext";

interface Actuacion {
  id: number;
  orden: number;
  fecha_actuacion: string;
  actuacion: string;
  anotacion: string;
  es_fijacion: boolean;
  fecha_inicia_termino: string;
  fecha_finaliza_termino: string;
  fecha_registro: string;
}

interface RadicadoDetalle {
  id: number;
  numero: string;
  estado_consulta: string;
  despacho_departamento: string;
  demandante: string;
  demandado: string;
  consultado_en: string;
  alerta_enviada: boolean;
  detalle_pendiente: string;
  actuaciones_nuevas_sin_revisar?: number;
  actuaciones: Actuacion[];
}

type OrdenActuaciones = "asc" | "desc";

function normalizarTexto(texto: string | null | undefined) {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatearEstado(estado: string | null | undefined) {
  const estadoNormalizado = normalizarTexto(estado);

  if (estadoNormalizado === "ok") {
    return {
      label: "Consultado",
      className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    };
  }

  if (estadoNormalizado.includes("no_encontrado") || estadoNormalizado.includes("no encontrado")) {
    return {
      label: "No encontrado en la Rama Judicial",
      className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    };
  }

  if (estadoNormalizado.includes("privado")) {
    return {
      label: "Proceso privado",
      className: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    };
  }

  if (estadoNormalizado.startsWith("error")) {
    return {
      label: "Error de consulta",
      className: "bg-red-500/10 text-red-600 dark:text-red-400",
    };
  }

  if (estadoNormalizado === "sin consultar") {
    return {
      label: "Sin consultar",
      className:
        "bg-[var(--surface-secondary)] text-[var(--foreground-muted)]",
    };
  }

  if (estadoNormalizado === "encolada") {
    return {
      label: "En cola",
      className:
        "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    };
  }

  if (estadoNormalizado === "ejecutando") {
    return {
      label: "Consultando",
      className:
        "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    };
  }

  if (estadoNormalizado === "error") {
    return {
      label: "Error",
      className:
        "bg-red-500/10 text-red-600 dark:text-red-400",
    };
  }

  return {
    label: estado || "Disponible",
    className:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  };
}

function validarTermino(valor: string | null | undefined) {
  if (
    !valor ||
    valor === "1900-01-01" ||
    valor === "-" ||
    valor.trim() === ""
  ) {
    return "No registrado";
  }

  return valor;
}

function obtenerTimestamp(fecha: string | null | undefined) {
  if (!fecha) {
    return 0;
  }

  const timestamp = new Date(fecha).getTime();

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export default function DetalleRadicadoPage() {
  const params = useParams();
  const router = useRouter();

  function volverAListado() {
    const returnTo = new URLSearchParams(window.location.search).get("returnTo");
    const listPath = "/gestion-procesos/dashboard/radicados";
    router.push(returnTo?.startsWith(`${listPath}?`) || returnTo === listPath ? returnTo : listPath);
  }

  const { user, token, loading: sessionLoading } = useSession();

  const id = Array.isArray(params?.id)
    ? params.id[0]
    : params?.id;

  const [radicado, setRadicado] =
    useState<RadicadoDetalle | null>(null);

  const [loading, setLoading] = useState(true);
  const [consultando, setConsultando] = useState(false);
  const [error, setError] = useState("");

  const [ordenActuaciones, setOrdenActuaciones] =
    useState<OrdenActuaciones>("desc");

  const [notification, setNotification] = useState<{
    type: "success" | "error" | "warning";
    message: string;
  } | null>(null);

  /*
   * ============================================================
   * NOTIFICACIONES
   * ============================================================
   */

  function mostrarNotificacion(
    type: "success" | "error" | "warning",
    message: string
  ) {
    setNotification({
      type,
      message,
    });

    window.setTimeout(() => {
      setNotification(null);
    }, 4000);
  }

  /*
   * ============================================================
   * CARGAR DETALLE
   * ============================================================
   *
   * GET /api/radicados/{id} devuelve solo el radicado solicitado
   * con su historial de actuaciones autorizado.
   */

  const cargarDetalle = useCallback(async (authToken: string) => {
    try {
      setLoading(true);
      setError("");

      const actual = (await fetchApi(
        `/api/radicados/${encodeURIComponent(String(id))}`,
        { method: "GET", token: authToken },
      )) as RadicadoDetalle;

      setRadicado(actual);
    } catch (err) {
      setRadicado(null);
      console.error(
        "Error cargando detalle del radicado:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "No fue posible cargar el detalle del radicado."
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  const cargarAlAbrir = useCallback(() => {
    if (sessionLoading || !token || !id) return;
    return cargarDetalle(token);
  }, [id, token, sessionLoading, cargarDetalle]);

  useLoadEffect(cargarAlAbrir);

  // Sin id en la URL no hay nada que cargar; el aviso se deriva al renderizar.
  const mensajeError = id ? error : "No se especificó el radicado.";

  /*
   * ============================================================
   * CONSULTAR RAMA JUDICIAL
   * ============================================================
   */

  async function handleConsultar() {
    if (!token || !id) {
      return;
    }

    try {
      setConsultando(true);
      setError("");

      await iniciarWorkflowConsultaRadicado(token, {
        tipo: "MANUAL",
        radicado_id: Number(id),
      });

      /*
       * La consulta es encolada en backend, por lo que
       * actualizamos primero el estado visual y luego
       * recuperamos nuevamente el detalle.
       */
      setRadicado((actual) =>
        actual
          ? {
              ...actual,
              estado_consulta: "ENCOLADA",
            }
          : actual
      );

      mostrarNotificacion(
        "success",
        "La consulta fue enviada correctamente a la cola."
      );

      await cargarDetalle(token);
    } catch (err) {
      console.error(
        "Error consultando el radicado:",
        err
      );

      const mensaje =
        err instanceof Error
          ? err.message
          : "No fue posible ejecutar la consulta.";

      setError(mensaje);

      mostrarNotificacion("error", mensaje);
    } finally {
      setConsultando(false);
    }
  }

  /*
   * ============================================================
   * ACTUACIONES ORDENADAS
   * ============================================================
   *
   * La única columna ordenable es Fecha de actuación.
   *
   * Por defecto se muestran las más recientes primero.
   */

  const actuacionesRadicado = radicado?.actuaciones;

  const actuacionesOrdenadas = useMemo(() => {
    if (!actuacionesRadicado) {
      return [];
    }

    const actuaciones = [...actuacionesRadicado];

    actuaciones.sort((a, b) => {
      const fechaA = obtenerTimestamp(a.fecha_actuacion);
      const fechaB = obtenerTimestamp(b.fecha_actuacion);

      if (fechaA === fechaB) {
        /*
         * Si dos actuaciones tienen la misma fecha,
         * usamos "orden" como criterio secundario.
         */
        return ordenActuaciones === "asc"
          ? a.orden - b.orden
          : b.orden - a.orden;
      }

      return ordenActuaciones === "asc"
        ? fechaA - fechaB
        : fechaB - fechaA;
    });

    return actuaciones;
  }, [actuacionesRadicado, ordenActuaciones]);

  /*
   * Actuaciones nuevas desde la última vez que el usuario abrió el
   * detalle: son las de menor "orden" (orden 1 = la más reciente).
   * Abrir el detalle es lo que quita el aviso de "actuaciones nuevas".
   */

  const idsActuacionesNuevas = useMemo(() => {
    const cantidad = radicado?.actuaciones_nuevas_sin_revisar ?? 0;
    if (!actuacionesRadicado?.length || cantidad <= 0) {
      return new Set<number>();
    }

    return new Set(
      [...actuacionesRadicado]
        .sort((a, b) => a.orden - b.orden)
        .slice(0, cantidad)
        .map((act) => act.id)
    );
  }, [actuacionesRadicado, radicado?.actuaciones_nuevas_sin_revisar]);

  /*
   * ============================================================
   * ACTUACIÓN ACTUAL
   * ============================================================
   *
   * Independientemente del orden visual de la tabla,
   * la actuación actual es la más reciente.
   */

  const actuacionActual = useMemo(() => {
    if (!actuacionesRadicado?.length) {
      return null;
    }

    return [...actuacionesRadicado].sort(
      (a, b) =>
        obtenerTimestamp(b.fecha_actuacion) -
        obtenerTimestamp(a.fecha_actuacion)
    )[0];
  }, [actuacionesRadicado]);

  /*
   * ============================================================
   * ESTADO
   * ============================================================
   */

  const estadoConsulta = formatearEstado(
    radicado?.estado_consulta
  );

  /*
   * ============================================================
   * LOADING DE SESIÓN
   * ============================================================
   */

  if (sessionLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex items-center gap-3 text-[var(--foreground-muted)]">
          <RefreshCw className="h-5 w-5 animate-spin" />
          Verificando sesión...
        </div>
      </div>
    );
  }

  if (!token) {
    return null;
  }

  /*
   * ============================================================
   * LOADING
   * ============================================================
   */

  if (loading && id) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex items-center gap-3 text-[var(--foreground-muted)]">
          <RefreshCw className="h-5 w-5 animate-spin" />
          Cargando expediente...
        </div>
      </div>
    );
  }

  /*
   * ============================================================
   * VISTA
   * ============================================================
   */

  return (
    <div className="space-y-5">
      {/* ========================================================
          NOTIFICACIÓN
      ========================================================= */}

      {notification && (
        <div
          className={`fixed right-4 top-4 z-[10000] flex max-w-[calc(100vw-2rem)] items-start gap-3 rounded-xl border px-4 py-3 shadow-xl ${
            notification.type === "success"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : notification.type === "warning"
              ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          )}

          <span className="text-sm font-medium">
            {notification.message}
          </span>

          <button
            type="button"
            onClick={() => setNotification(null)}
            className="ml-2 shrink-0 opacity-70 transition hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ========================================================
          VOLVER
      ========================================================= */}

      <button
        type="button"
        onClick={volverAListado}
        className="inline-flex items-center gap-2 rounded-lg px-1 py-1 text-sm text-[var(--foreground-muted)] transition hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a Radicados
      </button>

      {/* ========================================================
          ERROR
      ========================================================= */}

      {mensajeError && (
        <div className="flex items-start justify-between gap-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-700 dark:text-red-300">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />

            <div>
              <p className="font-medium">
                No fue posible completar la operación
              </p>

              <p className="mt-1 text-sm opacity-90">
                {mensajeError}
              </p>
            </div>
          </div>

          {radicado && (
            <button
              type="button"
              onClick={() => setError("")}
              className="shrink-0 rounded-lg p-1 transition hover:bg-red-500/10"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {!radicado ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center">
          <FileText className="mx-auto h-10 w-10 text-[var(--foreground-muted)]" />

          <h2 className="mt-4 text-lg font-semibold text-[var(--foreground)]">
            Radicado no encontrado
          </h2>

          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--foreground-muted)]">
            El radicado solicitado no existe o no se encuentra
            disponible para tu cuenta.
          </p>

          <button
            type="button"
            onClick={volverAListado}
            className="mt-5 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium !text-white transition hover:opacity-90"
          >
            Volver a Radicados
          </button>
        </div>
      ) : (
        <>
          {/* ======================================================
              CABECERA DEL EXPEDIENTE
          ======================================================= */}

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">
                  <FileText className="h-4 w-4" />
                  Expediente judicial
                </div>

                <h1 className="mt-2 break-all text-xl font-semibold tracking-tight text-[var(--foreground)] sm:text-2xl">
                  {radicado.numero}
                </h1>

                <div className="mt-2 flex items-start gap-2 text-sm text-[var(--foreground-muted)]">
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0" />

                  <span>
                    {radicado.despacho_departamento ||
                      "Despacho no especificado"}
                  </span>
                </div>
              </div>

              {user?.rol === "ADMIN" && (
                <button
                  type="button"
                  onClick={handleConsultar}
                  disabled={consultando}
                  className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium !text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {consultando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {consultando ? "Consultando..." : "Consultar ahora"}
                </button>
              )}
            </div>

            {/* ====================================================
                INFORMACIÓN GENERAL
            ===================================================== */}

            <div className="grid grid-cols-1 border-t border-[var(--border)] md:grid-cols-2">
              {/* Partes */}
              <div className="border-b border-[var(--border)] p-5 md:border-r md:p-6">
                <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
                  <UserCheck className="h-4 w-4 text-[var(--primary)]" />

                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
                    Partes del proceso
                  </h2>
                </div>

                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-xs text-[var(--foreground-muted)]">
                      Demandante
                    </p>

                    <p className="mt-1 break-words text-sm font-medium text-[var(--foreground)]">
                      {radicado.demandante ||
                        "No registrado"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-[var(--foreground-muted)]">
                      Demandado
                    </p>

                    <p className="mt-1 break-words text-sm font-medium text-[var(--foreground)]">
                      {radicado.demandado ||
                        "No registrado"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Estado */}
              <div className="border-b border-[var(--border)] p-5 md:p-6">
                <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
                  <RefreshCw className="h-4 w-4 text-[var(--primary)]" />

                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
                    Estado de la consulta
                  </h2>
                </div>

                <div className="mt-4 space-y-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <span className="text-xs text-[var(--foreground-muted)]">
                      Estado
                    </span>

                    <span
                      className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-medium ${estadoConsulta.className}`}
                    >
                      {estadoConsulta.label}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <span className="text-xs text-[var(--foreground-muted)]">
                      Consultado en
                    </span>

                    <span className="break-all text-left text-xs font-mono text-[var(--foreground)] sm:text-right">
                      {radicado.consultado_en ||
                        "No registrado"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-[var(--foreground-muted)]">
                      Alerta enviada
                    </span>

                    <span className="text-xs font-medium text-[var(--foreground)]">
                      {radicado.alerta_enviada
                        ? "Sí"
                        : "No"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actuación actual */}
              <div className="border-b border-[var(--border)] p-5 md:border-r md:border-b-0 md:p-6">
                <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
                  <FileText className="h-4 w-4 text-[var(--primary)]" />

                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
                    Actuación actual
                  </h2>
                </div>

                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-xs text-[var(--foreground-muted)]">
                      Fecha de actuación
                    </p>

                    <p className="mt-1 text-sm font-mono text-[var(--foreground)]">
                      {actuacionActual?.fecha_actuacion ||
                        "No registrado"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-[var(--foreground-muted)]">
                      Actuación
                    </p>

                    <p className="mt-1 break-words text-sm font-medium text-[var(--foreground)]">
                      {actuacionActual?.actuacion ||
                        "No registrado"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-[var(--foreground-muted)]">
                      Anotación
                    </p>

                    <p
                      className="mt-1 line-clamp-3 break-words text-sm text-[var(--foreground)]"
                      title={actuacionActual?.anotacion}
                    >
                      {actuacionActual?.anotacion ||
                        "No registrado"}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-[var(--foreground-muted)]">
                      Fijación
                    </span>

                    <span className="text-xs font-medium text-[var(--foreground)]">
                      {actuacionActual?.es_fijacion
                        ? "Sí"
                        : "No"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Términos */}
              <div className="p-5 md:p-6">
                <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
                  <Clock className="h-4 w-4 text-[var(--primary)]" />

                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
                    Términos y novedades
                  </h2>
                </div>

                <div className="mt-4 space-y-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <span className="text-xs text-[var(--foreground-muted)]">
                      Inicia término
                    </span>

                    <span className="text-xs font-mono text-[var(--foreground)] sm:text-right">
                      {validarTermino(
                        actuacionActual?.fecha_inicia_termino
                      )}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <span className="text-xs text-[var(--foreground-muted)]">
                      Finaliza término
                    </span>

                    <span className="text-xs font-mono text-[var(--foreground)] sm:text-right">
                      {validarTermino(
                        actuacionActual?.fecha_finaliza_termino
                      )}
                    </span>
                  </div>

                  <div className="border-t border-[var(--border)] pt-3">
                    <div className="flex items-start gap-2">
                      <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />

                      <div className="min-w-0">
                        <p className="text-xs text-[var(--foreground-muted)]">
                          Novedad pendiente
                        </p>

                        <p
                          className="mt-1 line-clamp-3 break-words text-xs text-amber-600 dark:text-amber-400"
                          title={radicado.detalle_pendiente}
                        >
                          {radicado.detalle_pendiente ||
                            "Ninguna"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ======================================================
              HISTORIAL DE ACTUACIONES
          ======================================================= */}

          <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            {/* Cabecera */}
            <div className="flex flex-col gap-3 border-b border-[var(--border)] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <h2 className="text-lg font-semibold text-[var(--foreground)]">
                  Historial de actuaciones
                </h2>

                <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                  Registro de actuaciones asociadas al proceso.
                  {idsActuacionesNuevas.size > 0 && (
                    <span className="ml-1 font-medium text-red-700 dark:text-red-400">
                      {idsActuacionesNuevas.size === 1
                        ? "1 actuación nueva desde tu última revisión."
                        : `${idsActuacionesNuevas.size} actuaciones nuevas desde tu última revisión.`}
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="rounded-full bg-[var(--surface-secondary)] px-2.5 py-1 text-xs font-medium text-[var(--foreground-muted)]">
                  {actuacionesOrdenadas.length}{" "}
                  {actuacionesOrdenadas.length === 1
                    ? "actuación"
                    : "actuaciones"}
                </span>
              </div>
            </div>

            {/* Tabla */}
            {actuacionesOrdenadas.length === 0 ? (
              <div className="flex min-h-[250px] flex-col items-center justify-center px-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-secondary)]">
                  <FileText className="h-5 w-5 text-[var(--foreground-muted)]" />
                </div>

                <h3 className="mt-4 font-semibold text-[var(--foreground)]">
                  No hay actuaciones registradas
                </h3>

                <p className="mt-1 max-w-md text-sm text-[var(--foreground-muted)]">
                  Realiza una consulta para intentar actualizar
                  la información del proceso.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--surface-secondary)]/50">
                      {/* Fecha */}
                      <th className="px-4 py-3 text-left">
                        <button
                          type="button"
                          onClick={() =>
                            setOrdenActuaciones(
                              (actual) =>
                                actual === "asc"
                                  ? "desc"
                                  : "asc"
                            )
                          }
                          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)] transition hover:text-[var(--foreground)]"
                        >
                          Fecha de actuación

                          {ordenActuaciones === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </th>

                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">
                        Actuación
                      </th>

                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">
                        Anotación
                      </th>

                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">
                        Fecha inicia término
                      </th>

                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">
                        Fecha finaliza término
                      </th>

                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">
                        Fecha de registro
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {actuacionesOrdenadas.map((act) => (
                      <tr
                        key={act.id}
                        className={`border-b border-[var(--border)] last:border-b-0 transition ${
                          act.es_fijacion
                            ? "bg-amber-500/[0.04] hover:bg-amber-500/[0.08]"
                            : "hover:bg-[var(--surface-secondary)]/40"
                        }`}
                      >
                        {/* Fecha actuación */}
                        <td className="px-4 py-4 align-top">
                          <div className="flex items-start gap-2">
                            {act.es_fijacion && (
                              <span
                                className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500"
                                title="Fijación"
                              />
                            )}

                            <span className="whitespace-nowrap text-xs font-mono text-[var(--foreground)]">
                              {act.fecha_actuacion ||
                                "No registrada"}
                            </span>
                          </div>
                        </td>

                        {/* Actuación */}
                        <td className="max-w-[260px] px-4 py-4 align-top">
                          <div className="flex flex-col items-start gap-2">
                            {idsActuacionesNuevas.has(act.id) && (
                              <span className="motion-pop inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
                                <span aria-hidden="true" className="motion-attention size-1.5 rounded-full bg-red-600 dark:bg-red-400" />
                                Nueva
                              </span>
                            )}

                            <span className="break-words text-sm font-medium text-[var(--foreground)]">
                              {act.actuacion ||
                                "No registrada"}
                            </span>

                            {act.es_fijacion && (
                              <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                                Fijación
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Anotación */}
                        <td className="max-w-[360px] px-4 py-4 align-top">
                          <p
                            className="break-words text-xs leading-relaxed text-[var(--foreground-muted)]"
                            title={act.anotacion}
                          >
                            {act.anotacion || "—"}
                          </p>
                        </td>

                        {/* Inicio término */}
                        <td className="px-4 py-4 text-center align-top">
                          <span className="whitespace-nowrap text-xs font-mono text-[var(--foreground-muted)]">
                            {validarTermino(
                              act.fecha_inicia_termino
                            ) === "No registrado"
                              ? "—"
                              : act.fecha_inicia_termino}
                          </span>
                        </td>

                        {/* Final término */}
                        <td className="px-4 py-4 text-center align-top">
                          <span className="whitespace-nowrap text-xs font-mono text-[var(--foreground-muted)]">
                            {validarTermino(
                              act.fecha_finaliza_termino
                            ) === "No registrado"
                              ? "—"
                              : act.fecha_finaliza_termino}
                          </span>
                        </td>

                        {/* Fecha registro */}
                        <td className="px-4 py-4 align-top">
                          <span className="whitespace-nowrap text-xs font-mono text-[var(--foreground-muted)]">
                            {act.fecha_registro || "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
