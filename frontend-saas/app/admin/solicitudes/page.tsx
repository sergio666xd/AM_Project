"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  UserCheck,
  CreditCard,
  FileCheck,
  Mail,
  Phone,
  CalendarDays,
  Check,
  X,
  LogOut,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

interface Plan {
  id: number;
  nombre: string;
  limite_radicados: number;
  precio_mensual: number;
  activo?: boolean;
}

interface Usuario {
  id: number;
  email: string;
  nombre_completo: string;
  whatsapp_numero: string;
  rol: string;
  estado: string;
  plan: Plan | null;
}

interface Solicitud {
  id: number;
  usuario_id: number;
  ruta_tarjeta_profesional: string;
  fecha_solicitud: string;
  usuario: Usuario;
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "";

export default function AdminSolicitudesPage() {
  const router = useRouter();

  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [planes, setPlanes] = useState<Plan[]>([]);

  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState<number | null>(null);

  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const [solicitudSeleccionada, setSolicitudSeleccionada] =
    useState<Solicitud | null>(null);

  const [planSeleccionado, setPlanSeleccionado] = useState("");

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [solicitudesResponse, planesResponse] =
        await Promise.all([
          fetch(`${API_URL}/api/admin/solicitudes`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),

          fetch(`${API_URL}/api/admin/planes`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
        ]);

      if (
        solicitudesResponse.status === 401 ||
        planesResponse.status === 401
      ) {
        localStorage.removeItem("token");
        router.push("/");
        return;
      }

      if (
        solicitudesResponse.status === 403 ||
        planesResponse.status === 403
      ) {
        router.push("/dashboard");
        return;
      }

      if (!solicitudesResponse.ok) {
        throw new Error(
          "No fue posible cargar las solicitudes."
        );
      }

      if (!planesResponse.ok) {
        throw new Error(
          "No fue posible cargar los planes."
        );
      }

      const solicitudesData =
        await solicitudesResponse.json();

      const planesData = await planesResponse.json();

      setSolicitudes(solicitudesData);

      setPlanes(
        planesData.filter(
          (plan: Plan) => plan.activo !== false
        )
      );
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "No fue posible cargar la información."
      );
    } finally {
      setLoading(false);
    }
  };

  const abrirSolicitud = (solicitud: Solicitud) => {
    setSolicitudSeleccionada(solicitud);

    const primerPlan = planes[0];

    setPlanSeleccionado(
      primerPlan ? String(primerPlan.id) : ""
    );

    setError("");
    setMensaje("");
  };

  const cerrarSolicitud = () => {
    if (procesando === null) {
      setSolicitudSeleccionada(null);
    }
  };

  const aprobarSolicitud = async () => {
    if (!solicitudSeleccionada) return;

    if (!planSeleccionado) {
      setError("Selecciona un plan para aprobar la solicitud.");
      return;
    }

    const confirmar = window.confirm(
      `¿Aprobar la cuenta de ${solicitudSeleccionada.usuario.nombre_completo}?`
    );

    if (!confirmar) return;

    const token = localStorage.getItem("token");

    setProcesando(solicitudSeleccionada.id);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/api/admin/solicitudes/${solicitudSeleccionada.id}/aprobar?plan_id=${planSeleccionado}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "No fue posible aprobar la solicitud."
        );
      }

      setMensaje(
        data.mensaje || "Solicitud aprobada correctamente."
      );

      setSolicitudSeleccionada(null);

      await cargarDatos();
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "No fue posible aprobar la solicitud."
      );
    } finally {
      setProcesando(null);
    }
  };

  const rechazarSolicitud = async () => {
    if (!solicitudSeleccionada) return;

    const confirmar = window.confirm(
      `¿Rechazar la solicitud de ${solicitudSeleccionada.usuario.nombre_completo}?`
    );

    if (!confirmar) return;

    const token = localStorage.getItem("token");

    setProcesando(solicitudSeleccionada.id);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/api/admin/solicitudes/${solicitudSeleccionada.id}/rechazar`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "No fue posible rechazar la solicitud."
        );
      }

      setMensaje(
        data.mensaje || "Solicitud rechazada correctamente."
      );

      setSolicitudSeleccionada(null);

      await cargarDatos();
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "No fue posible rechazar la solicitud."
      );
    } finally {
      setProcesando(null);
    }
  };

  const abrirTarjetaProfesional = (
    ruta: string
  ) => {
    let rutaLimpia = ruta.replaceAll("\\", "/");

    if (rutaLimpia.startsWith("uploads/")) {
      rutaLimpia = rutaLimpia.substring(8);
    }

    const url = `${API_URL}/uploads/${rutaLimpia}`;

    window.open(url, "_blank");
  };

  const formatearFecha = (fecha: string) => {
    return new Intl.DateTimeFormat("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(fecha));
  };

  const cerrarSesion = () => {
    localStorage.removeItem("token");
    router.push("/");
  };

  return (
    <main className="min-h-screen bg-gray-50 flex">

      {/* SIDEBAR */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">

        <div className="p-6 border-b border-gray-200">

          <div className="flex items-center gap-3">

            <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>

            <div>
              <h1 className="font-bold text-gray-900">
                Gestión Judicial
              </h1>

              <p className="text-xs text-gray-500">
                Administración
              </p>
            </div>

          </div>

        </div>

        <nav className="flex-1 p-4 space-y-1">

          <button
            onClick={() => router.push("/admin")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-600 hover:bg-gray-50"
          >
            <LayoutDashboard className="w-5 h-5" />
            Dashboard
          </button>

          <button
            onClick={() => router.push("/admin/usuarios")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-600 hover:bg-gray-50"
          >
            <Users className="w-5 h-5" />
            Usuarios
          </button>

          <button
            onClick={() => router.push("/admin/solicitudes")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-100 text-gray-900 font-medium"
          >
            <UserCheck className="w-5 h-5" />
            Solicitudes
          </button>

          <button
            onClick={() => router.push("/admin/planes")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-600 hover:bg-gray-50"
          >
            <CreditCard className="w-5 h-5" />
            Planes
          </button>

        </nav>

        <div className="p-4 border-t border-gray-200">

          <button
            onClick={cerrarSesion}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-600 hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="w-5 h-5" />
            Cerrar sesión
          </button>

        </div>

      </aside>

      {/* CONTENIDO */}
      <section className="flex-1 p-8 min-w-0">

        {/* HEADER */}
        <div className="flex items-start justify-between mb-8">

          <div>
            <p className="text-sm text-gray-500 mb-1">
              Administración
            </p>

            <h2 className="text-3xl font-bold text-gray-900">
              Solicitudes
            </h2>

            <p className="text-gray-500 mt-1">
              Revisa y gestiona las solicitudes de registro.
            </p>
          </div>

          <button
            onClick={cargarDatos}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 bg-white rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw
              className={`w-4 h-4 ${
                loading ? "animate-spin" : ""
              }`}
            />
            Actualizar
          </button>

        </div>

        {/* MENSAJE */}
        {mensaje && (
          <div className="mb-5 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
            {mensaje}
          </div>
        )}

        {/* ERROR */}
        {error && (
          <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        {/* RESUMEN */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">

          <div className="flex items-center gap-4">

            <div className="w-12 h-12 rounded-xl bg-yellow-50 flex items-center justify-center">
              <UserCheck className="w-6 h-6 text-yellow-600" />
            </div>

            <div>
              <p className="text-sm text-gray-500">
                Solicitudes pendientes
              </p>

              <p className="text-2xl font-bold text-gray-900">
                {solicitudes.length}
              </p>
            </div>

          </div>

        </div>

        {/* LISTADO */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">

          <div className="px-5 py-4 border-b border-gray-200">

            <h3 className="font-semibold text-gray-900">
              Registros pendientes de revisión
            </h3>

            <p className="text-xs text-gray-500 mt-1">
              Estas cuentas aún no han sido activadas.
            </p>

          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-500">
              Cargando solicitudes...
            </div>
          ) : solicitudes.length === 0 ? (
            <div className="p-12 text-center">

              <FileCheck className="w-10 h-10 text-gray-300 mx-auto mb-3" />

              <h3 className="font-medium text-gray-900">
                No hay solicitudes pendientes
              </h3>

              <p className="text-sm text-gray-500 mt-1">
                Todas las solicitudes han sido procesadas.
              </p>

            </div>
          ) : (
            <div className="divide-y divide-gray-100">

              {solicitudes.map((solicitud) => (
                <div
                  key={solicitud.id}
                  className="p-5 hover:bg-gray-50/50 transition"
                >

                  <div className="flex items-start justify-between gap-6">

                    {/* INFORMACIÓN */}
                    <div className="flex items-start gap-4">

                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center font-semibold text-gray-600">
                        {solicitud.usuario.nombre_completo
                          .split(" ")
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((parte) => parte[0])
                          .join("")
                          .toUpperCase()}
                      </div>

                      <div>

                        <h4 className="font-semibold text-gray-900">
                          {solicitud.usuario.nombre_completo}
                        </h4>

                        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2">

                          <span className="flex items-center gap-1.5 text-sm text-gray-500">
                            <Mail className="w-3.5 h-3.5" />
                            {solicitud.usuario.email}
                          </span>

                          <span className="flex items-center gap-1.5 text-sm text-gray-500">
                            <Phone className="w-3.5 h-3.5" />
                            {solicitud.usuario.whatsapp_numero}
                          </span>

                          <span className="flex items-center gap-1.5 text-sm text-gray-500">
                            <CalendarDays className="w-3.5 h-3.5" />
                            {formatearFecha(
                              solicitud.fecha_solicitud
                            )}
                          </span>

                        </div>

                        <div className="mt-3">

                          <button
                            onClick={() =>
                              abrirTarjetaProfesional(
                                solicitud.ruta_tarjeta_profesional
                              )
                            }
                            className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                          >
                            <FileCheck className="w-4 h-4" />
                            Ver tarjeta profesional
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>

                        </div>

                      </div>

                    </div>

                    {/* ACCIONES */}
                    <div className="flex items-center gap-2 shrink-0">

                      <button
                        onClick={() =>
                          abrirSolicitud(solicitud)
                        }
                        className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                      >
                        Revisar
                      </button>

                    </div>

                  </div>

                </div>
              ))}

            </div>
          )}

        </div>

      </section>

      {/* MODAL DE REVISIÓN */}
      {solicitudSeleccionada && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">

          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">

            {/* HEADER */}
            <div className="flex items-start justify-between p-6 border-b border-gray-200">

              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Revisar solicitud
                </h3>

                <p className="text-sm text-gray-500 mt-1">
                  Verifica la información antes de tomar una decisión.
                </p>
              </div>

              <button
                onClick={cerrarSolicitud}
                disabled={procesando !== null}
                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 disabled:opacity-50"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>

            </div>

            {/* DATOS */}
            <div className="p-6 space-y-5">

              <div className="p-4 bg-gray-50 rounded-xl">

                <p className="text-xs text-gray-500 uppercase tracking-wide">
                  Abogado
                </p>

                <p className="font-semibold text-gray-900 mt-1">
                  {solicitudSeleccionada.usuario.nombre_completo}
                </p>

                <p className="text-sm text-gray-500 mt-1">
                  {solicitudSeleccionada.usuario.email}
                </p>

              </div>

              <div className="grid grid-cols-2 gap-3">

                <div className="border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-500">
                    WhatsApp
                  </p>

                  <p className="text-sm font-medium text-gray-900 mt-1">
                    {solicitudSeleccionada.usuario.whatsapp_numero}
                  </p>
                </div>

                <div className="border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-500">
                    Solicitud
                  </p>

                  <p className="text-sm font-medium text-gray-900 mt-1">
                    #{solicitudSeleccionada.id}
                  </p>
                </div>

              </div>

              <button
                onClick={() =>
                  abrirTarjetaProfesional(
                    solicitudSeleccionada.ruta_tarjeta_profesional
                  )
                }
                className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:bg-gray-50"
              >

                <div className="flex items-center gap-3">

                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                    <FileCheck className="w-5 h-5 text-blue-600" />
                  </div>

                  <div className="text-left">

                    <p className="text-sm font-medium text-gray-900">
                      Tarjeta profesional
                    </p>

                    <p className="text-xs text-gray-500">
                      Abrir documento
                    </p>

                  </div>

                </div>

                <ExternalLink className="w-4 h-4 text-gray-400" />

              </button>

              {/* PLAN */}
              <div>

                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Plan para la cuenta
                </label>

                <select
                  value={planSeleccionado}
                  onChange={(e) =>
                    setPlanSeleccionado(e.target.value)
                  }
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:border-gray-500"
                >

                  <option value="">
                    Selecciona un plan
                  </option>

                  {planes.map((plan) => (
                    <option
                      key={plan.id}
                      value={plan.id}
                    >
                      {plan.nombre} — {plan.limite_radicados} radicados
                    </option>
                  ))}

                </select>

              </div>

            </div>

            {/* ACCIONES */}
            <div className="flex items-center justify-between p-6 border-t border-gray-200">

              <button
                onClick={rechazarSolicitud}
                disabled={procesando !== null}
                className="flex items-center gap-2 px-4 py-2.5 border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
                Rechazar
              </button>

              <button
                onClick={aprobarSolicitud}
                disabled={
                  procesando !== null ||
                  !planSeleccionado
                }
                className="flex items-center gap-2 px-5 py-2.5 bg-black text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />

                {procesando !== null
                  ? "Procesando..."
                  : "Aprobar solicitud"}
              </button>

            </div>

          </div>

        </div>
      )}

    </main>
  );
}