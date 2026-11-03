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

import { api, mensajeDeError, SESION_TERMINADA, type Esquemas } from "@/lib/api-v2/cliente";
import { useLoadEffect } from "@/lib/useLoadEffect";

/** Cada cuánto se renueva la sesión mientras el portal está abierto (12 horas). */
const RENOVACION_MS = 12 * 60 * 60 * 1000;
const CLAVE_ULTIMA_RENOVACION = "am:sesion-renovada-en";

export type UsuarioActual = Esquemas["UsuarioSesion"];

interface SessionContextType {
  user: UsuarioActual | null;
  loading: boolean;
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

/** La sesión va en una cookie httpOnly; aquí solo se lee quién es el usuario. */
async function leerSesion(): Promise<{ usuario: UsuarioActual | null; fallo: string | null }> {
  const { data, error, response } = await api.GET("/api/v2/sesion");
  if (data) return { usuario: data, fallo: null };
  // 401 o 403 (cuenta inactiva): no hay sesión válida. Lo demás es un fallo de red o del servidor.
  if (response && (response.status === 401 || response.status === 403)) return { usuario: null, fallo: null };
  return { usuario: null, fallo: mensajeDeError(error) };
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
      const { usuario, fallo } = await leerSesion();
      if (usuario) {
        setUser(usuario);
        persistPortalRole(usuario.rol);
        // Mantiene viva la ventana de la sesión sin retrasar la carga del portal.
        void renovarSiToca().catch(() => undefined);
      } else if (fallo) {
        // Un fallo de red o del servidor no invalida la sesión: se conserva
        // la cookie para que el usuario pueda reintentar sin volver a entrar.
        setSessionError(fallo);
      } else {
        clearSession();
      }
    } catch {
      setSessionError("No fue posible conectar con el servidor.");
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
    window.addEventListener(SESION_TERMINADA, handleExpired);
    return () => window.removeEventListener(SESION_TERMINADA, handleExpired);
  }, [clearSession]);

  const conSesion = Boolean(user);
  useEffect(() => {
    if (!conSesion) return;
    const intervalo = window.setInterval(() => void renovarSiToca().catch(() => undefined), RENOVACION_MS);
    return () => window.clearInterval(intervalo);
  }, [conSesion]);

  const refreshUser = useCallback(async () => {
    const { usuario, fallo } = await leerSesion().catch(() => ({ usuario: null, fallo: "sin conexión" }));
    if (usuario) {
      setUser(usuario);
      persistPortalRole(usuario.rol);
    } else if (!fallo) clearSession();
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
