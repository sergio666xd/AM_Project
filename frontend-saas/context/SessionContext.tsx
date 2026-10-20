"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  ReactNode,
} from "react";

import { getCurrentUser, API_URL } from "@/lib/api";

/** Intervalo de renovación del token: cada 12 horas (en ms). */
const TOKEN_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;

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
  silenciar_email_si_push?: boolean;
  silenciar_whatsapp_si_push?: boolean;
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

function persistPortalRole(role?: string | null) {
  if (typeof document === "undefined") return;
  if (!role) {
    document.cookie = "portal_role=; Path=/; Max-Age=0; SameSite=Lax";
    return;
  }
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `portal_role=${encodeURIComponent(role)}; Path=/; SameSite=Lax${secure}`;
}

/**
 * Llama a POST /api/auth/refresh-token para obtener un nuevo JWT
 * con la misma política de expiración (sliding window).
 * Devuelve el nuevo token o null si la renovación falla.
 */
async function refreshTokenFromApi(currentToken: string): Promise<string | null> {
  try {
    const response = await fetch(`${API_URL}/api/auth/refresh-token`, {
      method: "POST",
      headers: { Authorization: `Bearer ${currentToken}` },
    });
    if (!response.ok) return null;
    const data: { access_token?: string } = await response.json().catch(() => ({}));
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

export function SessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUser] = useState<UsuarioActual | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Renueva el token silenciosamente y lo guarda en localStorage. */
  const silentRefresh = useCallback(async () => {
    const storedToken = localStorage.getItem("token");
    if (!storedToken) return;

    const newToken = await refreshTokenFromApi(storedToken);
    if (newToken) {
      localStorage.setItem("token", newToken);
      setToken(newToken);
    }
    // Si falla, el token actual sigue siendo válido hasta que expire.
  }, []);

  /** Inicia el timer periódico de renovación si remember_me está activo. */
  const startRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    const isRemembered = localStorage.getItem("remember_me") === "true";
    if (!isRemembered) return;

    refreshTimerRef.current = setInterval(() => {
      silentRefresh();
    }, TOKEN_REFRESH_INTERVAL_MS);
  }, [silentRefresh]);

  async function loadSession() {
    const storedToken = localStorage.getItem("token");

    if (!storedToken) {
      setToken(null);
      setUser(null);
      persistPortalRole(null);
      setLoading(false);
      return;
    }

    setToken(storedToken);

    try {
      const currentUser = await getCurrentUser(storedToken);

      setUser(currentUser);
      persistPortalRole(currentUser.rol);

      // Si hay sesión persistente, renovar el token al cargar la app
      // para extender la ventana de 15 días desde ahora.
      const isRemembered = localStorage.getItem("remember_me") === "true";
      if (isRemembered) {
        const newToken = await refreshTokenFromApi(storedToken);
        if (newToken) {
          localStorage.setItem("token", newToken);
          setToken(newToken);
        }
      }
    } catch (error) {
      console.error(
        "No fue posible recuperar la sesión:",
        error
      );

      localStorage.removeItem("token");
      localStorage.removeItem("remember_me");
      persistPortalRole(null);

      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Iniciar/detener el timer de renovación cuando cambia el token
  useEffect(() => {
    if (token) {
      startRefreshTimer();
    }
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [token, startRefreshTimer]);

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
      persistPortalRole(currentUser.rol);
    } catch (error) {
      console.error(
        "No fue posible actualizar el usuario:",
        error
      );
    }
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("remember_me");
    persistPortalRole(null);

    setToken(null);
    setUser(null);

    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

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
