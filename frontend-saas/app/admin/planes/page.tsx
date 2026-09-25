"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  UserCheck,
  CreditCard,
  Plus,
  Pencil,
  Power,
  Trash2,
  LogOut,
  ShieldCheck,
  X,
} from "lucide-react";

interface Plan {
  id: number;
  nombre: string;
  limite_radicados: number;
  precio_mensual: number;
  activo: boolean;
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "";

export default function AdminPlanesPage() {
  const router = useRouter();

  const [planes, setPlanes] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<Plan | null>(null);

  const [nombre, setNombre] = useState("");
  const [limite, setLimite] = useState("");
  const [precio, setPrecio] = useState("");
  const [activo, setActivo] = useState(true);

  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    cargarPlanes();
  }, []);

  const cargarPlanes = async () => {
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/");
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/api/admin/planes`,
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
        throw new Error("No se pudieron cargar los planes");
      }

      const data = await response.json();
      setPlanes(data);
    } catch (err) {
      console.error(err);
      setError("No fue posible cargar los planes.");
    } finally {
      setLoading(false);
    }
  };

  const abrirNuevoPlan = () => {
    setEditando(null);
    setNombre("");
    setLimite("");
    setPrecio("");
    setActivo(true);
    setModalOpen(true);
  };

  const abrirEditarPlan = (plan: Plan) => {
    setEditando(plan);
    setNombre(plan.nombre);
    setLimite(String(plan.limite_radicados));
    setPrecio(String(plan.precio_mensual));
    setActivo(plan.activo);
    setModalOpen(true);
  };

  const cerrarModal = () => {
    if (!guardando) {
      setModalOpen(false);
    }
  };

  const guardarPlan = async (e: React.FormEvent) => {
    e.preventDefault();

    setGuardando(true);
    setError("");

    const token = localStorage.getItem("token");

    try {
      const payload = {
        nombre: nombre.trim(),
        limite_radicados: Number(limite),
        precio_mensual: Number(precio),
        ...(editando ? { activo } : {}),
      };

      const url = editando
        ? `${API_URL}/api/admin/planes/${editando.id}`
        : `${API_URL}/api/admin/planes`;

      const method = editando ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "No fue posible guardar el plan"
        );
      }

      setModalOpen(false);
      await cargarPlanes();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "No fue posible guardar el plan."
      );
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (plan: Plan) => {
    const token = localStorage.getItem("token");

    try {
      const response = await fetch(
        `${API_URL}/api/admin/planes/${plan.id}/estado`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            activo: !plan.activo,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "No fue posible cambiar el estado"
        );
      }

      await cargarPlanes();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "No fue posible cambiar el estado."
      );
    }
  };

  const eliminarPlan = async (plan: Plan) => {
    const confirmar = window.confirm(
      `¿Estás seguro de eliminar el plan "${plan.nombre}"?`
    );

    if (!confirmar) return;

    const token = localStorage.getItem("token");

    try {
      const response = await fetch(
        `${API_URL}/api/admin/planes/${plan.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "No fue posible eliminar el plan"
        );
      }

      await cargarPlanes();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "No fue posible eliminar el plan."
      );
    }
  };

  const cerrarSesion = () => {
    localStorage.removeItem("token");
    router.push("/");
  };

  const formatearPrecio = (valor: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(valor);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">
          Cargando planes...
        </p>
      </main>
    );
  }

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
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-600 hover:bg-gray-50"
          >
            <UserCheck className="w-5 h-5" />
            Solicitudes
          </button>

          <button
            onClick={() => router.push("/admin/planes")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-100 text-gray-900 font-medium"
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
      <section className="flex-1 p-8">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-8">

          <div>
            <p className="text-sm text-gray-500 mb-1">
              Administración
            </p>

            <h2 className="text-3xl font-bold text-gray-900">
              Planes
            </h2>

            <p className="text-gray-500 mt-1">
              Administra los planes disponibles para los abogados.
            </p>
          </div>

          <button
            onClick={abrirNuevoPlan}
            className="flex items-center gap-2 px-4 py-2.5 bg-black text-white rounded-lg hover:bg-gray-800 transition"
          >
            <Plus className="w-4 h-4" />
            Nuevo plan
          </button>

        </div>

        {/* ERROR */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
            {error}

            <button
              onClick={() => setError("")}
              className="ml-3 underline"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* PLANES */}
        {planes.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
            <CreditCard className="w-10 h-10 text-gray-300 mx-auto mb-4" />

            <h3 className="text-lg font-semibold text-gray-900">
              No hay planes registrados
            </h3>

            <p className="text-sm text-gray-500 mt-1 mb-5">
              Crea el primer plan para comenzar.
            </p>

            <button
              onClick={abrirNuevoPlan}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-black text-white rounded-lg"
            >
              <Plus className="w-4 h-4" />
              Crear plan
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">

            {planes.map((plan) => (
              <div
                key={plan.id}
                className="bg-white border border-gray-200 rounded-2xl p-6"
              >

                {/* Cabecera */}
                <div className="flex items-start justify-between">

                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">
                      {plan.nombre}
                    </h3>

                    <div className="mt-2">
                      {plan.activo ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-xs font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 text-xs font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                          Inactivo
                        </span>
                      )}
                    </div>
                  </div>

                  <CreditCard className="w-6 h-6 text-gray-300" />

                </div>

                {/* Precio */}
                <div className="mt-6">
                  <span className="text-3xl font-bold text-gray-900">
                    {formatearPrecio(plan.precio_mensual)}
                  </span>

                  <span className="text-sm text-gray-500 ml-1">
                    / mes
                  </span>
                </div>

                {/* Límite */}
                <div className="mt-5 py-4 border-y border-gray-100">
                  <p className="text-sm text-gray-500">
                    Límite de radicados
                  </p>

                  <p className="text-lg font-semibold text-gray-900 mt-1">
                    {plan.limite_radicados} radicados
                  </p>
                </div>

                {/* Acciones */}
                <div className="flex items-center gap-2 mt-5">

                  <button
                    onClick={() => abrirEditarPlan(plan)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Pencil className="w-4 h-4" />
                    Editar
                  </button>

                  <button
                    onClick={() => cambiarEstado(plan)}
                    title={plan.activo ? "Desactivar" : "Activar"}
                    className={`w-10 h-10 flex items-center justify-center rounded-lg border ${
                      plan.activo
                        ? "border-yellow-200 text-yellow-600 hover:bg-yellow-50"
                        : "border-green-200 text-green-600 hover:bg-green-50"
                    }`}
                  >
                    <Power className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => eliminarPlan(plan)}
                    title="Eliminar"
                    className="w-10 h-10 flex items-center justify-center rounded-lg border border-red-200 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                </div>

              </div>
            ))}

          </div>
        )}

      </section>

      {/* MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">

          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">

            {/* Modal header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">

              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {editando ? "Editar plan" : "Nuevo plan"}
                </h3>

                <p className="text-sm text-gray-500 mt-1">
                  {editando
                    ? "Modifica la configuración del plan."
                    : "Configura un nuevo plan para los abogados."}
                </p>
              </div>

              <button
                onClick={cerrarModal}
                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>

            </div>

            {/* Formulario */}
            <form
              onSubmit={guardarPlan}
              className="p-6 space-y-5"
            >

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Nombre del plan
                </label>

                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Estándar"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Límite de radicados
                </label>

                <input
                  type="number"
                  required
                  min="1"
                  value={limite}
                  onChange={(e) => setLimite(e.target.value)}
                  placeholder="Ej. 50"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Precio mensual
                </label>

                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-gray-400 text-sm">
                    $
                  </span>

                  <input
                    type="number"
                    required
                    min="0"
                    value={precio}
                    onChange={(e) => setPrecio(e.target.value)}
                    placeholder="Ej. 99000"
                    className="w-full pl-7 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-500"
                  />
                </div>
              </div>

              {editando && (
                <label className="flex items-center justify-between p-3 border border-gray-200 rounded-lg cursor-pointer">

                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      Plan activo
                    </p>

                    <p className="text-xs text-gray-500">
                      Los planes inactivos no deberían asignarse a nuevos usuarios.
                    </p>
                  </div>

                  <input
                    type="checkbox"
                    checked={activo}
                    onChange={(e) => setActivo(e.target.checked)}
                    className="w-4 h-4"
                  />

                </label>
              )}

              <div className="flex justify-end gap-3 pt-2">

                <button
                  type="button"
                  onClick={cerrarModal}
                  disabled={guardando}
                  className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={guardando}
                  className="px-5 py-2.5 bg-black text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50"
                >
                  {guardando
                    ? "Guardando..."
                    : editando
                    ? "Guardar cambios"
                    : "Crear plan"}
                </button>

              </div>

            </form>

          </div>

        </div>
      )}

    </main>
  );
}