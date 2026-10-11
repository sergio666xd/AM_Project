"use client";

import { useEffect } from "react";
import { useSession } from "@/context/SessionContext";
import { API_URL } from "@/lib/api";

const ACTIVE_ROLES = new Set(["CLIENTE", "ABOGADO_ADMIN", "ADMIN"]);
const HEARTBEAT_INTERVAL_MS = 30_000;

function getSessionId() {
  const storageKey = "firm-chat-presence-session";
  let sessionId = sessionStorage.getItem(storageKey);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem(storageKey, sessionId);
  }
  return sessionId;
}

export default function ChatPresenceHeartbeat() {
  const { user, token } = useSession();

  useEffect(() => {
    if (!token || !user || !ACTIVE_ROLES.has(user.rol)) return;

    let sessionId: string;
    try {
      sessionId = getSessionId();
    } catch {
      return;
    }

    let released = false;
    const request = (method: "POST" | "DELETE", keepalive = false) =>
      fetch(`${API_URL}/api/chat/presencia`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ session_id: sessionId }),
        keepalive,
      }).catch(() => undefined);

    const heartbeat = () => {
      if (!released) void request("POST");
    };
    const resume = () => {
      released = false;
      heartbeat();
    };
    const release = () => {
      if (released) return;
      released = true;
      void request("DELETE", true);
    };

    heartbeat();
    const interval = window.setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
    window.addEventListener("pagehide", release);
    window.addEventListener("pageshow", resume);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", release);
      window.removeEventListener("pageshow", resume);
      release();
    };
  }, [token, user]);

  return null;
}
