"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

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
  actuaciones: Actuacion[];
}

type OrdenActuaciones = "asc" | "desc";

function normalizarTexto(
  texto: string | null | undefined
): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatearEstado(
  estado: string | null | undefined
) {
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

function validarTermino(
  valor: string | null | undefined
) {
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

export default function DetalleRadicadoPage() {
  const params = useParams();
  const router = useRouter();

  const {
    user,
    token,
    loading: sessionLoading,
  } = useSession();

  const id = Array.isArray(params?.id)
    ? params.id[0]
    : params?.id;

  const [radicado, setRadicado] =
    useState<RadicadoDetalle | null>(null);

  const [loading, setLoading] = useState(true);

  const [consultando, setConsultando] =
    useState(false);

  const [error, setError] = useState("");

  /*
   * IMPORTANTE:
   *
   * "asc" significa orden 1 → N.
   * Visualmente, cuando estamos en ascendente,
   * mostramos la flecha hacia abajo.
   *
   * Esto es deliberado porque el usuario solicitó
   * que inicialmente aparezca la flecha hacia abajo
   * aunque los registros estén ordenados 1 → N.
   */
  const [ordenActuaciones, setOrdenActuaciones] =
    useState<OrdenActuaciones>("asc");

  const [notification, setNotification] =
    useState<{
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

  async function cargarDetalle(authToken: string) {
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
  }

  useEffect(() => {
    if (sessionLoading) {
      return;
    }

    if (!token) {
      return;
    }

    if (!id) {
      setError("No se especificó el radicado.");
      setLoading(false);
      return;
    }

    cargarDetalle(token);
  }, [
    id,
    token,
    sessionLoading,
    router,
  ]);

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
       * La consulta queda encolada en backend.
       * Actualizamos inmediatamente el estado visual.
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

      mostrarNotificacion(
        "error",
        mensaje
      );
    } finally {
      setConsultando(false);
    }
  }

  /*
   * ============================================================
   * ACTUACIONES ORDENADAS
   * ============================================================
   *
   * IMPORTANTE:
   *
   * El botón está ubicado en "Fecha de actuación",
   * pero NO ordenamos por fecha.
   *
   * El único criterio real de ordenamiento es:
   *
   *     actuacion.orden
   *
   * ASC:
   *     1 → 2 → 3 → ... → N
   *
   * DESC:
   *     N → ... → 3 → 2 → 1
   */

  const actuacionesOrdenadas = useMemo(() => {
    if (!radicado?.actuaciones) {
      return [];
    }

    const actuaciones = [
      ...radicado.actuaciones,
    ];

    actuaciones.sort((a, b) => {
      if (ordenActuaciones === "asc") {
        return a.orden - b.orden;
      }

      return b.orden - a.orden;
    });

    return actuaciones;
  }, [
    radicado?.actuaciones,
    ordenActuaciones,
  ]);

  /*
   * ============================================================
   * ACTUACIÓN ACTUAL
   * ============================================================
   *
   * La actuación actual SIEMPRE es la que tiene
   * el menor valor de "orden".
   *
   * Normalmente:
   *
   *     orden = 1
   *
   * Esto es independiente del orden visual de la tabla.
   */

  const actuacionActual = useMemo(() => {
    if (!radicado?.actuaciones?.length) {
      return null;
    }

    return [...radicado.actuaciones].sort(
      (a, b) => a.orden - b.orden
    )[0];
  }, [radicado?.actuaciones]);

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

  if (loading) {
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
            onClick={() =>
              setNotification(null)
            }
            className="ml-2 shrink-0 opacity-70 transition hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ========================================================
          VOLVER
      ========================================================= */}

      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          router.push(
            "/gestion-procesos/abogado/radicados"
          )
        }
        icon={<ArrowLeft className="size-4" />}
      >
        Volver a Radicados
      </Button>

      {/* ========================================================
          ERROR
      ========================================================= */}

      {error && (
        <div className="flex items-start justify-between gap-4 rounded-xl border border-risk/30 bg-risk/10 p-4 text-risk">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />

            <div>
              <p className="font-medium">
                No fue posible completar la operación
              </p>

              <p className="mt-1 text-sm opacity-90">
                {error}
              </p>
            </div>
          </div>

          {radicado && (
            <button
              type="button"
              onClick={() => setError("")}
              className="shrink-0 rounded-lg p-1 transition hover:bg-risk/20"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {!radicado ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center shadow-xs">
          <FileText className="mx-auto h-10 w-10 text-muted" />

          <h2 className="mt-4 text-lg font-semibold text-foreground">
            Radicado no encontrado
          </h2>

          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            El radicado solicitado no existe o no se
            encuentra disponible para tu cuenta.
          </p>

          <Button
            variant="primary"
            onClick={() =>
              router.push(
                "/gestion-procesos/abogado/radicados"
              )
            }
            className="mt-5"
          >
            Volver a Radicados
          </Button>
        </div>
      ) : (
        <>
          {/* ======================================================
              CABECERA DEL EXPEDIENTE
          ======================================================= */}

          <PageHeader
            overline="Expediente judicial"
            title={radicado.numero}
            description={radicado.despacho_departamento || "Despacho no especificado"}
            action={
              user?.rol === "ADMIN" ? (
                <Button
                  variant="primary"
                  onClick={handleConsultar}
                  loading={consultando}
                  icon={<RefreshCw className="size-4" />}
                >
                  Consultar ahora
                </Button>
              ) : undefined
            }
          />

          <section className="rounded-xl border border-border bg-surface shadow-xs">

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
                      Orden
                    </p>

                    <p className="mt-1 text-sm font-mono text-[var(--foreground)]">
                      {actuacionActual?.orden ??
                        "No registrado"}
                    </p>
                  </div>

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
                      title={
                        actuacionActual?.anotacion
                      }
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
                          title={
                            radicado.detalle_pendiente
                          }
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
                      {/* Fecha de actuación */}

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
                          title="Ordenar por orden de actuación"
                        >
                          Fecha de actuación

                          {ordenActuaciones === "asc" ? (
                            /*
                             * ASC = 1 → N
                             *
                             * La flecha solicitada es hacia abajo.
                             */
                            <ArrowDown className="h-3.5 w-3.5" />
                          ) : (
                            /*
                             * DESC = N → 1
                             *
                             * La flecha cambia hacia arriba.
                             */
                            <ArrowUp className="h-3.5 w-3.5" />
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
                    {actuacionesOrdenadas.map(
                      (act) => (
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

                              <div className="flex flex-col gap-1">
                                <span className="whitespace-nowrap text-xs font-mono text-[var(--foreground)]">
                                  {act.fecha_actuacion ||
                                    "No registrada"}
                                </span>

                                <span className="text-[10px] text-[var(--foreground-muted)]">
                                  Orden {act.orden}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Actuación */}

                          <td className="max-w-[260px] px-4 py-4 align-top">
                            <div className="flex flex-col items-start gap-2">
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
                              ) ===
                              "No registrado"
                                ? "—"
                                : act.fecha_inicia_termino}
                            </span>
                          </td>

                          {/* Final término */}

                          <td className="px-4 py-4 text-center align-top">
                            <span className="whitespace-nowrap text-xs font-mono text-[var(--foreground-muted)]">
                              {validarTermino(
                                act.fecha_finaliza_termino
                              ) ===
                              "No registrado"
                                ? "—"
                                : act.fecha_finaliza_termino}
                            </span>
                          </td>

                          {/* Fecha registro */}

                          <td className="px-4 py-4 align-top">
                            <span className="whitespace-nowrap text-xs font-mono text-[var(--foreground-muted)]">
                              {act.fecha_registro ||
                                "—"}
                            </span>
                          </td>
                        </tr>
                      )
                    )}
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
