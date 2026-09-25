"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchApi } from "@/lib/api";
import { Lock, Mail, Scale } from "lucide-react";
import { useSession } from "@/context/SessionContext";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { refreshUser } = useSession();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // FastAPI OAuth2PasswordRequestForm espera form-urlencoded
      const formData = new URLSearchParams();
      formData.append("username", email);
      formData.append("password", password);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData,
      });

      if (!res.ok) throw new Error("Credenciales inválidas o cuenta inactiva");

      const data = await res.json();
      localStorage.setItem("token", data.access_token);
      await refreshUser();

      const adminResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/admin/dashboard`,
        {
          headers: {
            Authorization: `Bearer ${data.access_token}`,
          },
        }
      );

      if (adminResponse.ok) {
        router.push("/gestion-procesos/admin");
        return;
      }

      if (adminResponse.status === 403) {
        router.push("/gestion-procesos/dashboard");
        return;
      }

      if (adminResponse.status === 401) {
        localStorage.removeItem("token");
        throw new Error("La sesión no es válida");
      }

      throw new Error("No fue posible verificar los permisos del usuario");
    } catch (err: any) {
      setError(err.message || "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
      <div className="max-w-md w-full p-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
        <div className="flex flex-col items-center mb-6">
          <div className="p-3 bg-indigo-600/15 text-indigo-400 rounded-xl mb-3">
            <Scale className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">SaaS Jurídico</h1>
          <p className="text-sm text-slate-400 mt-1">Ingresa a tu cuenta para gestionar tus procesos</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1 uppercase tracking-wider">Correo Electrónico</label>
            <div className="relative">
              <Mail className="w-5 h-5 text-slate-500 absolute left-3 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500 text-sm"
                placeholder="abogado@ejemplo.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1 uppercase tracking-wider">Contraseña</label>
            <div className="relative">
              <Lock className="w-5 h-5 text-slate-500 absolute left-3 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500 text-sm"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 transition font-medium rounded-lg text-sm shadow-lg shadow-indigo-600/20 disabled:opacity-50"
          >
            {loading ? "Iniciando sesión..." : "Ingresar al Sistema"}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 mt-6">
          ¿No tienes una cuenta? <a href="/auth/registro" className="text-indigo-400 hover:underline">Regístrate aquí</a>
        </p>
      </div>
    </div>
  );
}
