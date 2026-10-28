"use client";

import { useId, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";

import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { PRIORIDADES, type PrioridadTarea } from "@/lib/tareas";

type Plantilla = Esquemas["Plantilla"];
type Paso = { clave: number; titulo: string; dias: string; prioridad: PrioridadTarea };

let siguienteClave = 1;
const pasoVacio = (): Paso => ({ clave: siguienteClave++, titulo: "", dias: "", prioridad: "MEDIA" });

function pasosDe(plantilla: Plantilla | null): Paso[] {
  if (!plantilla) return [pasoVacio()];
  return plantilla.pasos.map((p) => ({ clave: siguienteClave++, titulo: p.titulo, dias: p.dias_habiles?.toString() ?? "", prioridad: p.prioridad ?? "MEDIA" }));
}

/** Crear o editar una plantilla: nombre, palabras que la sugieren y sus pasos. */
export function EditorPlantilla({ plantilla, abierto, onClose, onGuardada }: {
  plantilla: Plantilla | null;
  abierto: boolean;
  onClose: () => void;
  onGuardada: () => void;
}) {
  const id = useId();
  const [nombre, setNombre] = useState(plantilla?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(plantilla?.descripcion ?? "");
  const [palabras, setPalabras] = useState(plantilla?.palabras_clave.join(", ") ?? "");
  const [pasos, setPasos] = useState<Paso[]>(() => pasosDe(plantilla));
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  function cambiarPaso(clave: number, cambio: Partial<Paso>) {
    setPasos((actual) => actual.map((p) => (p.clave === clave ? { ...p, ...cambio } : p)));
  }

  function moverPaso(indice: number, delta: number) {
    setPasos((actual) => {
      const copia = [...actual];
      const [paso] = copia.splice(indice, 1);
      copia.splice(indice + delta, 0, paso);
      return copia;
    });
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    const validos = pasos.filter((p) => p.titulo.trim());
    const nuevosErrores: Record<string, string> = {};
    if (!nombre.trim()) nuevosErrores.nombre = "Ponle un nombre a la plantilla.";
    if (validos.length === 0) nuevosErrores.pasos = "Agrega al menos un paso.";
    if (validos.some((p) => p.dias !== "" && !(Number(p.dias) >= 0 && Number(p.dias) <= 365))) nuevosErrores.pasos = "Los días hábiles van de 0 a 365.";
    if (Object.keys(nuevosErrores).length) {
      setErrores(nuevosErrores);
      return;
    }
    const cuerpo = {
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      palabras_clave: palabras.split(",").map((p) => p.trim()).filter(Boolean),
      pasos: validos.map((p) => ({ titulo: p.titulo.trim(), dias_habiles: p.dias === "" ? null : Number(p.dias), prioridad: p.prioridad })),
    };
    setGuardando(true);
    setErrores({});
    const { error } = plantilla
      ? await api.PUT("/api/v2/tareas/plantillas/{plantilla_id}", { params: { path: { plantilla_id: plantilla.id } }, body: cuerpo })
      : await api.POST("/api/v2/tareas/plantillas", { body: cuerpo });
    setGuardando(false);
    if (error) {
      setErrores({ general: mensajeDeError(error) });
      return;
    }
    onGuardada();
    onClose();
  }

  return (
    <Modal open={abierto} onClose={onClose} size="lg" title={plantilla ? "Editar plantilla" : "Nueva plantilla"} description="Los pasos se crean como tareas del proceso cuando alguien usa la plantilla.">
      <form onSubmit={guardar} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-nombre`} className={ETIQUETA}>Nombre</label>
            <input id={`${id}-nombre`} value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Traslado de excepciones" aria-invalid={errores.nombre ? true : undefined} className={CAMPO} />
            {errores.nombre && <p className="mt-1.5 text-[13px] text-bad">{errores.nombre}</p>}
          </div>
          <div>
            <label htmlFor={`${id}-palabras`} className={ETIQUETA}>Se sugiere si la actuación dice</label>
            <input id={`${id}-palabras`} value={palabras} onChange={(e) => setPalabras(e.target.value)} placeholder="traslado, excepciones" aria-describedby={`${id}-palabras-ayuda`} className={CAMPO} />
            <p id={`${id}-palabras-ayuda`} className="mt-1.5 text-[12.5px] text-ink-3">Separa las palabras con comas. No importan tildes ni mayúsculas.</p>
          </div>
        </div>
        <label htmlFor={`${id}-descripcion`} className={cx(ETIQUETA, "mt-4")}>Para qué sirve <span className="font-normal text-ink-3">(opcional)</span></label>
        <textarea id={`${id}-descripcion`} rows={2} maxLength={1000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={cx(CAMPO, "resize-y py-2.5")} />

        <fieldset className="mt-5">
          <legend className={ETIQUETA}>Pasos</legend>
          <p className="-mt-1 mb-2.5 text-[12.5px] text-ink-3">El plazo se cuenta en días hábiles desde la notificación. Déjalo vacío si el paso no tiene fecha.</p>
          <ol className="space-y-2">
            {pasos.map((paso, i) => (
              <li key={paso.clave} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-2 rounded-lg bg-manila/60 p-2 sm:grid-cols-[1.25rem_minmax(0,1fr)_6.5rem_8rem_auto] sm:items-center">
                <span className="pt-2.5 text-right text-[13px] tabular-nums text-ink-3 sm:pt-0">{i + 1}.</span>
                <input aria-label={`Paso ${i + 1}`} value={paso.titulo} maxLength={255} onChange={(e) => cambiarPaso(paso.clave, { titulo: e.target.value })} placeholder="Qué hay que hacer" className={CAMPO} />
                <div className="row-span-2 flex flex-col gap-0.5 sm:order-last sm:row-span-1 sm:flex-row">
                  <button type="button" onClick={() => moverPaso(i, -1)} disabled={i === 0} aria-label={`Subir el paso ${i + 1}`} className="grid size-9 place-items-center rounded-md text-ink-3 hover:bg-sheet hover:text-ink disabled:opacity-30"><ArrowUp size={15} /></button>
                  <button type="button" onClick={() => moverPaso(i, 1)} disabled={i === pasos.length - 1} aria-label={`Bajar el paso ${i + 1}`} className="grid size-9 place-items-center rounded-md text-ink-3 hover:bg-sheet hover:text-ink disabled:opacity-30"><ArrowDown size={15} /></button>
                  <button type="button" onClick={() => setPasos((a) => a.filter((p) => p.clave !== paso.clave))} disabled={pasos.length === 1} aria-label={`Quitar el paso ${i + 1}`} className="grid size-9 place-items-center rounded-md text-ink-3 hover:bg-bad-soft hover:text-bad disabled:opacity-30"><X size={15} /></button>
                </div>
                <div className="col-start-2 flex gap-2 sm:contents">
                  <label className="relative block flex-1 sm:flex-none">
                    <span className="sr-only">Días hábiles del paso {i + 1}</span>
                    <input type="number" inputMode="numeric" min={0} max={365} value={paso.dias} onChange={(e) => cambiarPaso(paso.clave, { dias: e.target.value })} placeholder="Sin fecha" className={cx(CAMPO, "pr-11 tabular-nums")} />
                    <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] text-ink-3">días</span>
                  </label>
                  <select aria-label={`Prioridad del paso ${i + 1}`} value={paso.prioridad} onChange={(e) => cambiarPaso(paso.clave, { prioridad: e.target.value as PrioridadTarea })} className={cx(CAMPO, "flex-1 sm:flex-none")}>
                    {PRIORIDADES.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
              </li>
            ))}
          </ol>
          {errores.pasos && <p className="mt-2 text-[13px] text-bad">{errores.pasos}</p>}
          <Button type="button" variant="ghost" size="sm" className="mt-2" icon={<Plus size={15} />} onClick={() => setPasos((a) => [...a, pasoVacio()])} disabled={pasos.length >= 20}>Agregar paso</Button>
        </fieldset>

        {errores.general && <p role="alert" className="mt-3 text-[13px] text-bad">{errores.general}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={guardando}>{plantilla ? "Guardar cambios" : "Crear plantilla"}</Button>
        </div>
      </form>
    </Modal>
  );
}
