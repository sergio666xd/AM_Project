"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Clock3, FileText, FolderOpen, KeyRound, Mail, Pencil, Save, Trash2 } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { useSession } from "@/context/SessionContext";

type UserDetail = {
  id: number;
  nombre_completo: string;
  email: string;
  whatsapp_numero: string;
  rol: string;
  estado: string;
  debe_cambiar_password: boolean;
  created_at: string | null;
  ultimo_acceso: string | null;
  plan: { id: number; nombre: string } | null;
  responsable: { id: number; nombre: string } | null;
  procesos: { id: number; nombre: string; estado: string; abogado: string | null; href: string }[];
  tareas: { id: number; titulo: string; estado: string; fecha_limite: string | null; proceso: string | null; href: string }[];
  documentos: { id: number; nombre: string; fecha: string; proceso: string | null; href: string }[];
  solicitudes: { id: number; tipo: string; estado: string; fecha: string; href: string }[];
  actividad: { id: number; accion: string; descripcion: string; recurso: string; fecha: string; href: string }[];
  totales: { procesos: number; tareas: number; documentos: number; solicitudes: number };
};

const roleLabels: Record<string, string> = {
  ADMIN: "Administrador de plataforma",
  ABOGADO_ADMIN: "Abogado de la firma",
  ABOGADO: "Abogado SaaS",
  CLIENTE: "Cliente",
};
const stateTone = (state: string) => state === "ACTIVO" ? "completed" : state === "RECHAZADO" ? "rejected" : "pending";
const stateLabel = (state: string) => ({ ACTIVO: "Activo", SUSPENDIDO: "Suspendido", RECHAZADO: "Rechazado", PENDIENTE_APROBACION: "Pendiente de aprobación" })[state] || state;
const formatDate = (value: string | null) => value ? new Date(value).toLocaleString("es-CO", { timeZone: "America/Bogota" }) : "Sin registro";

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { token } = useSession();

  async function load() {
    if (!token || !id) return;
    setLoading(true);
    setError("");
    try {
      const result = await fetchApi(`/api/admin/usuarios/${id}`, { method: "GET", token });
      setUser(result);
      setName(result.nombre_completo);
      setPhone(result.whatsapp_numero || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible cargar la ficha.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token || !id) return;
    let active = true;
    fetchApi(`/api/admin/usuarios/${id}`, { method: "GET", token })
      .then((result) => {
        if (active) {
          setUser(result);
          setName(result.nombre_completo);
          setPhone(result.whatsapp_numero || "");
        }
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "No fue posible cargar la ficha."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, token]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setWorking(true);
    setError("");
    try {
      await fetchApi(`/api/admin/usuarios/${user.id}`, {
        method: "PATCH", token,
        body: JSON.stringify({ nombre_completo: name.trim(), whatsapp_numero: phone.trim() }),
      });
      setNotice("Datos personales actualizados.");
      setEditing(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible actualizar los datos.");
    } finally {
      setWorking(false);
    }
  }

  async function changeStatus() {
    if (!user) return;
    setWorking(true);
    setError("");
    try {
      const next = user.estado === "ACTIVO" ? "SUSPENDIDO" : "ACTIVO";
      await fetchApi(`/api/admin/usuarios/${user.id}/estado?estado=${next}`, { method: "PATCH", token });
      setNotice(next === "ACTIVO" ? "Cuenta activada." : "Cuenta suspendida de forma lógica.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible cambiar el estado.");
    } finally {
      setWorking(false);
    }
  }

  async function deleteAccount() {
    if (!user || !window.confirm(`¿Eliminar la cuenta de ${user.nombre_completo}? Las cuentas con procesos, tareas, solicitudes o documentos vinculados se conservan para proteger el historial.`)) return;
    setWorking(true);
    setError("");
    try {
      const result = await fetchApi(`/api/admin/usuarios/${user.id}`, { method: "DELETE", token });
      setNotice(result.mensaje || "Cuenta eliminada.");
      router.push("/gestion-procesos/admin/usuarios");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible eliminar la cuenta.");
    } finally {
      setWorking(false);
    }
  }

  async function forcePasswordChange() {
    if (!user) return;
    setWorking(true);
    setError("");
    try {
      await fetchApi(`/api/admin/usuarios/${user.id}/forzar-cambio-password`, { method: "PATCH", token });
      setNotice("Se solicitará un cambio de contraseña en el siguiente ingreso.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible actualizar el acceso.");
    } finally {
      setWorking(false);
    }
  }

  async function sendPasswordReset() {
    if (!user || !window.confirm(`¿Enviar a ${user.email} un enlace para restablecer su contraseña?`)) return;
    setWorking(true);
    setError("");
    try {
      const result = await fetchApi(`/api/admin/usuarios/${user.id}/enviar-restablecimiento`, { method: "POST", token });
      setNotice(result.mensaje || `Se solicitó el envío a ${user.email}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible enviar el restablecimiento.");
    } finally {
      setWorking(false);
    }
  }

  if (loading) return <div><LoadingState label="Cargando ficha de usuario" rows={5} /></div>;
  if (!user) return <div className="space-y-4"><Link href="/gestion-procesos/admin/usuarios" className="text-sm text-brand-700 hover:underline">Volver a usuarios</Link>{error && <p role="alert" className="rounded-lg bg-danger-light p-3 text-danger">{error}</p>}<EmptyState title="No se encontró el usuario" description="La cuenta pudo ser eliminada o no está disponible." /></div>;

  const adminReadOnly = user.rol === "ADMIN";
  const pendingRequests = user.solicitudes.filter((request) => ["PENDIENTE", "PENDIENTE_APROBACION"].includes(request.estado));

  return (
    <section className="motion-swap mx-auto max-w-6xl space-y-5">
      <Link href="/gestion-procesos/admin/usuarios" className="inline-flex items-center gap-2 text-sm text-foreground-muted hover:text-brand-900"><ArrowLeft className="size-4" /> Volver a usuarios</Link>
      <PageHeader
        overline={`Ficha de cuenta · ${roleLabels[user.rol] || user.rol}`}
        title={user.nombre_completo}
        description={user.email}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void sendPasswordReset()} disabled={working} icon={<Mail className="size-4" />}>
              Enviar restablecimiento
            </Button>
            {!adminReadOnly && <Button variant="secondary" onClick={() => setEditing((value) => !value)} icon={<Pencil className="size-4" />}>Editar</Button>}
            {!adminReadOnly && <Button variant="secondary" onClick={() => void forcePasswordChange()} disabled={working || user.debe_cambiar_password} icon={<KeyRound className="size-4" />}>Restablecer acceso</Button>}
            {!adminReadOnly && user.estado !== "PENDIENTE_APROBACION" && <Button variant={user.estado === "ACTIVO" ? "danger" : "primary"} onClick={() => void changeStatus()} disabled={working}>{user.estado === "ACTIVO" ? "Suspender" : "Activar"}</Button>}
            {!adminReadOnly && user.estado === "PENDIENTE_APROBACION" && <Link className="inline-flex min-h-10 items-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-surface-hover" href="/gestion-procesos/admin/solicitudes">Revisar solicitud</Link>}
            {!adminReadOnly && <Button variant="danger" onClick={() => void deleteAccount()} disabled={working} icon={<Trash2 className="size-4" />}>Eliminar cuenta</Button>}
          </div>
        }
      />
      {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger-light p-3 text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-success/30 bg-success-light p-3 text-sm text-success">{notice}</p>}

      {editing && <Card title="Editar datos personales"><form onSubmit={saveProfile} className="grid gap-3 md:grid-cols-3"><label className="text-sm">Nombre completo<input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" /></label><label className="text-sm">WhatsApp<input value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" /></label><div className="flex items-end gap-2"><Button type="submit" disabled={working}><Save className="size-4" /> Guardar</Button><Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button></div></form></Card>}

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatCard label="Procesos" value={user.totales.procesos} icon={FolderOpen} />
        <StatCard label="Tareas" value={user.totales.tareas} icon={Clock3} />
        <StatCard label="Documentos" value={user.totales.documentos} icon={FileText} />
        <StatCard label="Solicitudes" value={user.totales.solicitudes} icon={Mail} />
      </div>

      <Card title="Datos personales y acceso"><dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><div><dt className="text-xs text-foreground-muted">Rol</dt><dd className="mt-1 text-sm">{roleLabels[user.rol] || user.rol}</dd></div><div><dt className="text-xs text-foreground-muted">Estado</dt><dd className="mt-1"><Badge tone={stateTone(user.estado)}>{stateLabel(user.estado)}</Badge></dd></div><div><dt className="text-xs text-foreground-muted">Correo</dt><dd className="mt-1 text-sm">{user.email}</dd></div><div><dt className="text-xs text-foreground-muted">WhatsApp</dt><dd className="mt-1 text-sm">{user.whatsapp_numero || "Sin número registrado"}</dd></div><div><dt className="text-xs text-foreground-muted">Cuenta creada</dt><dd className="mt-1 text-sm">{formatDate(user.created_at)}</dd></div><div><dt className="text-xs text-foreground-muted">Último acceso</dt><dd className="mt-1 text-sm">{formatDate(user.ultimo_acceso)}</dd></div><div><dt className="text-xs text-foreground-muted">Contraseña</dt><dd className="mt-1 text-sm">{user.debe_cambiar_password ? "Debe cambiarla en el siguiente ingreso" : "Acceso normal"}</dd></div><div><dt className="text-xs text-foreground-muted">Plan</dt><dd className="mt-1 text-sm">{user.plan?.nombre || "No aplica"}</dd></div><div><dt className="text-xs text-foreground-muted">Responsable interno</dt><dd className="mt-1 text-sm">{user.responsable?.nombre || "No asignado"}</dd></div></dl></Card>

      {pendingRequests.length > 0 && <Card title="Solicitudes por revisar" description="Abre el módulo adecuado para decidir cada solicitud."><div className="space-y-2">{pendingRequests.map((request) => <div key={`${request.tipo}-${request.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"><div><p className="text-sm font-medium">{request.tipo}</p><p className="text-xs text-foreground-muted">{formatDate(request.fecha)}</p></div><Link className="text-sm font-semibold text-brand-700 hover:underline" href={request.href}>Revisar solicitud</Link></div>)}</div></Card>}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Procesos asociados" description="Procesos como responsable o cliente."><div className="space-y-2">{user.procesos.length ? user.procesos.map((process) => <Link key={process.id} href={process.href} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 hover:bg-surface-hover"><span className="flex items-center gap-2 text-sm"><FolderOpen className="size-4 text-brand-700" />{process.nombre}<span className="text-xs text-foreground-muted">{process.abogado || ""}</span></span><Badge tone={process.estado === "Archivado" ? "archived" : "completed"}>{process.estado}</Badge></Link>) : <EmptyState title="Sin procesos asociados" />}</div></Card>
        <Card title="Tareas" description="Tareas asignadas o relacionadas con esta cuenta."><div className="space-y-2">{user.tareas.length ? user.tareas.map((task) => <Link key={task.id} href={task.href} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 hover:bg-surface-hover"><span><span className="block text-sm font-medium">{task.titulo}</span><span className="text-xs text-foreground-muted">{task.proceso || "General"}{task.fecha_limite ? ` · Vence ${formatDate(task.fecha_limite)}` : ""}</span></span><Badge tone={task.estado === "COMPLETADA" ? "completed" : "pending"}>{task.estado.replaceAll("_", " ")}</Badge></Link>) : <EmptyState title="Sin tareas asociadas" />}</div></Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Documentos" description="Documentos asociados a la cuenta o sus procesos."><div className="space-y-2">{user.documentos.length ? user.documentos.map((document) => <Link key={document.id} href={document.href} className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm hover:bg-surface-hover"><FileText className="size-4 text-brand-700" /><span>{document.nombre}<span className="block text-xs text-foreground-muted">{document.proceso || "Sin proceso"} · {formatDate(document.fecha)}</span></span></Link>) : <EmptyState title="Sin documentos asociados" />}</div></Card>
        <Card title="Solicitudes" description="Historial de registro, perfil y documentos."><div className="space-y-2">{user.solicitudes.length ? user.solicitudes.map((request) => <Link key={`${request.tipo}-${request.id}`} href={request.href} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 hover:bg-surface-hover"><span><span className="block text-sm">{request.tipo}</span><span className="text-xs text-foreground-muted">{formatDate(request.fecha)}</span></span><Badge tone={request.estado === "PENDIENTE" || request.estado === "PENDIENTE_APROBACION" ? "pending" : "normal"}>{request.estado.replaceAll("_", " ")}</Badge></Link>) : <EmptyState title="Sin solicitudes" />}</div></Card>
      </div>

      <Card title="Actividad reciente" description="Acciones registradas por este usuario."><div className="space-y-2">{user.actividad.length ? user.actividad.map((event) => <Link key={event.id} href={event.href} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-3 last:border-0"><span className="flex items-start gap-2 text-sm"><Clock3 className="mt-0.5 size-4 text-foreground-muted" /><span>{event.descripcion}<span className="block text-xs text-foreground-muted">{event.recurso} · {formatDate(event.fecha)}</span></span></span><span className="text-xs text-foreground-muted">{event.accion}</span></Link>) : <EmptyState title="Sin actividad registrada" description="Las acciones futuras de esta cuenta aparecerán aquí." />}</div></Card>
      {adminReadOnly && <p className="text-xs text-foreground-muted">Las cuentas administradoras se muestran en modo consulta y no se pueden suspender desde esta ficha.</p>}
    </section>
  );
}
