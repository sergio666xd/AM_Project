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

import {
  getCurrentUser,
  API_URL,
  apiErrorStatus,
  SESSION_EXPIRED_EVENT,
  TOKEN_EN_COOKIE,
} from "@/lib/api";
import { api, SESION_TERMINADA } from "@/lib/api-v2/cliente";
import { useLoadEffect } from "@/lib/useLoadEffect";

/** Cada cuánto se renueva la sesión mientras el portal está abierto (12 horas). */
const RENOVACION_MS = 12 * 60 * 60 * 1000;
const CLAVE_ULTIMA_RENOVACION = "am:sesion-renovada-en";

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
  /**
   * Marcador de compatibilidad (`TOKEN_EN_COOKIE`) cuando hay sesión, o null.
   * El token real está en una cookie httpOnly; no se puede leer desde aquí.
   */
  token: string | null;
  /** Mensaje cuando la sesión no se pudo validar por un fallo de red o del servidor. */
  sessionError: string | null;
  logout: () => Promise<void>;
  /** Cierra la sesión en todos los dispositivos (invalida todos los tokens emitidos). */
  logoutEverywhere: () => Promise<void>;
  refreshUser: () => Promise<void>;
  retrySession: () => Promise<void>;
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

function leerAlmacen(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function escribirAlmacen(clave: string, valor: string | null) {
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, valor);
  } catch {
    // Modo privado o almacenamiento bloqueado: la sesión sigue en la cookie.
  }
}

/**
 * Pasa a la cookie una sesión iniciada antes de este cambio, cuando el token
 * se guardaba en localStorage: renovarlo con ese token deja la cookie puesta
 * y nadie tiene que volver a iniciar sesión. Después se borra el token viejo.
 */
async function migrarTokenAntiguo() {
  const antiguo = leerAlmacen("token");
  if (!antiguo) return;
  try {
    await fetch(`${API_URL}/api/auth/refresh-token`, {
      method: "POST",
      headers: { Authorization: `Bearer ${antiguo}` },
      credentials: "same-origin",
    });
  } catch {
    // Sin red: el usuario vuelve a iniciar sesión si la cookie no quedó.
  } finally {
    escribirAlmacen("token", null);
    escribirAlmacen("remember_me", null);
  }
}

async function renovarSiToca() {
  const ultima = Number(leerAlmacen(CLAVE_ULTIMA_RENOVACION) || 0);
  if (Date.now() - ultima < RENOVACION_MS) return;
  const { response } = await api.POST("/api/v2/sesion/renovar");
  if (response.ok) escribirAlmacen(CLAVE_ULTIMA_RENOVACION, String(Date.now()));
}

export function SessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUser] = useState<UsuarioActual | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const userRef = useRef<UsuarioActual | null>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const clearSession = useCallback(() => {
    persistPortalRole(null);
    escribirAlmacen(CLAVE_ULTIMA_RENOVACION, null);
    setUser(null);
  }, []);

  const loadSession = useCallback(async () => {
    setSessionError(null);
    try {
      await migrarTokenAntiguo();
      const currentUser: UsuarioActual = await getCurrentUser();
      setUser(currentUser);
      persistPortalRole(currentUser.rol);
      // Mantiene viva la ventana de la sesión sin retrasar la carga del portal.
      void renovarSiToca().catch(() => undefined);
    } catch (error) {
      const status = apiErrorStatus(error);
      if (status === 401 || status === 403) {
        clearSession();
      } else {
        // Un fallo de red o del servidor no invalida la sesión: se conserva
        // la cookie para que el usuario pueda reintentar sin volver a entrar.
        console.error("No fue posible recuperar la sesión:", error);
        setSessionError(
          error instanceof Error
            ? error.message
            : "No fue posible conectar con el servidor.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [clearSession]);

  const retrySession = useCallback(async () => {
    setLoading(true);
    await loadSession();
  }, [loadSession]);

  useLoadEffect(loadSession);

  // La API avisa cuando rechaza la sesión; limpiarla hace que RoleGate lleve
  // al usuario al inicio de sesión conservando la ruta actual.
  useEffect(() => {
    const handleExpired = () => {
      if (userRef.current) clearSession();
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpired);
    window.addEventListener(SESION_TERMINADA, handleExpired);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpired);
      window.removeEventListener(SESION_TERMINADA, handleExpired);
    };
  }, [clearSession]);

  const conSesion = Boolean(user);
  useEffect(() => {
    if (!conSesion) return;
    const intervalo = window.setInterval(() => void renovarSiToca().catch(() => undefined), RENOVACION_MS);
    return () => window.clearInterval(intervalo);
  }, [conSesion]);

  const refreshUser = useCallback(async () => {
    try {
      const currentUser: UsuarioActual = await getCurrentUser();
      setUser(currentUser);
      persistPortalRole(currentUser.rol);
    } catch (error) {
      if (apiErrorStatus(error) === 401) clearSession();
      else console.error("No fue posible actualizar el usuario:", error);
    }
  }, [clearSession]);

  const salir = useCallback(async (todas: boolean) => {
    await (todas ? api.DELETE("/api/v2/sesion/todas") : api.DELETE("/api/v2/sesion")).catch(() => undefined);
    clearSession();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa al cerrar sesión para descartar todo el estado en memoria.
    window.location.assign("/");
  }, [clearSession]);

  const logout = useCallback(() => salir(false), [salir]);
  const logoutEverywhere = useCallback(() => salir(true), [salir]);

  return (
    <SessionContext.Provider
      value={{
        user,
        loading,
        token: user ? TOKEN_EN_COOKIE : null,
        sessionError,
        logout,
        logoutEverywhere,
        refreshUser,
        retrySession,
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
