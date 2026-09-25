"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    ArrowLeft,
    Check,
    ChevronDown,
    Mail,
    MessageCircle,
    User,
    Calendar,
    ShieldCheck,
    FileText,
    Ban,
    RefreshCw,
    Search,
    ExternalLink,
    Activity,
    Database,
} from "lucide-react";

const API_URL =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Plan = {
    id: number;
    nombre: string;
    limite_radicados: number;
    precio_mensual: number;
    activo: boolean;
};

type Radicado = {
    id: number;
    numero: string;
    estado_consulta: string;
    despacho_departamento: string;
    demandante: string;
    demandado: string;
    consultado_en: string;
    alerta_enviada: boolean;
    detalle_pendiente: string;
    created_at: string;
    total_actuaciones: number;
};

type Usuario = {
    id: number;
    email: string;
    nombre_completo: string;
    whatsapp_numero: string | null;
    rol: string;
    estado: string;
    created_at: string;
    plan: Plan | null;

    total_radicados: number;
    radicados: Radicado[];
};

export default function UsuarioDetallePage() {
    const params = useParams();
    const router = useRouter();

    const usuarioId = params.id;

    const [usuario, setUsuario] = useState<Usuario | null>(null);
    const [planes, setPlanes] = useState<Plan[]>([]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [selectedPlan, setSelectedPlan] = useState("");
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const token =
        typeof window !== "undefined"
            ? localStorage.getItem("token")
            : null;

    useEffect(() => {
        if (!token) {
            router.push("/");
            return;
        }

        cargarDatos();
    }, [usuarioId]);

    const cargarDatos = async () => {
        try {
            setLoading(true);
            setError("");

            const [usuarioRes, planesRes] = await Promise.all([
                fetch(`${API_URL}/api/admin/usuarios/${usuarioId}`, {
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

            if (usuarioRes.status === 401 || planesRes.status === 401) {
                localStorage.removeItem("token");
                router.push("/");
                return;
            }

            if (usuarioRes.status === 403 || planesRes.status === 403) {
                router.push("/dashboard");
                return;
            }

            if (!usuarioRes.ok) {
                throw new Error("No fue posible cargar el usuario.");
            }

            if (!planesRes.ok) {
                throw new Error("No fue posible cargar los planes.");
            }

            const usuarioData = await usuarioRes.json();
            const planesData = await planesRes.json();

            setUsuario(usuarioData);
            setPlanes(planesData);

            if (usuarioData.plan) {
                setSelectedPlan(String(usuarioData.plan.id));
            }
        } catch (err: any) {
            setError(err.message || "Ocurrió un error.");
        } finally {
            setLoading(false);
        }
    };

    const cambiarPlan = async () => {
        if (!selectedPlan || !usuario) return;

        if (String(usuario.plan?.id) === selectedPlan) {
            return;
        }

        try {
            setSaving(true);
            setError("");
            setMessage("");

            const res = await fetch(
                `${API_URL}/api/admin/usuarios/${usuario.id}/plan?plan_id=${selectedPlan}`,
                {
                    method: "PATCH",
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.detail || "No fue posible cambiar el plan.");
            }

            setMessage("Plan actualizado correctamente.");

            setUsuario({
                ...usuario,
                plan: data.plan,
            });
        } catch (err: any) {
            setError(err.message || "No fue posible cambiar el plan.");
        } finally {
            setSaving(false);
        }
    };

    const cambiarEstado = async (nuevoEstado: string) => {
        if (!usuario) return;

        const accion =
            nuevoEstado === "ACTIVO"
                ? "activar"
                : nuevoEstado === "RECHAZADO"
                    ? "rechazar"
                    : "cambiar el estado de";

        const confirmado = window.confirm(
            `¿Está seguro de que desea ${accion} esta cuenta?`
        );

        if (!confirmado) return;

        try {
            setSaving(true);
            setError("");
            setMessage("");

            const res = await fetch(
                `${API_URL}/api/admin/usuarios/${usuario.id}/estado?estado=${nuevoEstado}`,
                {
                    method: "PATCH",
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            const data = await res.json();

            if (!res.ok) {
                throw new Error(
                    data.detail || "No fue posible actualizar el estado."
                );
            }

            setUsuario({
                ...usuario,
                estado: data.estado,
            });

            setMessage("Estado actualizado correctamente.");
        } catch (err: any) {
            setError(err.message || "No fue posible actualizar el estado.");
        } finally {
            setSaving(false);
        }
    };

    const formatearFecha = (fecha: string) => {
        return new Date(fecha).toLocaleDateString("es-CO", {
            day: "2-digit",
            month: "long",
            year: "numeric",
        });
    };

    const obtenerEstado = () => {
        if (!usuario) return null;

        switch (usuario.estado) {
            case "ACTIVO":
                return {
                    texto: "Activo",
                    clase: "bg-green-100 text-green-700",
                };

            case "PENDIENTE_APROBACION":
                return {
                    texto: "Pendiente de aprobación",
                    clase: "bg-yellow-100 text-yellow-700",
                };

            case "RECHAZADO":
                return {
                    texto: "Rechazado",
                    clase: "bg-red-100 text-red-700",
                };

            default:
                return {
                    texto: usuario.estado,
                    clase: "bg-gray-100 text-gray-700",
                };
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="flex items-center gap-3 text-gray-500">
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Cargando información...
                </div>
            </div>
        );
    }

    if (!usuario) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-gray-600 mb-4">
                        No se encontró el usuario.
                    </p>

                    <button
                        onClick={() => router.push("/admin/usuarios")}
                        className="px-4 py-2 bg-gray-900 text-white rounded-lg"
                    >
                        Volver a usuarios
                    </button>
                </div>
            </div>
        );
    }

    const estado = obtenerEstado();

    return (
        <div className="min-h-screen bg-gray-50 flex">
            {/* SIDEBAR */}
            <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col">
                <div className="h-20 px-6 flex items-center border-b border-gray-200">
                    <div>
                        <h1 className="font-bold text-gray-900">
                            Administración
                        </h1>
                        <p className="text-xs text-gray-500">
                            Gestión de plataforma
                        </p>
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-1">
                    <button
                        onClick={() => router.push("/admin")}
                        className="w-full text-left px-4 py-3 rounded-lg text-gray-600 hover:bg-gray-100"
                    >
                        Dashboard
                    </button>

                    <button
                        onClick={() => router.push("/admin/usuarios")}
                        className="w-full text-left px-4 py-3 rounded-lg bg-gray-100 text-gray-900 font-medium"
                    >
                        Usuarios
                    </button>

                    <button
                        onClick={() => router.push("/admin/solicitudes")}
                        className="w-full text-left px-4 py-3 rounded-lg text-gray-600 hover:bg-gray-100"
                    >
                        Solicitudes
                    </button>

                    <button
                        onClick={() => router.push("/admin/planes")}
                        className="w-full text-left px-4 py-3 rounded-lg text-gray-600 hover:bg-gray-100"
                    >
                        Planes
                    </button>
                </nav>
            </aside>

            {/* CONTENIDO */}
            <main className="flex-1">
                <div className="max-w-6xl mx-auto px-6 py-8">
                    {/* HEADER */}
                    <div className="flex items-center gap-4 mb-8">
                        <button
                            onClick={() => router.push("/admin/usuarios")}
                            className="p-2 rounded-lg hover:bg-white border border-transparent hover:border-gray-200"
                        >
                            <ArrowLeft className="w-5 h-5 text-gray-600" />
                        </button>

                        <div>
                            <p className="text-sm text-gray-500 mb-1">
                                Administración / Usuarios / Detalle
                            </p>

                            <h1 className="text-2xl font-bold text-gray-900">
                                {usuario.nombre_completo}
                            </h1>
                        </div>
                    </div>

                    {/* MENSAJES */}
                    {message && (
                        <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
                            <Check className="w-5 h-5" />
                            {message}
                        </div>
                    )}

                    {error && (
                        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* INFORMACIÓN PRINCIPAL */}
                        <section className="lg:col-span-2 space-y-6">
                            <div className="bg-white rounded-xl border border-gray-200 p-6">
                                <div className="flex items-start justify-between mb-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
                                            <User className="w-7 h-7 text-gray-500" />
                                        </div>

                                        <div>
                                            <h2 className="text-lg font-semibold text-gray-900">
                                                {usuario.nombre_completo}
                                            </h2>

                                            <p className="text-sm text-gray-500">
                                                Abogado
                                            </p>
                                        </div>
                                    </div>

                                    {estado && (
                                        <span
                                            className={`px-3 py-1.5 rounded-full text-sm font-medium ${estado.clase}`}
                                        >
                                            {estado.texto}
                                        </span>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div>
                                        <p className="text-xs text-gray-500 mb-1">
                                            Correo electrónico
                                        </p>

                                        <div className="flex items-center gap-2 text-gray-800">
                                            <Mail className="w-4 h-4 text-gray-400" />
                                            {usuario.email}
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-xs text-gray-500 mb-1">
                                            WhatsApp
                                        </p>

                                        <div className="flex items-center gap-2 text-gray-800">
                                            <MessageCircle className="w-4 h-4 text-gray-400" />
                                            {usuario.whatsapp_numero || "No registrado"}
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-xs text-gray-500 mb-1">
                                            Rol
                                        </p>

                                        <div className="flex items-center gap-2 text-gray-800">
                                            <ShieldCheck className="w-4 h-4 text-gray-400" />
                                            {usuario.rol}
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-xs text-gray-500 mb-1">
                                            Fecha de registro
                                        </p>

                                        <div className="flex items-center gap-2 text-gray-800">
                                            <Calendar className="w-4 h-4 text-gray-400" />
                                            {formatearFecha(usuario.created_at)}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* PLAN */}
                            <div className="bg-white rounded-xl border border-gray-200 p-6">
                                <div className="flex items-center justify-between mb-5">
                                    <div>
                                        <h2 className="text-lg font-semibold text-gray-900">
                                            Plan del usuario
                                        </h2>

                                        <p className="text-sm text-gray-500">
                                            Administre el plan asignado a esta cuenta.
                                        </p>
                                    </div>

                                    <FileText className="w-5 h-5 text-gray-400" />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                    <div className="bg-gray-50 rounded-lg p-4">
                                        <p className="text-xs text-gray-500 mb-1">
                                            Plan actual
                                        </p>

                                        <p className="font-semibold text-gray-900">
                                            {usuario.plan?.nombre || "Sin plan"}
                                        </p>
                                    </div>

                                    <div className="bg-gray-50 rounded-lg p-4">
                                        <p className="text-xs text-gray-500 mb-1">
                                            Límite de radicados
                                        </p>

                                        <p className="font-semibold text-gray-900">
                                            {usuario.plan?.limite_radicados ?? 0}
                                        </p>
                                    </div>

                                    <div className="bg-gray-50 rounded-lg p-4">
                                        <p className="text-xs text-gray-500 mb-1">
                                            Precio mensual
                                        </p>

                                        <p className="font-semibold text-gray-900">
                                            $
                                            {(
                                                usuario.plan?.precio_mensual ?? 0
                                            ).toLocaleString("es-CO")}
                                        </p>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Cambiar plan
                                    </label>

                                    <div className="flex gap-3">
                                        <div className="relative flex-1">
                                            <select
                                                value={selectedPlan}
                                                onChange={(e) =>
                                                    setSelectedPlan(e.target.value)
                                                }
                                                className="w-full appearance-none border border-gray-300 rounded-lg px-4 py-3 pr-10 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200"
                                            >
                                                <option value="">
                                                    Seleccionar plan
                                                </option>

                                                {planes
                                                    .filter((plan) => plan.activo)
                                                    .map((plan) => (
                                                        <option
                                                            key={plan.id}
                                                            value={plan.id}
                                                        >
                                                            {plan.nombre} —{" "}
                                                            {plan.limite_radicados} radicados
                                                        </option>
                                                    ))}
                                            </select>

                                            <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
                                        </div>

                                        <button
                                            onClick={cambiarPlan}
                                            disabled={
                                                saving ||
                                                !selectedPlan ||
                                                String(usuario.plan?.id) === selectedPlan
                                            }
                                            className="px-5 py-3 rounded-lg bg-gray-900 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-800"
                                        >
                                            {saving ? "Guardando..." : "Actualizar"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            {/* RADICADOS */}
                            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                <div className="p-6 border-b border-gray-200">
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">

                                        <div>
                                            <div className="flex items-center gap-2">
                                                <Database className="w-5 h-5 text-gray-500" />

                                                <h2 className="text-lg font-semibold text-gray-900">
                                                    Radicados
                                                </h2>
                                            </div>

                                            <p className="text-sm text-gray-500 mt-1">
                                                Procesos registrados en la cuenta del abogado.
                                            </p>
                                        </div>

                                        <div className="text-right">
                                            <p className="text-2xl font-bold text-gray-900">
                                                {usuario.total_radicados}
                                                <span className="text-sm font-normal text-gray-400">
                                                    {" "}
                                                    / {usuario.plan?.limite_radicados ?? 0}
                                                </span>
                                            </p>

                                            <p className="text-xs text-gray-500">
                                                radicados utilizados
                                            </p>
                                        </div>

                                    </div>

                                    {/* Barra de utilización */}
                                    <div className="mt-5">
                                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gray-900 rounded-full transition-all"
                                                style={{
                                                    width: `${Math.min(
                                                        100,
                                                        usuario.plan?.limite_radicados
                                                            ? (usuario.total_radicados /
                                                                usuario.plan.limite_radicados) *
                                                            100
                                                            : 0
                                                    )}%`,
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {usuario.radicados.length === 0 ? (
                                    <div className="p-10 text-center">
                                        <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />

                                        <p className="font-medium text-gray-700">
                                            No hay radicados registrados
                                        </p>

                                        <p className="text-sm text-gray-500 mt-1">
                                            Este abogado todavía no tiene procesos asociados.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="bg-gray-50 border-b border-gray-200">
                                                    <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                                                        Radicado
                                                    </th>

                                                    <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                                                        Despacho
                                                    </th>

                                                    <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                                                        Partes
                                                    </th>

                                                    <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase text-center">
                                                        Actuaciones
                                                    </th>

                                                    <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase text-center">
                                                        Estado
                                                    </th>
                                                </tr>
                                            </thead>

                                            <tbody className="divide-y divide-gray-100">
                                                {usuario.radicados.map((radicado) => (
                                                    <tr
                                                        key={radicado.id}
                                                        className="hover:bg-gray-50 transition"
                                                    >
                                                        {/* RADICADO */}
                                                        <td className="px-5 py-4">
                                                            <button
                                                                onClick={() => {
                                                                    // Próximamente: detalle administrativo del radicado
                                                                }
                                                                }
                                                                className="font-mono text-sm font-medium text-gray-900 hover:underline"
                                                                title="Abrir proceso"
                                                            >
                                                                {radicado.numero}
                                                            </button>

                                                            <p className="text-xs text-gray-400 mt-1">
                                                                ID #{radicado.id}
                                                            </p>
                                                        </td>

                                                        {/* DESPACHO */}
                                                        <td className="px-5 py-4 max-w-[180px]">
                                                            <p
                                                                className="text-sm text-gray-700 truncate"
                                                                title={radicado.despacho_departamento}
                                                            >
                                                                {radicado.despacho_departamento || "Sin información"}
                                                            </p>
                                                        </td>

                                                        {/* PARTES */}
                                                        <td className="px-5 py-4 max-w-[220px]">
                                                            <div className="text-xs text-gray-600 space-y-1">
                                                                <p
                                                                    className="truncate"
                                                                    title={radicado.demandante}
                                                                >
                                                                    <span className="font-medium">
                                                                        Dte.:
                                                                    </span>{" "}
                                                                    {radicado.demandante || "Sin información"}
                                                                </p>

                                                                <p
                                                                    className="truncate"
                                                                    title={radicado.demandado}
                                                                >
                                                                    <span className="font-medium">
                                                                        Ddo.:
                                                                    </span>{" "}
                                                                    {radicado.demandado || "Sin información"}
                                                                </p>
                                                            </div>
                                                        </td>

                                                        {/* ACTUACIONES */}
                                                        <td className="px-5 py-4 text-center">
                                                            <div className="inline-flex items-center gap-1.5 text-sm text-gray-700">
                                                                <Activity className="w-4 h-4 text-gray-400" />

                                                                {radicado.total_actuaciones}
                                                            </div>
                                                        </td>

                                                        {/* ESTADO */}
                                                        <td className="px-5 py-4 text-center">
                                                            <span
                                                                className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${radicado.estado_consulta ===
                                                                    "sin consultar"
                                                                    ? "bg-yellow-100 text-yellow-700"
                                                                    : radicado.estado_consulta
                                                                        ?.toLowerCase()
                                                                        .includes("fallo")
                                                                        ? "bg-red-100 text-red-700"
                                                                        : "bg-green-100 text-green-700"
                                                                    }`}
                                                            >
                                                                {radicado.estado_consulta || "Sin estado"}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </section>
                        {/* PANEL LATERAL */}
                        <aside className="space-y-6">
                            <div className="bg-white rounded-xl border border-gray-200 p-6">
                                <h2 className="font-semibold text-gray-900 mb-1">
                                    Estado de cuenta
                                </h2>

                                <p className="text-sm text-gray-500 mb-5">
                                    Controle el acceso del usuario a la plataforma.
                                </p>

                                <div className="space-y-3">
                                    {usuario.estado !== "ACTIVO" && (
                                        <button
                                            onClick={() => cambiarEstado("ACTIVO")}
                                            disabled={saving}
                                            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gray-900 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
                                        >
                                            <Check className="w-4 h-4" />
                                            Activar cuenta
                                        </button>
                                    )}

                                    {usuario.estado !== "RECHAZADO" && (
                                        <button
                                            onClick={() => cambiarEstado("RECHAZADO")}
                                            disabled={saving}
                                            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                                        >
                                            <Ban className="w-4 h-4" />
                                            Rechazar cuenta
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="bg-white rounded-xl border border-gray-200 p-6">
                                <h2 className="font-semibold text-gray-900 mb-4">
                                    Resumen
                                </h2>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-gray-500">
                                            ID usuario
                                        </span>

                                        <span className="text-sm font-medium text-gray-900">
                                            #{usuario.id}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-gray-500">
                                            Rol
                                        </span>

                                        <span className="text-sm font-medium text-gray-900">
                                            Abogado
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-gray-500">
                                            Plan
                                        </span>

                                        <span className="text-sm font-medium text-gray-900">
                                            {usuario.plan?.nombre || "Sin plan"}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-500">
                                        Radicados
                                    </span>

                                    <span className="text-sm font-medium text-gray-900">
                                        {usuario.total_radicados} /{" "}
                                        {usuario.plan?.limite_radicados ?? 0}
                                    </span>
                                </div>
                            </div>
                        </aside>
                    </div>
                </div>
            </main>
        </div>
    );
}