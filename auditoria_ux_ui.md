# AuditorÃ­a UX/UI del sistema

**Fecha:** 10 de octubre de 2026
**Estado:** Fase 2 completada; evaluaciÃ³n estÃ¡tica de la interfaz.
**AgrupaciÃ³n:** aprobada por el usuario al completar la Fase 1.

## Alcance y mÃ©todo

Se revisaron las rutas de pÃ¡gina bajo `frontend-saas/app`, sus componentes principales y los componentes compartidos de navegaciÃ³n, formularios, tablas, diÃ¡logos, estados vacÃ­os y carga. La puntuaciÃ³n describe lo que permite inferir el cÃ³digo fuente; no es una certificaciÃ³n WCAG ni una inspecciÃ³n visual en navegador. Contraste final, tamaÃ±os renderizados y comportamiento real con lectores de pantalla requieren verificaciÃ³n en ejecuciÃ³n.

La escala es de 1 a 5: **1** bloquea o dificulta gravemente la tarea; **2** tiene barreras frecuentes; **3** permite completar la tarea con fricciones; **4** es consistente con problemas menores; **5** hace la tarea clara, accesible y predecible en los contextos revisados. Las cuatro cifras en las tablas siguen este orden: **Accesibilidad / Responsividad / Usabilidad / Carga cognitiva**.

El umbral de 44 Ã— 44 px se usa como meta de diseÃ±o solicitada en la Fase 1. WCAG 2.2 AA tiene un criterio de tamaÃ±o mÃ­nimo de 24 Ã— 24 CSS px con excepciones, y el criterio mejorado de 44 Ã— 44 px es AAA. Se observaron componentes menores de 44 px; esto no implica por sÃ­ solo una declaraciÃ³n de incumplimiento WCAG. [W3C: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [W3C: Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html).

## AnÃ¡lisis de brechas de arquitectura

La aplicaciÃ³n ya tiene piezas reutilizables como `LoadingState`, `EmptyState`, `Modal`, `ConfirmDialog`, pÃ¡ginas de error y `RoleGate`, pero su uso no es uniforme entre rutas. La Ãºnica frontera de error de ruta detectada estÃ¡ en administraciÃ³n de contenido; varios flujos muestran errores y cargas localmente, mientras que otras pÃ¡ginas no tienen una pantalla equivalente. Las siguientes pantallas reducirÃ­an callejones sin salida y harÃ­an mÃ¡s uniforme la recuperaciÃ³n:

| Prioridad | Pantalla nueva propuesta | Ruta sugerida | Motivo y alcance |
|---|---|---|---|
| Alta | Entradas separadas para firma, SaaS y administraciÃ³n | Sitio pÃºblico; `admin.alejandramunozabogada.com`; `panel.alejandramunozabogada.com`; SaaS en `/gestion-procesos/dashboard` | La firma ya presta servicios mientras que el SaaS puede estar en prelanzamiento. La pÃ¡gina pÃºblica debe conservar el acceso a los servicios de la firma independientemente del estado comercial del SaaS. El acceso de administraciÃ³n debe tener una entrada propia fuera de la navegaciÃ³n pÃºblica. Los hosts indicados son el destino propuesto y requieren configuraciÃ³n de dominio/rutas antes de estar activos. |
| Alta | PÃ¡gina no encontrada | `app/not-found.tsx` | Explicar que la ruta o recurso no existe y dar accesos a inicio pÃºblico e inicio del portal del usuario autenticado. Evita pÃ¡ginas vacÃ­as al abrir enlaces antiguos o identificadores invÃ¡lidos. |
| Alta | Error recuperable de aplicaciÃ³n | `app/error.tsx` y fronteras de segmento para los portales | Ofrecer reintento, navegaciÃ³n de salida y un identificador de diagnÃ³stico. Reutilizar el patrÃ³n existente en `admin/contenido/error.tsx`; el lÃ­mite global debe preservar el diseÃ±o de cada segmento donde sea posible. |
| Media | Acceso restringido | `app/gestion-procesos/acceso-restringido` o estado contextual en `RoleGate` | Cuando la sesiÃ³n existe pero el rol no permite ver una ruta, explicar el motivo y enlazar al panel correcto. Hoy `RoleGate` redirige al inicio del rol, lo que puede sentirse como navegaciÃ³n inesperada. |
| Media | Carga de navegaciÃ³n de portal | `loading.tsx` en segmentos `admin`, `abogado` y `cliente` | Establecer una espera reconocible durante transiciones y carga inicial, usando esqueletos acordes con el contenido de cada secciÃ³n. `LoadingState` ya ofrece una base compartida. |
| Media | Bienvenida y configuraciÃ³n inicial | Estado inicial dentro del portal del cliente y del abogado | Orientar a una cuenta sin procesos, documentos o tareas: explicar quÃ© aparecerÃ¡ y cuÃ¡l es el siguiente paso. Algunos listados ya tienen estados vacÃ­os, pero no forman una guÃ­a inicial comÃºn. |
| Baja | Solicitud completada / resultado de operaciÃ³n | Estado de resultado reutilizable en flujos administrativos y de cuenta | Confirmar cambios importantes (aprobaciÃ³n, seguridad, carga o revisiÃ³n) con resumen del resultado y enlace al elemento. Preferir estado contextual si no amerita una ruta propia. |

Estas son brechas de experiencia, no instrucciones de implementaciÃ³n para esta fase. No se aÃ±aden porque la Fase 2 no contempla escribir componentes.

## EvaluaciÃ³n por bloques funcionales

### 1. Sitio pÃºblico

Rutas: `/`, `/areas-de-practica`, `/contacto`, `/quienes-somos`, `/filosofia`, `/poliza-juridica`, `/politica-de-privacidad`, `/tratamiento-de-datos` y `/gestion-procesos`.

| PÃ¡ginas evaluadas | A / R / U / C | Aspectos a mejorar | Elementos a aÃ±adir |
|---|---:|---|---|
| Inicio, Ã¡reas de prÃ¡ctica, quiÃ©nes somos, filosofÃ­a y pÃ³liza jurÃ­dica | 3 / 4 / 4 / 4 | La estructura usa jerarquÃ­a de tÃ­tulos, secciones y rejillas responsivas. La navegaciÃ³n mÃ³vil depende de un menÃº desplegable; verificar cierre con Escape, foco y objetivos de toque. Los colores de marca estÃ¡n escritos directamente en varias pÃ¡ginas, por lo que contrastes y consistencia deben comprobarse por combinaciÃ³n. | VerificaciÃ³n de contraste y foco; estados claros de enlace activo y una ruta de contacto visible al final de cada pÃ¡gina de servicio. |
| Contacto | 3 / 4 / 4 / 3 | La acciÃ³n de contacto se resuelve principalmente en correo y WhatsApp; quien prefiera explicar su caso desde la web debe cambiar de aplicaciÃ³n. Revisar que la informaciÃ³n de contacto y los CTA sean fÃ¡ciles de ubicar en mÃ³vil. | ConfirmaciÃ³n de disponibilidad y horarios, mÃ¡s una alternativa de consulta web con confirmaciÃ³n de envÃ­o si la firma desea captar solicitudes dentro del sitio. |
| Privacidad y tratamiento de datos | 3 / 4 / 3 / 3 | Son documentos extensos en una columna de lectura. Hace falta comprobar navegaciÃ³n por encabezados, fecha de actualizaciÃ³n y legibilidad en mÃ³vil; no se observa Ã­ndice de secciones en el componente legal compartido. | Ãndice anclado para documentos largos, enlace de regreso al inicio del documento y fecha de actualizaciÃ³n presentada de forma consistente. |
| GestiÃ³n de procesos pÃºblica y formulario de interÃ©s | 3 / 4 / 3 / 3 | Esta pÃ¡gina presenta el producto SaaS y tiene dos estados comerciales: prelanzamiento y servicio lanzado. El estado del SaaS no debe ocultar ni desactivar la oferta de servicios jurÃ­dicos de la firma, que ya estÃ¡ activa. El botÃ³n Â«GestiÃ³n de procesosÂ» del menÃº pÃºblico debe seguir visible y operativo en ambos estados, pero la pÃ¡gina debe dejar claro si se refiere a los servicios de la firma o al producto SaaS. | Separar claramente los Ã¡mbitos **Firma** y **SaaS**. En prelanzamiento del SaaS, mostrar su propuesta y el formulario de interÃ©s, conservando el botÃ³n de menÃº y los CTA de servicios activos de la firma. Al lanzarse el SaaS, mostrar sus planes y el flujo de registro, tambiÃ©n sin reemplazar los servicios de la firma. Mantener separados beneficios, funcionalidades, precios y estados comerciales. |

### 2. Acceso y recuperaciÃ³n

Rutas: `/gestion-procesos/auth/login`, `registro`, `recuperar-password`, `restablecer-password` y `cambiar-password`.

| PÃ¡ginas evaluadas | A / R / U / C | Aspectos a mejorar | Elementos a aÃ±adir |
|---|---:|---|---|
| Inicio de sesiÃ³n | 3 / 4 / 3 / 3 | El acceso ofrece recuperaciÃ³n y redirecciÃ³n segura de vuelta al destino. La entrada de administraciÃ³n debe separarse de la autenticaciÃ³n presentada en el contenido pÃºblico; el acceso administrativo no debe aparecer como enlace o CTA del sitio pÃºblico. Revisar asociaciÃ³n explÃ­cita de etiquetas, anuncio de error y preservaciÃ³n del destino al ingresar. | Acceso de administraciÃ³n dedicado bajo `admin.alejandramunozabogada.com`, separado de la entrada pÃºblica. El portal de cliente y abogado se alojarÃ­a bajo `panel.alejandramunozabogada.com`. Mantener el SaaS bajo `/gestion-procesos/dashboard`; llevar a cada persona al Ã¡mbito que corresponde a su rol sin ofrecer el acceso admin desde el contenido pÃºblico. |
| Registro | 3 / 4 / 3 / 2 | El formulario reÃºne datos de cuenta, plan y soporte de pago; ese volumen puede sentirse denso. Los planes se cargan desde API, por lo que error, carga y ausencia de planes deben quedar diferenciados. | Formulario progresivo o agrupado por pasos, resumen de datos antes del envÃ­o y explicaciÃ³n de formatos/tamaÃ±o antes de cargar soporte. |
| Recuperar y restablecer contraseÃ±a | 4 / 4 / 4 / 4 | El restablecimiento distingue enlace invÃ¡lido, error y Ã©xito. Mantener mensajes que no revelen si una direcciÃ³n existe y explicar el vencimiento del enlace antes de que el usuario envÃ­e. | AcciÃ³n clara para solicitar un enlace nuevo y una confirmaciÃ³n de envÃ­o que indique revisar correo y spam sin filtrar existencia de cuenta. |
| Cambio de contraseÃ±a de primer ingreso | 2 / 4 / 3 / 3 | El formulario usa placeholders como identificaciÃ³n de los campos en vez de etiquetas persistentes; los mensajes de error estÃ¡n en texto pero deben quedar asociados al formulario. | Etiquetas visibles, mostrar/ocultar contraseÃ±a, reglas al lado del campo y foco automÃ¡tico en el primer error. |

### 3. Dashboard compartido y rutas de compatibilidad

Rutas: `/gestion-procesos/dashboard`, `dashboard/tareas`, `dashboard/tareas/[id]`, `dashboard/radicados` y `dashboard/radicados/[id]`.

| PÃ¡ginas evaluadas | A / R / U / C | Aspectos a mejorar | Elementos a aÃ±adir |
|---|---:|---|---|
| Dashboard y navegaciÃ³n antigua | 3 / 4 / 3 / 3 | `/dashboard` redirige a abogado y su layout restringe el rol ABOGADO. La coexistencia de rutas de compatibilidad con portales por rol puede hacer difÃ­cil saber cuÃ¡l es la URL canÃ³nica y mantener los enlaces profundos. | Redirecciones documentadas y consistentes por rol; breadcrumb y enlaces siempre hacia las rutas canÃ³nicas del portal actual. |
| Detalle y listas de tareas/radicados del dashboard | 3 / 3 / 3 / 3 | Se conserva una experiencia comÃºn para rutas heredadas, pero convive con pÃ¡ginas especÃ­ficas de abogado y cliente. En pantallas estrechas, revisar filtros, navegaciÃ³n de detalle y tablas/listados densos. | Estado de transiciÃ³n al cambiar de listado a detalle, volver preservando filtros y filtros compactos o tarjetas en mÃ³vil. |

### 4. Portal del cliente

Rutas actuales: `/gestion-procesos/cliente`, `procesos`, `procesos/[id]`, `documentos`, `tareas`, `calendario`, `ayuda`, `mensajes`, `chat`, `notificaciones`, `configuracion` y `perfil`. El objetivo propuesto es servir los portales de cliente y abogado bajo `panel.alejandramunozabogada.com`.

| PÃ¡ginas evaluadas | A / R / U / C | Aspectos a mejorar | Elementos a aÃ±adir |
|---|---:|---|---|
| Inicio y lista/detalle de procesos | 3 / 4 / 3 / 3 | El resumen es legible, pero en mÃ³vil sus cuatro mÃ©tricas se apilan y retrasan el contenido secundario. La lista funciona bien con bÃºsqueda y estado; el detalle pone estado y accesos a documentos, tareas, actividad, radicados y chat arriba, pero la cronologÃ­a queda debajo y el botÃ³n flotante puede cubrirla. | Considerar dos columnas para mÃ©tricas breves en mÃ³vil; conservar el filtro de estado y dejar margen inferior en el detalle para el chat flotante. |
| Documentos y solicitudes | 3 / 3 / 3 / 3 | En captura mÃ³vil los controles nativos de archivo aparecen en inglÃ©s; la acciÃ³n de entrega se habilita tras seleccionar un archivo y puede quedar parcialmente tapada por el chat flotante. El progreso por solicitud sÃ­ deja claro cuÃ¡ntos elementos faltan. | Control de carga etiquetado en espaÃ±ol con nombre, formato, tamaÃ±o, progreso y error por archivo; espacio inferior protegido para completar entregas. |
| Tareas y calendario | 3 / 3 / 3 / 3 | La tarea se muestra tanto en Â«Fechas prÃ³ximasÂ» como en Â«PendientesÂ», lo que repite contenido y extiende la pÃ¡gina. La vista de lista del calendario se adapta bien, pero las filas estrechas acercan el enlace de acciÃ³n al texto del evento. | Mostrar prÃ³ximas fechas como resumen enlazado en vez de duplicar la tarjeta; conservar lista para mÃ³vil y separar visualmente tÃ­tulo, proceso y acciÃ³n. |
| Notificaciones | 3 / 4 / 3 / 3 | El tipo, la fecha, el tÃ­tulo y la acciÃ³n se distinguen en escritorio y mÃ³vil. En mÃ³vil, marcar todo, actualizar, filtro y acciones por aviso ocupan varias filas; el estado leÃ­do/no leÃ­do depende bastante del fondo. | Compactar acciones globales, reforzar el estado leÃ­do con texto o icono ademÃ¡s del color y proteger la Ãºltima notificaciÃ³n del botÃ³n flotante. |
| Ayuda, configuraciÃ³n, perfil y seguridad | 3 / 4 / 3 / 3 | La ayuda usa preguntas con enlaces, y los cambios sensibles pasan por ventanas de seguridad. Mantener claros mÃ©todo de OTP, caducidad, reenvÃ­o y cancelaciÃ³n; datos del perfil y preferencias deben tener lÃ­mites de ediciÃ³n evidentes. | Ayuda contextual desde carga de documentos y tareas, resumen del canal de notificaciÃ³n activo y estado/tiempo restante del cÃ³digo en el diÃ¡logo de seguridad. |
| Chat | 3 / 4 / 4 / 3 | Conversaciones agrupadas por proceso, Markdown, referencias, estado entregado/leÃ­do y botÃ³n flotante cubren casos clave. La actualizaciÃ³n cada cinco segundos debe comunicar cuÃ¡ndo hay datos nuevos; en mÃ³vil el chat flotante compite con el botÃ³n de envÃ­o y el teclado virtual. | Accesos a conversaciÃ³n con nombre comprensible, anuncio accesible de mensajes nuevos, foco/teclado consistente y diseÃ±o probado con teclado mÃ³vil y lectores de pantalla. |

### 5. Portal del abogado

Rutas actuales: `/gestion-procesos/abogado`, `metricas`, `clientes`, `clientes/[id]`, `procesos`, `procesos/[id]`, `procesos/[id]/[subpagina]`, `radicados`, `radicados/[id]`, `tareas`, `tareas/[id]`, `agenda`, `documentos`, `contratos`, `notificaciones`, `configuracion`, `perfil`, `solicitudes-perfil` y `chat`. El portal de abogado compartirÃ­a `panel.alejandramunozabogada.com` con el de cliente.

| PÃ¡ginas evaluadas | A / R / U / C | Aspectos a mejorar | Elementos a aÃ±adir |
|---|---:|---|---|
| Inicio y mÃ©tricas/carga de trabajo | 3 / 4 / 4 / 3 | En escritorio hay tres tarjetas de acceso, ocho indicadores y paneles de atenciÃ³n/actividad. En mÃ³vil, el apilado vertical demora la llegada a actividad reciente; algunas mÃ©tricas se repiten entre bloques. | Subir tareas, vencimientos y alertas accionables; plegar mÃ©tricas secundarias y explicar periodo/criterio de cada conteo. |
| Clientes y perfiles | 3 / 3 / 3 / 3 | El listado combina bÃºsqueda, selecciÃ³n y operaciones; verificar densidad de columnas en mÃ³vil y mantener visibles las acciones prioritarias. Perfil contiene datos de contrato ademÃ¡s de datos de cuenta, que son conceptos distintos. | Secciones Â«CuentaÂ» y Â«Datos para documentos legalesÂ» separadas, guardado por secciÃ³n y resumen de cambios pendientes. |
| Procesos y subpÃ¡ginas | 3 / 3 / 3 / 2 | La lista se ajusta al mÃ³vil, aunque algunos indicadores visibles en escritorio no aparecen en el resumen mÃ³vil. En la ficha, la barra de pestaÃ±as se recorta horizontalmente y no deja claro que hay mÃ¡s secciones; el campo DescripciÃ³n de una sola lÃ­nea corta textos largos. Las rutas actuales no cumplen la expectativa de `/proceso/[id]/subpagina`. | Convertir secciones principales en subpÃ¡ginas reales con URL propia, navegaciÃ³n contextual y regreso preservando el contexto; usar textarea o vista expandible para DescripciÃ³n y mantener indicadores consistentes entre tamaÃ±os. |
| Radicados y actuaciones | 3 / 3 / 3 / 3 | BÃºsqueda, consultas y actuaciones son operaciones distintas dentro del mismo dominio. Los listados y el historial cronolÃ³gico pueden resultar difÃ­ciles de recorrer cuando hay muchas actuaciones. | Filtros por proceso, estado y rango de fechas; agrupaciÃ³n por fecha y carga progresiva del historial. |
| Tareas, agenda y documentos | 3 / 3 / 3 / 3 | La tabla de tareas funciona en escritorio y se vuelve tarjeta en mÃ³vil, pero las acciones quedan por debajo del contenido inicial. En agenda, filtros de responsable, proceso, cliente y tipo se apilan antes de la vista; en documentos, filtros y cuatro contadores preceden a las carpetas y empujan el trabajo principal bajo el primer viewport. | Mostrar acciones principales de tarea dentro de la tarjeta mÃ³vil; plegar filtros secundarios de agenda y exponer rango consultado en estados vacÃ­os; reducir/plegar contadores de documentos para adelantar carpetas y solicitudes. |
| Contratos y documentos legales | 3 / 3 / 3 / 3 | La generaciÃ³n y carga del escaneado contienen pasos de distinto riesgo. Estado del contrato, firma y archivo deben distinguirse visualmente y la vista previa requiere un estado de carga perceptible. | Asistente por etapas: seleccionar plantilla, completar datos, revisar PDF, emitir, agendar firma y cargar firmado; resumen de estado en lista. |
| Notificaciones, chat, configuraciÃ³n y solicitudes de perfil | 3 / 4 / 3 / 3 | Hay pantallas separadas y el chat tiene capacidades avanzadas. En configuraciÃ³n hay muchas preferencias por tipo/canal, lo que dificulta encontrar quÃ© controla cada aviso. | Agrupar preferencias por actividad y canal, con valores actuales explÃ­citos; filtros guardables en notificaciones y chat. |

### 6. AdministraciÃ³n: usuarios y expedientes

Rutas actuales: `/gestion-procesos/admin`, `metricas`, `usuarios`, `usuarios/nuevo`, `usuarios/[id]`, `procesos`, `radicados`, `tareas`, `documentos`, `documentos/solicitudes`, `documentos/contratos`, `contratos`, `solicitudes`, `solicitudes-perfil`, `global/[recurso]` y `saas/[recurso]`. El objetivo propuesto es exponer este portal en `admin.alejandramunozabogada.com`; el host no estÃ¡ configurado por este informe.

| PÃ¡ginas evaluadas | A / R / U / C | Aspectos a mejorar | Elementos a aÃ±adir |
|---|---:|---|---|
| Panel principal y mÃ©tricas | 3 / 4 / 4 / 3 | La captura muestra tarjetas, accesos rÃ¡pidos y actividad reciente en una jerarquÃ­a reconocible. En mÃ³vil todas las mÃ©tricas se apilan y hacen largo el recorrido; el sidebar de escritorio contiene varios grupos y requiere desplazamiento. | En mÃ³vil priorizar alertas y accesos de uso frecuente antes de mÃ©tricas secundarias; permitir plegar grupos del sidebar y dejar mÃ¡s espacio al contenido bajo el botÃ³n flotante. |
| Usuarios, creaciÃ³n y detalle | 3 / 3 / 3 / 3 | La captura de usuarios quedÃ³ bloqueada por una respuesta HTTP 500 de la API; la interfaz muestra Â«No se pudo conectarÂ», aunque el servidor sÃ­ respondiÃ³. No se pudieron observar filas, densidad de acciones ni adaptaciÃ³n de la tabla. | Distinguir error de servidor de error de conexiÃ³n y repetir revisiÃ³n visual cuando el endpoint cargue; luego valorar tabla/tarjetas, filtros y controles masivos en mÃ³vil. |
| Procesos, radicados, tareas y documentos de firma | 3 / 3 / 3 / 2 | Varias rutas sectoriales reutilizan `AdminResourcePage`; esa reutilizaciÃ³n mantiene patrones pero puede hacer menos evidente la diferencia entre recursos y estados. El componente central es grande y la administraciÃ³n global mezcla sectores. | Encabezado contextual por recurso y sector, filtros persistentes y acceso uniforme a detalle sin depender de conocer el identificador. |
| Solicitudes y solicitudes de perfil | 3 / 3 / 3 / 3 | Las decisiones de aprobaciÃ³n requieren revisar documentaciÃ³n y asignaciÃ³n. Hace falta priorizar pendientes, explicar criterios y prevenir cambios irreversibles sin contexto. | Cola priorizada, lista de verificaciÃ³n antes de aprobar/rechazar y motivo obligatorio con resultado notificable. |
| Contratos y documentos contractuales | 3 / 3 / 3 / 3 | Las pÃ¡ginas generales y de documentos contractuales pueden resultar duplicadas si no se explica cuÃ¡l administra estados y cuÃ¡l consulta archivos. | SeparaciÃ³n explÃ­cita Â«gestionar contratoÂ» y Â«consultar archivo firmadoÂ», con enlaces recÃ­procos y permisos visibles. |
| Inventarios globales y SaaS | 3 / 3 / 3 / 2 | Los recursos dinÃ¡micos dependen de una ruta `[recurso]`; el usuario debe reconocer el contexto de sector para evitar confundir inventarios. | Breadcrumb con sector + recurso, descripciÃ³n del alcance de datos y controles de sector persistentes. |

### 7. AdministraciÃ³n: operaciÃ³n y configuraciÃ³n

Rutas: `/gestion-procesos/admin/operacion`, `operacion/consultas`, `operacion/integraciones`, `operacion/mensajes`, `operacion/notificaciones`, `actividad`, `auditoria`, `alertas`, `agenda`, `notificaciones`, `notificaciones/entregas`, `contenido`, `cuenta`, `firma` y `planes`.

| PÃ¡ginas evaluadas | A / R / U / C | Aspectos a mejorar | Elementos a aÃ±adir |
|---|---:|---|---|
| OperaciÃ³n, consultas e integraciones | 3 / 3 / 3 / 3 | Las subsecciones separadas ayudan, aunque el resumen, operaciones y gestiÃ³n de integraciones comparten una zona con alto volumen de informaciÃ³n tÃ©cnica. La consulta debe diferenciar en cola, en proceso, completada y fallida. | Indicadores de estado con explicaciÃ³n, enlace a detalle de ejecuciÃ³n y filtros de entorno/fecha para investigar incidentes. |
| Mensajes del sistema | 3 / 3 / 3 / 3 | Editor de varias plantillas con variables, correo y WhatsApp. La navegaciÃ³n por tipos puede crecer y se debe evitar guardar una plantilla cuyo ejemplo no represente el resultado final. | BÃºsqueda por tipo, lista de variables disponibles y vista previa por canal con datos de ejemplo y enlaces separados del texto editable. |
| Alertas, notificaciones y entregas | 3 / 3 / 3 / 3 | Filtros, selecciÃ³n y operaciones masivas ya existen; por densidad, el estado de una entrega puede confundirse con lectura de una alerta. Los mensajes largos de correo requieren una vista de detalle mÃ¡s legible que una fila. | DefiniciÃ³n persistente de estados, panel de detalle con historial por canal y separaciÃ³n entre alerta interna y entrega externa. |
| Actividad y auditorÃ­a tÃ©cnica | 3 / 3 / 3 / 3 | La auditorÃ­a tiene filtros por usuario, acciÃ³n, mÃ³dulo, resultado y fecha. La terminologÃ­a tÃ©cnica puede ser difÃ­cil de interpretar y la eliminaciÃ³n de registros requiere claridad de permisos y alcance. | Glosario de eventos, filtros visibles resumidos y detalle tÃ©cnico expandible con traducciÃ³n breve a lenguaje operativo. |
| Agenda de la firma | 3 / 3 / 3 / 3 | Hay vistas por dÃ­a, semana, mes y listado, selecciÃ³n mÃºltiple y ediciÃ³n. En mÃ³vil las cuadrÃ­culas son densas; los controles y acciones masivas deben conservar contexto al cambiar de vista. | Vista lista predeterminada en mÃ³vil, leyenda de tipos/estados y confirmaciÃ³n que resuma los eventos que cambiarÃ¡n o se eliminarÃ¡n. |
| Cuenta, firma, planes y contenido pÃºblico | 3 / 3 / 3 / 3 | Son Ã¡reas con riesgos distintos: credenciales, identidad pÃºblica, planes y ediciÃ³n de contenido. La navegaciÃ³n administrativa agrupa varias secciones y algunas rutas tienen nombres amplios. | Separar guardado por secciÃ³n, mostrar cuÃ¡ndo se guardÃ³ por Ãºltima vez y ofrecer vista previa antes de publicar cambios del sitio o plan. |

### 8. Chat transversal

Rutas: `/gestion-procesos/{cliente,abogado,admin}/chat`, rutas de conversaciÃ³n y el chat flotante disponible fuera de la pÃ¡gina de chat completa.

| PÃ¡ginas evaluadas | A / R / U / C | Aspectos a mejorar | Elementos a aÃ±adir |
|---|---:|---|---|
| Lista, grupos de proceso y selecciÃ³n de conversaciÃ³n | 3 / 4 / 4 / 3 | La agrupaciÃ³n por proceso reduce ruido, pero aÃ±ade un nivel de navegaciÃ³n que necesita indicar cuÃ¡ntas conversaciones tiene el grupo y ordenar por llegada reciente de forma evidente. En mÃ³vil hay que comprobar la navegaciÃ³n desde una conversaciÃ³n directa hacia el grupo y que la URL refleje el destino. La lista se actualiza periÃ³dicamente. | Estado de grupo abierto/cerrado anunciado, resumen de mensajes no leÃ­dos por grupo y orden/fecha explicados en la interfaz; navegaciÃ³n consistente entre lista, grupo y subchat con URL directa recuperable. |
| ConversaciÃ³n completa | 3 / 4 / 4 / 3 | Mensajes agrupados por dÃ­a, Markdown, referencias y marcas de entrega mejoran el uso. Asegurar que botones circulares de referencia, envÃ­o y retorno tengan nombre accesible, foco visible y tamaÃ±o tÃ¡ctil suficiente. | Anuncio de mensaje nuevo sin mover el foco, control para pausar el salto automÃ¡tico al Ãºltimo mensaje y selecciÃ³n de referencia con bÃºsqueda cuando existan muchos elementos. |
| Chat flotante | 3 / 3 / 3 / 3 | Aporta acceso rÃ¡pido, pero en mÃ³vil se superpone al contenido y el teclado virtual puede reducir el Ã¡rea de lectura. En la revisiÃ³n visual tambiÃ©n se observÃ³ que los mensajes entrantes deben reflejar la agrupaciÃ³n por proceso, que la conversaciÃ³n debe abrir en el mensaje mÃ¡s reciente y que sus mensajes deben cargarse igual que en la vista completa. | Ajuste a pantalla completa en mÃ³vil, botÃ³n explÃ­cito Â«Abrir chat completoÂ» y retorno a la misma conversaciÃ³n desde ambas vistas; respetar grupos y subchats tambiÃ©n en la lista flotante y abrir siempre en el Ãºltimo mensaje. |

### 9. Componentes compartidos de interfaz

Evaluados transversalmente en todos los bloques: `AppShell`, `AdminConsoleShell`, `Sidebar`, `Breadcrumbs`, `GlobalSearch`, `Button`, `DataTable`, `Modal`, `ConfirmDialog`, `EmptyState` y `LoadingState`.

| Componentes | A / R / U / C | Aspectos a mejorar | Elementos a aÃ±adir |
|---|---:|---|---|
| Botones, enlaces e iconos | 2 / 4 / 3 / 3 | El componente `Button` ofrece tamaÃ±os de 32, 40 y 44 px de alto; `Modal` usa un cierre de 36 px y hay acciones de icono de 36 px en listados. Por tanto, no todos alcanzan la meta tÃ¡ctil de 44 px. El chat flotante comparte espacio mÃ³vil con el contenido y teclado, por lo que el botÃ³n de envÃ­o y los accesos de referencia necesitan objetivos tÃ¡ctiles claros. | Aumentar Ã¡rea interactiva sin inflar visualmente el icono, mantener separaciÃ³n entre controles y documentar excepciones para controles densos de escritorio; comprobar que envÃ­o y referencias sigan siendo accesibles con teclado virtual abierto. |
| Tablas y listados | 3 / 3 / 3 / 3 | `DataTable` permite desplazamiento horizontal y ancho mÃ­nimo de 640 px, opciÃ³n funcional pero costosa en mÃ³vil. Muchos listados agregan sus propios filtros y acciones, con patrones variables. | Columnas prioritarias en mÃ³vil, alternativa de tarjetas/lista, encabezados ordenables anunciados y patrÃ³n comÃºn de paginaciÃ³n/selecciÃ³n. |
| Modales y confirmaciones | 3 / 3 / 4 / 3 | `Modal` incluye foco inicial, trampa de foco, Escape y retorno del foco. El botÃ³n de cierre no llega a 44 px; verificar que los diÃ¡logos creados manualmente compartan estas mismas garantÃ­as. | Unificar diÃ¡logos manuales en el componente comÃºn y ampliar objetivo tÃ¡ctil de cierre. |
| Estados de carga, error y vacÃ­o | 3 / 4 / 3 / 3 | `LoadingState` anuncia estado y `EmptyState` es reutilizable, pero pÃ¡ginas similares alternan esqueletos, spinners y texto; algunos flujos gestionan su propio error. En la lista de usuarios, un error HTTP 500 de la API aparece como fallo de conexiÃ³n; el mensaje debe distinguir servidor, red y ausencia de datos para orientar la recuperaciÃ³n. | ConvenciÃ³n comÃºn: carga inicial, actualizaciÃ³n, error recuperable, sin resultados filtrados y estado vacÃ­o real, cada uno con acciÃ³n siguiente clara; comunicar errores HTTP y de red por separado, conservando el detalle Ãºtil sin exponer informaciÃ³n tÃ©cnica sensible. |
| NavegaciÃ³n y bÃºsqueda | 3 / 3 / 3 / 3 | Hay shells y breadcrumbs por Ã¡rea, mÃ¡s buscador global para ciertos roles. La jerarquÃ­a del sidebar administrativo tiene secciones global, firma, SaaS y sitio pÃºblico; el volumen puede dificultar encontrar destinos. En mÃ³vil los breadcrumbs del abogado se parten en varias lÃ­neas, y las pestaÃ±as del expediente no muestran con claridad el desbordamiento horizontal. | BÃºsqueda de navegaciÃ³n, distinguir enlaces visibles por rol y preservar breadcrumb/retorno en rutas de detalle; compactar breadcrumbs mÃ³viles y hacer evidente la navegaciÃ³n adicional del expediente. |

## PriorizaciÃ³n general de hallazgos

1. **Accesibilidad tÃ¡ctil y foco:** unificar alturas/Ã¡reas de botones, cierres de diÃ¡logo y herramientas de formato. La paleta usa variables de tema para el portal, pero las pÃ¡ginas pÃºblicas escriben colores de marca directamente; hace falta medir contraste en ambos temas.
2. **Complejidad de expedientes y administraciÃ³n:** el detalle del proceso mantiene muchas secciones en un componente con pestaÃ±as; inventarios administrativos reutilizan una pÃ¡gina genÃ©rica. Mejorar arquitectura de informaciÃ³n antes de aÃ±adir mÃ¡s controles.
3. **Consistencia de estados:** normalizar carga, error, vacÃ­o, sin resultados, confirmaciÃ³n y acciones que tardan para que cada rol reciba la misma retroalimentaciÃ³n.
4. **MÃ³vil para trabajo denso:** priorizar tablas administrativas, calendario, documentaciÃ³n y chat, incluyendo teclado virtual y objetivos de toque.
5. **OrientaciÃ³n:** aÃ±adir recuperaciÃ³n de rutas rotas, acceso restringido explicativo y guÃ­a inicial para cuentas sin datos.

## ConclusiÃ³n de Fase 2

La arquitectura tiene una base funcional amplia y varios patrones reutilizables, pero las fricciones principales se concentran en densidad de expedientes y administraciÃ³n, uniformidad de pantallas de estado y controles tÃ¡ctiles pequeÃ±os. Las notas son una lÃ­nea base para decidir por quÃ© bloque empezar; no se modificÃ³ cÃ³digo de interfaz en esta fase.

## RevisiÃ³n visual en navegador: paneles

**Fecha:** 10 de octubre de 2026.
**Dispositivos:** escritorio 1440 Ã— 1000 px y mÃ³vil 390 Ã— 844 px.
**Cuentas:** usuarios temporales locales de cliente, abogado y administrador, con datos de ejemplo.
**Alcance:** se revisaron pÃ¡ginas autenticadas de cliente y abogado, mÃ¡s el resumen global y el listado de usuarios de administraciÃ³n. Se excluyÃ³ el sitio pÃºblico y no se revisaron las secciones SaaS. Esta revisiÃ³n documenta oportunidades; no implementa cambios visuales.

Los textos con `?` en nombres de procesos y actividades pertenecen a los datos temporales usados en la base local y no se consideran defectos de interfaz. El listado de usuarios de administraciÃ³n no pudo evaluarse visualmente en su estado normal: la consulta `GET /api/admin/usuarios?incluir_administradores=true` respondiÃ³ HTTP 500 durante la captura. El mensaje genÃ©rico Â«No se pudo conectar con la APIÂ» oculta ese estado y debe revisarse aparte del diseÃ±o.

| Panel y pantalla | Evidencia observada en las capturas | Aspectos a mejorar | Prioridad |
|---|---|---|---:|
| Cliente Â· Inicio mÃ³vil | Las cuatro mÃ©tricas aparecen en una sola columna y empujan el resto del resumen por debajo del primer viewport. El acceso flotante al chat queda sobre el contenido al desplazarse. | Considerar una cuadrÃ­cula de dos columnas para mÃ©tricas breves; dar espacio inferior al contenido para que los controles flotantes no tapen tarjetas ni acciones. | Media |
| Cliente Â· Procesos mÃ³vil | La bÃºsqueda, el filtro por estado y la tarjeta del expediente se entienden sin desplazamiento horizontal. La tarjeta deja bastante espacio entre el nombre, estado y resumen. | Mantener el patrÃ³n; probar nombres y radicados largos y mostrar una acciÃ³n principal mÃ¡s visible cuando haya varias acciones disponibles. | Baja |
| Cliente Â· Detalle del proceso mÃ³vil | El estado y la descripciÃ³n aparecen al inicio; accesos a actividad, documentos, tareas, radicados y chat se acomodan en dos filas. Luego comienza la cronologÃ­a. | Mantener los accesos en una zona estable y dejar espacio de scroll al final: el chat flotante se superpone al inicio de las actualizaciones. En nombres largos, evitar que el tÃ­tulo empuje el estado fuera de vista. | Media |
| Cliente Â· Documentos escritorio/mÃ³vil | La solicitud y el progreso `0 de 2` se identifican claramente. En mÃ³vil se usan controles nativos de archivo en inglÃ©s y el botÃ³n de entrega queda deshabilitado hasta seleccionar el archivo; al final de la tarjeta el botÃ³n flotante puede cubrir parte del flujo. | Sustituir la presentaciÃ³n nativa por un control de carga consistente en espaÃ±ol que muestre el nombre seleccionado, formatos permitidos, progreso y errores por archivo. Reservar margen inferior para el chat flotante. | Alta |
| Cliente Â· Tareas mÃ³vil | La tarjeta Â«Fechas prÃ³ximasÂ» repite la tarea que vuelve a aparecer en Â«PendientesÂ»; fecha editable, prioridad y botones se muestran en la tarjeta extensa. | Evitar duplicar la tarea en el resumen y en la lista completa; resumir prÃ³ximas fechas como enlace a la tarea y agrupar guardar fecha/completar en una zona de acciones estable. | Media |
| Cliente Â· Calendario mÃ³vil | La vista de lista evita comprimir el calendario mensual. Filtros de proceso y tipo se apilan correctamente; las filas de evento/tarea muestran fecha y enlace relacionado. | Dar mÃ¡s separaciÃ³n al enlace de acciÃ³n en filas estrechas y asegurar que el chat flotante no tape el Ãºltimo elemento o su acciÃ³n. | Media |
| Cliente Â· Notificaciones escritorio/mÃ³vil | Las notificaciones tienen jerarquÃ­a por tipo, fecha, tÃ­tulo y acciÃ³n. En mÃ³vil, Â«Marcar todas como leÃ­dasÂ», actualizar, filtro y controles por aviso ocupan varias filas; el chat flotante se superpone al extremo inferior. | Priorizar el filtro y las acciones globales en una barra compacta; reservar Ã¡rea inferior y hacer mÃ¡s evidente el estado leÃ­do/no leÃ­do sin depender solo del fondo. | Media |
| Abogado Â· Inicio escritorio/mÃ³vil | En escritorio conviven tres tarjetas de acceso, ocho indicadores y dos paneles de actividad/atenciÃ³n. En mÃ³vil se apilan verticalmente y el usuario debe desplazarse bastante antes de ver actividad reciente. | Priorizar tareas, vencimientos y alertas confirmadas al inicio; mover mÃ©tricas secundarias a una secciÃ³n plegable o secundaria. | Alta |
| Abogado Â· Procesos escritorio/mÃ³vil | La barra de bÃºsqueda, selector y filtros funciona en ambos tamaÃ±os. En mÃ³vil los controles se apilan en una tarjeta y parte de los indicadores visibles en escritorio no aparece en la primera fila mÃ³vil. | Mantener un orden y un conjunto de indicadores coherente entre tamaÃ±os; fijar una acciÃ³n principal por expediente y reducir filtros secundarios cuando el espacio es corto. | Media |
| Abogado Â· Tareas escritorio/mÃ³vil | En escritorio la tabla presenta tÃ­tulo, contexto, prioridad, vencimiento, estado y acciones en una sola fila. En mÃ³vil se transforma en tarjetas y conserva estados, proceso y cliente, aunque acciones adicionales quedan mÃ¡s abajo. | Mantener la tabla en escritorio; en mÃ³vil colocar las acciones principales en una fila persistente dentro de la tarjeta y limitar cuÃ¡nto resumen se repite entre encabezado, contadores y lista. | Media |
| Abogado Â· Agenda escritorio/mÃ³vil | La pantalla ofrece filtros por responsable, proceso, cliente y tipo, mÃ¡s controles de dÃ­a/semana/mes/lista. En mÃ³vil todos los filtros se apilan antes del calendario, ocupando casi el primer viewport. | Agrupar filtros secundarios en un panel desplegable y dejar visibles el rango activo y el selector de vista. En estado vacÃ­o, mostrar el rango de fechas consultado para que sea claro por quÃ© no aparecen actividades. | Alta |
| Abogado Â· Documentos mÃ³vil | El botÃ³n de solicitud va primero; despuÃ©s aparecen bÃºsqueda, dos selectores, actualizaciÃ³n y cuatro contadores antes de las carpetas por proceso. La lista principal empieza debajo del primer viewport. | Reducir o plegar contadores cuando hay poco contenido y adelantar las carpetas/solicitudes, que son el trabajo central de la pÃ¡gina. Mantener visible el botÃ³n de solicitar documento. | Media |
| Abogado Â· Ficha del proceso mÃ³vil | La ficha aÃºn presenta pestaÃ±as horizontales: varias quedan fuera del viewport y solo se insinÃºa el desplazamiento con una barra fina. El campo DescripciÃ³n se muestra en una sola lÃ­nea y su contenido queda cortado. | Convertir las secciones en subpÃ¡ginas con rutas `/proceso/[id]/[subpagina]`, como se solicitÃ³ previamente; usar textarea o una vista expandible para la descripciÃ³n. | Alta |
| AdministraciÃ³n Â· Resumen global escritorio/mÃ³vil | El resumen separa indicadores, accesos rÃ¡pidos y actividad. En escritorio el menÃº lateral contiene muchos grupos y requiere scroll; en mÃ³vil el resumen se vuelve una columna larga y el chat flotante se cruza con tarjetas cercanas al borde inferior. | Dar prioridad a alertas y acciones diarias, permitir contraer grupos de navegaciÃ³n y proteger el contenido del botÃ³n flotante con espacio inferior. | Media |
| AdministraciÃ³n Â· Usuarios | La captura muestra el mensaje de error de API y una tabla vacÃ­a, por lo que no se califican densidad de filas, filtros ni acciones individuales/en bloque. La API devolviÃ³ HTTP 500 en la consulta mencionada arriba. | Resolver el 500 y diferenciar errores HTTP del texto Â«no se pudo conectarÂ»; repetir la evaluaciÃ³n de escritorio y mÃ³vil con resultados reales. | Bloqueo funcional |

### Hallazgos compartidos

- El botÃ³n flotante de chat estÃ¡ presente sobre casi todas las pÃ¡ginas y puede cubrir contenido al final de tarjetas, listas o formularios en mÃ³vil. Debe reservarse espacio o ajustarse su posiciÃ³n segÃºn el Ã¡rea desplazable.
- Las pÃ¡ginas de listado se adaptan al ancho sin desbordamiento general en las capturas de cliente y abogado; los principales problemas mÃ³viles observados son densidad vertical y elementos internos desplazables, especialmente las pestaÃ±as de la ficha del proceso.
- Los selectores nativos y los campos de archivo pueden mostrar idioma o presentaciÃ³n del navegador, no del producto; conviene envolverlos con etiquetas y estados claros para mantener una experiencia coherente.
- La comprobaciÃ³n visual no sustituye pruebas con lector de pantalla, teclado, contraste medido ni datos extensos. Antes de implementar, revisar nombres de proceso largos, muchos documentos/tareas y estados vacÃ­os.

### Orden sugerido de mejora basado en capturas

1. Corregir el HTTP 500 del listado de usuarios y mostrar por separado errores de servidor y fallos de conexiÃ³n.
2. Completar la ficha del proceso como subpÃ¡ginas y mejorar la ediciÃ³n de descripciones largas.
3. Ajustar carga de documentos y el espacio reservado al chat flotante en mÃ³vil.
4. Reducir el desplazamiento del inicio del abogado y del inicio del cliente con una jerarquÃ­a de mÃ©tricas mÃ¡s compacta.
5. Afinar las acciones de calendario/notificaciones y la navegaciÃ³n administrativa en mÃ³vil.

## Seguimiento de implementaciÃ³n por bloques

### Resumen de los bloques anteriores

| Bloque | Trabajo registrado | Alcance pendiente o vigente |
|---|---|---|
| 1. Sitio pÃºblico | Se separaron en la experiencia pÃºblica los servicios activos de la firma y la oferta de GestiÃ³n de Procesos, manteniendo el acceso del menÃº y contemplando prelanzamiento/lanzamiento del SaaS. | Por instrucciÃ³n del usuario, el contenido pÃºblico queda congelado y no se harÃ¡n mÃ¡s cambios allÃ­. |
| 2. Acceso y recuperaciÃ³n | Se separaron las entradas de administraciÃ³n y de los portales de cliente/abogado, con selecciÃ³n de destino por dominio/rol y rutas de autenticaciÃ³n dedicadas. | Revisar en despliegue que los dominios configurados coincidan con Vercel; no ampliar el trabajo de login salvo bloqueo reportado. |
| 3. Dashboard compartido y compatibilidad | Se trabajÃ³ la separaciÃ³n entre paneles de firma y rutas heredadas, preservando acceso a destinos de cliente/abogado. | La parte SaaS queda expresamente fuera de alcance y pausada; no se harÃ¡n cambios en sus pÃ¡ginas. |

### Bloque 4: Portal del cliente â€” implementado; validaciÃ³n visual pendiente

- El resumen mÃ³vil de vencimientos agrupa tareas por fecha y enlaza al primer pendiente de ese dÃ­a, evitando repetir los tÃ­tulos de las tareas.
- La carga documental presenta un selector en espaÃ±ol, muestra el nombre del archivo elegido y conserva validaciÃ³n de formato y tamaÃ±o.
- Las notificaciones indican explÃ­citamente Â«LeÃ­daÂ» o Â«Sin leerÂ», ademÃ¡s del tratamiento visual.
- Las vistas principales reservan espacio inferior para que el botÃ³n flotante del chat no cubra acciones en mÃ³vil.
- La cuadrÃ­cula de mÃ©tricas del inicio y los filtros/listas de procesos y calendario ya se adaptaban a pantallas estrechas; se conservaron.

No se modificaron las pÃ¡ginas pÃºblicas ni las secciones SaaS. Falta repetir la revisiÃ³n visual en navegador tras estos cambios y evaluar con lector de pantalla y teclado fÃ­sico.

### Bloque 5: Portal del abogado â€” implementado; validaciÃ³n visual pendiente

- El inicio conserva la cola de atenciÃ³n y actividad, y permite plegar los ocho indicadores secundarios para reducir el recorrido inicial.
- La agenda agrupa los filtros opcionales, muestra cuÃ¡ntos estÃ¡n activos y expone el rango consultado aun cuando no haya resultados.
- En tareas, la acciÃ³n Â«CompletarÂ» tiene una etiqueta visible y los controles tÃ¡ctiles alcanzan una altura mÃ­nima mayor.
- En documentos, los cuatro contadores quedan plegados para adelantar las carpetas por proceso.
- La descripciÃ³n del expediente admite varias lÃ­neas y la navegaciÃ³n horizontal de subpÃ¡ginas explica en mÃ³vil que hay mÃ¡s secciones.
- Las vistas principales reservan espacio inferior para el chat flotante.

No se modificaron las pÃ¡ginas pÃºblicas ni las secciones SaaS. Falta repetir la revisiÃ³n visual en navegador tras estos cambios y evaluar con lector de pantalla y teclado fÃ­sico.

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

No se modifico la seccion de contenido publico ni las vistas SaaS. Falta revisar visualmente los estados y modales en ambos temas y tamaÃ±os, y confirmar con teclado y lector de pantalla el flujo de detalle de entregas.

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
