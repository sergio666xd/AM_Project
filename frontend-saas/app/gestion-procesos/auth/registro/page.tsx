"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import GuestOnly from "@/components/auth/GuestOnly";
import { API_URL } from "@/lib/api";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
type Plan = { id: number; nombre: string; precio_mensual: number; limite_radicados: number };
type PlansState = "loading" | "error" | "ready";

function formatPrice(price: number) {
  return price === 0 ? "Gratis" : `$${price.toLocaleString("es-CO")} COP al mes`;
}

function RegistroForm() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansState, setPlansState] = useState<PlansState>("loading");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [planId, setPlanId] = useState("");
  const [card, setCard] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const loadPlans = useCallback(async () => {
    setPlansState("loading");
    try {
      const response = await fetch(`${API_URL}/api/planes-publicos`, { cache: "no-store" });
      if (!response.ok) throw new Error("No fue posible cargar los planes.");
      const availablePlans: Plan[] = await response.json();
      if (!Array.isArray(availablePlans)) throw new Error("La respuesta de planes no tiene el formato esperado.");
      setPlans(availablePlans);
      const requestedPlan = new URLSearchParams(window.location.search).get("plan_id");
      if (requestedPlan && availablePlans.some((plan) => String(plan.id) === requestedPlan)) setPlanId(requestedPlan);
      setPlansState("ready");
    } catch {
      setPlans([]);
      setPlansState("error");
    }
  }, []);

  useEffect(() => { void loadPlans(); }, [loadPlans]);

  function selectCard(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setError("");
    if (file && !ALLOWED_FILE_TYPES.has(file.type)) {
      setError("La tarjeta profesional debe ser PDF, JPG o PNG.");
      setCard(null);
      event.target.value = "";
      return;
    }
    if (file && file.size > MAX_FILE_SIZE) {
      setError("El archivo no puede superar 10 MB.");
      setCard(null);
      event.target.value = "";
      return;
    }
    setCard(file);
  }

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!card || !planId) {
      setError("Selecciona un plan y adjunta tu tarjeta profesional.");
      return;
    }
    setReviewing(true);
  }

  async function sendRequest() {
    if (!card || !planId) return;
    setLoading(true);
    setError("");
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
      setReviewing(false);
    } finally {
      setLoading(false);
    }
  }

  const selectedPlan = plans.find((plan) => String(plan.id) === planId);

  return (
    <MarketingLayout>
      <main className="mx-auto max-w-3xl px-5 py-12 text-[#002060] lg:px-8">
        <Link href="/gestion-procesos" className="inline-flex min-h-11 items-center rounded px-1 text-sm font-semibold underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-[#002060]">Volver a Gestión de Procesos</Link>
        <header className="mt-8">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-[#765d19]">Acceso SaaS para abogados</p>
          <h1 className="mt-3 text-4xl font-semibold">Solicita tu acceso</h1>
          <p className="mt-3 leading-7 text-[#002060]/80">Completa los datos de la cuenta, elige un plan y carga tu tarjeta profesional para revisión.</p>
        </header>

        {plansState === "loading" && <p role="status" aria-live="polite" className="mt-6 flex items-center gap-2 rounded-lg bg-white p-4 text-sm"><LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> Cargando planes disponibles…</p>}
        {plansState === "error" && <div role="alert" className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900"><p>No se pudieron consultar los planes. Inténtalo nuevamente.</p><button type="button" onClick={() => void loadPlans()} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-red-900/30 px-4 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-red-900"><RefreshCw size={16} aria-hidden="true" /> Reintentar</button></div>}
        {plansState === "ready" && plans.length === 0 && <div className="mt-6 rounded-lg border border-[#ccb56b]/60 bg-white p-4 text-sm"><p>No hay planes SaaS disponibles para registro en este momento.</p><Link href="/contacto" className="mt-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Consultar con la firma</Link></div>}
        {error && <p id="registration-error" role="alert" className="mt-6 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</p>}

        {plansState === "ready" && plans.length > 0 && <form onSubmit={review} className="mt-7 space-y-5" aria-describedby={error ? "registration-error" : undefined}>
          <fieldset disabled={reviewing || loading} className="grid gap-5 rounded-xl border border-[#ccb56b]/50 bg-white p-5 sm:grid-cols-2 sm:p-7">
            <legend className="px-2 text-lg font-semibold">Datos de la cuenta</legend>
            <label className="grid gap-2 text-sm font-semibold sm:col-span-2">Nombre completo<input required maxLength={180} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className="min-h-11 rounded-lg border border-[#ccb56b]/70 px-3 py-2 font-normal outline-none focus:border-[#002060] focus:ring-2 focus:ring-[#002060]/30" /></label>
            <label className="grid gap-2 text-sm font-semibold">Correo electrónico<input required type="email" maxLength={180} value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="min-h-11 rounded-lg border border-[#ccb56b]/70 px-3 py-2 font-normal outline-none focus:border-[#002060] focus:ring-2 focus:ring-[#002060]/30" /></label>
            <label className="grid gap-2 text-sm font-semibold">WhatsApp<input required type="tel" maxLength={30} value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" className="min-h-11 rounded-lg border border-[#ccb56b]/70 px-3 py-2 font-normal outline-none focus:border-[#002060] focus:ring-2 focus:ring-[#002060]/30" /></label>
            <label className="grid gap-2 text-sm font-semibold sm:col-span-2">Contraseña
              <span className="text-xs font-normal text-[#002060]/75">Usa al menos 8 caracteres. Al iniciar sesión podrás cambiarla.</span>
              <input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className="min-h-11 rounded-lg border border-[#ccb56b]/70 px-3 py-2 font-normal outline-none focus:border-[#002060] focus:ring-2 focus:ring-[#002060]/30" />
            </label>
          </fieldset>

          <fieldset disabled={reviewing || loading} className="grid gap-5 rounded-xl border border-[#ccb56b]/50 bg-white p-5 sm:grid-cols-2 sm:p-7">
            <legend className="px-2 text-lg font-semibold">Plan y verificación profesional</legend>
            <label className="grid gap-2 text-sm font-semibold sm:col-span-2">Plan SaaS
              <select required value={planId} onChange={(event) => setPlanId(event.target.value)} className="min-h-11 rounded-lg border border-[#ccb56b]/70 bg-white px-3 py-2 font-normal outline-none focus:border-[#002060] focus:ring-2 focus:ring-[#002060]/30">
                <option value="">Selecciona un plan</option>
                {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.nombre} · {plan.limite_radicados} procesos · {formatPrice(plan.precio_mensual)}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold sm:col-span-2">Tarjeta profesional
              <span className="text-xs font-normal text-[#002060]/75">PDF, JPG o PNG; máximo 10 MB. Se usa para verificar la solicitud de acceso.</span>
              <input required type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={selectCard} className="min-h-11 rounded-lg border border-dashed border-[#92792e]/70 p-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-[#002060]" />
              {card && <span className="text-xs font-normal text-[#002060]/80">Archivo seleccionado: {card.name} ({(card.size / 1024 / 1024).toFixed(2)} MB)</span>}
            </label>
          </fieldset>

          {!reviewing ? <button type="submit" className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#002060] px-5 py-3 font-semibold !text-white outline-none hover:bg-[#003387] focus-visible:ring-2 focus-visible:ring-[#92792e] focus-visible:ring-offset-2">Revisar solicitud</button> : <section className="rounded-xl border border-[#ccb56b]/60 bg-[#fffdf8] p-5" aria-labelledby="review-title">
            <h2 id="review-title" className="text-lg font-semibold">Revisa antes de enviar</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="font-semibold">Nombre</dt><dd>{name.trim()}</dd></div>
              <div><dt className="font-semibold">Correo</dt><dd className="break-all">{email.trim()}</dd></div>
              <div><dt className="font-semibold">WhatsApp</dt><dd>{phone.trim()}</dd></div>
              <div><dt className="font-semibold">Plan</dt><dd>{selectedPlan ? `${selectedPlan.nombre} · ${formatPrice(selectedPlan.precio_mensual)}` : "Sin seleccionar"}</dd></div>
              <div className="sm:col-span-2"><dt className="font-semibold">Tarjeta profesional</dt><dd className="break-all">{card?.name}</dd></div>
            </dl>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => setReviewing(false)} disabled={loading} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-[#002060]/30 px-4 py-3 font-semibold outline-none hover:bg-[#f7f3e8] focus-visible:ring-2 focus-visible:ring-[#002060]">Volver a editar</button>
              <button type="button" onClick={() => void sendRequest()} disabled={loading} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-[#002060] px-4 py-3 font-semibold !text-white outline-none hover:bg-[#003387] focus-visible:ring-2 focus-visible:ring-[#92792e] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">{loading && <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />}{loading ? "Enviando solicitud…" : "Confirmar y enviar"}</button>
            </div>
          </section>}
        </form>}
      </main>
    </MarketingLayout>
  );
}

export default function RegistroPage() {
  return <GuestOnly><RegistroForm /></GuestOnly>;
}
