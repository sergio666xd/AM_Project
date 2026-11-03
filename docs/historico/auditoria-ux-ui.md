# Auditoría UX/UI del sistema

**Fecha:** 10 de octubre de 2026
**Estado:** Fase 2 completada; evaluación estática de la interfaz.
**Agrupación:** aprobada por el usuario al completar la Fase 1.

## Alcance y método

Se revisaron las rutas de página bajo `frontend-saas/app`, sus componentes principales y los componentes compartidos de navegación, formularios, tablas, diálogos, estados vacíos y carga. La puntuación describe lo que permite inferir el código fuente; no es una certificación WCAG ni una inspección visual en navegador. Contraste final, tamaños renderizados y comportamiento real con lectores de pantalla requieren verificación en ejecución.

La escala es de 1 a 5: **1** bloquea o dificulta gravemente la tarea; **2** tiene barreras frecuentes; **3** permite completar la tarea con fricciones; **4** es consistente con problemas menores; **5** hace la tarea clara, accesible y predecible en los contextos revisados. Las cuatro cifras en las tablas siguen este orden: **Accesibilidad / Responsividad / Usabilidad / Carga cognitiva**.

El umbral de 44 × 44 px se usa como meta de diseño solicitada en la Fase 1. WCAG 2.2 AA tiene un criterio de tamaño mínimo de 24 × 24 CSS px con excepciones, y el criterio mejorado de 44 × 44 px es AAA. Se observaron componentes menores de 44 px; esto no implica por sí solo una declaración de incumplimiento WCAG. [W3C: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [W3C: Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html).

## Análisis de brechas de arquitectura

La aplicación ya tiene piezas reutilizables como `LoadingState`, `EmptyState`, `Modal`, `ConfirmDialog`, páginas de error y `RoleGate`, pero su uso no es uniforme entre rutas. La única frontera de error de ruta detectada está en administración de contenido; varios flujos muestran errores y cargas localmente, mientras que otras páginas no tienen una pantalla equivalente. Las siguientes pantallas reducirían callejones sin salida y harían más uniforme la recuperación:

| Prioridad | Pantalla nueva propuesta | Ruta sugerida | Motivo y alcance |
|---|---|---|---|
| Alta | Entradas separadas para firma, SaaS y administración | Sitio público; `admin.alejandramunozabogada.com`; `panel.alejandramunozabogada.com`; SaaS en `/gestion-procesos/dashboard` | La firma ya presta servicios mientras que el SaaS puede estar en prelanzamiento. La página pública debe conservar el acceso a los servicios de la firma independientemente del estado comercial del SaaS. El acceso de administración debe tener una entrada propia fuera de la navegación pública. Los hosts indicados son el destino propuesto y requieren configuración de dominio/rutas antes de estar activos. |
| Alta | Página no encontrada | `app/not-found.tsx` | Explicar que la ruta o recurso no existe y dar accesos a inicio público e inicio del portal del usuario autenticado. Evita páginas vacías al abrir enlaces antiguos o identificadores inválidos. |
| Alta | Error recuperable de aplicación | `app/error.tsx` y fronteras de segmento para los portales | Ofrecer reintento, navegación de salida y un identificador de diagnóstico. Reutilizar el patrón existente en `admin/contenido/error.tsx`; el límite global debe preservar el diseño de cada segmento donde sea posible. |
| Media | Acceso restringido | `app/gestion-procesos/acceso-restringido` o estado contextual en `RoleGate` | Cuando la sesión existe pero el rol no permite ver una ruta, explicar el motivo y enlazar al panel correcto. Hoy `RoleGate` redirige al inicio del rol, lo que puede sentirse como navegación inesperada. |
| Media | Carga de navegación de portal | `loading.tsx` en segmentos `admin`, `abogado` y `cliente` | Establecer una espera reconocible durante transiciones y carga inicial, usando esqueletos acordes con el contenido de cada sección. `LoadingState` ya ofrece una base compartida. |
| Media | Bienvenida y configuración inicial | Estado inicial dentro del portal del cliente y del abogado | Orientar a una cuenta sin procesos, documentos o tareas: explicar qué aparecerá y cuál es el siguiente paso. Algunos listados ya tienen estados vacíos, pero no forman una guía inicial común. |
| Baja | Solicitud completada / resultado de operación | Estado de resultado reutilizable en flujos administrativos y de cuenta | Confirmar cambios importantes (aprobación, seguridad, carga o revisión) con resumen del resultado y enlace al elemento. Preferir estado contextual si no amerita una ruta propia. |

Estas son brechas de experiencia, no instrucciones de implementación para esta fase. No se añaden porque la Fase 2 no contempla escribir componentes.

## Evaluación por bloques funcionales

### 1. Sitio público

Rutas: `/`, `/areas-de-practica`, `/contacto`, `/quienes-somos`, `/filosofia`, `/poliza-juridica`, `/politica-de-privacidad`, `/tratamiento-de-datos` y `/gestion-procesos`.

| Páginas evaluadas | A / R / U / C | Aspectos a mejorar | Elementos a añadir |
|---|---:|---|---|
| Inicio, áreas de práctica, quiénes somos, filosofía y póliza jurídica | 3 / 4 / 4 / 4 | La estructura usa jerarquía de títulos, secciones y rejillas responsivas. La navegación móvil depende de un menú desplegable; verificar cierre con Escape, foco y objetivos de toque. Los colores de marca están escritos directamente en varias páginas, por lo que contrastes y consistencia deben comprobarse por combinación. | Verificación de contraste y foco; estados claros de enlace activo y una ruta de contacto visible al final de cada página de servicio. |
| Contacto | 3 / 4 / 4 / 3 | La acción de contacto se resuelve principalmente en correo y WhatsApp; quien prefiera explicar su caso desde la web debe cambiar de aplicación. Revisar que la información de contacto y los CTA sean fáciles de ubicar en móvil. | Confirmación de disponibilidad y horarios, más una alternativa de consulta web con confirmación de envío si la firma desea captar solicitudes dentro del sitio. |
| Privacidad y tratamiento de datos | 3 / 4 / 3 / 3 | Son documentos extensos en una columna de lectura. Hace falta comprobar navegación por encabezados, fecha de actualización y legibilidad en móvil; no se observa índice de secciones en el componente legal compartido. | Índice anclado para documentos largos, enlace de regreso al inicio del documento y fecha de actualización presentada de forma consistente. |
| Gestión de procesos pública y formulario de interés | 3 / 4 / 3 / 3 | Esta página presenta el producto SaaS y tiene dos estados comerciales: prelanzamiento y servicio lanzado. El estado del SaaS no debe ocultar ni desactivar la oferta de servicios jurídicos de la firma, que ya está activa. El botón «Gestión de procesos» del menú público debe seguir visible y operativo en ambos estados, pero la página debe dejar claro si se refiere a los servicios de la firma o al producto SaaS. | Separar claramente los ámbitos **Firma** y **SaaS**. En prelanzamiento del SaaS, mostrar su propuesta y el formulario de interés, conservando el botón de menú y los CTA de servicios activos de la firma. Al lanzarse el SaaS, mostrar sus planes y el flujo de registro, también sin reemplazar los servicios de la firma. Mantener separados beneficios, funcionalidades, precios y estados comerciales. |

### 2. Acceso y recuperación

Rutas: `/gestion-procesos/auth/login`, `registro`, `recuperar-password`, `restablecer-password` y `cambiar-password`.

| Páginas evaluadas | A / R / U / C | Aspectos a mejorar | Elementos a añadir |
|---|---:|---|---|
| Inicio de sesión | 3 / 4 / 3 / 3 | El acceso ofrece recuperación y redirección segura de vuelta al destino. La entrada de administración debe separarse de la autenticación presentada en el contenido público; el acceso administrativo no debe aparecer como enlace o CTA del sitio público. Revisar asociación explícita de etiquetas, anuncio de error y preservación del destino al ingresar. | Acceso de administración dedicado bajo `admin.alejandramunozabogada.com`, separado de la entrada pública. El portal de cliente y abogado se alojaría bajo `panel.alejandramunozabogada.com`. Mantener el SaaS bajo `/gestion-procesos/dashboard`; llevar a cada persona al ámbito que corresponde a su rol sin ofrecer el acceso admin desde el contenido público. |
| Registro | 3 / 4 / 3 / 2 | El formulario reúne datos de cuenta, plan y soporte de pago; ese volumen puede sentirse denso. Los planes se cargan desde API, por lo que error, carga y ausencia de planes deben quedar diferenciados. | Formulario progresivo o agrupado por pasos, resumen de datos antes del envío y explicación de formatos/tamaño antes de cargar soporte. |
| Recuperar y restablecer contraseña | 4 / 4 / 4 / 4 | El restablecimiento distingue enlace inválido, error y éxito. Mantener mensajes que no revelen si una dirección existe y explicar el vencimiento del enlace antes de que el usuario envíe. | Acción clara para solicitar un enlace nuevo y una confirmación de envío que indique revisar correo y spam sin filtrar existencia de cuenta. |
| Cambio de contraseña de primer ingreso | 2 / 4 / 3 / 3 | El formulario usa placeholders como identificación de los campos en vez de etiquetas persistentes; los mensajes de error están en texto pero deben quedar asociados al formulario. | Etiquetas visibles, mostrar/ocultar contraseña, reglas al lado del campo y foco automático en el primer error. |

### 3. Dashboard compartido y rutas de compatibilidad

Rutas: `/gestion-procesos/dashboard`, `dashboard/tareas`, `dashboard/tareas/[id]`, `dashboard/radicados` y `dashboard/radicados/[id]`.

| Páginas evaluadas | A / R / U / C | Aspectos a mejorar | Elementos a añadir |
|---|---:|---|---|
| Dashboard y navegación antigua | 3 / 4 / 3 / 3 | `/dashboard` redirige a abogado y su layout restringe el rol ABOGADO. La coexistencia de rutas de compatibilidad con portales por rol puede hacer difícil saber cuál es la URL canónica y mantener los enlaces profundos. | Redirecciones documentadas y consistentes por rol; breadcrumb y enlaces siempre hacia las rutas canónicas del portal actual. |
| Detalle y listas de tareas/radicados del dashboard | 3 / 3 / 3 / 3 | Se conserva una experiencia común para rutas heredadas, pero convive con páginas específicas de abogado y cliente. En pantallas estrechas, revisar filtros, navegación de detalle y tablas/listados densos. | Estado de transición al cambiar de listado a detalle, volver preservando filtros y filtros compactos o tarjetas en móvil. |

### 4. Portal del cliente

Rutas actuales: `/gestion-procesos/cliente`, `procesos`, `procesos/[id]`, `documentos`, `tareas`, `calendario`, `ayuda`, `mensajes`, `chat`, `notificaciones`, `configuracion` y `perfil`. El objetivo propuesto es servir los portales de cliente y abogado bajo `panel.alejandramunozabogada.com`.

| Páginas evaluadas | A / R / U / C | Aspectos a mejorar | Elementos a añadir |
|---|---:|---|---|
| Inicio y lista/detalle de procesos | 3 / 4 / 3 / 3 | El resumen es legible, pero en móvil sus cuatro métricas se apilan y retrasan el contenido secundario. La lista funciona bien con búsqueda y estado; el detalle pone estado y accesos a documentos, tareas, actividad, radicados y chat arriba, pero la cronología queda debajo y el botón flotante puede cubrirla. | Considerar dos columnas para métricas breves en móvil; conservar el filtro de estado y dejar margen inferior en el detalle para el chat flotante. |
| Documentos y solicitudes | 3 / 3 / 3 / 3 | En captura móvil los controles nativos de archivo aparecen en inglés; la acción de entrega se habilita tras seleccionar un archivo y puede quedar parcialmente tapada por el chat flotante. El progreso por solicitud sí deja claro cuántos elementos faltan. | Control de carga etiquetado en español con nombre, formato, tamaño, progreso y error por archivo; espacio inferior protegido para completar entregas. |
| Tareas y calendario | 3 / 3 / 3 / 3 | La tarea se muestra tanto en «Fechas próximas» como en «Pendientes», lo que repite contenido y extiende la página. La vista de lista del calendario se adapta bien, pero las filas estrechas acercan el enlace de acción al texto del evento. | Mostrar próximas fechas como resumen enlazado en vez de duplicar la tarjeta; conservar lista para móvil y separar visualmente título, proceso y acción. |
| Notificaciones | 3 / 4 / 3 / 3 | El tipo, la fecha, el título y la acción se distinguen en escritorio y móvil. En móvil, marcar todo, actualizar, filtro y acciones por aviso ocupan varias filas; el estado leído/no leído depende bastante del fondo. | Compactar acciones globales, reforzar el estado leído con texto o icono además del color y proteger la última notificación del botón flotante. |
| Ayuda, configuración, perfil y seguridad | 3 / 4 / 3 / 3 | La ayuda usa preguntas con enlaces, y los cambios sensibles pasan por ventanas de seguridad. Mantener claros método de OTP, caducidad, reenvío y cancelación; datos del perfil y preferencias deben tener límites de edición evidentes. | Ayuda contextual desde carga de documentos y tareas, resumen del canal de notificación activo y estado/tiempo restante del código en el diálogo de seguridad. |
| Chat | 3 / 4 / 4 / 3 | Conversaciones agrupadas por proceso, Markdown, referencias, estado entregado/leído y botón flotante cubren casos clave. La actualización cada cinco segundos debe comunicar cuándo hay datos nuevos; en móvil el chat flotante compite con el botón de envío y el teclado virtual. | Accesos a conversación con nombre comprensible, anuncio accesible de mensajes nuevos, foco/teclado consistente y diseño probado con teclado móvil y lectores de pantalla. |

### 5. Portal del abogado

Rutas actuales: `/gestion-procesos/abogado`, `metricas`, `clientes`, `clientes/[id]`, `procesos`, `procesos/[id]`, `procesos/[id]/[subpagina]`, `radicados`, `radicados/[id]`, `tareas`, `tareas/[id]`, `agenda`, `documentos`, `contratos`, `notificaciones`, `configuracion`, `perfil`, `solicitudes-perfil` y `chat`. El portal de abogado compartiría `panel.alejandramunozabogada.com` con el de cliente.

| Páginas evaluadas | A / R / U / C | Aspectos a mejorar | Elementos a añadir |
|---|---:|---|---|
| Inicio y métricas/carga de trabajo | 3 / 4 / 4 / 3 | En escritorio hay tres tarjetas de acceso, ocho indicadores y paneles de atención/actividad. En móvil, el apilado vertical demora la llegada a actividad reciente; algunas métricas se repiten entre bloques. | Subir tareas, vencimientos y alertas accionables; plegar métricas secundarias y explicar periodo/criterio de cada conteo. |
| Clientes y perfiles | 3 / 3 / 3 / 3 | El listado combina búsqueda, selección y operaciones; verificar densidad de columnas en móvil y mantener visibles las acciones prioritarias. Perfil contiene datos de contrato además de datos de cuenta, que son conceptos distintos. | Secciones «Cuenta» y «Datos para documentos legales» separadas, guardado por sección y resumen de cambios pendientes. |
| Procesos y subpáginas | 3 / 3 / 3 / 2 | La lista se ajusta al móvil, aunque algunos indicadores visibles en escritorio no aparecen en el resumen móvil. En la ficha, la barra de pestañas se recorta horizontalmente y no deja claro que hay más secciones; el campo Descripción de una sola línea corta textos largos. Las rutas actuales no cumplen la expectativa de `/proceso/[id]/subpagina`. | Convertir secciones principales en subpáginas reales con URL propia, navegación contextual y regreso preservando el contexto; usar textarea o vista expandible para Descripción y mantener indicadores consistentes entre tamaños. |
| Radicados y actuaciones | 3 / 3 / 3 / 3 | Búsqueda, consultas y actuaciones son operaciones distintas dentro del mismo dominio. Los listados y el historial cronológico pueden resultar difíciles de recorrer cuando hay muchas actuaciones. | Filtros por proceso, estado y rango de fechas; agrupación por fecha y carga progresiva del historial. |
| Tareas, agenda y documentos | 3 / 3 / 3 / 3 | La tabla de tareas funciona en escritorio y se vuelve tarjeta en móvil, pero las acciones quedan por debajo del contenido inicial. En agenda, filtros de responsable, proceso, cliente y tipo se apilan antes de la vista; en documentos, filtros y cuatro contadores preceden a las carpetas y empujan el trabajo principal bajo el primer viewport. | Mostrar acciones principales de tarea dentro de la tarjeta móvil; plegar filtros secundarios de agenda y exponer rango consultado en estados vacíos; reducir/plegar contadores de documentos para adelantar carpetas y solicitudes. |
| Contratos y documentos legales | 3 / 3 / 3 / 3 | La generación y carga del escaneado contienen pasos de distinto riesgo. Estado del contrato, firma y archivo deben distinguirse visualmente y la vista previa requiere un estado de carga perceptible. | Asistente por etapas: seleccionar plantilla, completar datos, revisar PDF, emitir, agendar firma y cargar firmado; resumen de estado en lista. |
| Notificaciones, chat, configuración y solicitudes de perfil | 3 / 4 / 3 / 3 | Hay pantallas separadas y el chat tiene capacidades avanzadas. En configuración hay muchas preferencias por tipo/canal, lo que dificulta encontrar qué controla cada aviso. | Agrupar preferencias por actividad y canal, con valores actuales explícitos; filtros guardables en notificaciones y chat. |

### 6. Administración: usuarios y expedientes

Rutas actuales: `/gestion-procesos/admin`, `metricas`, `usuarios`, `usuarios/nuevo`, `usuarios/[id]`, `procesos`, `radicados`, `tareas`, `documentos`, `documentos/solicitudes`, `documentos/contratos`, `contratos`, `solicitudes`, `solicitudes-perfil`, `global/[recurso]` y `saas/[recurso]`. El objetivo propuesto es exponer este portal en `admin.alejandramunozabogada.com`; el host no está configurado por este informe.

| Páginas evaluadas | A / R / U / C | Aspectos a mejorar | Elementos a añadir |
|---|---:|---|---|
| Panel principal y métricas | 3 / 4 / 4 / 3 | La captura muestra tarjetas, accesos rápidos y actividad reciente en una jerarquía reconocible. En móvil todas las métricas se apilan y hacen largo el recorrido; el sidebar de escritorio contiene varios grupos y requiere desplazamiento. | En móvil priorizar alertas y accesos de uso frecuente antes de métricas secundarias; permitir plegar grupos del sidebar y dejar más espacio al contenido bajo el botón flotante. |
| Usuarios, creación y detalle | 3 / 3 / 3 / 3 | La captura de usuarios quedó bloqueada por una respuesta HTTP 500 de la API; la interfaz muestra «No se pudo conectar», aunque el servidor sí respondió. No se pudieron observar filas, densidad de acciones ni adaptación de la tabla. | Distinguir error de servidor de error de conexión y repetir revisión visual cuando el endpoint cargue; luego valorar tabla/tarjetas, filtros y controles masivos en móvil. |
| Procesos, radicados, tareas y documentos de firma | 3 / 3 / 3 / 2 | Varias rutas sectoriales reutilizan `AdminResourcePage`; esa reutilización mantiene patrones pero puede hacer menos evidente la diferencia entre recursos y estados. El componente central es grande y la administración global mezcla sectores. | Encabezado contextual por recurso y sector, filtros persistentes y acceso uniforme a detalle sin depender de conocer el identificador. |
| Solicitudes y solicitudes de perfil | 3 / 3 / 3 / 3 | Las decisiones de aprobación requieren revisar documentación y asignación. Hace falta priorizar pendientes, explicar criterios y prevenir cambios irreversibles sin contexto. | Cola priorizada, lista de verificación antes de aprobar/rechazar y motivo obligatorio con resultado notificable. |
| Contratos y documentos contractuales | 3 / 3 / 3 / 3 | Las páginas generales y de documentos contractuales pueden resultar duplicadas si no se explica cuál administra estados y cuál consulta archivos. | Separación explícita «gestionar contrato» y «consultar archivo firmado», con enlaces recíprocos y permisos visibles. |
| Inventarios globales y SaaS | 3 / 3 / 3 / 2 | Los recursos dinámicos dependen de una ruta `[recurso]`; el usuario debe reconocer el contexto de sector para evitar confundir inventarios. | Breadcrumb con sector + recurso, descripción del alcance de datos y controles de sector persistentes. |

### 7. Administración: operación y configuración

Rutas: `/gestion-procesos/admin/operacion`, `operacion/consultas`, `operacion/integraciones`, `operacion/mensajes`, `operacion/notificaciones`, `actividad`, `auditoria`, `alertas`, `agenda`, `notificaciones`, `notificaciones/entregas`, `contenido`, `cuenta`, `firma` y `planes`.

| Páginas evaluadas | A / R / U / C | Aspectos a mejorar | Elementos a añadir |
|---|---:|---|---|
| Operación, consultas e integraciones | 3 / 3 / 3 / 3 | Las subsecciones separadas ayudan, aunque el resumen, operaciones y gestión de integraciones comparten una zona con alto volumen de información técnica. La consulta debe diferenciar en cola, en proceso, completada y fallida. | Indicadores de estado con explicación, enlace a detalle de ejecución y filtros de entorno/fecha para investigar incidentes. |
| Mensajes del sistema | 3 / 3 / 3 / 3 | Editor de varias plantillas con variables, correo y WhatsApp. La navegación por tipos puede crecer y se debe evitar guardar una plantilla cuyo ejemplo no represente el resultado final. | Búsqueda por tipo, lista de variables disponibles y vista previa por canal con datos de ejemplo y enlaces separados del texto editable. |
| Alertas, notificaciones y entregas | 3 / 3 / 3 / 3 | Filtros, selección y operaciones masivas ya existen; por densidad, el estado de una entrega puede confundirse con lectura de una alerta. Los mensajes largos de correo requieren una vista de detalle más legible que una fila. | Definición persistente de estados, panel de detalle con historial por canal y separación entre alerta interna y entrega externa. |
| Actividad y auditoría técnica | 3 / 3 / 3 / 3 | La auditoría tiene filtros por usuario, acción, módulo, resultado y fecha. La terminología técnica puede ser difícil de interpretar y la eliminación de registros requiere claridad de permisos y alcance. | Glosario de eventos, filtros visibles resumidos y detalle técnico expandible con traducción breve a lenguaje operativo. |
| Agenda de la firma | 3 / 3 / 3 / 3 | Hay vistas por día, semana, mes y listado, selección múltiple y edición. En móvil las cuadrículas son densas; los controles y acciones masivas deben conservar contexto al cambiar de vista. | Vista lista predeterminada en móvil, leyenda de tipos/estados y confirmación que resuma los eventos que cambiarán o se eliminarán. |
| Cuenta, firma, planes y contenido público | 3 / 3 / 3 / 3 | Son áreas con riesgos distintos: credenciales, identidad pública, planes y edición de contenido. La navegación administrativa agrupa varias secciones y algunas rutas tienen nombres amplios. | Separar guardado por sección, mostrar cuándo se guardó por última vez y ofrecer vista previa antes de publicar cambios del sitio o plan. |

### 8. Chat transversal

Rutas: `/gestion-procesos/{cliente,abogado,admin}/chat`, rutas de conversación y el chat flotante disponible fuera de la página de chat completa.

| Páginas evaluadas | A / R / U / C | Aspectos a mejorar | Elementos a añadir |
|---|---:|---|---|
| Lista, grupos de proceso y selección de conversación | 3 / 4 / 4 / 3 | La agrupación por proceso reduce ruido, pero añade un nivel de navegación que necesita indicar cuántas conversaciones tiene el grupo y ordenar por llegada reciente de forma evidente. En móvil hay que comprobar la navegación desde una conversación directa hacia el grupo y que la URL refleje el destino. La lista se actualiza periódicamente. | Estado de grupo abierto/cerrado anunciado, resumen de mensajes no leídos por grupo y orden/fecha explicados en la interfaz; navegación consistente entre lista, grupo y subchat con URL directa recuperable. |
| Conversación completa | 3 / 4 / 4 / 3 | Mensajes agrupados por día, Markdown, referencias y marcas de entrega mejoran el uso. Asegurar que botones circulares de referencia, envío y retorno tengan nombre accesible, foco visible y tamaño táctil suficiente. | Anuncio de mensaje nuevo sin mover el foco, control para pausar el salto automático al último mensaje y selección de referencia con búsqueda cuando existan muchos elementos. |
| Chat flotante | 3 / 3 / 3 / 3 | Aporta acceso rápido, pero en móvil se superpone al contenido y el teclado virtual puede reducir el área de lectura. En la revisión visual también se observó que los mensajes entrantes deben reflejar la agrupación por proceso, que la conversación debe abrir en el mensaje más reciente y que sus mensajes deben cargarse igual que en la vista completa. | Ajuste a pantalla completa en móvil, botón explícito «Abrir chat completo» y retorno a la misma conversación desde ambas vistas; respetar grupos y subchats también en la lista flotante y abrir siempre en el último mensaje. |

### 9. Componentes compartidos de interfaz

Evaluados transversalmente en todos los bloques: `AppShell`, `AdminConsoleShell`, `Sidebar`, `Breadcrumbs`, `GlobalSearch`, `Button`, `DataTable`, `Modal`, `ConfirmDialog`, `EmptyState` y `LoadingState`.

| Componentes | A / R / U / C | Aspectos a mejorar | Elementos a añadir |
|---|---:|---|---|
| Botones, enlaces e iconos | 2 / 4 / 3 / 3 | El componente `Button` ofrece tamaños de 32, 40 y 44 px de alto; `Modal` usa un cierre de 36 px y hay acciones de icono de 36 px en listados. Por tanto, no todos alcanzan la meta táctil de 44 px. El chat flotante comparte espacio móvil con el contenido y teclado, por lo que el botón de envío y los accesos de referencia necesitan objetivos táctiles claros. | Aumentar área interactiva sin inflar visualmente el icono, mantener separación entre controles y documentar excepciones para controles densos de escritorio; comprobar que envío y referencias sigan siendo accesibles con teclado virtual abierto. |
| Tablas y listados | 3 / 3 / 3 / 3 | `DataTable` permite desplazamiento horizontal y ancho mínimo de 640 px, opción funcional pero costosa en móvil. Muchos listados agregan sus propios filtros y acciones, con patrones variables. | Columnas prioritarias en móvil, alternativa de tarjetas/lista, encabezados ordenables anunciados y patrón común de paginación/selección. |
| Modales y confirmaciones | 3 / 3 / 4 / 3 | `Modal` incluye foco inicial, trampa de foco, Escape y retorno del foco. El botón de cierre no llega a 44 px; verificar que los diálogos creados manualmente compartan estas mismas garantías. | Unificar diálogos manuales en el componente común y ampliar objetivo táctil de cierre. |
| Estados de carga, error y vacío | 3 / 4 / 3 / 3 | `LoadingState` anuncia estado y `EmptyState` es reutilizable, pero páginas similares alternan esqueletos, spinners y texto; algunos flujos gestionan su propio error. En la lista de usuarios, un error HTTP 500 de la API aparece como fallo de conexión; el mensaje debe distinguir servidor, red y ausencia de datos para orientar la recuperación. | Convención común: carga inicial, actualización, error recuperable, sin resultados filtrados y estado vacío real, cada uno con acción siguiente clara; comunicar errores HTTP y de red por separado, conservando el detalle útil sin exponer información técnica sensible. |
| Navegación y búsqueda | 3 / 3 / 3 / 3 | Hay shells y breadcrumbs por área, más buscador global para ciertos roles. La jerarquía del sidebar administrativo tiene secciones global, firma, SaaS y sitio público; el volumen puede dificultar encontrar destinos. En móvil los breadcrumbs del abogado se parten en varias líneas, y las pestañas del expediente no muestran con claridad el desbordamiento horizontal. | Búsqueda de navegación, distinguir enlaces visibles por rol y preservar breadcrumb/retorno en rutas de detalle; compactar breadcrumbs móviles y hacer evidente la navegación adicional del expediente. |

## Priorización general de hallazgos

1. **Accesibilidad táctil y foco:** unificar alturas/áreas de botones, cierres de diálogo y herramientas de formato. La paleta usa variables de tema para el portal, pero las páginas públicas escriben colores de marca directamente; hace falta medir contraste en ambos temas.
2. **Complejidad de expedientes y administración:** el detalle del proceso mantiene muchas secciones en un componente con pestañas; inventarios administrativos reutilizan una página genérica. Mejorar arquitectura de información antes de añadir más controles.
3. **Consistencia de estados:** normalizar carga, error, vacío, sin resultados, confirmación y acciones que tardan para que cada rol reciba la misma retroalimentación.
4. **Móvil para trabajo denso:** priorizar tablas administrativas, calendario, documentación y chat, incluyendo teclado virtual y objetivos de toque.
5. **Orientación:** añadir recuperación de rutas rotas, acceso restringido explicativo y guía inicial para cuentas sin datos.

## Conclusión de Fase 2

La arquitectura tiene una base funcional amplia y varios patrones reutilizables, pero las fricciones principales se concentran en densidad de expedientes y administración, uniformidad de pantallas de estado y controles táctiles pequeños. Las notas son una línea base para decidir por qué bloque empezar; no se modificó código de interfaz en esta fase.

## Revisión visual en navegador: paneles

**Fecha:** 10 de octubre de 2026.
**Dispositivos:** escritorio 1440 × 1000 px y móvil 390 × 844 px.
**Cuentas:** usuarios temporales locales de cliente, abogado y administrador, con datos de ejemplo.
**Alcance:** se revisaron páginas autenticadas de cliente y abogado, más el resumen global y el listado de usuarios de administración. Se excluyó el sitio público y no se revisaron las secciones SaaS. Esta revisión documenta oportunidades; no implementa cambios visuales.

Los textos con `?` en nombres de procesos y actividades pertenecen a los datos temporales usados en la base local y no se consideran defectos de interfaz. El listado de usuarios de administración no pudo evaluarse visualmente en su estado normal: la consulta `GET /api/admin/usuarios?incluir_administradores=true` respondió HTTP 500 durante la captura. El mensaje genérico «No se pudo conectar con la API» oculta ese estado y debe revisarse aparte del diseño.

| Panel y pantalla | Evidencia observada en las capturas | Aspectos a mejorar | Prioridad |
|---|---|---|---:|
| Cliente · Inicio móvil | Las cuatro métricas aparecen en una sola columna y empujan el resto del resumen por debajo del primer viewport. El acceso flotante al chat queda sobre el contenido al desplazarse. | Considerar una cuadrícula de dos columnas para métricas breves; dar espacio inferior al contenido para que los controles flotantes no tapen tarjetas ni acciones. | Media |
| Cliente · Procesos móvil | La búsqueda, el filtro por estado y la tarjeta del expediente se entienden sin desplazamiento horizontal. La tarjeta deja bastante espacio entre el nombre, estado y resumen. | Mantener el patrón; probar nombres y radicados largos y mostrar una acción principal más visible cuando haya varias acciones disponibles. | Baja |
| Cliente · Detalle del proceso móvil | El estado y la descripción aparecen al inicio; accesos a actividad, documentos, tareas, radicados y chat se acomodan en dos filas. Luego comienza la cronología. | Mantener los accesos en una zona estable y dejar espacio de scroll al final: el chat flotante se superpone al inicio de las actualizaciones. En nombres largos, evitar que el título empuje el estado fuera de vista. | Media |
| Cliente · Documentos escritorio/móvil | La solicitud y el progreso `0 de 2` se identifican claramente. En móvil se usan controles nativos de archivo en inglés y el botón de entrega queda deshabilitado hasta seleccionar el archivo; al final de la tarjeta el botón flotante puede cubrir parte del flujo. | Sustituir la presentación nativa por un control de carga consistente en español que muestre el nombre seleccionado, formatos permitidos, progreso y errores por archivo. Reservar margen inferior para el chat flotante. | Alta |
| Cliente · Tareas móvil | La tarjeta «Fechas próximas» repite la tarea que vuelve a aparecer en «Pendientes»; fecha editable, prioridad y botones se muestran en la tarjeta extensa. | Evitar duplicar la tarea en el resumen y en la lista completa; resumir próximas fechas como enlace a la tarea y agrupar guardar fecha/completar en una zona de acciones estable. | Media |
| Cliente · Calendario móvil | La vista de lista evita comprimir el calendario mensual. Filtros de proceso y tipo se apilan correctamente; las filas de evento/tarea muestran fecha y enlace relacionado. | Dar más separación al enlace de acción en filas estrechas y asegurar que el chat flotante no tape el último elemento o su acción. | Media |
| Cliente · Notificaciones escritorio/móvil | Las notificaciones tienen jerarquía por tipo, fecha, título y acción. En móvil, «Marcar todas como leídas», actualizar, filtro y controles por aviso ocupan varias filas; el chat flotante se superpone al extremo inferior. | Priorizar el filtro y las acciones globales en una barra compacta; reservar área inferior y hacer más evidente el estado leído/no leído sin depender solo del fondo. | Media |
| Abogado · Inicio escritorio/móvil | En escritorio conviven tres tarjetas de acceso, ocho indicadores y dos paneles de actividad/atención. En móvil se apilan verticalmente y el usuario debe desplazarse bastante antes de ver actividad reciente. | Priorizar tareas, vencimientos y alertas confirmadas al inicio; mover métricas secundarias a una sección plegable o secundaria. | Alta |
| Abogado · Procesos escritorio/móvil | La barra de búsqueda, selector y filtros funciona en ambos tamaños. En móvil los controles se apilan en una tarjeta y parte de los indicadores visibles en escritorio no aparece en la primera fila móvil. | Mantener un orden y un conjunto de indicadores coherente entre tamaños; fijar una acción principal por expediente y reducir filtros secundarios cuando el espacio es corto. | Media |
| Abogado · Tareas escritorio/móvil | En escritorio la tabla presenta título, contexto, prioridad, vencimiento, estado y acciones en una sola fila. En móvil se transforma en tarjetas y conserva estados, proceso y cliente, aunque acciones adicionales quedan más abajo. | Mantener la tabla en escritorio; en móvil colocar las acciones principales en una fila persistente dentro de la tarjeta y limitar cuánto resumen se repite entre encabezado, contadores y lista. | Media |
| Abogado · Agenda escritorio/móvil | La pantalla ofrece filtros por responsable, proceso, cliente y tipo, más controles de día/semana/mes/lista. En móvil todos los filtros se apilan antes del calendario, ocupando casi el primer viewport. | Agrupar filtros secundarios en un panel desplegable y dejar visibles el rango activo y el selector de vista. En estado vacío, mostrar el rango de fechas consultado para que sea claro por qué no aparecen actividades. | Alta |
| Abogado · Documentos móvil | El botón de solicitud va primero; después aparecen búsqueda, dos selectores, actualización y cuatro contadores antes de las carpetas por proceso. La lista principal empieza debajo del primer viewport. | Reducir o plegar contadores cuando hay poco contenido y adelantar las carpetas/solicitudes, que son el trabajo central de la página. Mantener visible el botón de solicitar documento. | Media |
| Abogado · Ficha del proceso móvil | La ficha aún presenta pestañas horizontales: varias quedan fuera del viewport y solo se insinúa el desplazamiento con una barra fina. El campo Descripción se muestra en una sola línea y su contenido queda cortado. | Convertir las secciones en subpáginas con rutas `/proceso/[id]/[subpagina]`, como se solicitó previamente; usar textarea o una vista expandible para la descripción. | Alta |
| Administración · Resumen global escritorio/móvil | El resumen separa indicadores, accesos rápidos y actividad. En escritorio el menú lateral contiene muchos grupos y requiere scroll; en móvil el resumen se vuelve una columna larga y el chat flotante se cruza con tarjetas cercanas al borde inferior. | Dar prioridad a alertas y acciones diarias, permitir contraer grupos de navegación y proteger el contenido del botón flotante con espacio inferior. | Media |
| Administración · Usuarios | La captura muestra el mensaje de error de API y una tabla vacía, por lo que no se califican densidad de filas, filtros ni acciones individuales/en bloque. La API devolvió HTTP 500 en la consulta mencionada arriba. | Resolver el 500 y diferenciar errores HTTP del texto «no se pudo conectar»; repetir la evaluación de escritorio y móvil con resultados reales. | Bloqueo funcional |

### Hallazgos compartidos

- El botón flotante de chat está presente sobre casi todas las páginas y puede cubrir contenido al final de tarjetas, listas o formularios en móvil. Debe reservarse espacio o ajustarse su posición según el área desplazable.
- Las páginas de listado se adaptan al ancho sin desbordamiento general en las capturas de cliente y abogado; los principales problemas móviles observados son densidad vertical y elementos internos desplazables, especialmente las pestañas de la ficha del proceso.
- Los selectores nativos y los campos de archivo pueden mostrar idioma o presentación del navegador, no del producto; conviene envolverlos con etiquetas y estados claros para mantener una experiencia coherente.
- La comprobación visual no sustituye pruebas con lector de pantalla, teclado, contraste medido ni datos extensos. Antes de implementar, revisar nombres de proceso largos, muchos documentos/tareas y estados vacíos.

### Orden sugerido de mejora basado en capturas

1. Corregir el HTTP 500 del listado de usuarios y mostrar por separado errores de servidor y fallos de conexión.
2. Completar la ficha del proceso como subpáginas y mejorar la edición de descripciones largas.
3. Ajustar carga de documentos y el espacio reservado al chat flotante en móvil.
4. Reducir el desplazamiento del inicio del abogado y del inicio del cliente con una jerarquía de métricas más compacta.
5. Afinar las acciones de calendario/notificaciones y la navegación administrativa en móvil.

## Seguimiento de implementación por bloques

### Resumen de los bloques anteriores

| Bloque | Trabajo registrado | Alcance pendiente o vigente |
|---|---|---|
| 1. Sitio público | Se separaron en la experiencia pública los servicios activos de la firma y la oferta de Gestión de Procesos, manteniendo el acceso del menú y contemplando prelanzamiento/lanzamiento del SaaS. | Por instrucción del usuario, el contenido público queda congelado y no se harán más cambios allí. |
| 2. Acceso y recuperación | Se separaron las entradas de administración y de los portales de cliente/abogado, con selección de destino por dominio/rol y rutas de autenticación dedicadas. | Revisar en despliegue que los dominios configurados coincidan con Vercel; no ampliar el trabajo de login salvo bloqueo reportado. |
| 3. Dashboard compartido y compatibilidad | Se trabajó la separación entre paneles de firma y rutas heredadas, preservando acceso a destinos de cliente/abogado. | La parte SaaS queda expresamente fuera de alcance y pausada; no se harán cambios en sus páginas. |

### Bloque 4: Portal del cliente — implementado; validación visual pendiente

- El resumen móvil de vencimientos agrupa tareas por fecha y enlaza al primer pendiente de ese día, evitando repetir los títulos de las tareas.
- La carga documental presenta un selector en español, muestra el nombre del archivo elegido y conserva validación de formato y tamaño.
- Las notificaciones indican explícitamente «Leída» o «Sin leer», además del tratamiento visual.
- Las vistas principales reservan espacio inferior para que el botón flotante del chat no cubra acciones en móvil.
- La cuadrícula de métricas del inicio y los filtros/listas de procesos y calendario ya se adaptaban a pantallas estrechas; se conservaron.

No se modificaron las páginas públicas ni las secciones SaaS. Falta repetir la revisión visual en navegador tras estos cambios y evaluar con lector de pantalla y teclado físico.

### Bloque 5: Portal del abogado — implementado; validación visual pendiente

- El inicio conserva la cola de atención y actividad, y permite plegar los ocho indicadores secundarios para reducir el recorrido inicial.
- La agenda agrupa los filtros opcionales, muestra cuántos están activos y expone el rango consultado aun cuando no haya resultados.
- En tareas, la acción «Completar» tiene una etiqueta visible y los controles táctiles alcanzan una altura mínima mayor.
- En documentos, los cuatro contadores quedan plegados para adelantar las carpetas por proceso.
- La descripción del expediente admite varias líneas y la navegación horizontal de subpáginas explica en móvil que hay más secciones.
- Las vistas principales reservan espacio inferior para el chat flotante.

No se modificaron las páginas públicas ni las secciones SaaS. Falta repetir la revisión visual en navegador tras estos cambios y evaluar con lector de pantalla y teclado físico.

### Bloque 6: Administracion de usuarios - implementado; validacion visual pendiente

- La respuesta de usuarios ahora normaliza las preferencias de notificacion antiguas en formato plano y completa campos parciales, evitando que registros historicos incompatibles rompan la serializacion del listado.
- La carga de usuarios y planes ahora comprueba el estado HTTP, diferencia errores del servidor y de red, y rechaza respuestas con estructura inesperada en vez de tratarlas como listas validas.
- Se conservaron filtros, acceso al detalle y acciones individuales y masivas ya existentes. No se cambio el inventario SaaS ni contenido publico.

Falta validar el listado con datos locales reales en escritorio y movil, confirmar que el HTTP 500 desaparecio y decidir con esa evidencia si la tabla necesita una presentacion alternativa en pantallas estrechas.

### Bloque 7: Operacion y configuracion administrativa - implementado; validacion visual pendiente

- Las ejecuciones de consulta ahora presentan estados reconocibles y una descripcion breve para cola, ejecucion, exito, finalizacion con errores y fallo.
- La lista de plantillas permite buscar por nombre o clave; sus opciones tienen un objetivo de toque mayor y comunican cual esta seleccionada.
- Las entregas de correo y WhatsApp tienen una vista de detalle para leer el contenido completo, sus fechas, destinatario e informacion de error. En movil se presentan como tarjetas.
- Las alertas pasan a tarjetas en movil y conservan la tabla en pantallas amplias; las acciones individuales ahora tienen objetivos tactiles mayores y etiquetas contextualizadas.
- La agenda abre en vista de listado en pantallas moviles, conserva la eleccion manual de vistas y aumenta el tamano de los filtros.

No se modifico la seccion de contenido publico ni las vistas SaaS. Falta revisar visualmente los estados y modales en ambos temas y tamaños, y confirmar con teclado y lector de pantalla el flujo de detalle de entregas.

Nota de alcance del Bloque 7: tambien se muestra la ultima actualizacion de la configuracion de firma en hora de Colombia. Los planes SaaS y el contenido publico se mantienen fuera de alcance por instruccion del usuario.


### Bloque 8: Chat transversal - implementado; validacion visual pendiente

- Las conversaciones de firma en pantalla completa anuncian mensajes entrantes con una region accesible sin desplazar el foco.
- La lista de mensajes deja de seguir automaticamente cuando el usuario sube a leer el historial; aparece un control para volver al mensaje mas reciente.
- Se aumentaron los objetivos tactiles de controles de conversacion y referencias, y se ajusto el retorno desde la vista agrupada por proceso.
- El chat flotante de cliente, abogado de firma y admin ocupa la pantalla en movil, conserva el panel compacto en escritorio y evita que el boton flotante tape la conversacion abierta.
- Se mantuvieron la agrupacion por proceso, los contadores, el orden por actividad y la navegacion a la lista de chats.

Los ajustes de este bloque se limitan a los roles CLIENTE, ABOGADO_ADMIN y ADMIN. El rol ABOGADO del portal SaaS conserva su comportamiento anterior. No se modificaron contenido publico ni modulos SaaS. Falta validar visualmente ambos temas y tamanos en navegador, y comprobar navegacion con teclado/lector de pantalla.


### Bloque 9: Estados de carga, error y vacio - implementado; validacion visual pendiente

- Se incorporo un estado de error reutilizable para pantallas de firma y administracion. Distingue fallos de red, respuestas HTTP del servidor y problemas de acceso sin mostrar detalles internos de la API, e incluye una accion accesible para reintentar.
- El listado de usuarios admin conserva los datos anteriores si falla una actualizacion; si falla la carga inicial, evita confundir el error con un listado vacio. Las fallas de carga se separan de errores al ejecutar acciones para que el reintento no sugiera repetir una accion ya iniciada.
- En usuarios admin se diferencian los ambitos realmente vacios de los filtros sin coincidencias.
- El inicio del cliente ya no presenta metricas en cero como si fueran datos cuando falla la carga inicial; permite reintentar y conserva los datos visibles si falla una actualizacion posterior.

Se mantuvieron fuera de alcance el contenido publico, las paginas SaaS y sus componentes compartidos. Falta validar visualmente errores, reintentos, carga y vacios en escritorio y movil, y navegar estos estados con teclado y lector de pantalla.


### Brechas de arquitectura - implementadas

- Se agregaron una pagina 404 global y fronteras de error globales y por portal, con reintento, salida y referencia de diagnostico.
- Las rutas de los portales de firma muestran una pantalla de acceso restringido y orientan al panel correspondiente. El comportamiento anterior se conserva como predeterminado para las rutas SaaS.
- Admin, abogado de firma y cliente tienen estados de carga propios para transiciones y carga inicial.
- El inicio del cliente sin expedientes y el inicio del despacho sin registros orientan al siguiente paso. La confirmacion de creacion de expediente incluye un enlace directo al expediente nuevo.
- La separacion por dominios de firma, panel y administracion ya estaba implementada; no se altero el contenido publico ni las pantallas del SaaS.

Queda pendiente la validacion visual en navegador de estos estados, sus variantes movil y tema oscuro, y el flujo de acceso restringido con cuentas de roles distintos.

- Ajuste posterior: la pagina 404 publica usa MarketingLayout (header, menu y footer); las 404 de admin, abogado, cliente y dashboard SaaS se resuelven dentro de sus segmentos para conservar el sidebar y el diseno del panel.
