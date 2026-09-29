# Plan de refactorización

## Alejandra Muñoz | Abogada y Asociados

El producto tiene dos modalidades: (1) la firma interna Alejandra Muñoz | Abogada y Asociados, y (2) abogados externos individuales que se registran como SaaS y consumen un plan. No se soportan despachos externos con varios miembros ni una tabla genérica Tenant.

Estados: `[x]` hecho y verificado; `[~]` parcial; `[ ]` pendiente.

## Alcance objetivo

- Firma interna fija: Alejandra Muñoz | Abogada y Asociados.
- `ADMIN`: administrador de plataforma; puede gestionar el acceso SaaS y crear cuentas internas.
- `ABOGADO_ADMIN`: abogado interno de la firma, creado solo por ADMIN y sin plan.
- `ABOGADO`: abogado externo SaaS, único rol con registro público y plan obligatorio.
- `CLIENTE`: usuario creado/asignado por un abogado; acceso solo a relaciones explícitas.
- Los abogados SaaS individuales se aíslan por su `usuario_id`/owner existente; la firma interna es un espacio fijo y no comparte información con cuentas SaaS.
- No crear una tabla para múltiples firmas externas. Conservar relaciones owner existentes y verificar que las consultas distingan modalidad.

## Fuera de alcance

- SaaS de despachos externos con equipos/membresías o selector de organización.
- Planes para `ABOGADO_ADMIN`, ADMIN o CLIENTE de la firma.
- Vercel como requisito de despliegue; el proveedor se decide según operación real.

No borrar los datos ni las tablas SaaS hasta inventariarlos, respaldarlos y definir una migración reversible. El retiro de pantallas/rutas es gradual y solo después de confirmar que no son necesarias para la firma.

## Política de acceso propuesta

- ADMIN: acceso global administrativo a ambas modalidades.
- ABOGADO_ADMIN: acceso interno a los recursos de la firma; sin `plan_id` requerido ni límites SaaS.
- ABOGADO: acceso únicamente a sus recursos SaaS; los límites del plan se validan en backend.
- CLIENTE: procesos/tareas/documentos asignados, tanto si lo gestiona la firma como un abogado SaaS.
- Los IDs de propietario separan cuentas ABOGADO SaaS; las relaciones del proceso controlan el portal del cliente.
- Mantener explícita la frontera entre ABOGADO SaaS y ABOGADO_ADMIN de la firma en cada query/API/UI.

## Estado actual

- [X] FastAPI, SQLAlchemy/PostgreSQL, Next.js, Celery/Redis y Cloudflare R2 existen.
- [X] Procesos, radicados, clientes, tareas, subtareas, recordatorios, documentos y notificaciones ya tienen implementación parcial.
- [X] Login local operativo con JWT/CORS configurados en `.env`; el secreto no se versiona.
- [X] WhatsApp Web/Playwright se retiró; los mensajes salen por la API configurada.
- [~] Verificación actual: 35 pruebas aprobadas, `compileall app tests` y TypeScript; ESLint de cliente pasa, mientras la pantalla abogado conserva un diagnóstico preexistente en su efecto de carga.

- [X] Planes y solicitudes SaaS se conservan y se usan en el onboarding de ABOGADO externo; no se purgaron datos existentes.

- [X] Inventario agregado sin PII: 2 ADMIN activos, 1 ABOGADO_ADMIN activo, 1 ABOGADO activo con plan, 1 ABOGADO pendiente sin plan y 1 CLIENTE activo; 1 proceso, 9 radicados (6 SaaS, 2 ADMIN, 1 interno), 2 tareas SaaS y 2 planes activos.
- [X] Mapeo conservador: ABOGADO activo conserva sus datos SaaS; ABOGADO_ADMIN conserva el proceso/radicado interno sin plan; ADMIN global; CLIENTE asignado; ABOGADO pendiente sigue pendiente.

- [X] Política híbrida definida: ADMIN global; ABOGADO_ADMIN acceso interno sin plan; ABOGADO acceso SaaS aislado por owner y sujeto a plan; CLIENTE por asignación.
- [~] El portal cliente y relaciones proceso-documento requieren pruebas de extremo a extremo.
- [~] El registro público requiere credenciales R2 para completar la carga de tarjeta profesional; no están configuradas en el entorno local.

- [~] No existe sistema de migraciones versionado; el nuevo campo de archivo usa una migración aditiva idempotente al iniciar el backend. Falta documentar backup/rollback.

## Hoja de ruta

### Fase 1. Reencuadre y auditoría de datos `[x]`

- [X] Confirmar una firma interna más cuentas SaaS individuales; no se soportan despachos SaaS con varios miembros.
- [X] Documentar módulos, rutas, roles, riesgos y estado de pruebas en la auditoría previa.
- [X] Obtener conteos agregados de cuentas y recursos sin revelar información personal.
- [x] Inventariar usuarios y distinguir la cuenta ABOGADO SaaS de la cuenta ABOGADO_ADMIN interna, sin alterar sus recursos.
- [x] Identificar consumidores frontend de planes/registro en el portal SaaS y separarlos del sitio institucional de la firma.
- [x] Diferenciar el sitio raíz de la firma del portal SaaS `/gestion-procesos`.
- [x] Identificar registros SaaS a preservar: dos planes, dos solicitudes; no hay registros de interés.

### Fase 2. Seguridad híbrida `[~]`

- [X] Eliminar CORS wildcard; usar allowlist configurable.
- [X] Evitar exposición de secretos R2 en logs y restringir el diagnóstico de Redis.
- [X] Retirar la ruta admin duplicada y corregir el filtro roto del job mensual.
- [X] Mantener acceso cliente limitado y agregar filtros de relaciones cruzadas para procesos, tareas y documentos.
- [X] Asegurar que el login local funcione y que WhatsApp use solo la API.
- [X] Evitar una entidad Tenant genérica; separar cuentas SaaS ABOGADO por owner y la firma fija por ABOGADO_ADMIN.
- [X] Registro público, catálogo y formulario habilitados solo para ABOGADO externo con plan activo.
- [X] Dashboard SaaS habilitado para ABOGADO; ABOGADO_ADMIN usa el panel interno de la firma.
- [X] Límites de radicados, actuaciones y notificaciones aplican solo a ABOGADO SaaS; ABOGADO_ADMIN no requiere plan.

- [~] Cobertura de autorización: 21 pruebas SQLite verifican reglas y consultas; faltan tests HTTP integrales para ambas modalidades y límites de plan. Los rate limits de captación/recuperación son locales al proceso; usar Redis o WAF con varias réplicas.

- [X] Separar ADMIN global, ABOGADO_ADMIN interno, ABOGADO SaaS y CLIENTE asignado; restan pruebas de no-filtración entre la firma y cuentas externas.
- [~] Revisar descargas, lecturas sensibles, trabajos Celery, uploads y enlaces históricos.
- [ ] Revisar el uso de `localStorage` para JWT y definir protección de sesión compatible con el frontend.

### Fase 3. Usuarios, contraseñas y onboarding `[x]`

- [X] Alta interna de `ABOGADO_ADMIN` reservada a ADMIN; abogados internos y SaaS crean clientes vinculados a su alcance.
- [X] Mantener registro público solo para ABOGADO SaaS; alta de ABOGADO_ADMIN y CLIENTE se reserva a ADMIN.
- [X] Cambio obligatorio de contraseña temporal y flujo UI/API de recuperación implementados; verificar entrega real cuando SMTP esté configurado.
- [X] Mapear los registros actuales antes de cambiar roles; no se cambiaron ni borraron cuentas durante el reencuadre.
- [X] Mantener solicitud y tarjeta profesional solo en el registro de abogados SaaS; no exigirlas a los roles internos.
- [X] Clientes solicitan cambios de correo, nombre y WhatsApp; responsable asignado o ADMIN los aprueba/rechaza, mientras las preferencias de notificación siguen siendo autogestionables.

### Fase 4. Datos y modelo jurídico `[x]`

- [X] Conservar la separación proceso/radicado y asociaciones existentes.

- [X] Mantener `Proceso.abogado_id` como responsable; el alcance de los enlaces cliente/radicado ahora distingue dueño SaaS de firma interna.

- [X] Mantener un responsable único por proceso y permitir que el responsable/admin asigne abogados internos `ABOGADO_ADMIN` como colaboradores; las asignaciones se auditan y SaaS no admite equipos.
- [X] Restringir lectura y operación del colaborador a procesos activos asignados; solo el responsable o ADMIN administra el equipo, cambia datos básicos o archiva/restaura el proceso.
- [X] ADMIN puede reasignar el responsable dentro del mismo rol/sector; se bloquean transferencias entre Firma y SaaS.
- [X] Bloquear nuevas asociaciones cruzadas de clientes/radicados entre SaaS y firma, conservando colaboración interna; la prueba cubre ambas direcciones.
- [X] Auditoría agregada actual: cero enlaces cruzados de cliente/radicado y cero inconsistencias tarea-proceso-cliente-radicado/documento-solicitud.
- [X] No agregar estados, partes ni tipos jurídicos nuevos: no se identificó un flujo real que los requiera.
- [X] Archivar procesos sin borrado físico; ocultar sus tareas/documentos del uso activo y permitir restauración auditada. Migración aditiva, sin modificar registros existentes.

### Fase 5. Espacio de trabajo de la firma `[x]`

- [X] Conservar `app/gestion-procesos/abogado` como workspace canónico compartido para `ABOGADO_ADMIN` y `ABOGADO`; ADMIN y el portal restringido CLIENTE mantienen áreas separadas.

- [X] El resumen compartido conserva procesos/clientes/tareas y, para SaaS, plan/cuota, alertas y consultas recientes.

- [X] Unificar inicio y shell de abogados; `/dashboard` redirige al workspace compartido y desaparece como segundo inicio.
- [X] Navegación dinámica por rol con flujos SaaS de radicados/tareas preservados bajo el mismo shell; las llamadas de ADMIN, abogado, SaaS y cliente usan el transporte compartido para auth, errores HTTP/red, multipart y descargas.
- [X] Los layouts protegen acceso por rol; backend sigue siendo autoridad para plan, owner y permisos.

### Fase 6. Expediente, documentos y comunicaciones `[~]`

- [X] Procesos, radicados, tareas, solicitudes documentales y cargas R2 existen.

- [X] Ficha del proceso con solicitudes, estado de entrega, documentos descargables y notificaciones recientes; permite solicitar archivos y enviar avisos vinculados a actuación/cliente.

- [X] Inventario documental con búsqueda por nombre, proceso, cliente y tipo MIME; solicitudes filtrables por texto y estado.
- [ ] Completar una timeline cronológica unificada del expediente; el historial actual de avisos de actuaciones está en un módulo separado.
- [~] Carga limita a 15 MB y valida firmas de PDF/JPEG/PNG/DOCX; descargas autenticadas, limitadas al ámbito asignado y auditadas. Si falla la transacción de metadatos, se revierte y se intenta borrar el objeto de R2; una prueba cubre éxito, rollback y fallo de limpieza sin ocultar el error original. Falta verificar el bucket R2 real, definir retención/limpieza periódica y decidir si se exige análisis antivirus.
- [~] Portal cliente lista y entrega/descarga documentos de procesos asignados sin anotaciones internas. Hay pruebas de permisos por funciones de backend, pero faltan pruebas HTTP autenticadas de extremo a extremo.

### Fase 7. Agenda y trabajo jurídico `[~]`

- [X] Agenda de tareas por vencimiento y recordatorios en la vista de agenda; resúmenes de abogado y cliente incluyen calendario mensual basado en tareas existentes, sin crear modelos ni calcular plazos jurídicos.
- [X] Tareas y subtareas permiten asignación general/proceso/radicado/actuación, asignación opcional al cliente y canales configurables de email/WhatsApp; el portal cliente solo lista sus subtareas asignadas y muestra su ámbito.
- [~] Confirmar con la firma si requiere audiencias y términos; no se calculan días hábiles ni plazos legales automáticamente.
- [ ] Si se aprueba: diseñar eventos vinculados a procesos, reglas de días hábiles configurables y alertas.
- [ ] Probar calendarios/reglas jurídicas con casos revisados por la firma.

### Fase 8. Administración y auditoría `[~]`

- [X] Consola ADMIN rehecha con shell, resumen, usuarios, planes, solicitudes, auditoría y operación.

- [X] Panel Administrativo separa en navegación `Control global`, `Firma`, `SaaS individual` y `Contenido público`, mostrando el ámbito en curso.
- [X] Inventarios de procesos/radicados/tareas/documentos aceptan sectores backend `FIRMA`, `SAAS` y `GLOBAL`; la prueba confirma que no mezclan propietarios.
- [X] Contenido público editable para ocho páginas con JSON estructurado, allowlist, fallback, restauración y auditoría de cambios.
- [X] Inventarios FIRMA/SAAS/GLOBAL permiten crear, editar y retirar procesos, radicados y tareas con responsable validado; los procesos se archivan y restauran sin borrado físico.
- [X] Documentos permiten crear con carga autenticada a R2, editar metadatos, descargar, eliminar y emitir URLs firmadas de 15 minutos con auditoría; la creación exige responsable, proceso activo y cliente del sector.
- [X] SMTP codifica explícitamente en UTF-8 y `.env` se carga desde la raíz del proyecto antes de inicializar la conexión y servicios.
- [~] Usuarios y planes tienen alta/edición/estado; las transiciones de rol de cuentas existentes no están habilitadas para evitar cambiar su ámbito propietario desde el panel.
- [X] Solicitudes SaaS permiten revisar tarjeta privada, aprobar/rechazar individualmente o en lote, asignar plan y auditar las decisiones.
- [X] ADMIN puede encolar consultas individuales o de todos los radicados del ámbito seleccionado; las acciones quedan auditadas.
- [X] ADMIN puede forzar el borrado de radicados con historial; desaparecen actuaciones, consultas, tareas y vínculos, mientras se conservan procesos/documentos R2.
- [X] La cuenta ADMIN puede actualizar correo/nombre/WhatsApp y cambiar contraseña con autenticación actual.
- [~] Se registran varias mutaciones; la auditoría aún no cubre todas las lecturas sensibles ni jobs.

- [ ] Completar auditoría de cambios y acciones extraordinarias sin guardar contraseñas ni contenido sensible.
- [ ] Mantener actividad por responsable y expediente para trazabilidad.

### Fase 9. Operación, pruebas y producción `[~]`

- [X] PostgreSQL, Redis, Celery y R2 están configurados para operación local.
- [X] Login y CORS del entorno local verificados.

- [X] El procesador compartido de recordatorios puede ser llamado por Celery o QStash; serializa fecha local como UTC, confirma envíos y usa `FOR UPDATE SKIP LOCKED` para evitar ejecuciones concurrentes duplicadas en PostgreSQL.
- [X] El endpoint QStash valida `Upstash-Signature` con ambas signing keys y la URL pública exacta; una prueba confirma rechazo de firma inválida sin procesar recordatorios.
- [~] El retry de consulta manual reenvía la firma original y conserva `consulta_id` tras errores 503; quedan revisiones de destinatarios y tareas mensuales.

- [~] Despliegue objetivo Vercel con QStash para recordatorios; falta asignar el dominio público a `QSTASH_ENDPOINT_URL` y crear en Upstash la schedule POST `CRON_TZ=America/Bogota * * * * *`. Sin esos pasos no habrá ejecución periódica en producción.
- [ ] Añadir migraciones versionadas, backups y procedimiento de rollback antes de cambios de datos.
- [ ] Completar pruebas API con entorno aislado, flujos frontend por rol y checks de regresión.
- [ ] Documentar `.env`, rotación de secretos, servicios y pasos de recuperación.

## Siguiente bloque

Definir si ADMIN debe cargar documentos fuera del flujo de solicitudes y qué controles aplican a cambios de rol/propietario; ampliar después pruebas HTTP y cobertura de auditoría para esas decisiones.

## Reglas

- No crear tablas/abstracciones multi-tenant.
- No eliminar roles, planes ni datos hasta completar inventario y migración reversible.
- Mantener acceso de cliente por asignación, aunque la organización sea única.
- Trabajar por flujos pequeños: prueba, cambio, validación y actualización de este plan.
- No avanzar a módulos nuevos hasta cerrar identidad, permisos y estabilidad del núcleo.
