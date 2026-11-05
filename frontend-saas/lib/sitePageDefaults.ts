export const SITE_PAGE_LABELS: Record<string, string> = {
  inicio: "Inicio",
  "quienes-somos": "Quiénes somos",
  "areas-de-practica": "Servicios",
  filosofia: "Filosofía",
  contacto: "Contacto",
  "poliza-juridica": "Póliza jurídica",
  "politica-de-privacidad": "Política de privacidad",
  "tratamiento-de-datos": "Tratamiento de datos",
};

// Texto base de cada página pública. Inicio, quiénes somos, contacto y las dos
// políticas copian lo que la firma tenía publicado el 29/10/2026; lo que la
// administración guarde en contenido_paginas se mezcla encima.
export const SITE_PAGE_DEFAULTS = {
  inicio: {
    route: "/",
    seo: {
      title: "Alejandra Muñoz | Abogada y Asociados",
      description: "Asesoría jurídica preventiva, estratégica y cercana para personas, familias y empresas en Sabaneta y toda Colombia.",
      keywords: "abogada en Sabaneta, asesoría jurídica, abogados en Colombia",
      noIndex: false
    },
    heroEyebrow: "Prevención · estrategia · representación",
    heroTitle: "Decisiones jurídicas bien informadas.",
    heroDescription: "Asesoría integral para personas, empresas y organizaciones, desde Sabaneta para toda Colombia.",
    heroCta: "Cuéntenos su caso",
    heroSecondaryCta: "Ver servicios",
    trust: [
      { label: "Atiende", value: "El equipo jurídico de la firma" },
      { label: "Experiencia", value: "Más de 10 años en la práctica del derecho" },
      { label: "Modalidad", value: "Presencial en Sabaneta con cita previa, o virtual por Teams o Zoom" },
      { label: "Contratación", value: "Alcance y honorarios acordados antes de empezar" }
    ],
    heroAside: "Una consulta a tiempo protege su patrimonio, sus relaciones y su tranquilidad.",
    servicesEyebrow: "Servicios",
    servicesTitle: "¿Qué necesita resolver?",
    services: [
      {
        icon: "family",
        title: "Familia y sucesiones",
        description: "Divorcios, alimentos, custodia, uniones de hecho, herencias y testamentos."
      },
      {
        icon: "civil",
        title: "Civil, contratos e inmuebles",
        description: "Compraventas, arrendamientos, estudios de títulos, deudas y responsabilidad civil."
      },
      {
        icon: "labor",
        title: "Laboral",
        description: "Contratos, despidos, liquidaciones, salarios y prestaciones, para empleadores y trabajadores."
      },
      {
        icon: "government",
        title: "Derecho público",
        description: "Derechos de petición, recursos, procesos sancionatorios y contratación con el Estado."
      }
    ],
    servicesLink: "Ver todos los servicios",
    preventionEyebrow: "Enfoque preventivo",
    preventionTitle: "Un buen asesoramiento puede evitar un largo proceso judicial.",
    preventionDescription: "El costo emocional, financiero y de tiempo de un pleito suele superar la inversión de redactar un contrato bien estructurado o recibir asesoría a tiempo.",
    preventionItems: [
      "Antes de firmar un contrato",
      "Antes de negociar un acuerdo",
      "Antes de comprar o vender",
      "Antes de emprender un negocio",
      "Antes de asumir una obligación",
      "Antes de iniciar un proceso"
    ],
    aboutTitle: "Conozca nuestro enfoque",
    aboutDescription: "Convertimos la complejidad jurídica en decisiones claras, con un acompañamiento humano y responsable.",
    aboutLink: "Quiénes somos",
    stepsTitle: "¿Qué pasa después de escribirnos?",
    steps: [
      { title: "Nos cuenta su caso", description: "Por el formulario, por WhatsApp o por correo. Bastan unas pocas frases; no hace falta enviar documentos." },
      { title: "Acordamos una entrevista", description: "Puede ser de inmediato por chat, por videollamada o presencial en Sabaneta." },
      { title: "Le damos una propuesta", description: "El equipo estudia su caso y, en máximo 2 días hábiles, le explica las alternativas, el alcance y el valor." },
      { title: "Usted decide", description: "Si decide continuar, formalizamos el servicio y acordamos los siguientes pasos." }
    ],
    formTitle: "Cuéntenos su caso",
    formIntro: "Escríbanos en pocas palabras. El equipo lo lee y le responde por el medio que usted elija en máximo 2 días hábiles."
  },
  "quienes-somos": {
    route: "/quienes-somos",
    seo: {
      title: "Quiénes somos | Alejandra Muñoz | Abogada y Asociados",
      description: "Conozca el equipo y la forma de trabajo de Alejandra Muñoz Abogada y Asociados: derecho claro, preventivo y cercano.",
      keywords: "firma jurídica, abogada, asesoría legal Colombia",
      noIndex: false
    },
    eyebrow: "Nuestra firma",
    title: "Quiénes somos",
    intro: "> El derecho también es una herramienta para prevenir.\n\nAlejandra Muñoz Abogada y Asociados es una firma jurídica colombiana, integrada por un equipo de abogados con más de diez años de experiencia, dedicada a la prevención de riesgos jurídicos, __asesoría__, __consultoría__, __representación judicial y extrajudicial__, y acompañamiento estratégico de **personas, familias, empresas y organizaciones**.\n\nEntendemos el ejercicio del derecho desde una perspectiva que combina conocimiento jurídico, análisis estratégico y comprensión de las circunstancias particulares de cada cliente.\n\n- Creemos que la mejor asesoría jurídica comienza con una pregunta: *¿__Qué consecuencias puede tener la decisión que está por tomar__?*\n\nUna firma jurídica verdaderamente cercana debe estar disponible no solamente cuando surge un conflicto, sino también antes de firmar, decidir, negociar, disponer de un patrimonio, asumir una obligación, iniciar un proyecto o adoptar una determinada actuación.\n\nPor eso, nuestro trabajo está orientado tanto a prevenir y anticipar riesgos como a actuar cuando el conflicto ya existe. Porque cuando una persona comprende sus derechos, sus obligaciones, sus alternativas y las consecuencias de cada camino, puede tomar decisiones jurídicas mejor informadas.",
    sections: [
      {
        title: "Nuestro propósito",
        body: "> Convertir el conocimiento jurídico en decisiones que protejan lo que más importa.\n\nEstamos para brindar a nuestros clientes las herramientas jurídicas necesarias para comprender sus situaciones, evaluar alternativas y tomar decisiones informadas, oportunas y sostenibles.\n\nCreemos que el derecho no debe ser únicamente una respuesta frente al conflicto. También debe ser una herramienta para: prevenir, anticipar, proteger, negociar, decidir y actuar.\n\nPor eso, en cada caso logramos que nuestros clientes conozcan no solamente qué pueden hacer, sino también:\n\n- ¿Qué riesgos existen?\n- ¿Qué consecuencias puede tener cada decisión?\n- ¿Qué alternativas tienen?\n- ¿Qué oportunidades pueden aprovechar?\n- ¿Qué derechos pueden ejercer?\n- ¿Qué obligaciones deben cumplir?\n- ¿Cuándo es el momento adecuado para actuar?\n\nPorque decidir con información jurídica oportuna y profesional puede cambiar el resultado a su favor."
      },
      {
        title: "Nuestros principios",
        body: "Nuestro ejercicio se orienta por el rigor técnico, la confidencialidad, la oportunidad, la prevención, la cercanía, la integridad, la independencia y la transparencia, con compromiso con los intereses legítimos de cada cliente y con la calidad humana de nuestro servicio."
      }
    ],
    teamTitle: "Nuestro equipo",
    team: [
      {
        name: "Yeinny Alejandra Muñoz Marín",
        role: "Abogada",
        license: "T.P. 375.092",
        photo: "",
        profile: "",
        experience: ""
      }
    ]
  },
  "areas-de-practica": {
    route: "/servicios",
    seo: {
      title: "Servicios jurídicos | Alejandra Muñoz | Abogada y Asociados",
      description: "Abogados en familia y sucesiones, civil, laboral y derecho público, además de empresas y propiedad horizontal. Sabaneta y toda Colombia.",
      keywords: "abogado de familia, abogado civil, abogado laboral, derecho administrativo, propiedad horizontal, Sabaneta",
      noIndex: false
    },
    eyebrow: "Servicios",
    title: "Lo que resolvemos.",
    description: "Busque su situación. Si no la encuentra, escríbanos igual: le decimos si podemos ayudarle.",
    areas: [
      {
        icon: "family",
        title: "Familia y sucesiones",
        description: "Para quien enfrenta un divorcio, necesita fijar alimentos o custodia, o debe repartir o planear una herencia.",
        sections: [
          {
            title: "Familia y pareja",
            items: [
              "Divorcios y cesación de efectos civiles de matrimonio",
              "Unión marital de hecho y liquidación de sociedad patrimonial",
              "Capitulaciones matrimoniales y patrimoniales",
              "Fijación, aumento y exoneración de cuota alimentaria",
              "Custodia, reglamentación de visitas y patria potestad"
            ]
          },
          {
            title: "Sucesiones y patrimonio",
            items: [
              "Procesos de sucesión notariales y judiciales",
              "Elaboración de testamentos e insinuaciones de donación",
              "Planificación de herencias en vida",
              "Protección de bienes: afectación a vivienda familiar y patrimonio de familia"
            ]
          }
        ]
      },
      {
        icon: "civil",
        title: "Civil, contratos e inmuebles",
        description: "Para quien va a comprar, vender o arrendar, tiene una deuda por cobrar o pagar, o sufrió un daño que alguien debe responder.",
        sections: [
          {
            title: "Contratos e inmuebles",
            items: [
              "Compraventa y arrendamiento",
              "Estudios de títulos inmobiliarios",
              "Procesos de pertenencia y saneamiento de propiedad"
            ]
          },
          {
            title: "Deudas y responsabilidad",
            items: [
              "Cobro prejurídico y ejecutivo",
              "Controversias de responsabilidad civil",
              "Conciliación y arreglos directos"
            ]
          }
        ]
      },
      {
        icon: "labor",
        title: "Laboral",
        description: "Para el empleador que contrata, sanciona o despide, y para el trabajador que reclama lo que le corresponde.",
        sections: [
          {
            title: "Empleadores",
            items: [
              "Contratos de trabajo y reglamentos internos",
              "Procesos disciplinarios y diligencias de descargos",
              "Terminación de contratos y liquidaciones"
            ]
          },
          {
            title: "Trabajadores",
            items: [
              "Reclamación de salarios, prestaciones e indemnizaciones",
              "Despidos sin justa causa",
              "Demandas ante la jurisdicción laboral"
            ]
          }
        ]
      },
      {
        icon: "government",
        title: "Derecho público",
        description: "Para quien necesita una respuesta de una entidad del Estado, enfrenta una sanción o quiere contratar con lo público.",
        sections: [
          {
            title: "Actuaciones ante la administración",
            items: [
              "Derechos de petición y recursos en vía administrativa",
              "Acompañamiento en procesos sancionatorios",
              "Defensa en investigaciones disciplinarias y fiscales"
            ]
          },
          {
            title: "Contratación estatal y análisis normativo",
            items: [
              "Asesoría en licitaciones y contratación directa",
              "Estructuración de propuestas para licitadores del Estado",
              "Conceptos jurídicos y análisis de viabilidad normativa"
            ]
          }
        ]
      },
      {
        icon: "business",
        title: "Empresas y sociedades",
        description: "Para quien crea, organiza o protege una empresa, y quiere contratos que prevengan conflictos.",
        sections: [
          {
            title: "Sociedades",
            items: [
              "Constitución, transformación y disolución de sociedades",
              "Acuerdos de accionistas y pactos de socios",
              "Actas de asamblea y juntas directivas"
            ]
          },
          {
            title: "Contratación y riesgos",
            items: [
              "Contratos mercantiles: distribución, franquicia y suministro",
              "Términos y condiciones para plataformas digitales",
              "Registro de marca",
              "Protección de datos personales",
              "Revisión preventiva de contratos vigentes"
            ]
          }
        ]
      },
      {
        icon: "building",
        title: "Propiedad horizontal",
        description: "Para administradores, consejos y copropietarios que necesitan cobrar cuotas, reformar un reglamento o resolver conflictos de convivencia.",
        sections: [
          {
            title: "Administración de la copropiedad",
            items: [
              "Revisión y reforma de reglamentos de propiedad horizontal",
              "Acompañamiento en asambleas ordinarias y extraordinarias",
              "Conceptos jurídicos para consejos de administración",
              "Manuales de convivencia y régimen sancionatorio"
            ]
          },
          {
            title: "Cobranza y conflictos",
            items: [
              "Recuperación de cartera de expensas comunes",
              "Procesos ejecutivos contra copropietarios morosos",
              "Querellas policivas y conflictos de convivencia",
              "Impugnación de actas de asamblea"
            ]
          }
        ]
      }
    ],
    closingTitle: "¿No encuentra su caso en la lista?",
    closingDescription: "Cuéntenoslo igual. Revisamos su situación y le decimos con franqueza si podemos ayudarle.",
    closingCta: "Cuéntenos su caso"
  },
  filosofia: {
    route: "/filosofia",
    seo: {
      title: "Nuestra filosofía de trabajo | Alejandra Muñoz | Abogada y Asociados",
      description: "Conozca nuestro enfoque jurídico basado en la prevención, la estrategia y la representación responsable.",
      keywords: "prevención jurídica, estrategia legal, representación jurídica",
      noIndex: false
    },
    eyebrow: "Nuestra filosofía de trabajo",
    title: "Prevenir. Estructurar. Defender.",
    intro: "Muchos conflictos pueden prevenirse con información y acompañamiento jurídico oportunos. Aportamos claridad para elegir una ruta sólida desde el primer día.",
    values: [
      {
        number: "01",
        title: "Prevención",
        description: "Identificamos riesgos anticipadamente en contratos, acuerdos y actuaciones formales."
      },
      {
        number: "02",
        title: "Estrategia",
        description: "Diseñamos rutas claras alineadas con sus objetivos, optimizando tiempo y recursos."
      },
      {
        number: "03",
        title: "Representación",
        description: "Acompañamos decisiones con rigor técnico, objetividad y firmeza ética."
      }
    ],
    methodologyEyebrow: "Metodología de trabajo",
    methodologyTitle: "Cómo acompañamos su caso",
    methodologyDescription: "Un proceso estructurado en cuatro etapas para su tranquilidad.",
    steps: [
      {
        step: "01",
        title: "Diagnóstico preventivo",
        description: "Escuchamos su situación, analizamos antecedentes y evaluamos riesgos jurídicos inmediatos y futuros."
      },
      {
        step: "02",
        title: "Diseño estratégico",
        description: "Estructuramos un plan claro con alternativas viables, tiempos proyectados y presupuestos transparentes."
      },
      {
        step: "03",
        title: "Ejecución",
        description: "Redactamos instrumentos, negociamos acuerdos o representamos sus intereses con rigor técnico."
      },
      {
        step: "04",
        title: "Seguimiento continuo",
        description: "Mantenemos información oportuna de cada avance y evaluamos resultados."
      }
    ]
  },
  contacto: {
    route: "/contacto",
    seo: {
      title: "Contacto | Alejandra Muñoz | Abogada y Asociados",
      description: "Solicite orientación jurídica presencial en Sabaneta o virtual desde cualquier lugar de Colombia.",
      keywords: "consulta jurídica, abogada Sabaneta, contacto abogado Colombia",
      noIndex: false
    },
    eyebrow: "¿Tiene una decisión jurídica por tomar?",
    title: "Consulte antes de firmar, negociar o comprar.",
    intro: "Una decisión informada puede prevenir conflictos y costos innecesarios.",
    whatsappCta: "Escribir por WhatsApp",
    emailCta: "Enviar correo",
    contactOptions: [
      {
        icon: "location",
        title: "Atención presencial",
        description: "Sabaneta, Antioquia. Sede principal con cita previa."
      },
      {
        icon: "clock",
        title: "Atención virtual nacional",
        description: "Por Teams o Zoom, para clientes en toda Colombia y en el exterior."
      },
      {
        icon: "email",
        title: "Correo directo",
        description: "alejandramunozabg@outlook.com"
      }
    ],
    formTitle: "Escríbanos su consulta",
    formIntro: "Cuéntenos en pocas palabras qué decisión tiene por delante. El equipo lo lee y le responde por el medio que usted elija en máximo 2 días hábiles.",
    faqEyebrow: "Resolvemos sus dudas",
    faqs: [
      {
        question: "¿Cuánto cuesta la asesoría?",
        answer: "No manejamos una tarifa fija. Primero acordamos una entrevista para entender su caso; con eso el equipo define el alcance y le propone el valor antes de empezar."
      },
      {
        question: "¿Qué debo contar en el primer mensaje?",
        answer: "Qué pasó o qué decisión tiene por delante, y si hay fechas o plazos cerca. No adjunte documentos al primer mensaje: si hacen falta, se los pedimos al responderle."
      },
      {
        question: "¿Cuándo me responden?",
        answer: "La entrevista se puede acordar de inmediato por chat. Después de la entrevista, el equipo le responde con la propuesta en máximo 2 días hábiles."
      },
      {
        question: "¿Por qué consultar antes de firmar un contrato o tomar una decisión?",
        answer: "Una consulta preventiva permite identificar cláusulas abusivas, riesgos financieros ocultos o vacíos legales antes de obligarse jurídicamente."
      },
      {
        question: "¿Cómo se programan y realizan las consultas?",
        answer: "Ofrecemos atención presencial en Sabaneta (Antioquia), con cita previa, y atención virtual por Teams o Zoom para clientes en toda Colombia y en el exterior."
      },
      {
        question: "¿Cómo es el esquema de honorarios profesionales?",
        answer: "Trabajamos bajo esquemas claros previamente pactados: tarifas por trámite, igualas mensuales o porcentaje de éxito en gestión de cobranzas, según el caso."
      },
      {
        question: "¿Ofrecen cobertura a nivel nacional?",
        answer: "Sí. Para trámites notariales, asesoría corporativa, contratos y procesos que permiten virtualidad, atendemos clientes de toda Colombia."
      }
    ]
  },
  "poliza-juridica": {
    route: "/poliza-juridica",
    seo: {
      title: "Póliza jurídica para personas y empresas | Alejandra Muñoz | Abogada y Asociados",
      description: "Acompañamiento jurídico continuo y ajustado a las necesidades de su organización o familia.",
      keywords: "póliza jurídica, asesoría jurídica mensual, acompañamiento legal empresas",
      noIndex: false
    },
    eyebrow: "Acompañamiento jurídico continuo",
    title: "Póliza Jurídica: prevención y respaldo cuando lo necesita.",
    intro: "Una solución diseñada para contar con orientación jurídica de forma periódica, anticipar riesgos y atender las necesidades legales cotidianas sin empezar de cero cada vez.",
    asideTitle: "No hay una póliza igual para todos.",
    asideDescription: "Evaluamos el tipo de cliente, sus operaciones, prioridades y volumen de requerimientos para definir el alcance apropiado.",
    coverageEyebrow: "Una cobertura a su medida",
    coverageTitle: "Servicios que pueden hacer parte de su póliza",
    coverageDescription: "El alcance, número de consultas y entregables se definen después de conocer su caso.",
    benefits: [
      {
        icon: "message",
        title: "Consultas jurídicas recurrentes",
        description: "Un número de consultas mensuales definido según las necesidades de su organización o familia."
      },
      {
        icon: "document",
        title: "Contratos y documentos",
        description: "Acompañamiento en revisión, elaboración y ajustes de documentos jurídicos prioritarios."
      },
      {
        icon: "shield",
        title: "Prevención de riesgos",
        description: "Identificación temprana de contingencias para tomar decisiones con mayor seguridad."
      },
      {
        icon: "followup",
        title: "Seguimiento y orientación",
        description: "Una ruta de acompañamiento clara para los asuntos jurídicos que requieran atención continua."
      }
    ],
    closingEyebrow: "Primer paso",
    closingTitle: "Conozcamos sus necesidades antes de definir la cobertura.",
    closingDescription: "Escríbanos por WhatsApp. Realizaremos un estudio preliminar para proponer una póliza jurídica pertinente y transparente para usted.",
    closingCta: "Consultar información adicional"
  },
  "politica-de-privacidad": {
    "route": "/politica-de-privacidad",
    "seo": {
      "title": "Política de privacidad | Alejandra Muñoz | Abogada y Asociados",
      "description": "Cómo protegemos y usamos los datos personales de quienes visitan este sitio o nos escriben.",
      "keywords": "política de privacidad, protección de datos personales",
      "noIndex": false
    },
    "title": "Política de privacidad",
    "updatedAt": "5 de noviembre de 2026",
    "sections": [
      {
        "title": "Quién responde por sus datos",
        "body": [
          "{{responsable}}[[, identificada con {{documento}},]] es la responsable del tratamiento de los datos personales que se recogen en este sitio, bajo la marca Alejandra Muñoz | Abogada y Asociados.",
          "Puede escribirnos sobre sus datos a {{correo_datos}}[[ o a la dirección {{direccion}}]][[, o llamar al {{telefono}}]]."
        ]
      },
      {
        "title": "Qué datos recogemos",
        "body": [
          "Los que usted nos da al escribirnos: nombre, número de WhatsApp o teléfono, correo electrónico, el tema de su consulta y lo que nos cuente en el mensaje.",
          "Le pedimos no incluir en el primer mensaje datos sensibles ni documentos. Si su caso los requiere, se los solicitaremos después, por un canal seguro y con su autorización."
        ]
      },
      {
        "title": "Para qué los usamos",
        "body": [
          "Para responder su consulta, acordar una entrevista, preparar una propuesta de servicios y, si decide contratarnos, prestar el servicio y cumplir nuestras obligaciones legales y profesionales.",
          "No vendemos ni cedemos sus datos. Solo los compartimos con proveedores que nos ayudan a operar el sitio y nuestras herramientas, bajo deberes de confidencialidad."
        ]
      },
      {
        "title": "Cookies y medición",
        "body": [
          "El sitio usa las tecnologías necesarias para funcionar y puede medir visitas de forma agregada para mejorar. No usamos esa información para identificarle."
        ]
      },
      {
        "title": "Seguridad y secreto profesional",
        "body": [
          "Protegemos la información con medidas técnicas, humanas y administrativas razonables, y la tratamos con el secreto profesional propio del ejercicio de la abogacía. Ninguna transmisión por internet es completamente segura, por eso le pedimos no enviar documentos por el formulario."
        ]
      },
      {
        "title": "Sus derechos",
        "body": [
          "Usted puede conocer, actualizar, rectificar y pedir la supresión de sus datos, y revocar su autorización, en los términos de la [política de tratamiento de datos personales](/tratamiento-de-datos)."
        ]
      },
      {
        "title": "Cambios",
        "body": [
          "Si esta política cambia, publicaremos aquí la nueva versión con su fecha."
        ]
      }
    ]
  },
  "tratamiento-de-datos": {
    "route": "/tratamiento-de-datos",
    "seo": {
      "title": "Política de tratamiento de datos personales | Alejandra Muñoz | Abogada y Asociados",
      "description": "Sus derechos sobre sus datos personales y cómo ejercerlos, según la Ley 1581 de 2012.",
      "keywords": "tratamiento de datos personales, Ley 1581 de 2012, derechos del titular",
      "noIndex": false
    },
    "title": "Política de tratamiento de datos personales",
    "updatedAt": "5 de noviembre de 2026",
    "sections": [
      {
        "title": "Responsable del tratamiento",
        "body": [
          "{{responsable}}[[, identificada con {{documento}},]] con domicilio en {{ciudad}}, presta servicios jurídicos bajo la marca Alejandra Muñoz | Abogada y Asociados y es la responsable del tratamiento de los datos personales descritos en esta política.",
          "Canal de atención: {{correo_datos}}[[ · {{telefono}}]][[ · {{direccion}}]]."
        ]
      },
      {
        "title": "Marco legal",
        "body": [
          "Esta política cumple la Constitución Política (artículo 15), la Ley 1581 de 2012, el Decreto 1074 de 2015 y las normas que los modifiquen o sustituyan."
        ]
      },
      {
        "title": "Datos que tratamos y finalidades",
        "body": [
          "De personas que nos consultan: datos de identificación y contacto, y la información de su caso. Los usamos para responderle, agendar entrevistas, preparar propuestas y, si nos contrata, prestar el servicio, facturar y cumplir deberes legales.",
          "De clientes: además, los documentos y datos necesarios para su asunto, incluidos los que se comparten con autoridades judiciales o administrativas cuando el caso lo exige.",
          "De proveedores y colaboradores: los necesarios para la relación contractual y los pagos.",
          "Cuando el caso requiera datos sensibles o de niños, niñas y adolescentes, los trataremos solo con autorización expresa y en lo estrictamente necesario. Usted no está obligado a entregar datos sensibles."
        ]
      },
      {
        "title": "Autorización",
        "body": [
          "Pedimos su autorización previa, expresa e informada al recoger sus datos, por ejemplo al marcar la casilla del formulario de consulta. Guardamos prueba de esa autorización. No se requiere en los casos que la ley exceptúa."
        ]
      },
      {
        "title": "Sus derechos",
        "body": [
          "Como titular, usted puede: conocer, actualizar y rectificar sus datos; pedir prueba de la autorización; saber cómo los hemos usado; presentar quejas ante la Superintendencia de Industria y Comercio después de agotar el trámite con nosotros; revocar la autorización o pedir la supresión cuando no exista un deber legal o contractual de conservarlos; y acceder gratis a sus datos."
        ]
      },
      {
        "title": "Cómo ejercerlos",
        "body": [
          "Escriba a {{correo_datos}} con su nombre, documento de identidad, datos de contacto, la solicitud y los documentos que quiera hacer valer.",
          "Las consultas se responden en máximo diez (10) días hábiles y los reclamos en máximo quince (15) días hábiles, prorrogables en los términos de la ley, caso en el cual le informaremos el motivo y la nueva fecha."
        ]
      },
      {
        "title": "Conservación y seguridad",
        "body": [
          "Conservamos los datos mientras sean necesarios para la finalidad que justificó su recolección y para cumplir deberes legales, contractuales y de archivo profesional. Aplicamos medidas de seguridad razonables y el secreto profesional."
        ]
      },
      {
        "title": "Vigencia",
        "body": [
          "Esta política rige desde el 5 de noviembre de 2026 y está disponible de forma permanente en este sitio."
        ]
      }
    ]
  }
} as const;

export type PublicPageSlug = keyof typeof SITE_PAGE_DEFAULTS;
