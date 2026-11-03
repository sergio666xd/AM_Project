# PROMPT MAESTRO — RECONSTRUCCIÓN INTEGRAL DE LA INTERFAZ DE AM_PROJECT

## Sistema de diseño, arquitectura UX y especificaciones de UI para ADMIN, ABOGADO_ADMIN y CLIENTE

> **Instrucción para el agente:** este documento es la especificación principal para rediseñar la interfaz de los paneles privados de `AM_Project`. Léelo completo antes de implementar. No uses los archivos Markdown existentes del repositorio como fuente de verdad: pueden estar desactualizados. La fuente de verdad es el código actual, sus rutas, componentes, modelos, endpoints, permisos y comportamiento observable.

---

# 1. MISIÓN

Reconstruir desde cero la **experiencia visual y la organización de la interfaz** de los paneles privados del sistema, porque la disposición visual actual no satisface los objetivos de producto.

No se trata de cambiar algunos colores, redondear tarjetas ni retocar CSS. Se requiere una renovación deliberada de:

- arquitectura de información y navegación;
- composición de dashboards;
- jerarquía visual;
- layout de escritorio y móvil;
- sistema de diseño;
- paleta cromática y tokens;
- tipografía y escala tipográfica;
- botones, inputs, selects, tablas, cards, badges, tabs, menús, diálogos y estados;
- formularios, filtros, búsquedas y acciones;
- páginas de listado y páginas de detalle;
- experiencia específica de cada rol;
- consistencia entre módulos;
- accesibilidad y comportamiento responsive.

La nueva interfaz debe parecer un producto profesional de gestión jurídica diseñado como un sistema coherente, no una colección de páginas independientes.

## Resultado esperado

Una aplicación de aspecto moderno, sobrio, elegante y funcional para **Alejandra Muñoz | Abogada y Asociados**, con identidad jurídica premium basada en azul oscuro y dorado, sin caer en interfaces anticuadas, recargadas o excesivamente ornamentales.

La interfaz debe priorizar contenido y acciones reales. No debe parecer un template genérico de dashboard al que se le cambió el logo.

---

# 2. ALCANCE Y EXCLUSIONES

## 2.1 Incluido

Reconstrucción de la interfaz privada de estos roles:

1. `ADMIN`: administración global de la plataforma y supervisión de la firma.
2. `ABOGADO_ADMIN`: operación jurídica interna de la firma.
3. `CLIENTE`: portal privado de clientes.

Incluye:

- layouts, sidebars, headers y navegación;
- dashboard y páginas existentes de cada rol;
- listas, detalles, tablas, formularios, modales, filtros y acciones;
- sistema visual compartido;
- responsive y accesibilidad;
- estados de carga, error, vacío, éxito y permisos;
- integración de UI con las APIs existentes;
- correcciones de interacción necesarias para que los controles de interfaz funcionen.

## 2.2 Excluido explícitamente

**NO rediseñar ni modificar el contenido público del sitio web.**

Excluir del alcance:

- CMS o editor de páginas públicas;
- páginas públicas como Inicio, Quiénes somos, Servicios, Contacto, Áreas de práctica;
- rediseño de la web pública;
- gestión visual del contenido público;
- SEO de páginas públicas.

La ruta administrativa existente de contenido público puede seguir existiendo y debe conservarse funcionalmente, pero no es objeto de rediseño en este encargo. No emplees esfuerzo en el CMS.

## 2.3 No cambiar el dominio de negocio

Esta tarea es principalmente de frontend/UI. No rehacer el backend ni el modelo de negocio para facilitar el diseño.

Solo se permiten cambios de backend/API si son indispensables para una interacción de interfaz requerida, están justificados, son mínimos y no rompen compatibilidad. Antes de crear un endpoint o campo, verifica si ya existe una alternativa.

---

# 3. REGLAS DE CONTEXTO DEL PROYECTO

Repositorio: `sergio666xd/AM_Project`.

Frontend: `frontend-saas/`.

Stack observado del proyecto: Next.js con App Router, TypeScript, Tailwind CSS y componentes React; backend FastAPI con SQLAlchemy/PostgreSQL y autenticación JWT. Verifica las versiones y librerías reales en `package.json` y archivos de configuración antes de tomar decisiones técnicas.

## 3.1 No confiar en documentación Markdown antigua

El propietario del proyecto ha indicado que los `.md` existentes pueden estar desactualizados. No los uses para inferir la arquitectura vigente ni los sigas automáticamente. En particular, no bases la implementación en planes antiguos, descripciones antiguas de rutas o supuestos de diseño.

Puedes leer `AGENTS.md` u otras instrucciones operativas del entorno del agente si son necesarias para respetar reglas de ejecución, pero no trates documentos funcionales antiguos como fuente de verdad. Si un archivo de instrucciones contradice esta especificación o el código real, señala el conflicto antes de actuar.

## 3.2 Auditar antes de programar

Inspecciona el estado actual del repositorio y confirma:

- rutas reales;
- layouts y grupos de rutas;
- componentes compartidos;
- navegación y protección de rutas;
- contexto de sesión/autenticación;
- componentes de interfaz existentes;
- estilos globales y tokens;
- librerías instaladas;
- endpoints utilizados por cada página;
- tipos TypeScript;
- comportamiento actual de formularios y acciones;
- scripts de lint, typecheck, tests y build.

No inventes archivos, rutas, endpoints, librerías ni funcionalidades. Busca primero.

## 3.3 Roles

Respetar estrictamente las diferencias entre:

- `ADMIN`: control y supervisión global;
- `ABOGADO_ADMIN`: trabajo diario de la firma y gestión de asuntos jurídicos;
- `CLIENTE`: seguimiento y participación en sus propios asuntos.

No convertir el producto en un sistema multi-firma ni introducir conceptos de tenants/organizaciones múltiples. La firma de referencia es una sola: **Alejandra Muñoz | Abogada y Asociados**.

## 3.4 Proceso no es Radicado

Mantener la distinción de dominio en labels, rutas y navegación:

- **Proceso**: entidad principal del sistema.
- **Radicado**: número/registro judicial consultado.

Un proceso puede contener uno o varios radicados. No renombrar ni fusionar ambos conceptos.

## 3.5 Conservar la lógica funcional

El rediseño puede cambiar por completo la presentación y distribución, pero debe preservar las funciones existentes, las validaciones, las APIs y los permisos. No reemplaces datos reales con mocks para simular una interfaz terminada. No elimines capacidades porque no encajen en el diseño inicial: reorganízalas.

---

# 4. DIRECCIÓN ARTÍSTICA

## 4.1 Personalidad de marca

La interfaz debe transmitir:

- confianza jurídica;
- rigor y profesionalismo;
- discreción;
- claridad;
- control;
- cercanía humana;
- calidad premium sin ostentación.

Evitar:

- dorado en exceso;
- gradientes llamativos;
- sombras grandes y difusas;
- glassmorphism como estilo dominante;
- efectos neón;
- bordes gruesos por todas partes;
- exceso de tarjetas dentro de tarjetas;
- dashboards llenos de números sin utilidad;
- iconos emoji como sustituto de iconografía de producto;
- colores saturados para decoración;
- texto gris claro con contraste insuficiente;
- una interfaz completamente azul oscuro que dificulte leer;
- estilo administrativo gubernamental anticuado;
- apariencia de template SaaS genérico;
- radios exagerados tipo “píldora” en todos los componentes.

La elegancia debe venir de la proporción, el espacio, la tipografía, la alineación, la calidad de los componentes y el uso moderado del color.

---

# 5. SISTEMA DE DISEÑO Y PALETA

Crear tokens centralizados, preferiblemente como variables CSS y/o configuración coherente con el Tailwind ya instalado. No distribuir valores hexadecimales arbitrarios por cientos de componentes.

## 5.1 Paleta de marca

| Token         | Valor       | Uso                                                             |
| ------------- | ----------- | --------------------------------------------------------------- |
| `brand-950` | `#00143D` | Azul profundo para contraste y elementos muy puntuales          |
| `brand-900` | `#002060` | **Azul principal de marca**                               |
| `brand-800` | `#123675` | Hover/active de superficies azules                              |
| `brand-700` | `#244A8B` | Acciones secundarias y énfasis                                 |
| `brand-100` | `#E8EEF8` | Fondo suave de elementos azules                                 |
| `brand-50`  | `#F4F7FC` | Superficie azul casi blanca                                     |
| `gold-600`  | `#A88D3D` | Dorado oscuro para texto/íconos cuando el contraste lo permita |
| `gold-500`  | `#B89D52` | Dorado funcional moderado                                       |
| `gold-400`  | `#CCB56B` | **Dorado secundario de marca**                            |
| `gold-200`  | `#E8DDAE` | Borde o fondo dorado tenue                                      |
| `gold-100`  | `#F6F0DB` | Superficie dorada suave                                         |
| `gold-50`   | `#FBF8EF` | Fondo dorado casi blanco                                        |

El dorado original `#CCB56B` no debe utilizarse como texto pequeño sobre fondo blanco sin comprobar contraste. Para texto dorado, usa una variante más oscura (`gold-600`) si alcanza contraste accesible.

## 5.2 Neutrales

| Token           | Valor       | Uso                                          |
| --------------- | ----------- | -------------------------------------------- |
| `neutral-950` | `#171A21` | Texto de máxima jerarquía                  |
| `neutral-900` | `#222733` | Texto principal                              |
| `neutral-800` | `#343B49` | Texto secundario fuerte                      |
| `neutral-700` | `#4B5565` | Texto secundario                             |
| `neutral-600` | `#606B7B` | Ayuda/metadata con contraste suficiente      |
| `neutral-500` | `#768091` | Iconos y texto auxiliar cuando sea accesible |
| `neutral-400` | `#A2AAB6` | Bordes/elementos deshabilitados              |
| `neutral-300` | `#D4D9E1` | Bordes                                       |
| `neutral-200` | `#E7EAF0` | Separadores                                  |
| `neutral-100` | `#F2F4F7` | Fondos secundarios                           |
| `neutral-50`  | `#F8F9FB` | Fondo general claro                          |
| `white`       | `#FFFFFF` | Superficies principales                      |

## 5.3 Colores semánticos

| Token           | Valor       | Uso                               |
| --------------- | ----------- | --------------------------------- |
| `success-700` | `#18734A` | Texto/ícono de éxito            |
| `success-100` | `#E4F4EB` | Fondo de éxito                   |
| `warning-700` | `#946200` | Texto/ícono de advertencia       |
| `warning-100` | `#FFF2CC` | Fondo de advertencia              |
| `danger-700`  | `#B42332` | Texto/ícono de error destructivo |
| `danger-100`  | `#FCE8EA` | Fondo de error                    |
| `info-700`    | `#245DA8` | Información                      |
| `info-100`    | `#E7F0FC` | Fondo informativo                 |

Los colores semánticos son para comunicar estados, no para decorar. Nunca dependas exclusivamente del color: acompaña con texto e iconografía.

## 5.4 Dark mode

Si el sistema ya soporta tema oscuro, preservarlo y adaptar correctamente los tokens. No romper el selector actual. Si el tema está incompleto, centraliza tokens para permitir completar el modo oscuro sin duplicar estilos página por página. El modo claro debe quedar bien acabado; el oscuro no puede ser una inversión automática que deje tarjetas, bordes o textos ilegibles.

---

# 6. TIPOGRAFÍA, ESPACIADO Y GEOMETRÍA

## 6.1 Tipografía

Audita las fuentes ya instaladas y el sistema actual. Usa una tipografía sans-serif de interfaz legible como base. Si no hay una fuente de marca configurada, utiliza una opción moderna y sobria compatible con Next.js, preferiblemente mediante `next/font` si la fuente está disponible localmente o puede instalarse de forma apropiada.

Dirección recomendada:

- títulos de página: 26–32 px, peso 600–700;
- títulos de sección: 17–21 px, peso 600;
- títulos de tarjeta: 14–16 px, peso 600;
- cuerpo: 14–16 px;
- labels: 12–14 px, peso 500–600;
- metadata: 12–13 px con contraste adecuado;
- números destacados: 24–32 px, solo cuando aporten información útil.

No usar tamaños distintos sin una jerarquía clara. Evitar todo en mayúsculas excepto pequeñas etiquetas deliberadas.

## 6.2 Espaciado

Definir escala consistente basada en múltiplos de 4 px. Referencia:

- 4 px: separación mínima;
- 8 px: elementos relacionados;
- 12 px: controles compactos;
- 16 px: padding de controles y gaps pequeños;
- 20–24 px: tarjetas y grupos;
- 28–32 px: separación de secciones;
- 40–48 px: grandes separaciones.

No resolver el layout agregando `margin` arbitrarios hasta que “se vea bien”. Usar grid, flex y tokens de spacing.

## 6.3 Radios y bordes

- controles: radio de 8–10 px;
- tarjetas: 12–16 px;
- diálogos grandes: 16 px;
- badges: radio completo cuando sea pertinente;
- bordes: finos, normalmente `neutral-200`;
- sombras: discretas y solo para jerarquía/elevación.

No envolver cada sección en una tarjeta. Utilizar superficies, divisores, títulos y espacios para jerarquizar.

---

# 7. LAYOUT GLOBAL DE LOS PANELES

Construir una estructura común reutilizable con variaciones por rol. Reutilizar componentes existentes si están bien diseñados internamente; si la arquitectura visual actual impide una renovación limpia, reemplazar la capa visual sin eliminar lógica de negocio.

## 7.1 Estructura de escritorio

```text
┌───────────────────────────────────────────────────────────────────────┐
│ Sidebar fijo      │ Header superior                                   │
│                   │ búsqueda / breadcrumb / ayuda / notificaciones /  │
│ Marca AM          │ avatar                                            │
│                   ├───────────────────────────────────────────────────┤
│ Navegación        │                                                   │
│ agrupada por      │ Título de página                                  │
│ propósito         │ descripción breve / acciones principales         │
│                   │                                                   │
│                   │ Contenido: ancho y jerarquía coherentes           │
│                   │                                                   │
│ Perfil / salir    │                                                   │
└───────────────────────────────────────────────────────────────────────┘
```

## 7.2 Sidebar

- ancho expandido aproximado: 248–272 px;
- ancho colapsado aproximado: 72–80 px;
- fondo principal claro, con azul reservado para marca, selección o áreas concretas;
- logo y nombre de la firma en zona superior;
- iconos lineales consistentes;
- etiquetas visibles al expandir;
- navegación agrupada con encabezados discretos;
- elemento activo evidente pero no estridente;
- tooltips al colapsar;
- perfil/menú de cuenta en zona inferior;
- scroll independiente si la navegación excede la altura;
- soporte correcto para teclado;
- en móvil, convertirse en drawer accesible.

No mostrar todos los módulos como una lista plana interminable. No introducir enlaces que no existan.

## 7.3 Header

Incluir, según el rol y las capacidades reales:

- botón para expandir/colapsar sidebar;
- breadcrumb cuando aporte orientación;
- búsqueda global si está implementada de verdad;
- centro de notificaciones con contador real;
- menú de ayuda si existe;
- avatar/menú de cuenta;
- cambio de tema si ya existe.

No incluir controles decorativos sin comportamiento. Si la búsqueda global no puede implementarse en la fase inicial, no mostrar una caja que finja funcionar.

## 7.4 Área de contenido

- fondo general `neutral-50` o equivalente;
- contenido principal con ancho razonable;
- padding desktop de referencia: 28–36 px;
- padding tablet: 20–24 px;
- padding móvil: 16 px;
- títulos y acciones alineados;
- uso deliberado de ancho completo en tablas/calendarios;
- formularios largos organizados en secciones claras;
- evitar columnas estrechas para tablas densas;
- evitar páginas que parezcan una columna interminable de tarjetas.

---

# 8. COMPONENTES DEL DESIGN SYSTEM

Crear o normalizar una biblioteca pequeña de componentes reutilizables, adaptada al stack instalado. No instalar una librería nueva sin comprobar primero las dependencias existentes y justificar la necesidad.

## 8.1 Botones

Variantes mínimas:

1. `primary`: fondo `brand-900`, texto blanco; acción principal.
2. `secondary`: fondo blanco, borde neutral, texto oscuro.
3. `outline`: fondo transparente/blanco con borde; acción secundaria.
4. `ghost`: sin superficie permanente; navegación y acciones discretas.
5. `danger`: acción destructiva con rojo semántico.
6. `gold`: solo para acentos o acciones especiales donde el dorado contraste bien; no convertirlo en la variante primaria de todo.

Tamaños:

- `sm`: 32–36 px;
- `md`: 40–44 px;
- `lg`: 46–48 px.

Requisitos:

- estados hover, active, focus-visible, disabled y loading;
- indicador de carga;
- icono opcional con espaciado consistente;
- área táctil suficiente en móvil;
- texto que explique la acción;
- confirmación para acciones destructivas;
- no usar botones píldora por defecto;
- evitar más de una acción primaria dominante en una misma zona.

## 8.2 Inputs y formularios

Normalizar:

- text input;
- textarea;
- select;
- combobox si ya existe soporte;
- date picker;
- checkbox;
- radio;
- switch;
- búsqueda;
- campo de carga de archivo.

Cada campo debe tener:

- label visible;
- descripción opcional;
- placeholder solo como ejemplo, nunca como sustituto del label;
- estado de error junto al campo;
- estado disabled;
- focus visible;
- validación coherente;
- mensajes de error útiles;
- required indicado accesiblemente;
- alturas consistentes (aprox. 40–44 px en controles estándar).

Formularios:

- agrupar campos por sección;
- colocar acciones Guardar/Cancelar en una ubicación predecible;
- confirmar cambios sin guardar cuando aplique;
- evitar diálogos para formularios extensos;
- mostrar errores del servidor sin borrar lo que el usuario escribió.

## 8.3 Cards

Variantes:

- resumen/KPI;
- contenido;
- alerta/atención;
- elemento de lista;
- resumen de proceso;
- resumen de cliente;
- actividad.

Reglas:

- una tarjeta debe tener un propósito;
- evitar tarjetas anidadas innecesarias;
- no convertir todo texto en una tarjeta;
- las tarjetas KPI deben mostrar etiqueta, valor y, si existe, contexto útil;
- no inventar tendencias, porcentajes ni datos.

## 8.4 Tablas y listados

Componente o patrón reutilizable con:

- encabezados claros;
- alineación consistente;
- filas con hover discreto;
- selección/fila clicable solo cuando la interacción esté clara;
- menú de acciones por fila;
- paginación si el backend o volumen lo requiere;
- filtros y búsqueda en una toolbar;
- estado vacío contextual;
- skeleton de carga;
- error con reintento;
- responsive: tabla con scroll horizontal controlado o transformación a tarjetas cuando tenga sentido.

No forzar una tabla enorme en móvil. No esconder acciones esenciales dentro de un menú si deben ser inmediatas.

## 8.5 Badges de estado

Estados semánticos coherentes, por ejemplo:

- activo/en curso: azul;
- completado/aprobado: verde;
- pendiente/atención: ámbar;
- vencido/error/rechazado: rojo;
- archivado/inactivo: neutral.

Mapear los estados reales del backend a etiquetas humanas en una capa centralizada. No modificar los enums de backend solo por razones visuales. Evitar mostrar estados técnicos crudos al usuario final.

## 8.6 Modales y diálogos

- tamaño adecuado al propósito;
- título y explicación;
- acción principal y cancelar;
- cerrar con Escape cuando corresponda;
- foco inicial y retorno de foco;
- bloqueo correcto de interacción detrás;
- confirmación explícita en operaciones destructivas;
- no utilizar modales para páginas complejas que necesitan navegación propia.

## 8.7 Tabs, menús y popovers

- foco visible;
- teclado funcional;
- estado activo claro;
- no usar tabs para categorías que en realidad son páginas independientes;
- menús con acciones reales y nombres comprensibles.

## 8.8 Toasts y feedback

Utilizar mensajes breves y específicos:

- “Cambios guardados”.
- “No se pudo cargar la información. Intenta nuevamente”.
- “Documento enviado para revisión”.

No exponer trazas, SQL ni detalles sensibles en mensajes de usuario. Los errores técnicos deben registrarse donde corresponda.

## 8.9 Iconografía

Utilizar la biblioteca de iconos que ya esté instalada. Si no hay una adecuada, elegir una sola familia lineal coherente y añadirla solo después de revisar dependencias. Mantener tamaños de 16/18/20/24 px según jerarquía. No mezclar familias distintas ni utilizar emoji para navegación de producto.

---

# 9. DASHBOARDS: COMPOSICIÓN Y JERARQUÍA

Los dashboards no deben ser una cuadrícula de 12 KPIs. Deben priorizar las decisiones y acciones de cada rol.

Patrón base:

1. encabezado de página con saludo/contexto y acción primaria;
2. zona de atención prioritaria;
3. métricas resumidas limitadas;
4. lista o tabla principal;
5. actividad reciente;
6. contenido secundario según rol.

El orden puede variar por rol, pero debe existir una jerarquía visible. No mostrar secciones vacías solo para cumplir un diseño. Si no hay datos, explicar qué significa y ofrecer una acción útil.

---

# 10. PANEL ADMIN — CONTROL Y SUPERVISIÓN

Ruta base observada: `/gestion-procesos/admin`.

Antes de implementar, confirma el inventario real de páginas del repositorio. En el estado actual hay rutas relacionadas con dashboard, usuarios, solicitudes, agenda, alertas, actividad, auditoría, métricas, procesos, radicados, tareas, documentos, notificaciones, operación, planes, firma/cuenta y recursos globales. Respeta rutas y funciones reales.

## 10.1 Objetivo UX

ADMIN debe poder responder rápidamente:

- ¿Qué está pasando?
- ¿Qué requiere atención?
- ¿Hay fallos operativos?
- ¿Qué solicitudes están pendientes?
- ¿Qué recursos necesitan intervención?
- ¿Cómo está funcionando la firma/plataforma?

Debe transmitir control y claridad, no convertirlo en una consola técnica.

## 10.2 Navegación recomendada

Agrupar los módulos existentes en secciones. Adaptar los nombres a las rutas y permisos reales; no eliminar páginas existentes:

**GENERAL**

- Resumen
- Alertas
- Actividad

**GESTIÓN**

- Usuarios
- Solicitudes
- Procesos
- Radicados
- Tareas
- Agenda
- Documentos

**PLATAFORMA**

- Planes
- Métricas
- Operación
- Auditoría

**CUENTA**

- Firma/configuración si corresponde a una funcionalidad real
- Mi cuenta

Las páginas de contenido público quedan fuera del rediseño visual de este proyecto. Si existe un enlace a ellas, mantenerlo funcional y sin invertir tiempo en su interfaz.

No añadir elementos de navegación sin página real. Si un módulo está actualmente dentro de un recurso dinámico, conserva la ruta y presenta un título/label humano.

## 10.3 Dashboard ADMIN

Composición recomendada:

- título “Resumen” y fecha/contexto;
- fila compacta de indicadores reales: usuarios, solicitudes pendientes, procesos activos, alertas abiertas;
- bloque principal “Requiere atención” con máximo 4–6 elementos prioritarios;
- tabla “Procesos que requieren revisión” cuando haya datos;
- actividad reciente legible;
- estado operativo resumido si los endpoints existentes permiten obtenerlo.

Cada tarjeta o fila debe navegar al detalle relevante. No inventar datos ni construir indicadores mediante aproximaciones ocultas. Si un dato no está disponible, no simularlo.

## 10.4 Usuarios y solicitudes

Diseñar páginas con:

- título + descripción corta;
- acción primaria clara;
- filtros relevantes;
- tabla con jerarquía;
- estados legibles;
- menú de acciones por fila;
- detalle de usuario con secciones bien agrupadas;
- formularios organizados y consistentes;
- confirmación para cambios sensibles;
- estado vacío con CTA útil.

No sobrecargar cada fila con todos los botones posibles. Usar una acción principal y un menú secundario cuando corresponda.

## 10.5 Procesos, radicados y tareas globales

Las vistas administrativas deben permitir entender el contexto y localizar el recurso con rapidez. Mostrar los campos realmente útiles, filtros coherentes y enlaces claros a detalles. Mantener diferenciados Proceso y Radicado.

## 10.6 Operación y auditoría

La información técnica puede ser densa, por lo que debe utilizarse una jerarquía especializada:

- resumen de estado;
- filtros;
- tabla de eventos;
- detalle técnico en panel lateral o acordeón;
- errores legibles;
- identificadores técnicos disponibles cuando sean necesarios para soporte.

No intentar presentar logs como tarjetas de marketing. Mantener la densidad de información útil sin sacrificar legibilidad.

---

# 11. PANEL ABOGADO_ADMIN — PRODUCTIVIDAD JURÍDICA

Ruta base observada: `/gestion-procesos/abogado`.

Este panel no es una versión reducida de ADMIN. Su centro es el trabajo diario de la firma.

## 11.1 Navegación recomendada

Agrupar las rutas existentes, conservando acceso a cada funcionalidad:

**TRABAJO**

- Resumen
- Procesos
- Clientes
- Tareas
- Agenda

**EXPEDIENTES**

- Radicados
- Documentos
- Contratos si la funcionalidad existente corresponde aquí

**COMUNICACIÓN**

- Solicitudes de perfil u otras solicitudes reales
- Chat/mensajes
- Notificaciones

**CUENTA**

- Métricas si corresponde al rol
- Perfil
- Configuración

La ubicación final de módulos debe validarse contra el uso real y los permisos. No ocultar funciones que ya existen.

## 11.2 Dashboard ABOGADO_ADMIN

Debe responder: “¿Qué tengo que hacer hoy y qué asuntos necesitan atención?”.

Composición:

- encabezado y acción primaria “Nuevo proceso” o acción existente más útil;
- bloque “Requiere atención” para tareas vencidas/próximas, solicitudes pendientes, documentos por revisar y problemas reales de consulta judicial;
- resumen compacto de procesos y tareas;
- próximos eventos;
- procesos recientes o críticos;
- actividad reciente.

No colocar métricas de SaaS, planes ni herramientas de operación global aquí salvo que el rol ya tenga una función explícita que las requiera.

## 11.3 Procesos

Diseñar listado con:

- búsqueda;
- filtros por estado, responsable y participación cuando existan;
- ordenamiento;
- resumen legible por fila/tarjeta;
- cliente asociado;
- responsable;
- estado y señal de atención si puede calcularse con datos reales;
- última actividad si existe;
- acciones contextuales.

No crear un indicador “riesgo” falso. Si se muestra salud del proceso, documentar la regla y basarla en datos reales.

## 11.4 Detalle de proceso

Debe sentirse como un **expediente digital** con jerarquía y navegación interna clara, no como una página larga con secciones visualmente idénticas.

Cabecera:

- nombre del proceso;
- cliente;
- responsable;
- estado;
- acciones principales;
- información de contexto compacta.

Organizar la información existente en tabs o secciones claras según la cantidad real de contenido, por ejemplo:

- Resumen
- Radicados y actuaciones
- Tareas
- Documentos
- Personas/colaboradores
- Actividad

No crear tabs vacíos ni mover información sin verificar su comportamiento. Mantener las subrutas existentes compatibles.

## 11.5 Radicados y actuaciones

Mostrar número de radicado, estado, fechas y actuaciones en jerarquía clara. Separar el número judicial de la entidad Proceso. En detalles densos, utilizar timeline o tabla según el tipo de dato, no tarjetas repetidas para todo.

## 11.6 Clientes

Diseñar una vista tipo CRM jurídico sobrio:

- nombre y datos principales;
- procesos asociados;
- información de contacto;
- tareas/documentos pendientes cuando existan;
- actividad o último contacto si los datos están disponibles;
- acceso claro al detalle.

No exponer datos personales en vistas que no los necesitan. Mantener los permisos existentes.

## 11.7 Tareas

Facilitar revisión y priorización:

- vista de lista como base;
- filtros por estado, vencimiento, proceso y responsable según datos existentes;
- vencidas y próximas destacadas semánticamente;
- descripción y contexto;
- acciones rápidas;
- calendario/Kanban solo si la funcionalidad y datos reales lo soportan.

No crear controles de vista que no cambien la representación de los datos.

## 11.8 Agenda

La agenda debe dar prioridad a fechas y compromisos. Diferenciar eventos de tareas. Mantener vistas existentes y mejorar la legibilidad, navegación entre fechas, etiquetas, filtros y vista móvil. No inventar eventos ni duplicar datos.

## 11.9 Documentos y contratos

Mejorar el flujo visual de revisión:

- tipo/nombre;
- proceso o cliente asociado;
- fecha;
- estado;
- acción siguiente;
- descargar/ver cuando corresponda.

Para archivos, indicar claramente si están cargando, listos o si falló la operación. No mostrar rutas internas ni tokens.

## 11.10 Chat, solicitudes y notificaciones

Conservar la funcionalidad existente. Diseñar una experiencia coherente con:

- listado de conversaciones/solicitudes;
- estado leído/no leído cuando exista;
- contexto de cliente/proceso;
- panel de conversación;
- historial y adjuntos si están soportados;
- empty states útiles.

No simular mensajes ni estados de entrega.

---

# 12. PORTAL CLIENTE — CLARIDAD Y CONFIANZA

Ruta base observada: `/gestion-procesos/cliente`.

El cliente no debe ver una versión recortada del panel del abogado. Debe entender qué ocurre con sus asuntos y qué acciones le corresponden.

## 12.1 Navegación recomendada

Agrupar las rutas existentes:

**INICIO**

- Inicio/Resumen

**MIS ASUNTOS**

- Mis procesos
- Radicados si la interfaz existente los expone al cliente

**PENDIENTES**

- Mis tareas
- Documentos
- Calendario

**COMUNICACIÓN**

- Mensajes/chat
- Notificaciones

**MI CUENTA**

- Perfil
- Configuración
- Ayuda

Confirma las rutas actuales. No añadir páginas duplicadas ni enlaces muertos.

## 12.2 Dashboard CLIENTE

Debe responder:

- ¿Cómo van mis asuntos?
- ¿Hay algo que deba hacer?
- ¿Qué documentos faltan?
- ¿Cuál fue la última actualización?
- ¿Cuándo es mi próximo compromiso?
- ¿Cómo contacto al despacho?

Composición:

1. bienvenida breve y discreta;
2. bloque prioritario “Tienes pendiente”;
3. resumen de procesos;
4. documentos por entregar o revisar;
5. próximas fechas/eventos cuando existan;
6. últimas actualizaciones visibles al cliente;
7. acceso a comunicación.

No llenar la pantalla con métricas técnicas. El lenguaje debe ser humano, claro y respetuoso.

## 12.3 Mis procesos y detalle

La lista debe presentar tarjetas o filas con:

- nombre del proceso;
- estado expresado de manera comprensible;
- última actualización visible;
- responsable/contacto cuando los permisos lo permitan;
- pendiente relevante;
- acceso a detalle.

El detalle del proceso debe agrupar el contenido disponible en:

- Resumen
- Actualizaciones
- Documentos
- Tareas
- Radicados, cuando corresponda

No exponer notas internas, detalles técnicos de consultas, errores internos ni acciones privadas del abogado. El backend debe mantener la autorización; la UI no es una barrera de seguridad.

## 12.4 Tareas del cliente

Mostrar tareas que el cliente realmente pueda o deba realizar, con:

- título accionable;
- explicación;
- fecha límite si existe;
- proceso asociado;
- estado;
- acción de completar cuando esté permitida.

No mostrar tareas internas del abogado. No inventar tareas o vencimientos. Confirmar visualmente cuando una acción se guarde y evitar doble envío.

## 12.5 Documentos

Diseñar una experiencia simple para:

- documentos solicitados;
- archivos enviados;
- documentos compartidos por el despacho;
- estado de revisión;
- errores de carga;
- descarga;
- reemplazo si la API lo permite.

Mostrar restricciones de archivo y tamaño antes de subir. Indicar progreso si la implementación lo soporta. No afirmar que un documento fue aprobado hasta recibir confirmación del backend.

## 12.6 Calendario

Mostrar solo compromisos relevantes y autorizados para el cliente. No exponer la agenda interna del abogado. La vista móvil debe ser comprensible; ofrecer una lista cronológica si el calendario mensual resulta incómodo en pantallas pequeñas.

## 12.7 Mensajes y notificaciones

Usar una interfaz fácil de entender. Diferenciar mensajes de notificaciones automáticas. Mantener el contexto de conversación y el estado de lectura solo si existe en backend. No presentar el chat como funcional si los mensajes no se pueden enviar o recuperar realmente.

## 12.8 Perfil, configuración y ayuda

Conservar las funciones actuales. Formularios claros, estados de solicitud de cambios, preferencias de notificación y ayuda accesible. No exponer controles de administración o configuración de la firma.

---

# 13. RESPONSIVE: REQUISITOS OBLIGATORIOS

Diseñar mobile-first sin sacrificar la experiencia de escritorio.

Verificar al menos:

- 360 px de ancho;
- 390–430 px;
- tablet alrededor de 768 px;
- laptop 1280 px;
- escritorio 1440 px o más.

En móvil:

- sidebar pasa a drawer;
- header compacto sin desbordamiento;
- acciones primarias accesibles;
- tablas con estrategia responsive definida;
- filtros plegables cuando ocupen demasiado;
- formularios a una columna;
- diálogos adaptados al viewport;
- cards sin texto cortado;
- calendario con alternativa de lista;
- no depender de hover;
- áreas táctiles apropiadas;
- evitar scroll horizontal de toda la página.

No basta con añadir `flex-col` en algunos breakpoints. Comprobar las páginas completas.

---

# 14. ACCESIBILIDAD Y CALIDAD DE INTERACCIÓN

Aplicar buenas prácticas WCAG razonables:

- contraste de texto;
- focus visible;
- orden lógico de tabulación;
- labels reales;
- `aria-label` solo cuando sea necesario;
- botones y enlaces semánticos;
- no utilizar `div` clicables sin semántica;
- teclado para menús y diálogos;
- mensajes de error asociados al campo;
- estados comunicados además del color;
- respetar `prefers-reduced-motion`;
- no usar animaciones que retrasen el trabajo.

El usuario debe entender qué se puede pulsar, qué ocurrió y qué debe hacer después.

---

# 15. ESTADOS DE PÁGINA OBLIGATORIOS

Cada pantalla que consume datos debe definir:

1. **Loading:** skeleton o indicador consistente, sin saltos de layout excesivos.
2. **Empty:** explicación específica y acción útil si procede.
3. **Error:** mensaje comprensible y reintento cuando sea posible.
4. **Success:** feedback después de mutaciones.
5. **Forbidden/not found:** estado apropiado sin filtrar información sensible.
6. **Disabled/pending:** controles con razón clara cuando sea pertinente.

Evitar spinners eternos, pantallas en blanco, errores silenciosos y botones que no hacen nada.

---

# 16. ARQUITECTURA FRONTEND Y ESTRATEGIA DE RECONSTRUCCIÓN

## 16.1 Auditar, después diseñar

Antes de editar código, inspecciona los archivos reales y genera un mapa de:

- layouts por rol;
- componentes compartidos;
- páginas;
- APIs por página;
- dependencias UI;
- estilos;
- problemas de navegación;
- funciones que no deben romperse.

No devuelvas una auditoría extensa al usuario antes de empezar si puede avanzar internamente. Usa ese mapa para implementar de forma ordenada.

## 16.2 Separar apariencia de lógica

Cuando sea posible:

- conservar hooks de datos;
- conservar llamadas API;
- conservar validaciones;
- conservar handlers y reglas de permisos;
- reemplazar markup y estilos;
- extraer componentes visuales reutilizables;
- evitar duplicar lógica de fetch o mutación.

No mezclar en una misma operación un rediseño masivo y una refactorización de negocio innecesaria.

## 16.3 Design tokens

Centralizar colores, radios, sombras, tipografía y spacing en el sistema actual. Definir nombres semánticos como `--color-brand`, `--surface`, `--text-primary`, `--border`, `--status-success`, etc. El resto de componentes debe consumir tokens, no repetir hexadecimales.

## 16.4 Componentes compartidos

Identificar oportunidades para crear componentes como:

- `DashboardLayout`;
- `PageHeader`;
- `SectionHeader`;
- `StatCard`;
- `AttentionPanel`;
- `DataTable` o patrón de tabla;
- `StatusBadge`;
- `EmptyState`;
- `ErrorState`;
- `LoadingSkeleton`;
- `FilterBar`;
- `SearchInput`;
- `ConfirmDialog`;
- `FormField`;
- `UserAvatar`;
- `ActivityTimeline`.

Los nombres son ilustrativos. No dupliques componentes existentes si cumplen bien el propósito; adapta o consolida los actuales.

## 16.5 No crear una abstracción universal prematura

No intentes convertir todas las páginas en una plantilla genérica configurable con decenas de props. Compartir los patrones que realmente son comunes y mantener composición específica donde haya necesidades distintas.

---

# 17. FASES DE IMPLEMENTACIÓN

La reconstrucción debe hacerse por fases. No intentes cambiar todas las rutas de golpe sin checkpoints.

## Fase 0 — Inventario técnico y baseline

- confirmar rama y estado del working tree;
- identificar scripts disponibles;
- localizar layouts, páginas, componentes, estilos, rutas y APIs;
- verificar librerías existentes;
- ejecutar baseline de lint/typecheck/build si los scripts y el entorno lo permiten;
- registrar errores preexistentes para no atribuirlos falsamente al rediseño;
- crear un inventario breve de rutas por rol;
- no usar `.md` antiguos como verdad funcional.

**Salida:** mapa técnico conciso y lista de riesgos. No cambiar backend ni datos.

## Fase 1 — Sistema visual fundacional

- crear paleta/tokens;
- establecer tipografía, spacing, radios, bordes y sombras;
- normalizar botones, campos, badges, cards, diálogos, tablas, toast y estados;
- validar tema claro y mantener el oscuro si ya existe;
- no rediseñar aún todas las páginas;
- crear una página interna de demostración/story gallery si ayuda a validar componentes, sin añadir rutas públicas ni datos falsos al producto.

**Criterio de aceptación:** componentes consistentes y utilizables, con tokens centralizados y sin romper los formularios existentes.

## Fase 2 — Layout compartido y navegación

- rediseñar shell, sidebar, header y área de contenido;
- definir agrupación por rol;
- preservar rutas existentes;
- implementar drawer móvil;
- mantener autenticación y redirecciones;
- verificar selección de ruta activa, navegación anidada y colapso;
- garantizar que no se muestren enlaces muertos.

**Criterio de aceptación:** los tres roles cuentan con estructura consistente, navegación comprensible y responsive.

## Fase 3 — ADMIN

Rediseñar las pantallas existentes de ADMIN en grupos:

1. dashboard;
2. usuarios y detalle;
3. solicitudes;
4. procesos/radicados/tareas;
5. agenda/documentos/notificaciones;
6. alertas/actividad/auditoría/operación/métricas;
7. cuenta y demás páginas privadas existentes que correspondan.

No trabajar sobre el CMS/contenido público. Mantener sus rutas sin dedicarles rediseño.

**Criterio de aceptación:** cada página existente de ADMIN conserva su funcionalidad y presenta el nuevo sistema visual.

## Fase 4 — ABOGADO_ADMIN

Rediseñar:

1. dashboard;
2. procesos/listado/detalle y subpáginas;
3. radicados/detalles;
4. clientes/listado/detalle;
5. tareas/listado/detalle;
6. agenda;
7. documentos/contratos;
8. chat/solicitudes/notificaciones;
9. perfil/configuración/métricas.

**Criterio de aceptación:** experiencia de trabajo coherente; contexto del proceso claro; sin duplicar lógica ni perder capacidades.

## Fase 5 — CLIENTE

Rediseñar:

1. dashboard;
2. procesos/listado/detalle;
3. tareas;
4. documentos;
5. calendario;
6. mensajes/chat;
7. notificaciones;
8. perfil/configuración/ayuda.

**Criterio de aceptación:** lenguaje claro, navegación simple, información limitada a los recursos autorizados y acciones reales funcionando.

## Fase 6 — Pulido transversal

- responsive por rutas;
- accesibilidad;
- loading/empty/error/success;
- consistencia de estados;
- overflow y layouts densos;
- formularios largos;
- menús y diálogos;
- dark mode si existe;
- rendimiento y eliminación de estilos duplicados;
- revisar que no se hayan modificado páginas públicas.

## Fase 7 — Validación y regresión

- lint;
- typecheck;
- tests disponibles;
- build de frontend;
- revisar consola y errores de runtime;
- probar flujos principales con datos reales de desarrollo si el entorno lo permite;
- comprobar acceso de cada rol;
- comprobar rutas directas y navegación interna;
- comprobar acciones CRUD;
- comprobar uploads/downloads si existen;
- documentar fallos preexistentes y fallos introducidos.

No afirmar que se probó algo que no pudo ejecutarse.

---

# 18. MATRIZ DE PRUEBAS FUNCIONALES

Probar, según lo que realmente exista:

## ADMIN

- inicio de sesión y entrada al panel correcto;
- navegar por cada grupo;
- abrir detalle de usuario;
- filtrar/buscar usuarios;
- crear/editar según permisos;
- revisar y tramitar solicitudes;
- navegar a procesos/radicados/tareas;
- consultar alertas, actividad y auditoría;
- consultar operación sin exponer errores al usuario final;
- menú de cuenta/cierre de sesión.

## ABOGADO_ADMIN

- entrada al panel correcto;
- listar y abrir procesos;
- abrir detalle y subpáginas;
- navegar entre radicados y actuaciones;
- consultar clientes y detalle;
- crear/editar/completar tareas según reglas;
- consultar agenda;
- cargar/descargar documentos cuando exista;
- abrir chat y notificaciones;
- editar perfil/configuración.

## CLIENTE

- entrada al portal correcto;
- consultar únicamente procesos propios;
- abrir detalle;
- consultar tareas permitidas;
- cargar/descargar documentos permitidos;
- consultar calendario y notificaciones;
- usar mensajes/chat si están implementados;
- solicitar cambios de perfil cuando corresponda;
- cambiar preferencias disponibles.

## Transversal

- refresh en una ruta interna;
- rutas con parámetros;
- responsive;
- loading/error/empty;
- sesión expirada;
- permisos insuficientes;
- ninguna acción principal debe ser decorativa o no funcional.

---

# 19. RESTRICCIONES DE SEGURIDAD

- No debilitar auth ni autorización.
- No confiar en ocultar botones como control de acceso.
- No mostrar datos de otros clientes.
- No exponer tokens, secretos, trazas o información sensible.
- No cambiar reglas de negocio para facilitar una demo.
- No añadir mocks como sustitutos permanentes de API real.
- No alterar variables de entorno ni credenciales.
- No realizar migraciones de base de datos para cambios puramente visuales.
- Si detectas una limitación de backend que impide una función, documentarla; no inventes datos ni simules éxito.

---

# 20. CRITERIOS DE ACEPTACIÓN GLOBALES

La reconstrucción está completa solo si:

1. Existe una paleta centralizada basada en `#002060` y `#CCB56B`, con neutrales y colores semánticos.
2. Botones, campos, cards, tablas, badges, diálogos y estados comparten reglas visuales.
3. Los tres roles tienen jerarquía de navegación diferenciada y coherente.
4. La composición de cada dashboard refleja el trabajo real del rol.
5. Todas las páginas privadas existentes relevantes fueron revisadas, no solo las landing pages de cada panel.
6. La interfaz es usable en móvil, tablet y escritorio.
7. Las funciones existentes continúan funcionando.
8. No se sustituyen APIs por datos ficticios.
9. No se debilitan permisos ni seguridad.
10. No se rediseña el sitio público ni el CMS.
11. No hay botones o filtros falsos.
12. Lint/typecheck/build se ejecutan cuando el entorno lo permite; los resultados se reportan con honestidad.
13. No se dejan errores nuevos conocidos sin corregir o documentar.

---

# 21. PROTOCOLO OBLIGATORIO PARA EL AGENTE

## 21.1 No hacer una implementación superficial

No consideres terminada una página por cambiar colores, bordes y padding. Debes reconsiderar la jerarquía y distribución de contenido según la función de la página.

Para cada pantalla, decide explícitamente:

- cuál es la acción primaria;
- qué información es más importante;
- qué puede quedar secundario;
- qué filtros necesita;
- cómo se entiende el estado;
- cómo funciona en móvil;
- qué estados de carga/error/vacío requiere.

## 21.2 Trabajar por lotes coherentes

No modificar todo el repositorio en una sola operación gigantesca. Trabajar por fases y grupos de páginas relacionados. Sin embargo, no detenerse después de entregar solo un plan: el objetivo es implementar la reconstrucción.

## 21.3 No detenerse a pedir aprobación por decisiones visuales menores

Toma decisiones profesionales coherentes con esta especificación. Si hay una decisión irreversible de negocio, riesgo de datos, cambio de API incompatible o falta de acceso, detente y explica el bloqueo. No preguntes por cada color, espaciado o disposición.

## 21.4 Mantener trazabilidad

Al terminar cada fase, informar brevemente:

- fase terminada;
- principales archivos modificados;
- componentes nuevos/consolidados;
- rutas cubiertas;
- validaciones ejecutadas;
- fallos preexistentes;
- bloqueadores reales.

Actualizar este documento solo en una sección de progreso si se necesita, sin reescribirlo por completo.

## 21.5 Continuidad entre sesiones

Al iniciar una nueva sesión:

1. leer este documento;
2. revisar `git status`;
3. identificar la última fase terminada a partir del código y del resumen de progreso;
4. inspeccionar solo los archivos necesarios para continuar;
5. no volver a auditar todo el repositorio si ya hay un inventario fiable;
6. continuar con la siguiente fase pendiente.

## 21.6 No crear commits ni desplegar automáticamente

No hacer push, commit, despliegue, migraciones destructivas ni cambios externos sin una instrucción explícita del usuario. Mantener los cambios locales o en el entorno de trabajo que use el agente.

---

# 22. INSTRUCCIÓN DE EJECUCIÓN PARA PEGAR EN AGENTE

**Implementa este documento como una reconstrucción real de la interfaz, no como una auditoría ni como una lista de recomendaciones.** Empieza por la Fase 0: inspecciona el código actual y establece el baseline; ignora los documentos `.md` funcionales desactualizados como fuente de verdad. Después avanza secuencialmente por las fases, completando cada una con cambios concretos en el código y verificaciones. Prioriza el sistema visual, los layouts y la navegación; luego rediseña todas las páginas privadas existentes de ADMIN, ABOGADO_ADMIN y CLIENTE. No trabajes en el contenido público ni en el CMS. Conserva APIs, reglas de negocio, autenticación y permisos. No uses datos mock para simular funcionalidad. No hagas refactors ajenos al rediseño. No pares después de describir lo que harías: implementa. Si una fase es demasiado amplia para una sola sesión, completa un grupo coherente de páginas, deja progreso preciso y continúa en la siguiente sesión sin repetir trabajo. Al finalizar, ejecuta las validaciones disponibles y entrega un resumen concreto de lo implementado y de cualquier limitación real.

---

# 23. PROMPT CORTO PARA CONTINUAR EN SESIONES POSTERIORES

Una vez que el agente haya comenzado el trabajo, usa este mensaje en nuevas sesiones:

> Lee `plan-ui.md` y revisa `git status`. Continúa desde la primera fase o grupo de páginas incompleto, según el código real; no repitas la auditoría inicial ni rehagas trabajo ya completado. Implementa el siguiente bloque de la reconstrucción visual de los paneles privados, siguiendo los tokens, patrones, permisos y criterios del documento. No toques el sitio público/CMS. Conserva la funcionalidad existente, ejecuta las validaciones pertinentes, actualiza el progreso y deja claro qué quedó terminado y qué sigue.
