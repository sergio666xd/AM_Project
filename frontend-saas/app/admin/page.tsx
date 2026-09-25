"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  FileText,
  CreditCard,
  UserCheck,
  UserX,
  Database,
  ArrowRight,
  LogOut,
  ShieldCheck,
} from "lucide-react";

interface DashboardData {
  usuarios_totales: number;
  abogados_activos: number;
  abogados_pendientes: number;
  abogados_rechazados: number;
  radicados_totales: number;
  planes_totales: number;
  planes_activos: number;
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "";

export default function AdminDashboard() {
  const router = useRouter();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    cargarDashboard();
  }, []);

  const cargarDashboard = async () => {
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/");
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/api/admin/dashboard`,
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
        throw new Error("No se pudo cargar el dashboard");
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error(err);
      setError("No fue posible cargar la información.");
    } finally {
      setLoading(false);
    }
  };

  const cerrarSesion = () => {
    localStorage.removeItem("token");
    router.push("/");
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">
          Cargando panel administrativo...
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow p-8 text-center">
          <p className="text-red-600 mb-4">
            {error || "No se pudo cargar el dashboard."}
          </p>

          <button
            onClick={cargarDashboard}
            className="px-4 py-2 bg-black text-white rounded-lg"
          >
            Reintentar
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 flex">

      {/* SIDEBAR */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">

        {/* Logo / título */}
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

        {/* Navegación */}
        <nav className="flex-1 p-4 space-y-1">

          <button
            onClick={() => router.push("/admin")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-100 text-gray-900 font-medium"
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

        {/* Cerrar sesión */}
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
      <section className="flex-1 p-8">

        {/* Header */}
        <div className="mb-8">
          <p className="text-sm text-gray-500 mb-1">
            Panel administrativo
          </p>

          <h2 className="text-3xl font-bold text-gray-900">
            Dashboard
          </h2>

          <p className="text-gray-500 mt-1">
            Resumen general de la plataforma.
          </p>
        </div>

        {/* MÉTRICAS PRINCIPALES */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">

          {/* Usuarios */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500">
                  Abogados registrados
                </p>

                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {data.usuarios_totales}
                </p>
              </div>

              <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-gray-700" />
              </div>
            </div>
          </div>

          {/* Activos */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500">
                  Usuarios activos
                </p>

                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {data.abogados_activos}
                </p>
              </div>

              <div className="w-11 h-11 rounded-xl bg-green-50 flex items-center justify-center">
                <UserCheck className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </div>

          {/* Pendientes */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500">
                  Solicitudes pendientes
                </p>

                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {data.abogados_pendientes}
                </p>
              </div>

              <div className="w-11 h-11 rounded-xl bg-yellow-50 flex items-center justify-center">
                <UserCheck className="w-5 h-5 text-yellow-600" />
              </div>
            </div>
          </div>

          {/* Rechazados */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500">
                  Usuarios rechazados
                </p>

                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {data.abogados_rechazados}
                </p>
              </div>

              <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center">
                <UserX className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </div>

        </div>

        {/* SEGUNDA FILA */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">

          {/* Radicados */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>

              <div>
                <p className="text-sm text-gray-500">
                  Radicados registrados
                </p>

                <p className="text-2xl font-bold text-gray-900">
                  {data.radicados_totales}
                </p>
              </div>
            </div>

            <p className="text-sm text-gray-500">
              Total de procesos registrados por los abogados.
            </p>
          </div>

          {/* Planes */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-purple-600" />
              </div>

              <div>
                <p className="text-sm text-gray-500">
                  Planes
                </p>

                <p className="text-2xl font-bold text-gray-900">
                  {data.planes_totales}
                </p>
              </div>
            </div>

            <p className="text-sm text-gray-500">
              {data.planes_activos} planes actualmente activos.
            </p>
          </div>

          {/* Base de datos */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                <Database className="w-5 h-5 text-gray-700" />
              </div>

              <div>
                <p className="text-sm text-gray-500">
                  Estado
                </p>

                <p className="text-2xl font-bold text-green-600">
                  Operativo
                </p>
              </div>
            </div>

            <p className="text-sm text-gray-500">
              La plataforma está funcionando correctamente.
            </p>
          </div>

        </div>

        {/* ACCIONES RÁPIDAS */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">

          <h3 className="text-lg font-semibold text-gray-900 mb-5">
            Acciones rápidas
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            <button
              onClick={() => router.push("/admin/usuarios")}
              className="group flex items-center justify-between border border-gray-200 rounded-xl p-4 hover:border-gray-400 hover:bg-gray-50 transition"
            >
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-gray-600" />

                <div className="text-left">
                  <p className="font-medium text-gray-900">
                    Gestionar usuarios
                  </p>

                  <p className="text-xs text-gray-500">
                    Ver abogados y sus cuentas
                  </p>
                </div>
              </div>

              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-900" />
            </button>

            <button
              onClick={() => router.push("/admin/solicitudes")}
              className="group flex items-center justify-between border border-gray-200 rounded-xl p-4 hover:border-gray-400 hover:bg-gray-50 transition"
            >
              <div className="flex items-center gap-3">
                <UserCheck className="w-5 h-5 text-gray-600" />

                <div className="text-left">
                  <p className="font-medium text-gray-900">
                    Revisar solicitudes
                  </p>

                  <p className="text-xs text-gray-500">
                    Aprobar o rechazar registros
                  </p>
                </div>
              </div>

              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-900" />
            </button>

            <button
              onClick={() => router.push("/admin/planes")}
              className="group flex items-center justify-between border border-gray-200 rounded-xl p-4 hover:border-gray-400 hover:bg-gray-50 transition"
            >
              <div className="flex items-center gap-3">
                <CreditCard className="w-5 h-5 text-gray-600" />

                <div className="text-left">
                  <p className="font-medium text-gray-900">
                    Gestionar planes
                  </p>

                  <p className="text-xs text-gray-500">
                    Límites y precios
                  </p>
                </div>
              </div>

              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-900" />
            </button>

          </div>
        </div>

      </section>
    </main>
  );
}