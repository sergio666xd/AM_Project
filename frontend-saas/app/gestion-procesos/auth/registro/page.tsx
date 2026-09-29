"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import GuestOnly from "@/components/auth/GuestOnly";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

type Plan = { id: number; nombre: string; precio_mensual: number; limite_radicados: number };

function RegistroForm() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [planId, setPlanId] = useState("");
  const [card, setCard] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadPlans() {
      try {
        const response = await fetch(`${API_URL}/api/planes-publicos`);
        if (!response.ok) throw new Error("No fue posible cargar los planes.");
        const availablePlans: Plan[] = await response.json();
        setPlans(availablePlans);
        const requestedPlan = new URLSearchParams(window.location.search).get("plan_id");
        if (requestedPlan && availablePlans.some((plan) => String(plan.id) === requestedPlan)) {
          setPlanId(requestedPlan);
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "No fue posible cargar los planes.");
      }
    }
    void loadPlans();
  }, []);

  function selectCard(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setError("");
    if (file && !ALLOWED_FILE_TYPES.has(file.type)) {
      setError("La tarjeta profesional debe ser PDF, JPG o PNG.");
      setCard(null);
      return;
    }
    if (file && file.size > MAX_FILE_SIZE) {
      setError("El archivo no puede superar 10 MB.");
      setCard(null);
      return;
    }
    setCard(file);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!card || !planId) {
      setError("Selecciona un plan y adjunta tu tarjeta profesional.");
      return;
    }
    setLoading(true);
    try {
      const form = new FormData();
      form.append("email", email.trim().toLowerCase());
      form.append("password", password);
      form.append("nombre_completo", name.trim());
      form.append("whatsapp_numero", phone.trim());
      form.append("tarjeta_profesional", card);
      form.append("plan_id", planId);
      const response = await fetch(`${API_URL}/api/auth/registro`, { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || "No fue posible enviar la solicitud.");
      router.push("/gestion-procesos/auth/login?registro=pendiente");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No fue posible enviar la solicitud.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <MarketingLayout>
      <main className="mx-auto max-w-3xl px-5 py-12 text-[#002060] lg:px-8">
        <Link href="/gestion-procesos" className="text-sm font-semibold underline underline-offset-4">Volver a Gestión de Procesos</Link>
        <header className="mt-8">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-[#92792e]">Abogado externo</p>
          <h1 className="mt-3 text-4xl font-semibold">Solicita tu acceso</h1>
          <p className="mt-3 text-[#002060]/70">Selecciona un plan y completa la verificación de tu tarjeta profesional.</p>
        </header>
        {error && <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <form onSubmit={submit} className="mt-7 grid gap-5 rounded-xl border border-[#ccb56b]/50 bg-white p-5 sm:grid-cols-2 sm:p-7">
          <label className="grid gap-2 text-sm font-semibold sm:col-span-2">Nombre completo
            <input required value={name} onChange={(event) => setName(event.target.value)} className="rounded-lg border border-[#ccb56b]/60 px-3 py-3 font-normal" autoComplete="name" />
          </label>
          <label className="grid gap-2 text-sm font-semibold">Correo electrónico
            <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="rounded-lg border border-[#ccb56b]/60 px-3 py-3 font-normal" autoComplete="email" />
          </label>
          <label className="grid gap-2 text-sm font-semibold">WhatsApp
            <input required type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="rounded-lg border border-[#ccb56b]/60 px-3 py-3 font-normal" autoComplete="tel" />
          </label>
          <label className="grid gap-2 text-sm font-semibold">Contraseña
            <input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="rounded-lg border border-[#ccb56b]/60 px-3 py-3 font-normal" autoComplete="new-password" />
          </label>
          <label className="grid gap-2 text-sm font-semibold">Plan
            <select required value={planId} onChange={(event) => setPlanId(event.target.value)} className="rounded-lg border border-[#ccb56b]/60 bg-white px-3 py-3 font-normal">
              <option value="">Selecciona un plan</option>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.nombre} · {plan.limite_radicados} radicados</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold sm:col-span-2">Tarjeta profesional (PDF, JPG o PNG; máximo 10 MB)
            <input required type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={selectCard} className="rounded-lg border border-dashed border-[#ccb56b]/70 p-3 font-normal" />
          </label>
          <button type="submit" disabled={loading || plans.length === 0} className="rounded-lg bg-[#002060] px-5 py-3 font-semibold text-white hover:bg-[#003387] disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2">
            {loading ? "Enviando solicitud…" : "Enviar solicitud de acceso"}
          </button>
        </form>
      </main>
    </MarketingLayout>
  );
}

export default function RegistroPage() {
  return <GuestOnly><RegistroForm /></GuestOnly>;
}
