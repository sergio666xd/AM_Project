# Gestión de Procesos Judiciales

Plataforma web para gestionar radicados judiciales, actuaciones, procesos, clientes, tareas y notificaciones. El proyecto tiene un backend en FastAPI y un frontend en Next.js. La interfaz y las reglas de acceso están separadas por tipo de usuario.

## Alcance objetivo vigente

El producto objetivo es una aplicación interna para una sola firma: **Alejandra Muñoz | Abogada y Asociados**. Este README también señala piezas SaaS heredadas que todavía existen en el código; el registro externo, los planes comerciales y la administración de varias firmas quedan fuera del alcance. El roadmap está en `plan.md`.

Este documento describe el estado funcional actual del repositorio. No pretende describir funcionalidades planeadas que todavía no estén implementadas.

## Perfiles y acceso

| Perfil | Alcance actual |
| --- | --- |
| `ADMIN` | Administración completa de Alejandra Muñoz \| Abogada y Asociados. No es administrador global de otras firmas. |
| `ABOGADO_ADMIN` | Dirección/socio: acceso operativo a los expedientes y recursos de la firma. |
| `ABOGADO` | Abogado asociado: acceso a procesos propios o explícitamente asignados. |
| `CLIENTE` | Acceso limitado a procesos asignados, tareas asignadas y carga de documentos solicitados. |

La organización es única. `abogado_id` identifica al responsable del expediente, no a un tenant. Los clientes conservan aislamiento por asignación explícita.

Todos los paneles usan el `AppShell` compartido, navegación móvil, modo oscuro persistente y control de rutas según el rol. Los accesos creados por administración o por un abogado pueden exigir cambio de contraseña en el primer inicio de sesión.

## Funcionalidades generales

- El registro público y la captación de interés SaaS están deshabilitados (`410 Gone`).
- Las cuentas internas y clientes son habilitados por administración de la firma.
- Inicio de sesión JWT.
- El alta pública de abogados está cerrada; los usuarios internos y clientes se habilitan por administración de la firma.
- Cambio obligatorio de contraseña cuando la cuenta fue creada con contraseña temporal.
- Perfil personal: nombre completo y número de WhatsApp.
- Configuración personal: preferencias de correo electrónico y WhatsApp.
- Tema claro/oscuro desde el menú de cuenta.
- Tareas, subtareas y recordatorios mediante Workflows durables.

## Administración de firma

Ruta principal: `/gestion-procesos/admin`.

### Usuarios

La administración puede consultar las cuentas de la firma, con búsqueda por nombre, correo o WhatsApp; filtros por perfil y estado; selección múltiple; activación/suspensión masiva e individual; y ficha individual.

La ruta `/gestion-procesos/admin/usuarios/nuevo` permite crear abogados y clientes de la firma. No debe usarse para habilitar despachos externos.

- Un abogado administrador (`ABOGADO_ADMIN`).
- Un abogado asociado (`ABOGADO`).
- Un cliente (`CLIENTE`) que se vincula a procesos con asignación explícita.
Las cuentas creadas se activan y reciben una contraseña temporal que debe cambiarse en el primer acceso.

### Solicitudes pendientes heredadas

- Lista de solicitudes pendientes.
- Búsqueda y selección múltiple.
- Aprobación o rechazo individual y masivo.
- Las solicitudes previas al cierre del registro se conservan para revisión; no se aceptan nuevas solicitudes públicas.
- Visor integrado de la tarjeta profesional en la misma página; sirve para imágenes y PDF.

### Planes SaaS heredados

La tabla y el panel de planes se conservan temporalmente para migrar datos existentes. La firma no comercializa suscripciones ni debe aplicar límites de planes a sus abogados.

### Visión global e inventarios

El dashboard administrativo consume una vista agregada de usuarios, procesos, radicados, actuaciones, tareas, documentos, consultas y estado de operación.

En `/gestion-procesos/admin/operacion`, ADMIN puede consultar todos los radicados o una selección, revisar ejecuciones y reintentar solo los radicados fallidos. El diagnóstico separa conectividad/configuración de los envíos reales; estos últimos requieren destinatario explícito, confirmación y quedan auditados. La agenda `/gestion-procesos/admin/agenda` es de solo lectura y muestra únicamente tareas asociadas a abogados internos `ABOGADO_ADMIN`, con filtros por mes, responsable y estado; excluye tareas/procesos SaaS.

Procesos, radicados, tareas y documentos tienen inventarios globales con búsqueda, filtro por estado cuando el recurso lo ofrece, selección, exportación CSV de la vista o selección, y copia de identificador.

Los recordatorios, las notificaciones y el resumen mensual se ejecutan como Workflows durables. La versión del recordatorio invalida ejecuciones anteriores al editarlo, desactivarlo, cambiar el vencimiento o completar/cancelar la tarea. Los canales salen de las preferencias `RECORDATORIOS` y pueden ser email o WhatsApp. Cada Workflow de recordatorio que despierta reintenta los lanzamientos pendientes de otros recordatorios (`POST /api/internal/workflows/recordatorios/reconciliar`), por lo que no se necesita un scheduler por minuto.

El resumen mensual se ejecuta desde el Cron diario `0 22 * * *` (17:00 Colombia) en `/cron/resumen-mensual`, que solo actúa el último día del mes.

No se usa Celery, Redis ni QStash: fueron retirados del código, las dependencias y la configuración local.

### Workflows de consultas judiciales

- El servicio frontend llama al backend por el binding privado `BACKEND_SERVICE_URL` definido en `vercel.json`; no configures ese URL manualmente en Vercel.
- El backend inicia Flows en el frontend mediante `VERCEL_URL`, que apunta al deployment público de frontend. Puedes fijar `WORKFLOW_FRONTEND_URL` como override si usas otro dominio. Si Preview tiene Deployment Protection, habilita `VERCEL_AUTOMATION_BYPASS_SECRET` para las llamadas de servicio; el código lo envía solo como header y nunca lo registra.
- Configura `WORKFLOW_SERVICE_TOKEN` en los entornos runtime de frontend y backend con el mismo valor aleatorio. FastAPI lo usa para proteger `/api/internal/workflows/*`.
- Configura `CRON_SECRET` en el frontend de Production. Vercel lo envía como `Authorization: Bearer ...` a los Cron de consultas y al resumen mensual. Los Cron solo corren en Production; cada uno invoca una vez al día y la DB filtra los días seleccionados.
- Para ejecutar workflows con `next dev`, configura `WORKFLOW_BACKEND_URL=http://localhost:8000` en `frontend-saas/.env.local` y el mismo `WORKFLOW_SERVICE_TOKEN` en el backend local. No reutilices un token real de producción en desarrollo.
- No guardes valores reales de estos secretos en Git ni los pegues en conversaciones o logs.

Para activar los recordatorios en producción basta con la configuración de Workflows indicada arriba: cada recordatorio inicia su propio Workflow al crearse y el propio motor los despierta a la hora programada.

## Panel del abogado administrador

Ruta principal: `/gestion-procesos/abogado`.

El resumen muestra conteos reales de procesos, clientes y tareas accesibles por el abogado asociado actual.

### Clientes

Ruta: `/gestion-procesos/abogado/clientes`.

- Listado y búsqueda de clientes creados por el abogado.
- Creación de cliente con correo, WhatsApp y contraseña temporal.
- Notificación de acceso según las preferencias del cliente.
- Cambio obligatorio de contraseña en el primer ingreso del cliente.

### Procesos

Ruta: `/gestion-procesos/abogado/procesos`.

- Crear procesos con nombre y descripción.
- Buscar procesos.
- Cada proceso muestra cantidad de radicados y actuaciones.
- El botón **Abrir ficha del proceso** dirige a `/gestion-procesos/abogado/procesos/[id]`.

#### Ficha de proceso

La ficha centraliza las relaciones del expediente:

- Editar nombre y descripción del proceso.
- Asociar y retirar clientes.
- Asociar y retirar radicados existentes.
- Crear un radicado desde el proceso y asociarlo en la misma transacción; se valida que tenga 23 dígitos y que no exista en el despacho.
- Ver cantidad de actuaciones por radicado asociado.
- Crear tareas directamente vinculadas al proceso.
- Ver tareas ya vinculadas al proceso.

El backend también proporciona en el detalle del proceso las solicitudes documentales, documentos entregados y actuaciones necesarias para notificar; estos datos están disponibles en la API para extender la interfaz.

### Radicados y actuaciones

Ruta: `/gestion-procesos/abogado/radicados`.

- Crear radicados directamente con número de 23 dígitos.
- Ver todos los radicados del abogado, estén o no asociados a un proceso.
- Buscar por número, despacho o texto de actuación.
- Desplegar un radicado para ver sus actuaciones, fecha y anotación.
- Crear una tarea desde el radicado completo.
- Crear una tarea desde una actuación específica; la tarea conserva `radicado_id` y `actuacion_id`.

El backend permite solicitar manualmente la consulta de un radicado para actualizar actuaciones. La sincronización guarda novedades sin duplicar actuaciones; la consulta ya no trunca el historial por plan SaaS.

### Tareas

Ruta: `/gestion-procesos/abogado/tareas`.

Actualmente permite crear tareas generales o ligadas a proceso, radicado, actuación y cliente; seleccionar prioridad y fecha límite; y listar tareas del despacho.

La API de tareas además implementa:

- Consultar, editar, completar y eliminar tareas.
- Subtareas, incluidas subtareas asignables a clientes.
- Recordatorios de tarea por WhatsApp.
- Control para que un cliente solo complete las tareas o subtareas que le fueron asignadas.
- Notificación al cliente cuando recibe una tarea o subtarea, por correo y opcionalmente WhatsApp según sus preferencias.

### Notificaciones y documentos

Desde la API del expediente el abogado puede:

- Notificar una actuación de un proceso a un cliente asignado.
- Incluir comentarios del abogado.
- Generar el mensaje con el nombre del abogado, proceso, número de radicado y actuación.
- Solicitar documentos a un cliente vinculado al proceso.
- Permitir que el cliente cargue documentos únicamente en respuesta a una solicitud pendiente.

La entrega se almacena como documento del proceso y conserva cliente, solicitud, tipo MIME y fecha.

## Panel del cliente

El modelo y las rutas de servidor restringen al cliente a sus procesos asignados, sus tareas asignadas y las solicitudes de documentos destinadas a él. No puede crear tareas, consultar procesos ajenos ni cargar documentos sin una solicitud activa.

## API relevante

Todas las rutas protegidas usan `Authorization: Bearer <token>`.

### Autenticación

- `POST /api/auth/registro` es una ruta heredada cerrada; responde `410 Gone`.
- `POST /api/auth/login`
- `POST /api/auth/cambiar-password`
- `GET /api/auth/me`
- `PATCH /api/auth/perfil`
- `PATCH /api/auth/preferencias-notificaciones`

### Administración

- `GET`, `POST /api/admin/usuarios`
- `PATCH /api/admin/usuarios/{usuario_id}`
- `PATCH /api/admin/usuarios/estado-masivo`
- `GET /api/admin/vision-global`
- `GET /api/admin/inventario/{recurso}`
- `GET /api/admin/solicitudes`
- `POST /api/admin/solicitudes/accion-masiva`
- `GET /api/admin/solicitudes/{solicitud_id}/tarjeta`
- `GET`, `POST /api/admin/planes`
- `PUT`, `DELETE /api/admin/planes/{plan_id}`
- `PATCH /api/admin/planes/estado-masivo`
- `GET`, `PUT /api/admin/configuracion`

### Expedientes y despacho

- `GET`, `POST /api/expedientes/procesos`
- `GET`, `PUT`, `DELETE /api/expedientes/procesos/{proceso_id}`
- `POST /api/expedientes/procesos/{proceso_id}/radicados` para crear y asociar un radicado.
- `POST`, `DELETE /api/expedientes/procesos/{proceso_id}/radicados/{radicado_id}` para asociar o retirar uno existente.
- `POST`, `DELETE /api/expedientes/procesos/{proceso_id}/clientes/{cliente_id}`.
- `POST /api/expedientes/procesos/{proceso_id}/actuaciones/{actuacion_id}/notificar`.
- `POST /api/expedientes/procesos/{proceso_id}/solicitudes-documento`.
- `POST /api/expedientes/solicitudes-documento/{solicitud_id}/archivo`.
- `GET`, `POST /api/expedientes/clientes`.
- `GET`, `POST /api/radicados`.
- `POST /api/radicados/{radicado_id}/consultar`.
- `GET`, `POST /api/tareas` y operaciones de actualización, completado, subtareas y recordatorios bajo `/api/tareas`.

## Ejecución local

### Requisitos

- Python 3.11 o compatible.
- Node.js 20 o compatible.
- PostgreSQL configurado mediante las variables de entorno del backend.
- Credenciales de almacenamiento compatible con S3/R2 si se probarán cargas de documentos o tarjetas.

### Migración de radicados canónicos

Antes de desplegar el esquema nuevo sobre una base existente, configura `DATABASE_URL` y ejecuta el preflight de solo lectura:

```powershell
python -m app.migrate_radicados_canonicos
```

Revisa los conteos. `invalid_rows`, `conflict_groups`, `cross_scope_references` y `unhandled_reference_tables` deben ser cero; si no, resuelve los casos antes de migrar. El preflight no modifica datos. La migración debe quedar aplicada antes de reabrir tráfico normal a la versión que consulta el esquema nuevo.

Con un backup verificado, aplica la migración en una transacción:

```powershell
python -m app.migrate_radicados_canonicos --apply --backup-confirmed
```

La migración renombra `radicados.usuario_id` a `creado_por_id`, crea los vínculos usuario-radicado, fusiona duplicados solo dentro de `FIRMA` o del mismo propietario SaaS y redirige procesos, consultas, actuaciones, tareas y subtareas. Si detecta metadatos incompatibles, referencias no contempladas o números inválidos, aborta. Debe ejecutarse antes de desplegar el backend que usa el esquema nuevo.

#### Ejecución desde Swagger

El backend también expone estas operaciones ADMIN en `/docs`:

- `GET /api/admin/migraciones/radicados/preview`: preflight de solo lectura.
- `POST /api/admin/migraciones/radicados/aplicar`: aplica la migración únicamente si `RADICADO_MIGRATION_API_ENABLED=true` y el body contiene `{"confirmacion":"CONFIRMO_BACKUP_VERIFICADO"}`.

Para producción, confirma primero que existe el backup. Despliega el código con el flag habilitado durante una ventana de mantenimiento, sin reabrir tráfico normal; autorízate como ADMIN en Swagger, revisa el preview, ejecuta el apply y confirma el resultado. Después deshabilita el flag y vuelve a desplegar. Reabre tráfico solo tras verificar el esquema migrado. No mantengas habilitada la ejecución de migraciones desde API.

### Backend

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

La aplicación crea tablas y, al iniciar, aplica DDL de compatibilidad para instalaciones PostgreSQL existentes. Ya no crea planes comerciales automáticamente. Solo crea una cuenta ADMIN si `ADMIN_PASSWORD` está configurada y aún no existe ninguna cuenta ADMIN.

### Migraciones de esquema (Alembic)

Los cambios de esquema se versionan con Alembic en `alembic_migrations/versions/`. Al arrancar, la API aplica las revisiones pendientes con un bloqueo de PostgreSQL, así que dos instancias de Vercel no migran a la vez:

- Base vacía: crea las tablas desde los modelos y la marca en la última revisión.
- Base anterior a Alembic: la marca en la revisión base `0001` (no modifica nada) y aplica las siguientes.
- Base ya versionada: aplica solo las revisiones nuevas.

Para un cambio de esquema, edita el modelo en `app/models.py` y genera la revisión contra una base local que esté al día:

```powershell
alembic upgrade head
alembic revision --autogenerate -m "describe el cambio"
```

Revisa el archivo generado antes de confirmarlo: el autogenerado no detecta renombres y puede proponer borrar columnas. `alembic upgrade head --sql` muestra el SQL sin ejecutarlo. No agregues sentencias nuevas a `actualizar_esquema_planes()` ni a `migrations/*.sql`; quedan como esquema heredado.

### Frontend

```powershell
cd frontend-saas
npm install
npm run dev
```

Configure `NEXT_PUBLIC_API_URL` para apuntar al backend cuando frontend y API no estén en el mismo origen.

## Verificación realizada

La verificación técnica usada en el desarrollo actual es:

```powershell
cd frontend-saas
npx.cmd tsc --noEmit
```

Y para las rutas modificadas del backend:

```powershell
.\venv\Scripts\python.exe -m py_compile app\main.py app\schemas.py app\routers\admin.py app\routers\expedientes.py app\routers\tareas.py
```

## Límites actuales conocidos

- La interfaz de ficha de proceso ya gestiona clientes, radicados y tareas, pero las secciones globales visuales de historial de notificaciones y documentos aún requieren una implementación más completa.
- La API de tareas tiene más capacidades que la interfaz del abogado actual; edición visual, calendario/kanban, subtareas y recordatorios todavía necesitan una experiencia completa en frontend.
- La auditoría transversal de cambios y el historial de entregas/envíos aún no se presentan como módulos visuales independientes.
