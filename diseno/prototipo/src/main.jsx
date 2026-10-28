import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { SlidersHorizontal, X } from "lucide-react";
import { AppShell, ClientShell, NAV } from "./shell.jsx";
import { Toast, cx } from "./ui.jsx";
import { Hoy, Procesos, Expediente } from "./abogado.jsx";
import { Tareas, Agenda, Mensajes, Clientes, Radicados, Documentos, Contratos, Cobros } from "./abogado2.jsx";
import { ClienteInicio, ClienteProceso, ClientePendientes, ClienteMensajes, ClientePagos, ClientePerfil, ClienteAyuda } from "./cliente.jsx";
import { AdminResumen, AdminUsuarios, AdminConsultas, AdminGlosario, AdminAuditoria, AdminIntegraciones, FueraDeAlcance, Login } from "./admin.jsx";
import { procesos } from "./data.js";

const INICIO = { abogado: "hoy", cliente: "inicio", admin: "resumen" };

function leerHash() {
  const [role, page, id] = location.hash.replace(/^#\/?/, "").split("/");
  if (role === "ingreso") return { role: "ingreso" };
  if (!INICIO[role]) return { role: "abogado", page: "hoy" };
  return { role, page: page || INICIO[role], id: id ? Number(id) : undefined };
}

function Prototipo({ ruta, setRuta, demo, setDemo }) {
  const [open, setOpen] = useState(false);
  const roles = [["abogado", "Abogada"], ["cliente", "Cliente"], ["admin", "Administración"], ["ingreso", "Ingreso"]];
  return (
    <div className="fixed bottom-[84px] right-3 z-40 lg:bottom-4 lg:right-4">
      {open ? (
        <div className="anim-pop w-[264px] rounded-xl bg-[#18203a] p-3 text-[13px] text-[#f4f1e8] shadow-pop">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold">Controles del prototipo</p>
            <button onClick={() => setOpen(false)} aria-label="Cerrar controles" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-white/10"><X size={16} /></button>
          </div>
          <p className="mb-1.5 text-[#9aa6c4]">Ver como</p>
          <div className="grid grid-cols-2 gap-1">
            {roles.map(([k, l]) => (
              <button key={k} onClick={() => setRuta(k === "ingreso" ? { role: "ingreso" } : { role: k, page: INICIO[k] })} className={cx("h-9 rounded-md font-semibold", ruta.role === k ? "bg-[#ccb56b] text-[#2b220a]" : "bg-white/8 hover:bg-white/15")}>{l}</button>
            ))}
          </div>
          <p className="mb-1.5 mt-3 text-[#9aa6c4]">Estado de los datos</p>
          <div className="grid grid-cols-3 gap-1">
            {[["normal", "Con datos"], ["cargando", "Cargando"], ["vacio", "Vacío"]].map(([k, l]) => (
              <button key={k} onClick={() => setDemo(k)} className={cx("h-9 rounded-md font-semibold", demo === k ? "bg-[#ccb56b] text-[#2b220a]" : "bg-white/8 hover:bg-white/15")}>{l}</button>
            ))}
          </div>
          <p className="mt-3 text-[12px] leading-snug text-[#9aa6c4]">Datos de ejemplo. Ninguna persona ni radicado es real. Hoy es martes 27 de octubre de 2026.</p>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#18203a] px-4 text-[13px] font-semibold text-[#f4f1e8] shadow-pop transition-[scale] active:scale-[0.96]">
          <SlidersHorizontal size={15} /> Prototipo
        </button>
      )}
    </div>
  );
}

function App() {
  const [ruta, setRutaState] = useState(leerHash);
  const [theme, setThemeState] = useState(() => { try { return localStorage.getItem("am-tema") || document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); } catch { return "light"; } });
  const [demo, setDemo] = useState("normal");
  const [toastMsg, setToast] = useState(null);

  const setRuta = useCallback((r) => {
    setRutaState(r);
    const h = r.role === "ingreso" ? "#/ingreso" : `#/${r.role}/${r.page}${r.id ? "/" + r.id : ""}`;
    if (location.hash !== h) history.pushState(null, "", h);
    window.scrollTo({ top: 0 });
  }, []);
  useEffect(() => { const f = () => setRutaState(leerHash()); window.addEventListener("popstate", f); return () => window.removeEventListener("popstate", f); }, []);
  const setTheme = (t) => { setThemeState(t); try { localStorage.setItem("am-tema", t); } catch {} };
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    const p = ruta.page === "expediente" ? procesos.find((x) => x.id === ruta.id)?.nombre : NAV[ruta.role]?.flatMap((g) => g.items).find((x) => x.id === ruta.page)?.label;
    document.title = (p ? p + " · " : "") + "Gestión de procesos AM";
  }, [ruta]);
  const toast = (text) => { setToast({ text, id: Date.now() }); setTimeout(() => setToast((t) => (t && Date.now() - t.id > 2600 ? null : t)), 2800); };

  const go = (r) => setRuta({ role: ruta.role, ...r });
  const salir = () => setRuta({ role: "ingreso" });
  const props = { go, demo, toast, id: ruta.id, folio: ruta.folio };

  let content;
  if (ruta.role === "ingreso") {
    content = <Login onEnter={(role) => setRuta({ role, page: INICIO[role] })} />;
  } else if (ruta.role === "cliente") {
    const P = { inicio: ClienteInicio, proceso: ClienteProceso, pendientes: ClientePendientes, mensajes: ClienteMensajes, pagos: ClientePagos, perfil: ClientePerfil, ayuda: ClienteAyuda }[ruta.page] || ClienteInicio;
    content = <ClientShell page={ruta.page} go={go} theme={theme} setTheme={setTheme} onExit={salir}><P {...props} /></ClientShell>;
  } else {
    const mapa = ruta.role === "admin"
      ? { resumen: AdminResumen, usuarios: AdminUsuarios, consultas: AdminConsultas, glosario: AdminGlosario, auditoria: AdminAuditoria, integraciones: AdminIntegraciones, procesos: Procesos, radicados: Radicados, expediente: Expediente }
      : { hoy: Hoy, procesos: Procesos, expediente: Expediente, tareas: Tareas, agenda: Agenda, mensajes: Mensajes, clientes: Clientes, radicados: Radicados, documentos: Documentos, contratos: Contratos, cobros: Cobros };
    const label = NAV[ruta.role].flatMap((g) => g.items).find((x) => x.id === ruta.page)?.label || "Expediente";
    const P = mapa[ruta.page];
    content = (
      <AppShell role={ruta.role} page={ruta.page} go={go} theme={theme} setTheme={setTheme} onExit={salir} title={ruta.page === "expediente" ? "Expediente" : label}>
        {P ? <P key={ruta.page + ruta.id} {...props} /> : <FueraDeAlcance titulo={label} />}
      </AppShell>
    );
  }

  return (
    <>
      {content}
      <Toast toast={toastMsg} />
      <Prototipo ruta={ruta} setRuta={setRuta} demo={demo} setDemo={setDemo} />
    </>
  );
}

document.documentElement.lang = "es-CO";
createRoot(document.getElementById("root")).render(<App />);
