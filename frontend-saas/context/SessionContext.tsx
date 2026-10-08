"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

import { getCurrentUser } from "@/lib/api";

export interface UsuarioActual {
  id: number;
  email: string;
  nombre_completo: string;
  whatsapp_numero?: string | null;
  genero?: "MASCULINO" | "FEMENINO" | null;
  numero_documento?: string | null;
  domicilio?: string | null;
  direccion?: string | null;
  tarjeta_profesional?: string | null;
  rol: string;
  estado: string;
  debe_cambiar_password?: boolean;
  notificaciones_email?: boolean;
  notificaciones_whatsapp?: boolean;
  preferencias_notificacion?: Record<string, { email: boolean; whatsapp: boolean }>;
  canal_notificacion_cliente?: "EMAIL" | "WHATSAPP" | null;
  plan?: {
    id: number;
    nombre: string;
    limite_radicados: number;
    precio_mensual: number;
    notificaciones_whatsapp_procesos?: boolean;
    notificaciones_whatsapp_tareas?: boolean;
  } | null;
}

interface SessionContextType {
  user: UsuarioActual | null;
  loading: boolean;
  token: string | null;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType | undefined>(
  undefined
);

export function SessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUser] = useState<UsuarioActual | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadSession() {
    const storedToken = localStorage.getItem("token");

    if (!storedToken) {
      setToken(null);
      setUser(null);
      setLoading(false);
      return;
    }

    setToken(storedToken);

    try {
      const currentUser = await getCurrentUser(storedToken);

      setUser(currentUser);
    } catch (error) {
      console.error(
        "No fue posible recuperar la sesión:",
        error
      );

      localStorage.removeItem("token");

      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSession();
  }, []);

  async function refreshUser() {
    const storedToken = localStorage.getItem("token");

    if (!storedToken) {
      setToken(null);
      setUser(null);
      return;
    }

    try {
      const currentUser = await getCurrentUser(storedToken);

      setToken(storedToken);
      setUser(currentUser);
    } catch (error) {
      console.error(
        "No fue posible actualizar el usuario:",
        error
      );
    }
  }

  function logout() {
    localStorage.removeItem("token");

    setToken(null);
    setUser(null);

    window.location.href = "/";
  }

  return (
    <SessionContext.Provider
      value={{
        user,
        loading,
        token,
        logout,
        refreshUser,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error(
      "useSession debe utilizarse dentro de SessionProvider"
    );
  }

  return context;
}
