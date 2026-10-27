// Datos de ejemplo del prototipo. Ninguna persona, proceso ni radicado es real.
// "Hoy" en el prototipo: martes 27 de octubre de 2026, 8:15 a. m.

export const HOY = "2026-10-27";

export const firma = {
  nombre: "Alejandra Muñoz",
  sufijo: "Abogada y Asociados",
  ciudad: "Sabaneta, Antioquia",
};

export const usuarios = {
  abogada: { id: 1, nombre: "Alejandra Muñoz Restrepo", corto: "Alejandra Muñoz", iniciales: "AM", rol: "Abogada directora", correo: "alejandra@amabogados.co" },
  asociado: { id: 2, nombre: "Santiago Ocampo Gil", corto: "Santiago Ocampo", iniciales: "SO", rol: "Abogado asociado", correo: "santiago@amabogados.co" },
  cliente: { id: 31, nombre: "Hernán Restrepo Vélez", corto: "Hernán Restrepo", iniciales: "HR", rol: "Cliente", correo: "hernan.restrepo@correo.co" },
  admin: { id: 90, nombre: "Paula Jaramillo", corto: "Paula Jaramillo", iniciales: "PJ", rol: "Coordinación", correo: "coordinacion@amabogados.co" },
};

export const etapasDeclarativo = ["Demanda", "Admisión", "Notificación", "Pruebas", "Audiencia", "Sentencia"];
export const etapasEjecutivo = ["Demanda", "Mandamiento de pago", "Notificación", "Excepciones", "Sentencia", "Liquidación"];
export const etapasSucesion = ["Demanda", "Apertura", "Emplazamiento", "Inventarios y avalúos", "Partición", "Sentencia"];

export const procesos = [
  {
    id: 21,
    contacto: "Hernán",
    nombre: "Sucesión intestada de Gloria Inés Restrepo",
    area: "Familia",
    clase: "Sucesión",
    cliente: "Hernán Restrepo Vélez",
    clienteId: 31,
    contraparte: "Herederos indeterminados",
    responsable: "Alejandra Muñoz",
    equipo: ["Alejandra Muñoz", "Santiago Ocampo"],
    radicado: "05266311000320250014200",
    despacho: "Juzgado 3.º de Familia de Envigado",
    etapas: etapasSucesion,
    etapa: 3,
    folios: 88,
    nuevos: 1,
    tareas: 2,
    docsPendientes: 1,
    proximo: { texto: "Audiencia de inventarios y avalúos", fecha: "2026-11-19", hora: "9:00 a. m." },
    resumenCliente:
      "El juzgado fijó la fecha para presentar el inventario de los bienes de su madre: será el jueves 19 de noviembre a las 9:00 a. m. Antes de esa fecha necesitamos el certificado de tradición del apartamento.",
    actualizado: "Hoy, 7:42 a. m.",
    estado: "activo",
  },
  {
    id: 22,
    contacto: "Marta Lucía",
    nombre: "Ejecutivo por cuotas de administración, apartamento 1204",
    area: "Propiedad horizontal",
    clase: "Ejecutivo singular",
    cliente: "Conjunto Residencial Aires de Sabaneta P.H.",
    clienteId: 32,
    contraparte: "Rodrigo Alzate Cano",
    responsable: "Santiago Ocampo",
    equipo: ["Santiago Ocampo", "Alejandra Muñoz"],
    radicado: "05631400300120250031100",
    despacho: "Juzgado 1.º Civil Municipal de Sabaneta",
    etapas: etapasEjecutivo,
    etapa: 1,
    folios: 47,
    nuevos: 1,
    tareas: 1,
    docsPendientes: 0,
    proximo: { texto: "Notificar al deudor", fecha: "2026-11-10", hora: null },
    resumenCliente: "El juzgado aceptó la demanda y ordenó al propietario del 1204 pagar lo que debe. Ahora debemos notificarlo.",
    actualizado: "Ayer, 5:08 p. m.",
    estado: "activo",
  },
  {
    id: 23,
    contacto: "Claudia",
    nombre: "Divorcio contencioso Ríos Montoya",
    area: "Familia",
    clase: "Verbal",
    cliente: "Claudia Patricia Ríos Montoya",
    clienteId: 33,
    contraparte: "Andrés Felipe Cardona Ruiz",
    responsable: "Alejandra Muñoz",
    equipo: ["Alejandra Muñoz"],
    radicado: "05001311000820250051000",
    despacho: "Juzgado 8.º de Familia de Medellín",
    etapas: etapasDeclarativo,
    etapa: 3,
    folios: 112,
    nuevos: 1,
    tareas: 3,
    docsPendientes: 0,
    proximo: { texto: "Audiencia inicial (virtual)", fecha: "2026-10-27", hora: "10:00 a. m." },
    resumenCliente: "Su esposo respondió la demanda. Hoy a las 10:00 a. m. es la audiencia inicial, por videollamada.",
    actualizado: "Ayer, 5:08 p. m.",
    estado: "activo",
  },
  {
    id: 24,
    contacto: "Diana Marcela",
    nombre: "Restitución de local comercial, Calle 75 Sur",
    area: "Inmobiliario",
    clase: "Verbal sumario",
    cliente: "Inversiones Montañas del Sur S.A.S.",
    clienteId: 34,
    contraparte: "Panadería El Trigal Ltda.",
    responsable: "Santiago Ocampo",
    equipo: ["Santiago Ocampo"],
    radicado: "05360400300220250020900",
    despacho: "Juzgado 2.º Civil Municipal de Itagüí",
    etapas: etapasDeclarativo,
    etapa: 0,
    folios: 31,
    nuevos: 1,
    tareas: 1,
    docsPendientes: 0,
    proximo: { texto: "Subsanar la demanda", fecha: "2026-11-04", hora: null },
    resumenCliente: "El juzgado pidió corregir algunos puntos de la demanda antes de admitirla. Lo haremos antes del 4 de noviembre.",
    actualizado: "Hoy, 7:42 a. m.",
    estado: "activo",
  },
  {
    id: 25,
    contacto: "Jorge",
    nombre: "Nulidad de sanción urbanística, Envigado",
    area: "Derecho público",
    clase: "Nulidad y restablecimiento",
    cliente: "Jorge Eliécer Zapata Mesa",
    clienteId: 35,
    contraparte: "Municipio de Envigado",
    responsable: "Alejandra Muñoz",
    equipo: ["Alejandra Muñoz"],
    radicado: "05001333300420240037500",
    despacho: "Juzgado 4.º Administrativo de Medellín",
    etapas: etapasDeclarativo,
    etapa: 3,
    folios: 64,
    nuevos: 0,
    tareas: 0,
    docsPendientes: 0,
    proximo: { texto: "Alegatos de conclusión", fecha: "2026-11-26", hora: null },
    resumenCliente: "El proceso está en etapa de pruebas. No hay novedades esta semana.",
    actualizado: "Hace 3 días",
    estado: "activo",
    consultaFallida: true,
  },
  {
    id: 26,
    contacto: "Luis Fernando",
    nombre: "Pertenencia del predio La Esperanza, vereda Pan de Azúcar",
    area: "Inmobiliario",
    clase: "Verbal",
    cliente: "Luis Fernando Arango Uribe",
    clienteId: 36,
    contraparte: "Personas indeterminadas",
    responsable: "Alejandra Muñoz",
    equipo: ["Alejandra Muñoz", "Santiago Ocampo"],
    radicado: "05266310300120230008800",
    despacho: "Juzgado Civil del Circuito de Envigado",
    etapas: etapasDeclarativo,
    etapa: 4,
    folios: 203,
    nuevos: 0,
    tareas: 1,
    docsPendientes: 0,
    proximo: { texto: "Inspección judicial al predio", fecha: "2026-11-13", hora: "8:00 a. m." },
    resumenCliente: "El juez visitará el predio el 13 de noviembre a las 8:00 a. m. Le pediremos estar presente.",
    actualizado: "Hace 5 días",
    estado: "activo",
  },
  {
    id: 19,
    contacto: "Beatriz",
    nombre: "Liquidación de sociedad conyugal Pérez Toro",
    area: "Familia",
    clase: "Liquidatorio",
    cliente: "Beatriz Elena Toro",
    clienteId: 37,
    contraparte: "Mauricio Pérez Lopera",
    responsable: "Alejandra Muñoz",
    equipo: ["Alejandra Muñoz"],
    radicado: "05001311000220230022100",
    despacho: "Juzgado 2.º de Familia de Medellín",
    etapas: etapasDeclarativo,
    etapa: 5,
    folios: 156,
    nuevos: 0,
    tareas: 0,
    docsPendientes: 0,
    proximo: null,
    resumenCliente: "El proceso terminó con sentencia aprobando la partición.",
    actualizado: "12 de septiembre",
    estado: "archivado",
  },
];

// Folios nuevos desde la última visita (consultas de ayer 5:00 p. m. y hoy 7:40 a. m.).
export const foliosNuevos = [
  {
    procesoId: 24,
    folio: 31,
    tipo: "actuacion",
    fecha: "2026-10-27",
    titulo: "Auto inadmite demanda",
    anotacion: "Se inadmite la demanda para que en el término de cinco (5) días se aporte certificado de existencia y representación actualizado y se aclare la cuantía.",
    claro: "El juzgado pidió corregir dos puntos de la demanda antes de admitirla.",
    termino: { dias: 5, base: "Art. 90 CGP", vence: "2026-11-04", habilesRestantes: 5 },
    urgente: true,
  },
  {
    procesoId: 21,
    folio: 88,
    tipo: "actuacion",
    fecha: "2026-10-27",
    titulo: "Auto fija fecha audiencia de inventarios y avalúos",
    anotacion: "Se fija el 19 de noviembre de 2026 a las 9:00 a. m. para llevar a cabo la diligencia de inventarios y avalúos (art. 501 CGP).",
    claro: "El juzgado fijó la audiencia para presentar el inventario de bienes: jueves 19 de noviembre, 9:00 a. m.",
    evento: { fecha: "2026-11-19", hora: "9:00 a. m." },
  },
  {
    procesoId: 22,
    folio: 47,
    tipo: "actuacion",
    fecha: "2026-10-26",
    titulo: "Auto libra mandamiento de pago",
    anotacion: "Se libra mandamiento de pago a favor del Conjunto Residencial Aires de Sabaneta P.H. por $8.640.000 correspondientes a cuotas de administración de enero a septiembre de 2026, más intereses moratorios.",
    claro: "El juzgado aceptó la demanda y ordenó al propietario del 1204 pagar $8.640.000 más intereses.",
  },
  {
    procesoId: 23,
    folio: 112,
    tipo: "actuacion",
    fecha: "2026-10-26",
    titulo: "Traslado de excepciones de mérito",
    anotacion: "Se corre traslado a la parte demandante de las excepciones de mérito propuestas por el demandado por el término de cinco (5) días.",
    claro: "Su esposo se opuso a algunas pretensiones. Tenemos cinco días hábiles para responder.",
    termino: { dias: 5, base: "Art. 370 CGP", vence: "2026-11-03", habilesRestantes: 4 },
  },
];

// Folios del expediente 21, del más reciente al más antiguo.
export const expediente21 = [
  { folio: 88, tipo: "actuacion", fecha: "2026-10-27", titulo: "Auto fija fecha audiencia de inventarios y avalúos", detalle: "Se fija el 19 de noviembre de 2026 a las 9:00 a. m. para la diligencia de inventarios y avalúos (art. 501 CGP).", claro: "El juzgado fijó la audiencia para presentar el inventario: jueves 19 de noviembre, 9:00 a. m.", nuevo: true, autor: "Rama Judicial" },
  { folio: 87, tipo: "documento", fecha: "2026-10-26", titulo: "Registro civil de defunción", detalle: "Entregado por Hernán Restrepo desde el portal. PDF, 2 páginas, 412 KB.", autor: "Hernán Restrepo", archivo: "registro-defuncion-gloria-restrepo.pdf" },
  { folio: 86, tipo: "mensaje", fecha: "2026-10-24", titulo: "Mensaje del cliente", detalle: "«Doctora, ya conseguí el registro de defunción. El certificado de tradición me lo entregan la otra semana.»", autor: "Hernán Restrepo" },
  { folio: 85, tipo: "tarea", fecha: "2026-10-22", titulo: "Preparar relación de bienes para inventario", detalle: "Asignada a Santiago Ocampo. Vence el 12 de noviembre.", autor: "Alejandra Muñoz", estado: "en curso" },
  { folio: 84, tipo: "aviso", fecha: "2026-10-20", titulo: "Aviso enviado al cliente", detalle: "Emplazamiento publicado en el Registro Nacional de Personas Emplazadas. Enviado por correo y WhatsApp; leído el 20 de octubre.", autor: "Alejandra Muñoz" },
  { folio: 83, tipo: "actuacion", fecha: "2026-10-16", titulo: "Constancia de inclusión en el Registro Nacional de Personas Emplazadas", detalle: "Se deja constancia de la inclusión del emplazamiento de herederos indeterminados.", claro: "El juzgado publicó el aviso para que otros posibles herederos se presenten.", autor: "Rama Judicial" },
  { folio: 82, tipo: "solicitud", fecha: "2026-10-09", titulo: "Solicitud de documentos al cliente", detalle: "Registro civil de defunción (entregado) y certificado de tradición y libertad del apartamento (pendiente, plazo 3 de noviembre).", autor: "Alejandra Muñoz" },
  { folio: 81, tipo: "actuacion", fecha: "2026-10-02", titulo: "Auto ordena emplazamiento", detalle: "Se ordena el emplazamiento de los herederos indeterminados de la causante.", claro: "El juzgado ordenó llamar públicamente a otros posibles herederos.", autor: "Rama Judicial" },
  { folio: 80, tipo: "contrato", fecha: "2026-09-18", titulo: "Contrato de prestación de servicios firmado", detalle: "Versión 2, firmada el 18 de septiembre. Copia enviada al correo del cliente.", autor: "Alejandra Muñoz", archivo: "contrato-cps-restrepo-v2-firmado.pdf" },
  { folio: 79, tipo: "actuacion", fecha: "2026-09-11", titulo: "Auto declara abierto el proceso de sucesión", detalle: "Se declara abierto y radicado el proceso de sucesión intestada de Gloria Inés Restrepo de Vélez.", claro: "El juzgado inició formalmente la sucesión de su madre.", autor: "Rama Judicial" },
];

export const tareas = [
  { id: 501, titulo: "Subsanar demanda de restitución", procesoId: 24, responsable: "Santiago Ocampo", vence: "2026-11-04", habiles: 5, prioridad: "alta", estado: "pendiente", origen: "Folio 31" },
  { id: 502, titulo: "Descorrer traslado de excepciones", procesoId: 23, responsable: "Alejandra Muñoz", vence: "2026-11-03", habiles: 4, prioridad: "alta", estado: "en curso", origen: "Folio 112" },
  { id: 503, titulo: "Preparar relación de bienes para inventario", procesoId: 21, responsable: "Santiago Ocampo", vence: "2026-11-12", habiles: 11, prioridad: "media", estado: "en curso", origen: "Folio 85" },
  { id: 504, titulo: "Tramitar citatorio de notificación personal", procesoId: 22, responsable: "Santiago Ocampo", vence: "2026-11-10", habiles: 9, prioridad: "media", estado: "pendiente", origen: "Folio 47" },
  { id: 505, titulo: "Confirmar asistencia del cliente a inspección", procesoId: 26, responsable: "Alejandra Muñoz", vence: "2026-11-06", habiles: 7, prioridad: "baja", estado: "pendiente", origen: "Folio 201" },
  { id: 506, titulo: "Revisar poder para audiencia inicial", procesoId: 23, responsable: "Alejandra Muñoz", vence: "2026-10-26", habiles: -1, prioridad: "alta", estado: "pendiente", origen: "Folio 109" },
  { id: 507, titulo: "Enviar cuenta de cobro de octubre", procesoId: 22, responsable: "Alejandra Muñoz", vence: "2026-10-30", habiles: 3, prioridad: "media", estado: "pendiente", origen: null },
  { id: 508, titulo: "Radicar memorial con pruebas documentales", procesoId: 25, responsable: "Alejandra Muñoz", vence: "2026-10-21", habiles: null, prioridad: "media", estado: "hecha", origen: "Folio 62" },
];

export const agendaHoy = [
  { hora: "10:00 a. m.", fin: "11:30 a. m.", titulo: "Audiencia inicial", procesoId: 23, lugar: "Virtual · Lifesize", tipo: "audiencia" },
  { hora: "3:30 p. m.", fin: "4:15 p. m.", titulo: "Reunión con la administradora de Aires de Sabaneta", procesoId: 22, lugar: "Oficina, Sabaneta", tipo: "reunion" },
];

export const agendaSemana = [
  { dia: "2026-10-27", items: agendaHoy },
  { dia: "2026-10-28", items: [{ hora: "9:00 a. m.", fin: "10:00 a. m.", titulo: "Firma de contrato con nuevo cliente", procesoId: null, lugar: "Oficina", tipo: "firma" }] },
  { dia: "2026-10-29", items: [] },
  { dia: "2026-10-30", items: [{ hora: "11:00 a. m.", fin: "12:00 m.", titulo: "Llamada de seguimiento con Jorge Zapata", procesoId: 25, lugar: "Teléfono", tipo: "reunion" }] },
  { dia: "2026-10-31", items: [] },
];

export const clientes = [
  { id: 31, nombre: "Hernán Restrepo Vélez", tipo: "Persona natural", documento: "C.C. 71.682.415", ciudad: "Envigado", procesos: 1, pendiente: "1 documento", ultimo: "Hace 1 día", whatsapp: "300 418 2290" },
  { id: 32, nombre: "Conjunto Residencial Aires de Sabaneta P.H.", tipo: "Persona jurídica", documento: "NIT 900.512.337-4", ciudad: "Sabaneta", procesos: 3, pendiente: "Cuenta de cobro por enviar", ultimo: "Ayer", whatsapp: "311 702 4418" },
  { id: 33, nombre: "Claudia Patricia Ríos Montoya", tipo: "Persona natural", documento: "C.C. 43.877.120", ciudad: "Medellín", procesos: 1, pendiente: "Mensaje sin responder", ultimo: "Hoy", whatsapp: "315 266 0192" },
  { id: 34, nombre: "Inversiones Montañas del Sur S.A.S.", tipo: "Persona jurídica", documento: "NIT 901.204.885-1", ciudad: "Itagüí", procesos: 1, pendiente: null, ultimo: "Hace 2 días", whatsapp: "304 551 8730" },
  { id: 35, nombre: "Jorge Eliécer Zapata Mesa", tipo: "Persona natural", documento: "C.C. 8.355.902", ciudad: "Envigado", procesos: 1, pendiente: null, ultimo: "Hace 3 días", whatsapp: "310 845 1123" },
  { id: 36, nombre: "Luis Fernando Arango Uribe", tipo: "Persona natural", documento: "C.C. 70.118.764", ciudad: "Envigado", procesos: 1, pendiente: null, ultimo: "Hace 5 días", whatsapp: "300 772 6045" },
];

export const conversaciones = [
  { id: 1, con: "Claudia Patricia Ríos Montoya", procesoId: 23, ultimo: "Doctora, ¿la audiencia de hoy es por la misma plataforma de la vez pasada?", hora: "7:58 a. m.", sinLeer: 1 },
  { id: 2, con: "Hernán Restrepo Vélez", procesoId: 21, ultimo: "Ya conseguí el registro de defunción. El certificado de tradición me lo entregan la otra semana.", hora: "Sáb.", sinLeer: 0 },
  { id: 3, con: "Santiago Ocampo", procesoId: 24, ultimo: "Ya pedí el certificado de existencia actualizado a la Cámara de Comercio.", hora: "Ayer", sinLeer: 0 },
];

export const cuentasCobro = [
  { numero: "CC-2026-043", cliente: "Claudia Patricia Ríos Montoya", procesoId: 23, concepto: "Honorarios, segunda cuota", valor: 3500000, pagado: 0, emitida: "2026-09-30", vence: "2026-10-15", estado: "vencida" },
  { numero: "CC-2026-044", cliente: "Conjunto Residencial Aires de Sabaneta P.H.", procesoId: 22, concepto: "Honorarios mensuales, septiembre", valor: 2400000, pagado: 1200000, emitida: "2026-10-01", vence: "2026-10-31", estado: "parcial" },
  { numero: "CC-2026-045", cliente: "Hernán Restrepo Vélez", procesoId: 21, concepto: "Honorarios, primera cuota", valor: 4000000, pagado: 4000000, emitida: "2026-09-18", vence: "2026-10-03", estado: "pagada" },
  { numero: "CC-2026-046", cliente: "Luis Fernando Arango Uribe", procesoId: 26, concepto: "Gastos de inspección judicial", valor: 650000, pagado: 0, emitida: "2026-10-24", vence: "2026-11-08", estado: "pendiente" },
];

export const pendientesCliente = [
  { id: 1, tipo: "documento", titulo: "Certificado de tradición y libertad del apartamento", detalle: "Lo expide la Oficina de Registro de Instrumentos Públicos de Envigado o la Superintendencia de Notariado en línea. Debe tener menos de 30 días.", vence: "2026-11-03", habiles: 4, procesoId: 21 },
  { id: 2, tipo: "confirmar", titulo: "Confirmar su asistencia a la audiencia del 19 de noviembre", detalle: "La audiencia es en el Juzgado 3.º de Familia de Envigado. Su presencia ayuda a responder preguntas sobre los bienes.", vence: "2026-11-12", habiles: 11, procesoId: 21 },
];

export const historiaCliente = [
  { folio: 88, fecha: "2026-10-27", texto: "El juzgado fijó la audiencia para presentar el inventario de bienes: jueves 19 de noviembre a las 9:00 a. m.", tecnico: "Auto fija fecha audiencia de inventarios y avalúos", nuevo: true },
  { folio: 87, fecha: "2026-10-26", texto: "Recibimos el registro civil de defunción que usted envió. Gracias.", tecnico: null },
  { folio: 83, fecha: "2026-10-16", texto: "El juzgado publicó el aviso para que otros posibles herederos se presenten. Es un paso obligatorio.", tecnico: "Constancia de inclusión en el Registro Nacional de Personas Emplazadas" },
  { folio: 81, fecha: "2026-10-02", texto: "El juzgado ordenó llamar públicamente a otros posibles herederos.", tecnico: "Auto ordena emplazamiento" },
  { folio: 79, fecha: "2026-09-11", texto: "El juzgado inició formalmente la sucesión de su madre.", tecnico: "Auto declara abierto el proceso de sucesión" },
];

export const consultas = {
  ultima: { hora: "Hoy, 7:40 a. m.", radicados: 41, nuevas: 3, fallidos: 1 },
  anterior: { hora: "Ayer, 5:00 p. m.", radicados: 41, nuevas: 2, fallidos: 0 },
  fallidos: [{ radicado: "05001333300420240037500", proceso: "Nulidad de sanción urbanística, Envigado", error: "La Rama Judicial no respondió en 30 segundos", intentos: 2 }],
  historial: [
    { hora: "Hoy, 7:40 a. m.", radicados: 41, nuevas: 3, fallidos: 1, duracion: "2 min 14 s" },
    { hora: "Ayer, 5:00 p. m.", radicados: 41, nuevas: 2, fallidos: 0, duracion: "1 min 58 s" },
    { hora: "Ayer, 12:00 m.", radicados: 41, nuevas: 0, fallidos: 0, duracion: "1 min 51 s" },
    { hora: "Vie. 23 oct., 5:00 p. m.", radicados: 40, nuevas: 4, fallidos: 0, duracion: "2 min 03 s" },
  ],
};

export const integraciones = [
  { nombre: "Rama Judicial", estado: "degradado", detalle: "1 radicado sin respuesta en la última consulta" },
  { nombre: "Correo (SMTP)", estado: "ok", detalle: "128 envíos esta semana, 0 rebotes" },
  { nombre: "WhatsApp", estado: "ok", detalle: "64 mensajes esta semana" },
  { nombre: "Almacenamiento", estado: "ok", detalle: "3,2 GB de 10 GB" },
];

export const usuariosAdmin = [
  { nombre: "Alejandra Muñoz Restrepo", correo: "alejandra@amabogados.co", rol: "Abogada directora", estado: "activo", ultimo: "Hoy, 8:12 a. m." },
  { nombre: "Santiago Ocampo Gil", correo: "santiago@amabogados.co", rol: "Abogado asociado", estado: "activo", ultimo: "Hoy, 7:55 a. m." },
  { nombre: "Paula Jaramillo", correo: "coordinacion@amabogados.co", rol: "Administración", estado: "activo", ultimo: "Hoy, 8:01 a. m." },
  { nombre: "Hernán Restrepo Vélez", correo: "hernan.restrepo@correo.co", rol: "Cliente", estado: "activo", ultimo: "Sáb., 4:20 p. m." },
  { nombre: "Claudia Patricia Ríos Montoya", correo: "claudia.rios@correo.co", rol: "Cliente", estado: "activo", ultimo: "Hoy, 7:58 a. m." },
  { nombre: "Marta Lucía Gómez (Aires de Sabaneta)", correo: "administracion@airesdesabaneta.co", rol: "Cliente", estado: "pendiente", ultimo: "Nunca ha ingresado" },
  { nombre: "Beatriz Elena Toro", correo: "beatriz.toro@correo.co", rol: "Cliente", estado: "suspendido", ultimo: "12 de septiembre" },
];

export const auditoria = [
  { hora: "8:12 a. m.", quien: "Alejandra Muñoz", accion: "Inició sesión", objeto: "Escritorio, Sabaneta" },
  { hora: "7:42 a. m.", quien: "Sistema", accion: "Agregó 3 folios desde la Rama Judicial", objeto: "Expedientes 21, 24 y 23" },
  { hora: "7:41 a. m.", quien: "Sistema", accion: "Consulta fallida", objeto: "Radicado 05001333300420240037500" },
  { hora: "Ayer, 6:10 p. m.", quien: "Santiago Ocampo", accion: "Creó tarea", objeto: "Tramitar citatorio de notificación personal" },
  { hora: "Ayer, 5:30 p. m.", quien: "Alejandra Muñoz", accion: "Envió aviso al cliente", objeto: "Folio 84, expediente 21" },
];

export const festivos2026 = ["2026-11-02", "2026-11-16", "2026-12-08", "2026-12-25"];
