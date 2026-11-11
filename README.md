# Alejandra Muñoz | Abogada y Asociados: sistema de la firma

Aplicación interna de una sola firma. Reúne el sitio público, el portal donde cada cliente sigue sus procesos, el panel donde el equipo lleva los expedientes y la consola de administración. Backend en FastAPI, frontend en Next.js y despliegue en Vercel.

- [`PRODUCT.md`](PRODUCT.md): quién usa la app, para qué y con qué tono.
- [`DESIGN.md`](DESIGN.md): tokens, tipografía, componentes y reglas visuales ("expediente foliado").
- [`diseno/`](diseno/): contrato de dirección visual y prototipo.
- [`docs/historico/`](docs/historico/): planes y auditorías anteriores a la reconstrucción, solo como referencia.

## Perfiles

| Perfil | Qué hace |
| --- | --- |
| `ADMIN` | Administra la firma: usuarios, operación, integraciones, sitio público, finanzas y auditoría. Entra por su propio dominio y puede abrir cualquier expediente. |
| `ABOGADO_ADMIN` | Abogado de la firma: lleva sus procesos y los que colabora, con clientes, tareas, agenda, documentos, contratos y cobros. |
| `ABOGADO` | Abogado asociado: entra al mismo panel de la firma con sus propios procesos, sin equipo, cobros ni contratos. Sus radicados son de la firma. Hoy no hay cuentas con este perfil y la administración todavía no lo ofrece al crear cuentas. |
| `CLIENTE` | Ve solo sus procesos, en lenguaje claro: en qué va cada uno, lo que la firma le pide, sus pagos y los mensajes. |

La firma es una sola organización. `abogado_id` identifica al responsable del expediente, no a un inquilino. Los clientes ven únicamente los procesos a los que están vinculados.

Las cuentas las crea la firma; no hay registro público. Quien recibe una contraseña temporal debe cambiarla al primer ingreso. El portal del cliente y la administración tratan de "usted"; el panel del abogado, de "tú".

## Dónde vive cada parte

| Dominio | Qué sirve | Rutas en `frontend-saas/app` |
| --- | --- | --- |
| `alejandramunozabogada.com` | Sitio público: inicio, áreas de práctica, quiénes somos, contacto y textos legales (editables desde administración). | `page.tsx`, `areas-de-practica/`, `contacto/`, … |
| `panel.alejandramunozabogada.com` | Ingreso y portal de clientes y abogados. | `gestion-procesos/auth`, `gestion-procesos/cliente`, `gestion-procesos/abogado` |
| `admin.alejandramunozabogada.com` | Consola de administración. Reutiliza las páginas del abogado para los expedientes. | `gestion-procesos/admin` |

`frontend-saas/proxy.ts` decide qué área corresponde a cada dominio y rol. En local, `localhost:3000` sirve el portal y `admin.localhost:3000` la administración.

## Arquitectura

### Backend (`app/`)

```
app/api/v2/          rutas de la aplicación (delgadas: validan, llaman al servicio, devuelven el esquema)
app/api/internos/    API que llaman los flujos programados (/api/internal/workflows/*)
app/modulos/<m>/     servicio.py (casos de uso, transacción y auditoría)
                     repositorio.py (consultas), politicas.py (quién ve y cambia qué), esquemas.py
app/nucleo/          sesión, errores, base de datos, zona horaria y ajustes compartidos
app/models.py        modelos SQLAlchemy; cada módulo los reexporta en su modelos.py
alembic_migrations/  revisiones del esquema
```

Módulos: `administracion` (resumen, usuarios, alertas e integraciones), `agenda`, `avisos` (la campana de cada rol), `bandeja` (lo urgente del día), `busqueda`, `clientes`, `contratos`, `cuenta` (datos propios y cambios con código), `documentos`, `etapas` (plantillas de etapas por tipo de proceso y etapas propias de un proceso), `expedientes`, `finanzas` (cobros, pagos y estado de cuenta), `folios` (el expediente foliado), `glosario` (lenguaje claro), `identidad` (sesión y contraseñas), `judicial`, `mensajes`, `operacion` (consultas a la Rama Judicial), `portal_cliente`, `push`, `radicados`, `sistema` (actividad y auditoría), `sitio` (sitio público y formulario de contacto) y `tareas`.

### Frontend (`frontend-saas/`)

Next.js con Tailwind v4. Los componentes por área están en `components/` y el cliente de la API en `lib/api-v2/cliente.ts`. `lib/api-v2/esquema.ts` se genera del contrato del backend; no se edita a mano.

El navegador siempre llama a `/api` en el mismo origen: en Vercel lo reescribe `vercel.json` hacia el servicio del backend y en `next dev` lo reescribe `next.config.ts` hacia `BACKEND_DEV_URL`. La sesión viaja en la cookie httpOnly `am_sesion` y el frontend no guarda ningún token.

### Flujos programados

No hay Celery, Redis ni colas propias. Los procesos largos o diferidos corren como Vercel Workflow (`frontend-saas/workflows/`), que llaman a la API interna con `WORKFLOW_SERVICE_TOKEN`:

| Qué | Cuándo |
| --- | --- |
| Consulta de radicados en la Rama Judicial | Cron `/cron/consultas/12` (12:00) y `/cron/consultas/17` (17:00, hora de Colombia); los días habilitados se eligen en Operación. |
| Recordatorios de documentos pendientes | Cron diario `/cron/recordatorios-documentos` (8:00). |
| Resumen mensual | Cron diario `/cron/resumen-mensual` (17:00); solo actúa el último día del mes. |
| Recordatorios de tareas | Un workflow por recordatorio, que despierta a la hora programada. Al editar, completar o cancelar la tarea, la versión del recordatorio invalida las ejecuciones anteriores. |

Los avisos salen por correo, WhatsApp o notificación del navegador según las preferencias de cada persona. Las plantillas se editan desde Administración.

## API

### `/api/v2`

- **Sesión:** `POST /api/v2/sesion` deja el token en la cookie `am_sesion` (`SameSite=Lax`). Los cambios autenticados con la cookie llevan el encabezado `X-AM-Solicitud: 1`. También se acepta `Authorization: Bearer`. `DELETE /api/v2/sesion/todas` cierra la sesión en todos los dispositivos. La recuperación de contraseña es `POST /sesion/recuperacion` y `POST /sesion/restablecimiento`, y el cambio de la temporal, `POST /sesion/contrasena`.
- **Errores:** `{"codigo", "mensaje", "campos"}`. `codigo` es estable y `mensaje` se puede mostrar tal cual.
- **Listados:** `{"items", "total", "siguiente"}`; la página siguiente se pide con `?cursor=<siguiente>`.
- **Fechas:** ISO 8601 con la zona de Bogotá (`-05:00`).
- **Documentación:** `/docs` y `/openapi.json`.

Después de cambiar una ruta v2, regenera el contrato y los tipos; CI falla si quedan desactualizados:

```bash
python scripts/exportar_openapi.py
cd frontend-saas && npm run api:tipos
```

### `/api/internal/workflows`

Solo la llaman los flujos programados, con `Authorization: Bearer $WORKFLOW_SERVICE_TOKEN`. Conserva el formato de error `{"detail": ...}` de FastAPI.

## Variables de entorno

Backend:

| Variable | Para qué |
| --- | --- |
| `DATABASE_URL` | PostgreSQL. |
| `JWT_SECRET_KEY` | Firma de sesiones y enlaces de recuperación. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Crean la primera cuenta ADMIN si no existe ninguna. |
| `INTEGRATION_CREDENTIALS_KEY` | Cifra las credenciales de integraciones guardadas desde Administración. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_STARTTLS` | Correo. |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | WhatsApp Cloud API de Meta; ver [docs/whatsapp-cloud-api.md](docs/whatsapp-cloud-api.md). `WHATSAPP_API_URL` solo sirve al proveedor anterior. |
| `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_VAPID_SUBJECT` | Notificaciones del navegador. |
| `WORKFLOW_SERVICE_TOKEN` | Protege la API interna; el mismo valor en el frontend. |
| `WORKFLOW_FRONTEND_URL` | Opcional: dominio para iniciar workflows si no sirve `VERCEL_URL`. |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Solo si Preview tiene Deployment Protection; se envía como encabezado y nunca se registra. |
| `FRONTEND_URL`, `PUBLIC_SITE_URL`, `CORS_ORIGINS` | Enlaces en avisos y orígenes adicionales. |
| `AM_COOKIE_SEGURA` | Opcional: fuerza la cookie `Secure`; por defecto solo en Vercel. |

Frontend:

| Variable | Para qué |
| --- | --- |
| `BACKEND_SERVICE_URL` | Lo inyecta el binding de `vercel.json`; no se configura a mano. |
| `WORKFLOW_SERVICE_TOKEN` | El mismo valor que en el backend. |
| `CRON_SECRET` | Solo en Production; Vercel lo envía a los cron. |
| `NEXT_PUBLIC_SITE_URL` | URL pública del sitio. |
| `BACKEND_DEV_URL`, `WORKFLOW_BACKEND_URL` | Solo en desarrollo: dónde está el backend local (por defecto `http://127.0.0.1:8000`). |

No guardes valores reales de secretos en Git ni los pegues en conversaciones o registros.

## Desarrollo local

Requisitos: Python 3.12, Node.js 20 y PostgreSQL.

```bash
python -m venv venv
source venv/bin/activate            # Windows: .\venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

```bash
cd frontend-saas
npm install
npm run dev
```

Para probar workflows con `next dev`, pon `WORKFLOW_BACKEND_URL=http://localhost:8000` en `frontend-saas/.env.local` y el mismo `WORKFLOW_SERVICE_TOKEN` en los dos lados. No reutilices un token de producción.

## Esquema y migraciones

Los cambios de esquema se versionan con Alembic en `alembic_migrations/versions/`. Al arrancar, la API aplica las revisiones pendientes con un bloqueo de PostgreSQL, así que dos instancias no migran a la vez:

- Base vacía: crea las tablas desde los modelos y la marca en la última revisión.
- Base anterior a Alembic: la marca en la revisión base `0001` sin modificarla y aplica las siguientes.
- Base ya versionada: aplica solo las revisiones nuevas.

Para un cambio, edita `app/models.py` y genera la revisión contra una base local al día:

```bash
alembic upgrade head
alembic revision --autogenerate -m "describe el cambio"
```

Revisa el archivo antes de confirmarlo: el autogenerado no detecta renombres y puede proponer borrar columnas. `actualizar_esquema_heredado()` (en `app/esquema.py`) y `migrations/*.sql` son esquema heredado; no se les agregan sentencias.

`python -m app.migrate_radicados_canonicos` es la herramienta de la migración de radicados canónicos de octubre de 2026. Sin argumentos solo muestra conteos. `--apply --backup-confirmed` aplica la migración, y solo debe usarse con un backup verificado.

## Pruebas y CI

```bash
ruff check .
pytest -q                                   # SQLite
PRUEBAS_DATABASE_URL=postgresql://… pytest -q tests/v2   # PostgreSQL, como en CI
cd frontend-saas && npm run lint && npx tsc --noEmit && npm run build
```

CI (`.github/workflows/ci.yml`) corre el backend con ruff y pytest, las pruebas v2 y las migraciones sobre PostgreSQL, la verificación de que los tipos del frontend coinciden con el contrato, y ESLint, TypeScript y la compilación del frontend.

## Retiro del antiguo SaaS

La revisión `0016` borró lo que quedaba del portal SaaS: las tablas `planes`, `configuracion_saas`, `intereses_saas` y `solicitudes_registro`, la columna `usuarios.plan_id` y las cuentas `ABOGADO` de abogados externos con sus procesos, radicados, actuaciones, tareas y los clientes que solo eran suyos. Al aplicarla, el registro de la API anota cuántas filas borró por tabla. No se puede deshacer; `downgrade` solo vuelve a crear las tablas vacías.
