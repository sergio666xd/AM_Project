"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  UserCheck,
  CreditCard,
  Search,
  Mail,
  Phone,
  Eye,
  LogOut,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";

interface Plan {
  id: number;
  nombre: string;
  limite_radicados: number;
  precio_mensual: number;
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

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "";

export default function AdminUsuariosPage() {
  const router = useRouter();

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("TODOS");
  const [filtroPlan, setFiltroPlan] = useState("TODOS");

  useEffect(() => {
    cargarUsuarios();
  }, []);

  const cargarUsuarios = async () => {
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/api/admin/usuarios`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.status === 401) {
        localStorage.removeItem("token");
        router.push("/");
        return;
      }

      if (response.status === 403) {
        router.push("/dashboard");
        return;
      }

      if (!response.ok) {
        throw new Error("No se pudieron cargar los usuarios");
      }

      const data = await response.json();
      setUsuarios(data);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "No fue posible cargar los usuarios."
      );
    } finally {
      setLoading(false);
    }
  };

  const planesDisponibles = useMemo(() => {
    const nombres = usuarios
      .map((usuario) => usuario.plan?.nombre)
      .filter((nombre): nombre is string => Boolean(nombre));

    return Array.from(new Set(nombres));
  }, [usuarios]);

  const usuariosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    return usuarios.filter((usuario) => {
      const coincideBusqueda =
        !texto ||
        usuario.nombre_completo.toLowerCase().includes(texto) ||
        usuario.email.toLowerCase().includes(texto) ||
        usuario.whatsapp_numero.toLowerCase().includes(texto);

      const coincideEstado =
        filtroEstado === "TODOS" ||
        usuario.estado === filtroEstado;

      const coincidePlan =
        filtroPlan === "TODOS" ||
        usuario.plan?.nombre === filtroPlan;

      return (
        coincideBusqueda &&
        coincideEstado &&
        coincidePlan
      );
    });
  }, [usuarios, busqueda, filtroEstado, filtroPlan]);

  const totalActivos = usuarios.filter(
    (usuario) => usuario.estado === "ACTIVO"
  ).length;

  const totalPendientes = usuarios.filter(
    (usuario) => usuario.estado === "PENDIENTE_APROBACION"
  ).length;

  const totalRechazados = usuarios.filter(
    (usuario) => usuario.estado === "RECHAZADO"
  ).length;

  const cerrarSesion = () => {
    localStorage.removeItem("token");
    router.push("/");
  };

  const limpiarFiltros = () => {
    setBusqueda("");
    setFiltroEstado("TODOS");
    setFiltroPlan("TODOS");
  };

  const etiquetaEstado = (estado: string) => {
    switch (estado) {
      case "ACTIVO":
        return "Activo";

      case "PENDIENTE_APROBACION":
        return "Pendiente";

      case "RECHAZADO":
        return "Rechazado";

      default:
        return estado;
    }
  };

  const claseEstado = (estado: string) => {
    switch (estado) {
      case "ACTIVO":
        return "bg-green-50 text-green-700 border-green-100";

      case "PENDIENTE_APROBACION":
        return "bg-yellow-50 text-yellow-700 border-yellow-100";

      case "RECHAZADO":
        return "bg-red-50 text-red-700 border-red-100";

      default:
        return "bg-gray-50 text-gray-600 border-gray-100";
    }
  };

  const iniciales = (nombre: string) => {
    return nombre
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((parte) => parte[0])
      .join("")
      .toUpperCase();
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
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-100 text-gray-900 font-medium"
          >
            <Users className="w-5 h-5" />
            Usuarios
          </button>

          <button
            onClick={() => router.push("/admin/solicitudes")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-600 hover:bg-gray-50"
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
              Usuarios
            </h2>

            <p className="text-gray-500 mt-1">
              Gestiona las cuentas de los abogados registrados.
            </p>
          </div>

          <button
            onClick={cargarUsuarios}
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

        {/* MÉTRICAS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">

          <div className="bg-white border border-gray-200 rounded-xl p-5">

            <div className="flex items-center justify-between">

              <div>
                <p className="text-sm text-gray-500">
                  Total abogados
                </p>

                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {usuarios.length}
                </p>
              </div>

              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-gray-600" />
              </div>

            </div>

          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">

            <div className="flex items-center justify-between">

              <div>
                <p className="text-sm text-gray-500">
                  Activos
                </p>

                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {totalActivos}
                </p>
              </div>

              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                <UserCheck className="w-5 h-5 text-green-600" />
              </div>

            </div>

          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">

            <div className="flex items-center justify-between">

              <div>
                <p className="text-sm text-gray-500">
                  Pendientes
                </p>

                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {totalPendientes}
                </p>
              </div>

              <div className="w-10 h-10 rounded-lg bg-yellow-50 flex items-center justify-center">
                <UserCheck className="w-5 h-5 text-yellow-600" />
              </div>

            </div>

          </div>

        </div>

        {/* ERROR */}
        {error && (
          <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        {/* FILTROS */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">

          <div className="flex flex-col lg:flex-row gap-3">

            {/* Búsqueda */}
            <div className="relative flex-1">

              <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />

              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, correo o WhatsApp..."
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
              />

            </div>

            {/* Estado */}
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white text-gray-700 focus:outline-none focus:border-gray-400"
            >
              <option value="TODOS">
                Todos los estados
              </option>

              <option value="ACTIVO">
                Activos
              </option>

              <option value="PENDIENTE_APROBACION">
                Pendientes
              </option>

              <option value="RECHAZADO">
                Rechazados
              </option>
            </select>

            {/* Plan */}
            <select
              value={filtroPlan}
              onChange={(e) => setFiltroPlan(e.target.value)}
              className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white text-gray-700 focus:outline-none focus:border-gray-400"
            >
              <option value="TODOS">
                Todos los planes
              </option>

              {planesDisponibles.map((plan) => (
                <option key={plan} value={plan}>
                  {plan}
                </option>
              ))}
            </select>

            {(busqueda ||
              filtroEstado !== "TODOS" ||
              filtroPlan !== "TODOS") && (
              <button
                onClick={limpiarFiltros}
                className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900"
              >
                Limpiar
              </button>
            )}

          </div>

        </div>

        {/* TABLA */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">

          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">

            <div>
              <h3 className="font-semibold text-gray-900">
                Abogados registrados
              </h3>

              <p className="text-xs text-gray-500 mt-0.5">
                Mostrando {usuariosFiltrados.length} de {usuarios.length}
              </p>
            </div>

          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-500">
              Cargando usuarios...
            </div>
          ) : usuariosFiltrados.length === 0 ? (
            <div className="p-12 text-center">

              <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />

              <h3 className="font-medium text-gray-900">
                No se encontraron usuarios
              </h3>

              <p className="text-sm text-gray-500 mt-1">
                Prueba cambiando los filtros de búsqueda.
              </p>

            </div>
          ) : (
            <div className="overflow-x-auto">

              <table className="w-full">

                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">

                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Abogado
                    </th>

                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Contacto
                    </th>

                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Plan
                    </th>

                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Estado
                    </th>

                    <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Acción
                    </th>

                  </tr>
                </thead>

                <tbody>

                  {usuariosFiltrados.map((usuario) => (
                    <tr
                      key={usuario.id}
                      className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50"
                    >

                      {/* Abogado */}
                      <td className="px-5 py-4">

                        <div className="flex items-center gap-3">

                          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600">
                            {iniciales(usuario.nombre_completo)}
                          </div>

                          <div>
                            <p className="font-medium text-gray-900">
                              {usuario.nombre_completo}
                            </p>

                            <p className="text-xs text-gray-500 mt-0.5">
                              ID #{usuario.id}
                            </p>
                          </div>

                        </div>

                      </td>

                      {/* Contacto */}
                      <td className="px-5 py-4">

                        <div className="space-y-1">

                          <div className="flex items-center gap-2 text-sm text-gray-700">
                            <Mail className="w-3.5 h-3.5 text-gray-400" />
                            {usuario.email}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Phone className="w-3.5 h-3.5 text-gray-400" />
                            {usuario.whatsapp_numero}
                          </div>

                        </div>

                      </td>

                      {/* Plan */}
                      <td className="px-5 py-4">

                        {usuario.plan ? (
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {usuario.plan.nombre}
                            </p>

                            <p className="text-xs text-gray-500 mt-0.5">
                              {usuario.plan.limite_radicados} radicados
                            </p>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">
                            Sin plan
                          </span>
                        )}

                      </td>

                      {/* Estado */}
                      <td className="px-5 py-4">

                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium ${claseEstado(
                            usuario.estado
                          )}`}
                        >
                          {etiquetaEstado(usuario.estado)}
                        </span>

                      </td>

                      {/* Acción */}
                      <td className="px-5 py-4 text-right">

                        <button
                          onClick={() =>
                            router.push(
                              `/admin/usuarios/${usuario.id}`
                            )
                          }
                          className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Eye className="w-4 h-4" />
                          Ver
                        </button>

                      </td>

                    </tr>
                  ))}

                </tbody>

              </table>

            </div>
          )}

        </div>

      </section>

    </main>
  );
}