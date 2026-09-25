"use client";

import { useState, useEffect } from "react";
import {
  ArrowUpRight, BriefcaseBusiness, Building2, Check, ChevronRight, FileCheck2,
  Gavel, HeartHandshake, Landmark, Mail, MapPin, MessageCircle, Scale,
  ShieldCheck, Sparkles, UsersRound, HelpCircle, Clock, CheckCircle2,
  Award, Compass, Search, UserCheck, ArrowUp, Menu, X
} from "lucide-react";

const whatsappUrl = "https://wa.me/573508809878?text=Hola%2C%20quiero%20recibir%20asesor%C3%ADa%20jur%C3%ADdica.";
const emailUrl = "mailto:alejandramunozabg@outlook.com?subject=Consulta%20jur%C3%ADdica";

// --- DATOS EXPANDIDOS POR SECCIÓN ---

const practiceAreasDetailed = [
  {
    id: "familia",
    icon: HeartHandshake,
    title: "Personas, Familia y Patrimonio",
    description: "Acompañamiento legal cercano y humano para proteger las relaciones familiares, el patrimonio acumulado y la sucesión generacional con total seguridad jurídica.",
    subsections: [
      {
        subtitle: "Derecho de Familia y Pareja",
        items: ["Divorcios y cesación de efectos civiles de matrimonio", "Unión marital de hecho y liquidación de sociedad patrimonial", "Capitulaciones matrimoniales y patrimoniales", "Fijación, aumento y exoneración de cuota alimentaria", "Custodia, reglamentación de visitas y patria potestad"]
      },
      {
        subtitle: "Sucesiones y Planificación Patrimonial",
        items: ["Procesos de sucesión notariales y judiciales", "Elaboración de testamentos e insinuaciones de donación", "Planificación de herencias en vida", "Protección de bienes (Afectación a vivienda familiar y Patrimonio de familia)"]
      },
      {
        subtitle: "Contratos Civiles y Bienes",
        items: ["Estructuración y revisión de contratos de compraventa y arrendamiento", "Estudios de títulos inmobiliarios", "Procesos de pertenencia y saneamiento de propiedad", "Acompañamiento en controversias de responsabilidad civil"]
      }
    ]
  },
  {
    id: "empresas",
    icon: BriefcaseBusiness,
    title: "Empresas, Contratos y Negocios",
    description: "Blindaje legal estratégico para PyMEs, emprendedores y corporaciones. Minimizamos contingencias legales para que su negocio crezca con certeza.",
    subsections: [
      {
        subtitle: "Derecho Corporativo y Societario",
        items: ["Constitución, transformación y disolución de sociedades (SAS, Ltda, etc.)", "Acuerdos de accionistas y pactos de socios", "Reorganización empresarial y gobierno corporativo", "Actas de asamblea y juntas directivas"]
      },
      {
        subtitle: "Derecho Comercial y Contratación",
        items: ["Redacción y negociación de contratos mercantiles (Distribución, Franquicia, Suministro)", "Términos y condiciones para plataformas digitales y e-commerce", "Registro de marca e intangibles corporativos", "Protección de datos personales (Habeas Data / SGPD)"]
      },
      {
        subtitle: "Gestión de Riesgos y Cartera",
        items: ["Estrategias de cobro prejurídico y ejecutivo de cartera morosa", "Auditoría preventiva de contratos vigentes", "Gestión y resolución alternativa de conflictos comerciales"]
      }
    ]
  },
  {
    id: "propiedad-horizontal",
    icon: Building2,
    title: "Propiedad Horizontal e Inmobiliario",
    description: "Soporte jurídico integral para administradores, consejos de administración, comités de convivencia y copropietarios en conjuntos residenciales y comerciales.",
    subsections: [
      {
        subtitle: "Asesoría Institucional y Gobierno de PH",
        items: ["Revisión y reforma de Reglamentos de Propiedad Horizontal", "Acompañamiento y moderación legal en Asambleas Ordinarias y Extraordinarias", "Emisión de conceptos jurídicos para Consejos de Administración", "Manuales de convivencia y régimen sancionatorio"]
      },
      {
        subtitle: "Cobranza y Litigios en PH",
        items: ["Recuperación efectiva de cartera de expensas comunes (ordinarias y extraordinarias)", "Procesos ejecutivos contra copropietarios morosos", "Querellas policivas y trámite de conflictos de convivencia", "Impugnación de actas de asamblea"]
      }
    ]
  },
  {
    id: "derecho-publico",
    icon: Landmark,
    title: "Derecho Público y Administrativo",
    description: "Representación y asesoría especializada ante entidades del Estado, organismos de control y corporaciones públicas.",
    subsections: [
      {
        subtitle: "Actuaciones ante la Administración",
        items: ["Derechos de petición, recursos de reposición y apelación en vía administrativa", "Acompañamiento en procesos sancionatorios ante superintendencias y alcaldías", "Defensa en investigación disciplinaria y de responsabilidad fiscal"]
      },
      {
        subtitle: "Contratación Estatal y Análisis Normativo",
        items: ["Asesoría en licitaciones públicas, selección abreviada y contratación directa", "Estructuración de propuestas legales para licitadores del Estado", "Elaboración de conceptos jurídicos y análisis de viabilidad normativa"]
      }
    ]
  }
];

const methodologySteps = [
  { step: "01", icon: Search, title: "Diagnóstico Preventivo", desc: "Escuchamos su situación en detalle, analizamos los antecedentes y evaluamos los riesgos jurídicos inmediatos y futuros." },
  { step: "02", icon: Compass, title: "Diseño Estratégico", desc: "Estructuramos un plan de acción claro con alternativas viables, tiempos proyectados y presupuestos transparentes." },
  { step: "03", icon: FileCheck2, title: "Ejecución & Blindaje", desc: "Redactamos los instrumentos legales necesarios, negociamos acuerdos o representamos sus intereses con rigor técnico." },
  { step: "04", icon: UserCheck, title: "Seguimiento Continuo", desc: "Le mantenemos informado de cada avance y evaluamos los resultados para garantizar su tranquilidad duradera." }
];

const faqItems = [
  {
    q: "¿Por qué es importante consultar a un abogado antes de firmar un contrato o tomar una decisión?",
    a: "Una consulta preventiva permite identificar cláusulas abusivas, riesgos financieros ocultos o vacíos legales antes de obligarse jurídicamente. Corregir un texto antes de firmar cuesta una fracción de lo que representa afrontar un litigio posterior."
  },
  {
    q: "¿Cómo se programan y realizan las consultas?",
    a: "Ofrecemos modalidades presenciales en nuestra sede en Sabaneta (Antioquia) y atención virtual a través de Teams o Zoom para clientes en cualquier parte del país. Puede agendar directamente escribiendo a nuestro WhatsApp."
  },
  {
    q: "¿Cómo es el esquema de honorarios profesionales?",
    a: "Trabajamos bajo esquemas claros y pactados previamente. Dependiendo del caso, ofrecemos tarifas fijas por trámite, esquemas de iguala mensual para empresas y copropiedades, o porcentaje de éxito en gestión de cobranzas."
  },
  {
    q: "¿Ofrecen cobertura de servicios a nivel nacional?",
    a: "Sí. Para trámites notariales, asesoría corporativa, redacción de contratos y procesos que permitan virtualidad, atendemos a clientes de toda Colombia."
  }
];

export default function Home() {
  const [activeSection, setActiveSection] = useState<string>("inicio");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "");
      if (["inicio", "areas", "filosofia", "contacto"].includes(hash)) {
        setActiveSection(hash);
      } else if (!hash) {
        setActiveSection("inicio");
      }
      setIsMobileMenuOpen(false); // Cerrar menú móvil al cambiar de sección
    };

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Mostrar u ocultar el botón "Ir arriba" según el desplazamiento del scroll
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 300) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { id: "inicio", label: "Inicio" },
    { id: "areas", label: "Áreas de práctica" },
    { id: "filosofia", label: "Filosofía" },
    { id: "contacto", label: "Contacto & FAQ" },
  ];

  return (
    <main className="min-h-screen overflow-hidden bg-[#f8f5ef] text-[#140b3b] flex flex-col justify-between">
      <div>
        {/* HEADER FIJO CON MENÚ RESPONSIVO */}
        <header className="sticky top-0 z-50 bg-[#f8f5ef]/95 backdrop-blur-md border-b border-[#e8e2d5]">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
            <a href="#inicio" className="flex items-center gap-3" aria-label="Inicio">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[#242045] text-[#e7c36d]">
                <Scale size={21} strokeWidth={1.8} />
              </span>
              <span className="leading-tight">
                <strong className="block font-serif text-base tracking-wide">Alejandra Muñoz</strong>
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#626070]">Abogada y Asociados</span>
              </span>
            </a>

            {/* Navegación Escritorio */}
            <nav className="hidden items-center gap-7 text-base font-medium text-[#626070] md:flex">
              {navLinks.map((link) => (
                <a
                  key={link.id}
                  href={`#${link.id}`}
                  className={`transition-colors py-1 ${
                    activeSection === link.id
                      ? "text-[#202145] font-bold border-b-2 border-[#202145]"
                      : "hover:text-[#202145]"
                  }`}
                >
                  {link.label}
                </a>
              ))}
            </nav>

            <div className="flex items-center gap-3">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="hidden sm:inline-flex rounded-full bg-[#202145] px-5 py-2.5 text-sm font-semibold !text-white transition hover:bg-[#323363]"
              >
                Hablemos por WhatsApp
              </a>

              {/* Botón Menú Hamburguesa para Móvil */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-2 text-[#202145] focus:outline-none rounded-lg border border-[#d9d6cb]"
                aria-label="Toggle Menu"
              >
                {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>

          {/* Menú Desplegable Móvil */}
          {isMobileMenuOpen && (
            <div className="md:hidden bg-[#f8f5ef] border-b border-[#e8e2d5] px-6 py-4 space-y-3 animate-fadeIn">
              {navLinks.map((link) => (
                <a
                  key={link.id}
                  href={`#${link.id}`}
                  className={`block py-2 text-base font-medium transition ${
                    activeSection === link.id
                      ? "text-[#202145] font-bold pl-2 border-l-4 border-[#202145]"
                      : "text-[#626070] hover:text-[#202145]"
                  }`}
                >
                  {link.label}
                </a>
              ))}
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="block w-full text-center rounded-full bg-[#202145] px-5 py-3 text-sm font-semibold !text-white transition hover:bg-[#323363] mt-4"
              >
                Hablemos por WhatsApp
              </a>
            </div>
          )}
        </header>

        {/* ----------------- SECCIÓN 1: INICIO ----------------- */}
        {activeSection === "inicio" && (
          <div className="space-y-20 pb-20">
            {/* Hero Principal */}
            <section id="inicio" className="relative mx-auto max-w-7xl px-6 pt-12 lg:px-8 lg:pt-16">
              <div className="absolute right-[-8rem] top-8 -z-0 h-72 w-72 rounded-full border border-[#d9c482] opacity-50 sm:h-96 sm:w-96" />
              <div className="relative z-10 grid items-end gap-12 lg:grid-cols-[1.25fr_.75fr]">
                <div>
                  <p className="mb-6 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.22em] text-[#a37a22]">
                    <Sparkles size={16} /> Prevención · estrategia · representación
                  </p>
                  <h1 className="max-w-4xl font-serif text-5xl leading-[1.05] tracking-tight text-[#202145] sm:text-6xl lg:text-7xl">
                    Decisiones jurídicas mejor informadas. Riesgos prevenidos.
                  </h1>
                  <p className="mt-7 max-w-2xl text-xl leading-8 text-[#535663]">
                    Asesoría jurídica integral para personas, empresas, copropiedades y organizaciones públicas y privadas. Desde Sabaneta, Antioquia, con atención nacional.
                  </p>
                  <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                    <a href={whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#202145] px-6 py-3.5 text-base font-semibold !text-white transition hover:bg-[#323363]">
                      Consultar por WhatsApp <MessageCircle size={20} />
                    </a>
                    <a href="#areas" className="inline-flex items-center justify-center gap-2 rounded-full border border-[#9ba8a2] px-6 py-3.5 text-base font-semibold text-[#202145] transition hover:border-[#202145]">
                      Conozca cómo le ayudamos <ChevronRight size={20} />
                    </a>
                  </div>
                </div>

                <aside className="relative overflow-hidden rounded-[2rem] bg-[#202145] p-8 !text-white shadow-2xl shadow-[#202145]/20 sm:p-10">
                  <div className="absolute right-0 top-0 h-32 w-32 rounded-bl-[5rem] bg-[#dfc66f] opacity-90" />
                  <p className="relative text-sm font-semibold uppercase tracking-[0.18em] text-[#ead897]">Una consulta a tiempo</p>
                  <p className="relative mt-5 font-serif text-3xl leading-tight">Puede proteger su patrimonio, sus relaciones y su tranquilidad.</p>
                  <a className="relative mt-8 inline-flex items-center gap-2 border-b border-[#e5cf85] pb-1 text-base font-bold text-[#f0dfa2]" href="#contacto">
                    Agendar una conversación <ArrowUpRight size={18} />
                  </a>
                </aside>
              </div>
            </section>

            {/* Subsección 1.1: Sectores de atención */}
            <section className="mx-auto max-w-7xl px-6 lg:px-8">
              <div className="border-t border-[#ded8c8] pt-16">
                <div className="text-center max-w-3xl mx-auto">
                  <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#a37a22]">Sectores de atención</p>
                  <h2 className="mt-3 font-serif text-3xl text-[#202145] sm:text-4xl">Soluciones a la medida de su perfil</h2>
                </div>

                <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { icon: HeartHandshake, title: "Personas y Familias", desc: "Protección de acuerdos familiares, herencias, patrimonio e inmuebles." },
                    { icon: BriefcaseBusiness, title: "Empresas y PyMEs", desc: "Contratos sólidos, prevención de litigios y asesoría societaria." },
                    { icon: Building2, title: "Propiedad Horizontal", desc: "Acompañamiento a administradores, consejos y cobro de cartera morosa." },
                    { icon: Landmark, title: "Entidades Públicas", desc: "Conceptos normativos, vía administrativa y contratación estatal." },
                  ].map((item, i) => (
                    <div key={i} className="bg-white p-7 rounded-2xl border border-[#e2dcd0] shadow-sm">
                      <item.icon className="text-[#a37a22] mb-4" size={32} />
                      <h3 className="font-serif text-2xl font-bold text-[#202145]">{item.title}</h3>
                      <p className="mt-3 text-base text-[#63716b] leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Subsección 1.2: Enfoque preventivo */}
            <section className="border-y border-[#ded8c8] bg-[#eee8dc] px-6 py-16 lg:px-8">
              <div className="mx-auto max-w-7xl">
                <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:items-center">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#a37a22]">Enfoque preventivo</p>
                    <h2 className="mt-4 font-serif text-4xl leading-tight text-[#202145]">Un buen asesoramiento puede evitar un largo proceso judicial.</h2>
                    <p className="mt-4 text-[#535663] text-base leading-relaxed">
                      El costo emocional, financiero y de tiempo de un pleito judicial siempre supera con creces la inversión de redactar un contrato bien estructurado o recibir una asesoría a tiempo.
                    </p>
                  </div>
                  <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 bg-white/60 p-6 rounded-2xl border border-[#d3cbbe]">
                    {["Antes de firmar un contrato", "Antes de negociar un acuerdo", "Antes de comprar o vender", "Antes de emprender un negocio", "Antes de asumir una obligación", "Antes de iniciar un proceso"].map((item) => (
                      <p key={item} className="flex items-center gap-3 font-medium text-[#40534c] text-base">
                        <ShieldCheck className="shrink-0 text-[#a37a22]" size={22} />{item}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ----------------- SECCIÓN 2: ÁREAS DE PRÁCTICA ----------------- */}
        {activeSection === "areas" && (
          <section id="areas" className="mx-auto max-w-7xl px-6 py-12 lg:px-8 lg:py-16">
            <div className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#a37a22]">Áreas de práctica especializadas</p>
              <h2 className="mt-4 font-serif text-4xl leading-tight text-[#202145] sm:text-5xl">Asesoría integral que entiende el contexto completo de su decisión.</h2>
              <p className="mt-4 text-lg text-[#63716b]">
                Explore en detalle nuestros servicios jurídicos clasificados por rama de práctica profesional.
              </p>
            </div>

            {/* Listado de Áreas */}
            <div className="mt-12 space-y-12">
              {practiceAreasDetailed.map((area) => (
                <div key={area.id} className="rounded-3xl border border-[#d9d6cb] bg-white p-8 shadow-sm lg:p-10">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 border-b border-[#e8e2d5] pb-6">
                    <span className="grid h-16 w-16 place-items-center rounded-2xl bg-[#ebf0eb] text-[#202145] shrink-0">
                      <area.icon size={32} strokeWidth={1.8} />
                    </span>
                    <div>
                      <h3 className="font-serif text-3xl text-[#202145]">{area.title}</h3>
                      <p className="mt-1 text-base text-[#63716b] leading-relaxed">{area.description}</p>
                    </div>
                  </div>

                  {/* Tarjetas internas con texto más grande */}
                  <div className="mt-8 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                    {area.subsections.map((sub, idx) => (
                      <div key={idx} className="bg-[#fcfaf7] p-6 rounded-2xl border border-[#ede7dc]">
                        <h4 className="font-serif text-xl font-bold text-[#202145] flex items-center gap-2 border-b border-[#e2dcd0] pb-3 mb-4">
                          <CheckCircle2 size={20} className="text-[#a37a22]" /> {sub.subtitle}
                        </h4>
                        <ul className="space-y-3 text-sm text-[#40534c]">
                          {sub.items.map((item, itemIdx) => (
                            <li key={itemIdx} className="flex items-start gap-2.5">
                              <span className="h-2 w-2 rounded-full bg-[#a37a22] mt-2 shrink-0" />
                              <span className="leading-relaxed">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Banner inferior */}
            <div className="mt-12 rounded-2xl bg-[#202145] p-8 md:p-10 text-center text-white">
              <h3 className="font-serif text-2xl md:text-3xl">¿Su requerimiento no encaja exactamente en estas categorías?</h3>
              <p className="mt-3 text-base text-[#c4d1cc] max-w-2xl mx-auto">
                Analizamos su caso particular para ofrecerle la mejor orientación jurídica o direccionar su asunto con total transparencia.
              </p>
              <a href={whatsappUrl} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#e7c36d] px-7 py-3.5 text-base font-bold text-[#202145] transition hover:bg-[#ebd18c]">
                Consulta preliminar sin compromiso <MessageCircle size={18} />
              </a>
            </div>
          </section>
        )}

        {/* ----------------- SECCIÓN 3: FILOSOFÍA ----------------- */}
        {activeSection === "filosofia" && (
          <div className="space-y-16 py-12">
            <section id="filosofia" className="bg-[#202145] px-6 py-16 !text-white lg:px-8 lg:py-24">
              <div className="mx-auto max-w-7xl">
                <div className="max-w-3xl">
                  <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#e7c36d]">Nuestra filosofía de trabajo</p>
                  <h2 className="mt-4 font-serif text-4xl leading-tight sm:text-5xl">Prevenir. Estructurar. Defender.</h2>
                  <p className="mt-6 text-xl leading-8 text-[#d6e0dc]">
                    Creemos firmemente que antes de que exista un pleito judicial, existió una decisión no asesorada. Nuestro compromiso es aportar claridad para que cada cliente elija una ruta sólida desde el primer día.
                  </p>
                </div>

                <div className="mt-16 grid gap-8 sm:grid-cols-3">
                  {[
                    { num: "01", title: "Prevención", desc: "Identificamos riesgos de forma anticipada en contratos, acuerdos y actuaciones formales para evitar contingencias futuras." },
                    { num: "02", title: "Estrategia", desc: "Diseñamos rutas claras alineadas con los objetivos personales o de negocio de nuestros clientes, optimizando tiempo y recursos." },
                    { num: "03", title: "Representación", desc: "Acompañamos sus decisiones con rigor técnico, objetividad y firmeza ética en trámites, negociaciones y litigios." }
                  ].map((pilar) => (
                    <div key={pilar.num} className="border-t border-[#728d84] pt-6">
                      <span className="text-base font-bold text-[#e7c36d] font-mono">{pilar.num}</span>
                      <h3 className="mt-2 font-serif text-3xl">{pilar.title}</h3>
                      <p className="mt-3 text-base leading-relaxed text-[#c4d1cc]">{pilar.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Metodología */}
            <section className="mx-auto max-w-7xl px-6 lg:px-8">
              <div className="text-center max-w-2xl mx-auto">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#a37a22]">Metodología de trabajo</p>
                <h2 className="mt-3 font-serif text-3xl text-[#202145] sm:text-4xl">Cómo acompañamos su caso</h2>
                <p className="mt-2 text-base text-[#63716b]">Un proceso estructurado en 4 etapas para su total tranquilidad.</p>
              </div>

              <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {methodologySteps.map((m) => (
                  <div key={m.step} className="bg-white p-7 rounded-2xl border border-[#d9d6cb] shadow-sm">
                    <span className="text-xs font-bold text-[#a37a22] bg-[#f5ede0] px-3 py-1 rounded-full font-mono">{m.step}</span>
                    <m.icon className="text-[#202145] mt-5 mb-3" size={30} />
                    <h3 className="font-serif text-2xl font-bold text-[#202145]">{m.title}</h3>
                    <p className="mt-3 text-sm text-[#63716b] leading-relaxed">{m.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Compromiso ético */}
            <section className="mx-auto max-w-7xl px-6 lg:px-8">
              <div className="rounded-3xl bg-[#f0eadd] p-8 border border-[#ded5c5] md:p-12 grid gap-8 md:grid-cols-2 items-center">
                <div>
                  <Award className="text-[#a37a22] mb-4" size={36} />
                  <h3 className="font-serif text-3xl text-[#202145]">Transparencia y claridad en honorarios</h3>
                  <p className="mt-3 text-base text-[#535663] leading-relaxed">
                    Creemos en las relaciones de confianza a largo plazo. Le diremos con total honestidad la viabilidad real de su caso, evitando falsas expectativas o trámites innecesarios.
                  </p>
                </div>
                <ul className="space-y-4 text-base text-[#40534c]">
                  <li className="flex items-center gap-3"><Check size={20} className="text-[#a37a22] shrink-0" /> Presupuestos claros antes de iniciar cualquier gestión.</li>
                  <li className="flex items-center gap-3"><Check size={20} className="text-[#a37a22] shrink-0" /> Reportes periódicos del estado de sus asuntos.</li>
                  <li className="flex items-center gap-3"><Check size={20} className="text-[#a37a22] shrink-0" /> Resguardo absoluto de la confidencialidad.</li>
                </ul>
              </div>
            </section>
          </div>
        )}

        {/* ----------------- SECCIÓN 4: CONTACTO & FAQ ----------------- */}
        {activeSection === "contacto" && (
          <div className="space-y-16 py-12">
            <section id="contacto" className="mx-auto max-w-7xl px-6 lg:px-8">
              <div className="rounded-[2rem] bg-[#c9a247] px-8 py-12 text-[#202145] sm:px-12 lg:flex lg:items-center lg:justify-between lg:py-16 shadow-lg shadow-[#c9a247]/20">
                <div className="max-w-3xl">
                  <p className="text-sm font-bold uppercase tracking-[0.2em]">¿Tiene una decisión jurídica por tomar?</p>
                  <h2 className="mt-4 font-serif text-4xl leading-tight sm:text-5xl">Consulte antes de firmar, negociar o comprar.</h2>
                  <p className="mt-5 text-xl leading-8">Una decisión jurídica informada puede prevenir un conflicto y evitar costos innecesarios.</p>
                </div>
                <div className="mt-8 flex flex-col gap-3 lg:mt-0 shrink-0">
                  <a href={whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#202145] px-7 py-4 text-base font-semibold !text-white shadow-lg transition hover:bg-[#323363]">
                    <MessageCircle size={20} /> Escribir por WhatsApp
                  </a>
                  <a href={emailUrl} className="inline-flex items-center justify-center gap-2 rounded-full border border-[#202145] px-7 py-4 text-base font-semibold hover:bg-[#202145]/10 transition">
                    <Mail size={20} /> Enviar correo
                  </a>
                </div>
              </div>
            </section>

            {/* Canales */}
            <section className="mx-auto max-w-7xl px-6 lg:px-8">
              <div className="grid gap-8 md:grid-cols-3">
                <div className="bg-white p-7 rounded-2xl border border-[#d9d6cb] shadow-sm">
                  <MapPin className="text-[#a37a22] mb-3" size={28} />
                  <h3 className="font-serif text-xl font-bold text-[#202145]">Atención Presencial</h3>
                  <p className="mt-2 text-sm text-[#63716b] leading-relaxed">
                    Sabaneta, Antioquia. Sede principal de atención con cita previa.
                  </p>
                </div>

                <div className="bg-white p-7 rounded-2xl border border-[#d9d6cb] shadow-sm">
                  <Clock className="text-[#a37a22] mb-3" size={28} />
                  <h3 className="font-serif text-xl font-bold text-[#202145]">Atención Virtual Nacional</h3>
                  <p className="mt-2 text-sm text-[#63716b] leading-relaxed">
                    Asesorías por Teams o Zoom para clientes en toda Colombia y el exterior.
                  </p>
                </div>

                <div className="bg-white p-7 rounded-2xl border border-[#d9d6cb] shadow-sm">
                  <Mail className="text-[#a37a22] mb-3" size={28} />
                  <h3 className="font-serif text-xl font-bold text-[#202145]">Correo Directo</h3>
                  <a href={emailUrl} className="mt-2 block text-sm text-[#202145] font-semibold hover:underline">
                    alejandramunozabg@outlook.com
                  </a>
                </div>
              </div>
            </section>

            {/* Preguntas Frecuentes (FAQ) */}
            <section className="mx-auto max-w-7xl px-6 lg:px-8 border-t border-[#ded8c8] pt-12">
              <div className="max-w-2xl mb-8">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#a37a22]">Resolvamos sus dudas</p>
                <h2 className="mt-2 font-serif text-3xl text-[#202145]">Preguntas Frecuentes</h2>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {faqItems.map((faq, i) => (
                  <div key={i} className="bg-white p-7 rounded-2xl border border-[#e2dcd0] shadow-sm">
                    <h3 className="font-serif text-xl font-bold text-[#202145] flex items-start gap-2.5">
                      <HelpCircle size={22} className="text-[#a37a22] shrink-0 mt-0.5" />
                      {faq.q}
                    </h3>
                    <p className="mt-3 text-sm text-[#63716b] leading-relaxed pl-8">{faq.a}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      {/* BOTÓN "IR ARRIBA" (Aparece al hacer scroll) */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-24 right-6 z-50 bg-[#202145] hover:bg-[#323363] text-white p-3.5 rounded-full shadow-2xl transition-all duration-300 hover:scale-110 flex items-center justify-center border border-[#e7c36d]/30"
          title="Volver arriba"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}

      {/* BOTÓN FLOTANTE DE WHATSAPP */}
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 bg-emerald-600 hover:bg-emerald-500 text-white p-4 rounded-full shadow-2xl transition-all duration-300 hover:scale-110 flex items-center justify-center group"
        title="¡Háblanos por WhatsApp!"
      >
        <MessageCircle className="w-6 h-6" />
        <span className="absolute right-full mr-3 bg-slate-900 text-slate-100 text-xs px-3 py-1.5 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-slate-800 pointer-events-none">
          ¿Necesitas asesoría?
        </span>
      </a>

      {/* FOOTER */}
      <footer className="border-t border-[#d9d6cb] px-6 py-10 lg:px-8 mt-12 bg-[#eee8dc]/50">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 text-sm text-[#63716b] sm:flex-row sm:items-end">
          <div>
            <p className="font-serif text-2xl text-[#202145]">Alejandra Muñoz | Abogada y Asociados</p>
            <p className="mt-2 text-sm">Asesoría · Prevención · Estrategia · Representación</p>
          </div>
          <div className="space-y-1 sm:text-right text-sm">
            <p className="flex items-center gap-2 sm:justify-end">
              <MapPin size={16} /> Sabaneta, Antioquia · Atención nacional
            </p>
            <a className="block hover:text-[#202145]" href={emailUrl}>alejandramunozabg@outlook.com</a>
            <a className="block text-[#202145] font-bold hover:underline" href="/dashboard">Acceso al Sistema de Gestión de Procesos</a>
          </div>
        </div>
      </footer>
    </main>
  );
}