# PROMPT MAESTRO — GESTIÓN DE PROCESOS: FIRMA + SAAS INDIVIDUAL

Actúa como **arquitecto de software senior y desarrollador Full Stack para un sistema jurídico híbrido**, con una firma interna y abogados SaaS individuales, usando FastAPI, SQLAlchemy, PostgreSQL, Next.js, TypeScript, Tailwind CSS, JWT, permisos, auditoría, tareas programadas e integraciones externas.

Vas a trabajar sobre el repositorio actual de **Gestión de Procesos**, una plataforma jurídica desarrollada para:

**Alejandra Muñoz | Abogada y Asociados**

La plataforma está destinada a la gestión interna de la firma, sus abogados, colaboradores, clientes, procesos judiciales, radicados, actuaciones, documentos, tareas y demás información relacionada con la actividad jurídica.

---

# REGLA PRINCIPAL

**NO empieces modificando código.**

Primero debes:

1. Inspeccionar completamente la estructura actual del proyecto.
2. Identificar backend, frontend, modelos, routers, schemas, servicios, autenticación, tareas, jobs, webhooks, componentes y páginas.
3. Determinar qué funcionalidades ya existen.
4. Determinar cuáles están incompletas.
5. Detectar duplicaciones.
6. Detectar inconsistencias entre frontend y backend.
7. Detectar endpoints sin protección adecuada.
8. Detectar problemas de permisos y control de acceso.
9. Detectar funcionalidades que dependan de Celery/worker y que no sean compatibles directamente con Vercel.
10. Detectar páginas/paneles duplicados.
11. Detectar problemas de roles.
12. Detectar operaciones CRUD que puedan afectar información que el usuario no debería modificar.
13. Detectar operaciones de eliminación que puedan provocar pérdida accidental de información.
14. Revisar variables de entorno, secretos, URLs, CORS, JWT y configuración de producción.
15. Revisar la estrategia actual de consultas automáticas, webhooks y tareas programadas.
16. Identificar qué información debe ser accesible únicamente por determinados usuarios de la firma.
17. Identificar qué información puede ser visible para clientes mediante el futuro portal de clientes.

Después de esta auditoría debes presentar internamente un diagnóstico del sistema y utilizarlo para implementar los cambios.

**No reconstruyas funcionalidades que ya estén correctamente implementadas.**

---

# 1. OBJETIVO GENERAL

Convertir el sistema actual en una plataforma jurídica modular, segura, escalable y preparada para producción denominada:

**Gestión de Procesos**

La plataforma pertenece y está destinada a:

**Alejandra Muñoz | Abogada y Asociados**

El sistema debe permitir:

* gestión de procesos jurídicos;
* gestión de radicados;
* consulta de actuaciones;
* gestión de clientes;
* gestión documental;
* tareas;
* subtareas;
* recordatorios;
* agenda;
* audiencias;
* términos procesales;
* comunicaciones;
* notificaciones;
* portal de clientes;
* administración de usuarios internos;
* administración de roles;
* administración granular de permisos;
* auditoría;
* reportes;
* automatizaciones;
* consulta judicial;
* planes y límites SaaS para abogados externos individuales, nunca para personal de la firma;
* integraciones externas.

La prioridad debe ser:

**seguridad → permisos → estabilidad → funcionalidad → UX/UI.**

---

# 2. MODELO ORGANIZACIONAL

## MODELO HÍBRIDO

El producto ofrece dos modalidades claramente separadas:

1. Un espacio interno único para la firma:

```text
Alejandra Muñoz | Abogada y Asociados
```

2. Cuentas SaaS individuales de abogados externos, con registro público y plan propio.

No se soportan otros despachos con múltiples miembros ni selector de firmas. La cuenta `ABOGADO` externa es su propia frontera de datos, identificada por su propietario (`usuario_id`/`abogado_id`); sus recursos nunca se mezclan con la firma ni con otra cuenta `ABOGADO`. No introducir una entidad genérica `Tenant` mientras el producto siga siendo una firma fija más cuentas individuales.

Separar obligatoriamente las modalidades:

| Modalidad | Roles/datos | Plan |
| --- | --- | --- |
| Administración | `ADMIN`: administra el producto, planes, cuentas SaaS y la cuenta interna de la firma. | No consume plan. |
| Firma interna | `ABOGADO_ADMIN`: lo crea únicamente ADMIN; gestiona recursos de Alejandra Muñoz y no participa en facturación/planes. `CLIENTE`: acceso por asignación explícita. | Sin plan. |
| SaaS individual | `ABOGADO`: único rol con registro público; dueño de su cuenta y recursos SaaS, sujeto a límites de plan. | Plan obligatorio y aplicado en backend solo a `ABOGADO`. |

No permitir que la vista de firma acceda accidentalmente a datos SaaS externos. ADMIN puede administrar ambas modalidades; ABOGADO_ADMIN solo la firma; ABOGADO solo su cuenta; CLIENTE solo sus asignaciones.

La seguridad debe centrarse en:

```text
Usuario
   ↓
Rol
   ↓
Permisos
   ↓
Alcance
   ↓
Recurso
```

El sistema debe controlar qué puede hacer cada usuario según su modalidad, rol, permisos, responsable y asignaciones explícitas.

---

# 3. ESTADO ACTUAL QUE DEBES RESPETAR

Actualmente existen, entre otras, las siguientes entidades y funcionalidades:

* Usuario
* Plan
* Radicado
* Actuación
* ConsultaRadicado
* Proceso
* ProcesoRadicado
* ProcesoCliente
* Cliente
* Tarea
* Subtarea
* RecordatorioTarea
* SolicitudDocumento
* DocumentoProceso
* NotificacionProceso
* SolicitudRegistro

También existe:

* autenticación JWT;
* bcrypt;
* planes SaaS;
* límites de radicados;
* consultas de radicados;
* Celery;
* consultas automáticas;
* notificaciones;
* WhatsApp;
* email;
* administración de usuarios;
* administración de planes;
* solicitudes de registro;
* dashboard administrativo;
* inventarios administrativos;
* gestión de procesos;
* clientes;
* documentos;
* tareas.

No elimines estas funcionalidades.

Debes conservarlas y evolucionarlas.

Si alguna funcionalidad fue diseñada originalmente alrededor de una arquitectura multi-tenant, **adáptala al modelo de una única firma en lugar de conservar complejidad innecesaria**.

---

# 4. DISTINCIÓN FUNDAMENTAL

No confundas:

**Proceso ≠ Radicado**

Un proceso puede contener uno o varios radicados.

La arquitectura debe conservar esta separación.

Ejemplo:

```text
Cliente
   ↓
Proceso
   ├── Radicado 1
   │     └── Actuaciones
   ├── Radicado 2
   │     └── Actuaciones
   ├── Tareas
   ├── Documentos
   ├── Audiencias
   ├── Términos
   └── Comunicaciones
```

---

# 5. MODELO DE USUARIOS

El sistema debe diferenciar claramente entre:

## ADMIN

Administrador global del sistema. Puede gestionar planes/cuentas SaaS y administrar la única cuenta interna de la firma.

Debe tener acceso al panel administrativo global.

Puede crear al abogado interno `ABOGADO_ADMIN`, consultar la operación SaaS según política y administrar la firma.

---

## ABOGADO EXTERNO (`ABOGADO`)

Es un profesional independiente que puede registrarse públicamente, elegir un plan y consultar sus propios radicados y recursos asociados. Su información queda aislada por cuenta y los límites del plan se validan en backend.

---

## ABOGADO INTERNO (`ABOGADO_ADMIN`)

Pertenece a Alejandra Muñoz | Abogada y Asociados. Solo ADMIN puede crear/habilitar esta cuenta. Usa procesos, clientes, radicados y tareas de la firma, sin asociarse a planes SaaS.

---

## USUARIOS INTERNOS DE LA FIRMA

Ejemplos:

* socio;
* abogado;
* abogado junior;
* asistente;
* pasante;
* gestor.

Estos usuarios:

**NO deben poder registrarse públicamente.**

Deben ser:

* creados;
* invitados;
* habilitados;

por ADMIN; en esta implementación los perfiles internos adicionales deben habilitarse de forma controlada y no pueden registrarse públicamente.

Todos pertenecen a:

**Alejandra Muñoz | Abogada y Asociados**

---

## CLIENTE

Tampoco debe tener registro público abierto.

Debe ser:

* creado;
* invitado;
* vinculado;

por un usuario autorizado de la firma.

---

# 6. CONTROL DE ACCESO

Como existe una única firma, la protección de los datos debe basarse en:

```text
Usuario
   ↓
Rol
   ↓
Permiso
   ↓
Alcance
   ↓
Recurso
```

Ningún usuario debe poder acceder, modificar o eliminar información que esté fuera de su alcance autorizado.

Por ejemplo:

```text
ABOGADO

Puede:
✓ consultar sus procesos
✓ crear procesos
✓ modificar sus procesos
✓ consultar clientes asignados
✓ administrar tareas autorizadas

No puede:
✗ modificar configuraciones administrativas
✗ administrar usuarios sin permiso
✗ cambiar planes
✗ acceder a funciones exclusivas del ADMIN
```

No confíes únicamente en el frontend.

Toda autorización debe validarse en backend.

Nunca implementes seguridad simplemente ocultando botones.

---

# 7. SISTEMA DE ROLES Y PERMISOS

Reestructura el sistema para separar:

## Rol

Define el tipo de usuario.

## Permiso

Define qué puede hacer.

## Alcance

Define sobre qué recursos puede hacerlo.

Ejemplo:

```text
ROL:
ABOGADO

PERMISOS:
proceso.ver
proceso.crear
proceso.editar
tarea.ver
tarea.crear

ALCANCE:
propios
```

Otro:

```text
ROL:
ABOGADO_ADMIN

PERMISOS:
proceso.*
cliente.*
tarea.*
documento.*
usuario.*

ALCANCE:
todos
```

Otro:

```text
ROL:
ASISTENTE

PERMISOS:
proceso.ver
tarea.ver
tarea.crear
documento.ver
documento.subir

ALCANCE:
asignados
```

El sistema debe permitir evolucionar estos permisos sin tener que reescribir toda la aplicación.

---

# 8. CRUD GRANULAR

Todos los módulos funcionales deben disponer de CRUD coherente cuando corresponda:

* Create
* Read
* Update
* Delete

Pero ningún CRUD debe permitir que un usuario opere sobre recursos fuera de su alcance.

Ejemplo:

```text
GET /procesos/{id}
```

Debe verificar:

1. usuario autenticado;
2. permiso;
3. alcance;
4. pertenencia o autorización sobre el recurso.

No basta con comprobar que existe el ID.

---

# 9. ELIMINACIONES SEGURAS

No permitas que un usuario pueda destruir accidentalmente información crítica.

Implementa cuando sea conveniente:

* soft delete;
* archivado;
* papelera;
* restauración;
* confirmación;
* auditoría.

Las entidades críticas deberían preferir:

```text
activo = false
```

o:

```text
deleted_at
```

en lugar de eliminación física inmediata.

La eliminación física debe estar reservada para casos controlados.

El ADMIN debe poder realizar acciones extraordinarias.

---

# 10. SISTEMA DE PERMISOS ADMINISTRABLE

El ADMIN debe poder determinar desde el panel:

* qué roles existen;
* qué permisos tiene cada rol;
* qué usuarios tienen permisos adicionales;
* qué usuarios tienen permisos restringidos;
* alcance de cada permiso.

Ejemplo:

```text
PROCESOS

☑ Ver
☑ Crear
☑ Editar
☐ Eliminar

TAREAS

☑ Ver
☑ Crear
☑ Editar
☑ Eliminar

DOCUMENTOS

☑ Ver
☑ Subir
☑ Descargar
☐ Eliminar
```

No codifiques todas las decisiones de permisos directamente en componentes frontend.

El backend debe ser la autoridad.

---

# 11. UNIFICACIÓN DE PANELES

Actualmente existen varios paneles separados, cada uno con sus propios `page.tsx`.

Debes analizar la estructura actual y unificar los paneles funcionales en **un solo panel principal para los usuarios de la firma**.

Debe existir una arquitectura equivalente a:

```text
/dashboard
```

o la ruta principal que resulte más adecuada según el proyecto actual.

El panel debe cambiar dinámicamente según:

* usuario;
* rol;
* permisos;
* plan;
* funcionalidades habilitadas.

No deben existir múltiples dashboards funcionalmente duplicados.

El:

**panel ADMIN "Ojo de Dios"**

sí debe permanecer separado cuando sus funciones sean administrativas o de supervisión global.

---

# 12. NAVEGACIÓN DINÁMICA

La navegación debe construirse a partir de permisos.

Ejemplo:

```text
ABOGADO

Inicio
Procesos
Radicados
Tareas
Agenda
Clientes
Documentos
Notificaciones
Mi cuenta
```

Otro usuario:

```text
ASISTENTE

Inicio
Procesos
Tareas
Agenda
Documentos
```

Cliente:

```text
Inicio
Mis procesos
Mis documentos
Solicitudes
Comunicaciones
Mi cuenta
```

Las pestañas que no correspondan:

* no deben mostrarse;
* tampoco deben ser accesibles directamente mediante URL.

---

# 13. FRONTEND

Para el frontend debes tomar como **referencia visual y estructural principal la interfaz existente del panel de administrador abogado**.

No diseñes una aplicación visualmente independiente.

Conserva:

* identidad visual;
* sidebar;
* navegación;
* componentes;
* botones;
* tablas;
* tarjetas;
* modales;
* formularios;
* modo claro/oscuro;
* responsive;
* tipografía;
* espaciado;
* jerarquía visual.

El nuevo panel debe sentirse como una evolución del sistema actual.

No reemplaces innecesariamente componentes que ya funcionan.

---

# 14. EXPEDIENTE JURÍDICO

Evoluciona el concepto actual de proceso hacia un expediente jurídico integral.

Cada proceso debería poder contener:

```text
Información general
Clientes
Partes
Radicados
Actuaciones
Tareas
Subtareas
Recordatorios
Documentos
Solicitudes de documentos
Audiencias
Términos
Comunicaciones
Notas
Historial
Línea de tiempo
```

---

# 15. ESTADOS DE PROCESO

Implementa estados jurídicamente útiles.

Por ejemplo:

```text
PREPARACIÓN
ACTIVO
EN_ESPERA
SUSPENDIDO
FINALIZADO
ARCHIVADO
```

Permite que el ADMIN pueda configurar los estados si la arquitectura lo permite.

---

# 16. TIPOS DE PROCESO

Permite clasificar procesos:

```text
Civil
Laboral
Penal
Familia
Administrativo
Comercial
Constitucional
Disciplinario
Otro
```

Debe ser posible filtrar y consultar por tipo.

---

# 17. PARTES DEL PROCESO

No reduzcas el proceso únicamente al cliente.

Debe existir una estructura de partes:

```text
Demandante
Demandado
Apoderado
Juzgado
Entidad
Tercero
Ministerio Público
Otro
```

Cada parte debe poder tener información relevante.

---

# 18. LÍNEA DE TIEMPO

Implementa una timeline por proceso.

Debe mostrar cronológicamente:

* creación;
* actuaciones;
* tareas;
* documentos;
* solicitudes;
* respuestas;
* audiencias;
* comunicaciones;
* cambios importantes;
* términos.

Ejemplo:

```text
25 SEP
Nueva actuación

26 SEP
Tarea creada

27 SEP
Documento solicitado

28 SEP
Documento recibido

30 SEP
Audiencia

02 OCT
Término vence
```

---

# 19. AGENDA

Implementa calendario:

* día;
* semana;
* mes.

Eventos:

* audiencias;
* reuniones;
* vencimientos;
* tareas;
* recordatorios;
* citas;
* eventos personalizados.

Los eventos deben poder vincularse a procesos.

---

# 20. TÉRMINOS PROCESALES

Crear un módulo específico.

Debe permitir:

* fecha inicial;
* fecha final;
* días hábiles;
* días calendario;
* alertas;
* estado;
* suspensión;
* prórroga;
* vencimiento.

Debe calcular correctamente los días hábiles según la configuración jurídica correspondiente.

No hardcodees cálculos que después impidan modificar reglas.

---

# 21. DOCUMENTOS

Evoluciona la gestión documental.

Debe contemplar:

* carpetas;
* categorías;
* etiquetas;
* versiones;
* historial;
* búsqueda;
* descarga;
* previsualización cuando sea posible;
* relación con proceso;
* relación con cliente;
* relación con actuación;
* relación con tarea.

---

# 22. CLIENTES

Implementa una experiencia completa de clientes:

```text
Cliente
├── Información
├── Procesos
├── Documentos
├── Solicitudes
├── Tareas
├── Comunicaciones
└── Historial
```

---

# 23. PORTAL DEL CLIENTE

El cliente debe visualizar únicamente:

* sus procesos;
* sus documentos;
* solicitudes;
* comunicaciones;
* información que explícitamente se le haya autorizado.

Nunca debe poder acceder a:

* notas internas;
* información de otros clientes;
* información interna del abogado;
* configuraciones;
* datos administrativos;
* información de otros procesos.

---

# 24. COMUNICACIONES

Implementa historial de comunicaciones:

```text
WhatsApp
Email
Mensaje interno
```

Relacionadas con:

* proceso;
* cliente;
* actuación;
* tarea.

Debe existir trazabilidad.

---

# 25. AUDITORÍA

Crear un módulo de auditoría.

Registrar:

```text
Usuario
Fecha/hora
Acción
Entidad
ID
IP si corresponde
Datos anteriores
Datos posteriores
Resultado
```

Ejemplos:

```text
CREÓ PROCESO
EDITÓ CLIENTE
ELIMINÓ DOCUMENTO
CAMBIÓ PERMISO
CAMBIÓ PLAN
INICIÓ CONSULTA
MODIFICÓ TAREA
```

El ADMIN debe poder consultar esta información.

**No es necesario registrar Tenant**, porque la plataforma corresponde a una única firma.

---

# 26. DASHBOARD DEL USUARIO

El dashboard debe ser contextual.

Mostrar únicamente información relevante.

Ejemplo:

```text
Procesos activos
Tareas pendientes
Próximos vencimientos
Próximas audiencias
Últimas actuaciones
Consultas recientes
Documentos pendientes
Notificaciones
Uso del plan
```

---

# 27. PLANES SaaS

Los planes aplican únicamente al rol externo `ABOGADO`. Pueden limitar radicados, actuaciones visibles, consultas o funciones asociadas. Toda limitación se valida en backend.

`ADMIN`, `ABOGADO_ADMIN` y `CLIENTE` no consumen planes SaaS. No usar planes para restringir el trabajo interno de la firma. Conservar asignaciones antiguas y migrarlas de forma reversible.

---

# 28. REGISTRO Y ALTA DE USUARIOS

El único rol con registro público es `ABOGADO` externo: registro, plan, datos profesionales, solicitud y aprobación según el flujo existente.

`ABOGADO_ADMIN` es exclusivo de la firma y solo ADMIN puede crearlo/habilitarlo. `CLIENTE` se crea/invita internamente y solo ve procesos/tareas/documentos asignados. No ofrecer registro público para roles internos o clientes.

---

# 29. PANEL ADMINISTRATIVO — OJO DE DIOS

El panel ADMIN es el centro de control global del producto. Administra el SaaS individual y la cuenta interna de Alejandra Muñoz | Abogada y Asociados, manteniendo separados sus datos y permisos.

No administra múltiples firmas externas. El ADMIN puede consultar ambas modalidades; el acceso de los usuarios ABOGADO y ABOGADO_ADMIN permanece separado por su scope.

La interfaz Ojo de Dios debe mantener ámbitos claramente separados: `Control global`, `Firma`, `SaaS individual` y `Contenido público`. El ámbito activo debe estar visible en navegación y encabezados en todo momento. Nunca presentes inventarios globales como si fueran datos exclusivos de la firma o de una cuenta SaaS.

Todo CRUD administrativo de procesos, radicados, tareas y documentos debe filtrar y validar el ámbito en backend, además del cliente. Al crear o reasignar recursos se debe indicar el responsable/propietario; las mutaciones quedan auditadas. No reutilices pantallas con consultas globales dentro del sector Firma/SaaS si no reciben scope explícito.

Debe permitir al ADMIN observar y administrar:

## Resumen global

* usuarios;
* abogados;
* clientes;
* procesos;
* radicados;
* actuaciones;
* consultas;
* tareas;
* documentos;
* almacenamiento;
* notificaciones;
* errores;
* trabajos programados.

## Usuarios

* listar;
* buscar;
* filtrar;
* crear;
* editar;
* suspender;
* activar;
* bloquear;
* cambiar rol;
* cambiar plan de cuentas ABOGADO SaaS;
* restablecer contraseña;
* forzar cambio de contraseña;
* ver actividad;
* ver consumo.

## Usuarios de la firma

Cuando corresponda, el ADMIN debe poder:

* consultar usuarios internos;
* ver roles;
* ver permisos;
* activar/desactivar usuarios;
* revisar actividad;
* gestionar accesos.

## Planes SaaS

ADMIN puede crear, editar, activar/desactivar planes y definir límites/funciones para cuentas externas ABOGADO. Los planes no aplican a ABOGADO_ADMIN, CLIENTE ni ADMIN. Los límites deben validarse en backend, nunca solo en frontend.

## Contenido público

Las páginas públicas principales deben conservar su estructura visual y poder editar sus textos/listas estructurados desde ADMIN. El editor no debe aceptar HTML/JavaScript arbitrario; los valores se renderizan como texto escapado. Debe existir fallback al contenido base, restauración y auditoría de cada cambio.

## Procesos

El ADMIN debe poder:

* consultar cualquier proceso;
* filtrar;
* ver propietario;
* ver clientes;
* ver radicados;
* ver tareas;
* ver documentos;
* archivar;
* restaurar;
* intervenir cuando sea necesario.

## Radicados

* consultar;
* ver actuaciones;
* ver consultas;
* consultar estado de jobs;
* forzar consulta;
* reintentar consulta;
* revisar errores.

## Tareas

* consultar;
* filtrar;
* ver responsable;
* ver vencimientos;
* revisar tareas atrasadas.

## Documentos

* consultar;
* identificar propietario;
* revisar almacenamiento;
* revisar documentos problemáticos.

## Notificaciones

* historial;
* WhatsApp;
* email;
* errores;
* reintentos;
* estado.

## Jobs

Mostrar:

```text
Pendientes
En ejecución
Completados
Fallidos
Reintentos
```

## Webhooks

Mostrar:

* recibidos;
* procesados;
* fallidos;
* timestamp;
* origen;
* respuesta;
* errores.

## Auditoría

Debe existir una vista global de auditoría.

---

# 30. OJO DE DIOS — REGLA DE SEGURIDAD

El ADMIN tiene poder absoluto dentro de la aplicación, pero todas sus acciones igualmente deben quedar auditadas.

Nunca permitir una acción administrativa sin registro.

Ejemplo:

```text
ADMIN
 ↓
Elimina proceso 123
 ↓
AUDITORÍA
 ↓
ADMIN X
Proceso 123
Acción DELETE
Fecha
Motivo/opcional
```

---

# 31. JOBS PROGRAMADOS Y WORKERS

Primero identifica el hosting real y los requisitos de operación. Vercel es una opción a evaluar, no un requisito ni un criterio obligatorio de aceptación.

Primero identifica qué tareas actuales dependen de:

* Celery worker;
* Celery Beat;
* procesos persistentes;
* `watchfiles`;
* workers locales;
* procesos de larga duración.

Un entorno serverless no puede depender de un worker persistente. Si el hosting elegido es serverless, define un servicio o scheduler compatible; no migres jobs por asumir Vercel.

Por tanto:

* identificar cada tarea programada;
* determinar si cada tarea permanece en Celery o migra a un scheduler disponible;
* proteger ejecuciones programadas y evitar duplicados;
* hacer jobs idempotentes;
* evitar ejecuciones duplicadas;
* registrar ejecución;
* registrar errores.

Ejemplo conceptual:

```text
Scheduler elegido
    ↓
consulta de radicados
    ↓
Selecciona trabajos pendientes
    ↓
Ejecuta procesamiento
    ↓
Actualiza DB
    ↓
Registra resultado
```

No asumas que Celery debe desaparecer completamente sin analizar antes qué funcionalidades dependen de él.

Determina qué tareas pueden migrarse a Vercel y cuáles necesitan un servicio externo.

---

# 32. WEBHOOKS

Preparar endpoints para:

* WhatsApp;
* proveedores externos;
* eventos de pago si posteriormente se agregan;
* otros servicios externos.

Los webhooks deben:

* validar autenticidad;
* validar firma/token cuando corresponda;
* registrar recepción;
* ser idempotentes;
* evitar procesamiento duplicado;
* registrar errores;
* responder rápidamente;
* delegar procesamiento pesado a una estrategia compatible con el entorno de despliegue.

Nunca confiar únicamente en que el frontend llame estos endpoints.

---

# 33. DESPLIEGUE Y PRODUCCIÓN

Revisar para el proveedor de hosting elegido (Vercel solo si se selecciona):

* variables de entorno;
* CORS;
* URLs;
* secretos;
* JWT;
* base de datos;
* almacenamiento de archivos;
* webhooks;
* cron;
* URLs públicas;
* configuración de frontend;
* configuración backend;
* timeouts;
* operaciones de larga duración.

No dejar:

```text
SECRET_KEY = "..."
```

hardcodeado.

Todos los secretos deben proceder de variables de entorno.

---

# 34. ARCHIVOS

No asumir que el almacenamiento local:

```text
/uploads
```

funcionará igual en producción serverless.

Revisar y preparar almacenamiento persistente externo.

Separar:

```text
metadata → PostgreSQL
archivo → almacenamiento persistente
```

No almacenar archivos importantes únicamente en filesystem efímero de Vercel.

---

# 35. SEGURIDAD

Auditar especialmente:

* JWT;
* expiración;
* refresh tokens si son necesarios;
* password hashing;
* CORS;
* CSRF cuando aplique;
* validación de entrada;
* SQL injection;
* path traversal;
* upload de archivos;
* MIME types;
* tamaño máximo;
* permisos;
* IDOR;
* endpoints administrativos;
* webhooks;
* cron;
* secretos.

La seguridad debe considerar principalmente:

```text
usuario → rol → permiso → alcance → recurso
```

No implementar complejidad de aislamiento entre tenants porque el sistema no utiliza múltiples organizaciones.

---

# 36. API

Revisar todos los endpoints existentes.

Crear una matriz:

```text
Endpoint
Método
Rol
Permiso
Alcance
CRUD
Riesgo
```

No debe existir endpoint que permita acceder a recursos simplemente conociendo su ID.

---

# 37. FRONTEND — PROTECCIÓN

El frontend debe:

* ocultar funciones no autorizadas;
* mostrar navegación según permisos;
* proteger rutas;
* manejar expiración de sesión;
* manejar 401;
* manejar 403;
* manejar estados de carga;
* manejar errores;
* no almacenar secretos;
* no confiar en el frontend para autorización.

La autorización real siempre debe estar en backend.

---

# 38. UX

Mantener el lenguaje visual actual del panel administrativo abogado.

Crear componentes reutilizables:

```text
DataTable
Modal
Drawer
Form
ConfirmDialog
StatusBadge
PermissionGuard
RoleGuard
EmptyState
LoadingState
ErrorState
Timeline
Calendar
```

Evitar duplicar componentes por cada tipo de usuario.

---

# 39. ESTRUCTURA FRONTEND OBJETIVO

Buscar una arquitectura aproximadamente equivalente a:

```text
app/gestion-procesos/
│
├── dashboard/
│
├── procesos/
├── radicados/
├── tareas/
├── agenda/
├── clientes/
├── documentos/
├── notificaciones/
├── configuracion/
│
└── admin/
    ├── dashboard/
    ├── usuarios/
    ├── planes/
    ├── procesos/
    ├── radicados/
    ├── tareas/
    ├── documentos/
    ├── jobs/
    ├── webhooks/
    ├── auditoria/
    └── configuracion/
```

Adapta esta estructura a la estructura real del proyecto.

No fuerces rutas innecesariamente.

---

# 40. API CLIENT

Centraliza las llamadas API.

Debe existir una única estrategia para:

* token;
* errores;
* refresh;
* 401;
* 403;
* loading;
* parsing;
* headers.

No dupliques `fetch()` con lógica diferente en cada página.

---

# 41. REPORTES

Agregar posteriormente una capa de reportes:

* procesos activos;
* procesos cerrados;
* consultas;
* actuaciones;
* tareas;
* vencimientos;
* clientes;
* uso del plan.

Para ADMIN:

* crecimiento;
* usuarios;
* planes;
* consumo;
* errores;
* actividad.

---

# 42. PRINCIPIO DE NO REGRESIÓN

Antes de modificar una funcionalidad:

1. identificar cómo funciona actualmente;
2. conservar endpoints existentes cuando sea posible;
3. mantener compatibilidad;
4. migrar gradualmente;
5. no eliminar rutas sin comprobar dependencias;
6. no romper el frontend actual;
7. ejecutar pruebas.

---

# 43. MIGRACIONES

Si se modifican modelos SQLAlchemy:

* crear migración;
* no modificar directamente producción;
* revisar claves foráneas;
* revisar cascadas;
* revisar índices;
* revisar constraints;
* revisar datos existentes.

Especial atención a:

```text
Proceso
ProcesoRadicado
ProcesoCliente
Tarea
DocumentoProceso
SolicitudDocumento
Usuario
```

Si durante la auditoría encuentras estructuras relacionadas con `tenant`, `organization`, `firm` o conceptos equivalentes que hayan sido creadas para soportar múltiples organizaciones, determina primero si realmente son necesarias.

**No agregues ni conserves abstracciones multi-tenant únicamente por seguir una arquitectura SaaS genérica.**

---

# 44. PRUEBAS

Crear o ampliar pruebas para:

## Autenticación

* login;
* password;
* expiración;
* permisos.

## Control de acceso

Probar expresamente:

```text
Usuario A intenta acceder a un recurso
que no está dentro de su alcance
→ 403/404
```

## CRUD

Probar:

* crear;
* consultar;
* editar;
* eliminar;
* restaurar.

## Roles

Probar cada rol.

## ADMIN

Probar acceso global.

## Webhooks

Probar:

* firma;
* duplicados;
* errores.

## Cron

Probar:

* ejecución;
* duplicados;
* idempotencia;
* errores.

---

# 45. ENTREGABLES

Al finalizar debes entregar:

## A. Auditoría

Lista de:

* problemas;
* duplicaciones;
* riesgos;
* funcionalidades existentes;
* funcionalidades faltantes;
* estructuras innecesarias.

## B. Arquitectura

Explicar:

* backend;
* frontend;
* permisos;
* roles;
* scopes;
* cron;
* webhooks;
* almacenamiento.

## C. Cambios implementados

Por archivo:

```text
archivo
→ cambio realizado
→ motivo
```

## D. Nuevas rutas API

Tabla:

```text
Método | Endpoint | Permiso | Descripción
```

## E. Nuevas entidades

Indicar:

* modelo;
* relaciones;
* índices;
* constraints.

## F. Frontend

Indicar:

* páginas eliminadas/unificadas;
* nuevas páginas;
* componentes;
* navegación;
* permisos.

## G. Producción

Indicar:

* variables de entorno;
* configuración Vercel;
* cron;
* webhooks;
* almacenamiento;
* servicios externos necesarios.

## H. Pruebas

Informar:

* pruebas ejecutadas;
* resultados;
* errores restantes.

---

# 46. ORDEN DE IMPLEMENTACIÓN

No intentes hacer todo desordenadamente.

Implementa aproximadamente en este orden:

### FASE 1

Auditoría completa.

### FASE 2

Seguridad y control de acceso.

### FASE 3

Roles + permisos + scopes.

### FASE 4

CRUD seguro.

### FASE 5

Unificación del panel frontend.

### FASE 6

Expediente jurídico.

### FASE 7

Timeline.

### FASE 8

Agenda + audiencias + términos.

### FASE 9

Documentos + clientes + comunicaciones.

### FASE 10

Portal cliente.

### FASE 11

Auditoría.

### FASE 12

Panel ADMIN "Ojo de Dios".

### FASE 13

Cron + webhooks + arquitectura Vercel.

### FASE 14

Pruebas de integración y seguridad.

### FASE 15

Preparación final para producción.

---

# 47. REGLA SOBRE FUNCIONALIDADES INCOMPLETAS

Si encuentras algo que ya existe pero está parcialmente implementado:

**complétalo en lugar de crear un segundo sistema paralelo.**

Si existen dos implementaciones:

1. identifica cuál está conectada al flujo actual;
2. determina cuál debe conservarse;
3. migra lo necesario;
4. elimina duplicaciones solamente después de comprobar dependencias.

---

# 48. REGLA SOBRE DECISIONES ARQUITECTÓNICAS

No hagas cambios destructivos sin justificar primero:

* qué problema solucionan;
* qué código afecta;
* qué datos afectan;
* qué migración requieren;
* qué funcionalidades podrían romper.

Si una decisión puede afectar producción, indícala antes de ejecutarla.

Evita agregar complejidad arquitectónica que no corresponda al modelo real del negocio.

En particular:

**No implementar multi-tenancy, múltiples firmas u organizaciones independientes si no existe un requerimiento real para ello.**

---

# 49. RESULTADO FINAL ESPERADO

El sistema final debe comportarse conceptualmente así:

```text
                         ┌─────────────────────┐
                         │       ADMIN         │
                         │    "OJO DE DIOS"    │
                         └──────────┬──────────┘
                                    │
                       CONTROL GLOBAL
                                    │
        ┌───────────────────────────┴──────────────────────────┐
        │                                                      │
        ▼                                                      ▼
   CONFIGURACIÓN                                         MONITOREO
   Usuarios                                               Jobs
   Roles                                                  Webhooks
   Permisos                                               Auditoría
   Planes                                                 Errores
                                                         Consumo
        │
        └──────────────────────┬───────────────────────────────┘
                               │
                               ▼
              ALEJANDRA MUÑOZ | ABOGADA Y ASOCIADOS
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
       ABOGADOS /         ASISTENTES /       CLIENTES
       SOCIOS             GESTORES
              │                │                │
              └────────────────┼────────────────┘
                               │
                        PANEL UNIFICADO
                               │
      ┌────────────┬───────────┼───────────┬────────────┐
      ▼            ▼           ▼           ▼            ▼
   Procesos     Radicados    Tareas      Agenda      Clientes
      │            │           │           │            │
      └────────────┴───────────┼───────────┴────────────┘
                               │
                         EXPEDIENTE
                               │
       ┌───────────┬───────────┼───────────┬───────────┐
       ▼           ▼           ▼           ▼           ▼
   Documentos  Actuaciones  Términos  Audiencias  Comunicaciones
                               │
                               ▼
                         NOTIFICACIONES
                         WhatsApp / Email
```

La arquitectura debe representar **una sola firma jurídica**, con múltiples usuarios y diferentes niveles de acceso.

El sistema debe poder crecer posteriormente hacia:

* facturación;
* pagos;
* firma electrónica;
* inteligencia artificial;
* analítica avanzada;
* integraciones externas.

Pero **no sacrifiques estabilidad, seguridad ni arquitectura por intentar implementar todas esas funciones inmediatamente**.

---

# 50. INSTRUCCIÓN FINAL

Antes de terminar, verifica nuevamente todo el repositorio y comprueba que:

1. El sistema compila.
2. El backend inicia correctamente.
3. El frontend compila.
4. No existen imports rotos.
5. No existen rutas duplicadas conflictivas.
6. Los endpoints están protegidos.
7. Los roles funcionan.
8. Los permisos funcionan.
9. El ADMIN conserva acceso absoluto.
10. El único registro público es ABOGADO externo SaaS; ABOGADO_ADMIN interno lo crea ADMIN y CLIENTE se crea/asigna internamente.
11. Los demás usuarios requieren invitación/creación autorizada.
12. El CRUD no permite afectar información fuera del alcance autorizado del usuario.
13. Las eliminaciones críticas están protegidas.
14. Los jobs están clasificados, protegidos e idempotentes para el hosting elegido.
15. Los webhooks implementados validan autenticidad e idempotencia según el proveedor integrado.
16. Los secretos no están hardcodeados.
17. El almacenamiento de archivos es compatible con producción.
18. Las funcionalidades existentes no fueron eliminadas accidentalmente.
19. No existen múltiples paneles independientes innecesarios.
20. Existe un único panel funcional para usuarios normales.
21. El panel ADMIN "Ojo de Dios" permanece separado.
22. La navegación depende de permisos.
23. La interfaz mantiene la estructura visual del panel de administrador abogado.
24. Las operaciones críticas quedan auditadas.
25. **No existen estructuras multi-tenant innecesarias.**
26. **No existe lógica de múltiples firmas u organizaciones que no corresponda al modelo real del negocio.**
27. Todos los usuarios internos están correctamente asociados a la única firma:
    **Alejandra Muñoz | Abogada y Asociados**.

**No declares el proyecto terminado simplemente porque el código compile.**

El criterio de finalización es que la arquitectura, seguridad, permisos, UX, CRUD, jobs, integraciones y despliegue correspondan al modelo híbrido real: **una firma interna, abogados SaaS individuales con planes, y clientes con acceso explícitamente asignado**. No debe haber datos compartidos entre cuentas SaaS ni entre la modalidad SaaS y la firma.
