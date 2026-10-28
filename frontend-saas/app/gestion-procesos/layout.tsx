// Aplica el tema guardado antes de pintar, para que el modo oscuro no parpadee al cargar.
const SCRIPT_TEMA = `try{if(localStorage.getItem("theme")==="dark")document.documentElement.classList.add("dark")}catch(e){}`;

/** Marca las pantallas de la app para que tomen el expediente foliado (ver globals.css). */
export default function GestionProcesosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-app className="contents">
      <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      {children}
    </div>
  );
}
