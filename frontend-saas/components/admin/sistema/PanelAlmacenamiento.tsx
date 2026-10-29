"use client";

import Link from "next/link";
import { useCallback, useId, useRef, useState, type FormEvent } from "react";
import { ChevronRight, ExternalLink, FileText, Folder, RefreshCw, Trash2 } from "lucide-react";

import { Campo } from "@/components/clientes/ClienteFormModal";
import { CAMPO } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { IconButton } from "@/components/ui/IconButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Sheet } from "@/components/ui/Sheet";
import { Tag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { fechaCorta } from "@/lib/fechas";
import { tamano } from "@/lib/sistema";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Archivo = Esquemas["ArchivoGuardado"];
type Contenido = Esquemas["ContenidoCarpeta"];

function Migas({ ruta, onIr }: { ruta: string; onIr: (ruta: string) => void }) {
  const partes = ruta ? ruta.split("/") : [];
  return (
    <nav aria-label="Carpeta actual" className="flex min-w-0 flex-wrap items-center gap-1 text-[14px]">
      <button type="button" onClick={() => onIr("")} className={partes.length ? "rounded px-1 font-semibold text-navy hover:underline dark:text-navy-ink" : "px-1 font-semibold text-ink"} aria-current={partes.length ? undefined : "location"}>
        Almacenamiento
      </button>
      {partes.map((parte, i) => {
        const destino = partes.slice(0, i + 1).join("/");
        const actual = i === partes.length - 1;
        return (
          <span key={destino} className="flex min-w-0 items-center gap-1">
            <ChevronRight aria-hidden="true" size={14} className="shrink-0 text-ink-3" />
            {actual ? (
              <span aria-current="location" className="truncate px-1 font-mono text-[13.5px] font-semibold text-ink">{parte}</span>
            ) : (
              <button type="button" onClick={() => onIr(destino)} className="truncate rounded px-1 font-mono text-[13.5px] text-navy hover:underline dark:text-navy-ink">{parte}</button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function BorrarCarpeta({ ruta, onCerrar, onBorrada }: { ruta: string | null; onCerrar: () => void; onBorrada: (cuantos: number) => void }) {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);
  const nombre = ruta?.split("/").pop() ?? "";

  async function borrar(e: FormEvent) {
    e.preventDefault();
    if (!ruta) return;
    setBorrando(true);
    setError(null);
    const { data, error: fallo } = await api.POST("/api/v2/admin/almacenamiento/eliminar-carpeta", { body: { ruta, confirmacion: texto } });
    setBorrando(false);
    if (fallo || !data) { setError(fallo?.campos?.confirmacion ?? mensajeDeError(fallo)); return; }
    setTexto("");
    onBorrada(data.archivos);
  }

  return (
    <Modal open={ruta !== null} onClose={() => { setTexto(""); setError(null); onCerrar(); }} size="sm" title="Borrar la carpeta"
      description="Se borran del almacenamiento todos los archivos de la carpeta y sus subcarpetas. No se puede deshacer.">
      <form onSubmit={borrar} noValidate className="space-y-4">
        <p className="rounded-lg bg-sheet-2 px-3 py-2 font-mono text-[13px] text-ink shadow-[inset_0_0_0_1px_var(--line)] break-all">{ruta}/</p>
        <p className="text-[13.5px] text-ink-2">Si algún archivo pertenece a un documento de un expediente, la carpeta no se borra.</p>
        <Campo id={`${id}-c`} etiqueta={`Escriba «${nombre}» para confirmar`} error={error ?? undefined}>
          <input id={`${id}-c`} value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" spellCheck={false} className={`${CAMPO} font-mono`} />
        </Campo>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variant="danger" loading={borrando} disabled={texto.trim() !== nombre}>Borrar la carpeta</Button>
        </div>
      </form>
    </Modal>
  );
}

export function PanelAlmacenamiento() {
  const { toast } = useToast();
  const [ruta, setRuta] = useState("");
  const [contenido, setContenido] = useState<Contenido | null>(null);
  const [archivos, setArchivos] = useState<Archivo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<{ mensaje: string; sinConfigurar: boolean } | null>(null);
  const [soloHuerfanos, setSoloHuerfanos] = useState(false);
  const [aBorrar, setABorrar] = useState<Archivo | null>(null);
  const [carpetaABorrar, setCarpetaABorrar] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState<string | null>(null);
  const ultima = useRef(0);

  const cargar = useCallback(async (siguiente?: string) => {
    const esta = ++ultima.current;
    setCargando(true);
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/admin/almacenamiento", { params: { query: { ruta, siguiente } } });
    if (esta !== ultima.current) return;
    if (fallo || !data) setError({ mensaje: mensajeDeError(fallo), sinConfigurar: fallo?.codigo === "almacenamiento_sin_configurar" });
    else {
      setContenido(data);
      setArchivos((actuales) => (siguiente ? [...actuales, ...data.archivos] : data.archivos));
    }
    setCargando(false);
  }, [ruta]);
  useLoadEffect(cargar);

  function ir(destino: string) {
    setContenido(null);
    setRuta(destino);
  }

  async function abrir(clave: string) {
    // Se abre la pestaña antes de pedir el enlace para que el navegador no la bloquee.
    const pestana = window.open("", "_blank");
    setAbriendo(clave);
    const { data, error: fallo } = await api.GET("/api/v2/admin/almacenamiento/enlace", { params: { query: { clave } } });
    setAbriendo(null);
    if (data && pestana) pestana.location.href = data.url;
    else {
      pestana?.close();
      toast({ title: "No se pudo abrir el archivo", description: mensajeDeError(fallo), tone: "error" });
    }
  }

  async function borrarArchivo() {
    if (!aBorrar) return;
    const { error: fallo } = await api.POST("/api/v2/admin/almacenamiento/eliminar-archivo", { body: { clave: aBorrar.clave } });
    if (fallo) throw new Error(mensajeDeError(fallo));
    setArchivos((xs) => xs.filter((a) => a.clave !== aBorrar.clave));
    toast({ title: "Archivo borrado", tone: "success" });
    setABorrar(null);
  }

  const huerfanos = archivos.filter((a) => !a.vinculo).length;
  const visibles = soloHuerfanos ? archivos.filter((a) => !a.vinculo) : archivos;
  const carpetas = contenido?.carpetas ?? [];

  return (
    <div>
      <PageHeader title="Almacenamiento" description="Los archivos que la plataforma guarda en Cloudflare R2. Cada uno dice qué documento lo usa; solo se pueden borrar los que no usa ninguno." />
      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-bad-soft px-4 py-3 text-bad">
          <p className="flex-1 text-[14px]">{error.mensaje}</p>
          {error.sinConfigurar ? (
            <Link href="/gestion-procesos/admin/operacion/integraciones" className="text-[14px] font-semibold underline">Ver integraciones</Link>
          ) : (
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
          )}
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <Migas ruta={ruta} onIr={ir} />
            <div className="flex items-center gap-3">
              {huerfanos > 0 && (
                <label className="flex min-h-10 items-center gap-2 text-[14px] text-ink">
                  <input type="checkbox" checked={soloHuerfanos} onChange={(e) => setSoloHuerfanos(e.target.checked)} className="size-4 accent-[var(--navy)]" />
                  Solo sin documento ({huerfanos})
                </label>
              )}
              {ruta && !archivos.some((a) => a.vinculo) && <Button size="sm" variant="secondary" icon={<Trash2 size={14} />} onClick={() => setCarpetaABorrar(ruta)}>Borrar la carpeta</Button>}
            </div>
          </div>
          {!contenido && cargando ? (
            <LoadingState label="Cargando la carpeta" rows={6} />
          ) : (
            <Sheet aria-label="Contenido de la carpeta" className="overflow-hidden">
              {carpetas.length + visibles.length === 0 ? (
                <p className="px-4 py-6 text-[14px] text-ink-2">{soloHuerfanos ? "En esta carpeta todos los archivos pertenecen a un documento." : "Esta carpeta está vacía."}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {carpetas.map((c) => (
                    <li key={c.ruta}>
                      <button type="button" onClick={() => ir(c.ruta)} className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-sheet-2">
                        <Folder aria-hidden="true" size={18} strokeWidth={1.75} className="shrink-0 text-ink-2" />
                        <span className="min-w-0 flex-1 truncate font-mono text-[13.5px] text-ink">{c.nombre}/</span>
                        <ChevronRight aria-hidden="true" size={16} className="shrink-0 text-ink-3" />
                      </button>
                    </li>
                  ))}
                  {visibles.map((a) => (
                    <li key={a.clave} className="flex items-start gap-3 px-4 py-2.5">
                      <FileText aria-hidden="true" size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink-3" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[13.5px] text-ink" title={a.nombre}>{a.nombre}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-ink-2">
                          <span className="tabular-nums">{tamano(a.tamano)}</span>
                          {a.modificado && <span><span aria-hidden="true">· </span>{fechaCorta(a.modificado)}</span>}
                          {!a.vinculo && <Tag tone="neutral">Sin documento</Tag>}
                        </p>
                        {a.vinculo && (
                          <p className="mt-0.5 text-[12.5px] text-ink-2">
                            {a.vinculo.enlace
                              ? <Link href={a.vinculo.enlace} className="text-navy hover:underline dark:text-navy-ink">{a.vinculo.descripcion}</Link>
                              : a.vinculo.descripcion}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <IconButton icon={ExternalLink} iconSize={16} label={`Abrir ${a.nombre}`} onClick={() => void abrir(a.clave)} disabled={abriendo === a.clave} />
                        {!a.vinculo && (
                          <IconButton icon={Trash2} iconSize={16} label={`Borrar ${a.nombre}`} onClick={() => setABorrar(a)} />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {contenido?.siguiente && (
                <div className="flex justify-end border-t border-line px-4 py-2">
                  <Button size="sm" variant="ghost" loading={cargando} onClick={() => void cargar(contenido.siguiente ?? undefined)}>Ver más archivos</Button>
                </div>
              )}
            </Sheet>
          )}
        </>
      )}

      <ConfirmDialog
        open={aBorrar !== null}
        onClose={() => setABorrar(null)}
        onConfirm={borrarArchivo}
        title="Borrar este archivo"
        description={aBorrar ? `«${aBorrar.nombre}» no pertenece a ningún documento. Se borra del almacenamiento y no se puede recuperar.` : ""}
        confirmLabel="Borrar"
        destructive
      />
      <BorrarCarpeta
        ruta={carpetaABorrar}
        onCerrar={() => setCarpetaABorrar(null)}
        onBorrada={(cuantos) => {
          setCarpetaABorrar(null);
          toast({ title: "Carpeta borrada", description: cuantos === 1 ? "Se borró 1 archivo." : `Se borraron ${cuantos} archivos.`, tone: "success" });
          ir(ruta.split("/").slice(0, -1).join("/"));
        }}
      />
    </div>
  );
}
