# Plan: lanzadores Workflows para consultas y recordatorios

## Objetivo

Implementar en Vercel dos lanzadores durables: consultas periódicas de radicados y recordatorios individuales. Next.js inicia y orquesta los Workflows; FastAPI conserva la propiedad de la base de datos y la integración con la Rama Judicial.

## Alcance y reglas

- [X] La firma interna comparte recursos solo entre sus abogados autorizados. Las cuentas SaaS de abogados individuales permanecen aisladas por propietario; no se incorpora un modelo genérico de tenants ni equipos SaaS externos.
- [X] No se almacenará una lista de IDs dentro de Usuario. La lista visible como `usuario.radicados` se persistirá mediante una relación Usuario-Radicado.
- [ ] Confirmar antes de migrar la clave de deduplicación: fuente judicial + número normalizado + ámbito permitido. Propuesta: ficha compartida dentro de la firma y cada cuenta SaaS en su propio ámbito.
- [X] Cada barrido consulta una vez cada ficha canónica de su ámbito. No se asume que la API de Rama tenga consulta masiva: cada radicado requiere llamadas propias.
- [X] Horario visible para el admin: 12:00 y 17:00, hora de Colombia. Vercel Cron usa UTC: `0 17 * * *` y `0 22 * * *`, respectivamente. Cada Cron corre una vez diaria en Hobby; la configuración DB filtra los días elegidos. Hobby puede invocarlos en cualquier momento dentro de la hora programada (precisión de hasta ±59 minutos). Las horas quedan fijas en el despliegue; cambiar las horas desde la UI requiere otro scheduler/plan.
- [X] Las tareas y subtareas conservan su responsable actual. Compartir la ficha del radicado no comparte tareas ni notas internas.

## Base ya validada

- [X] El probe de Next.js completó en Preview con `{ value: 7 }`; las rutas internas de Workflow se generan correctamente.
- [X] El probe Python se retiró del branch de prueba para que el servicio Next no reciba workflows que no registra.
- [ ] Implementar los lanzadores reales; el probe no realiza consultas ni programa recordatorios.

## Fases pendientes

### 1. Modelo canónico y migración

- [x] Definir ámbito de deduplicación: `FIRMA` compartida y `SAAS:<usuario_id>` aislado; normalizar a los 23 dígitos.
- [x] Implementar ficha canónica por fuente/ámbito/número, la relación `Usuario.radicados` y la migración que renombra el propietario legacy a `creado_por_id`.
- [x] Ejecutar el preflight sobre la PostgreSQL objetivo: 6 radicados; cero duplicados, filas inválidas, conflictos, referencias cruzadas o tablas no contempladas.
- [x] Exponer preflight y apply desde Swagger bajo ADMIN; el apply requiere flag temporal, confirmación de backup y deja auditoría.
- [x] Ejecutar el apply real en ventana de mantenimiento y verificar en Supabase que el esquema quedó migrado.
- [x] Agregar y persistir el identificador de proceso que devuelve Rama (`idProceso`) al completar la búsqueda inicial.
- [x] Implementar preflight y fusión que preservan actuaciones, consultas, procesos, tareas, subtareas y vínculos; el test legacy sintético verifica referencias y duplicados.
- [x] Revisar duplicados/conflictos de la base objetivo antes del apply; el preflight no reportó ninguno.
- [x] Al quitar un radicado de un usuario, borrar solo la asociación; conservar la ficha canónica compartida.
- [x] Proteger la creación concurrente con clave única por fuente/ámbito/número y crear o vincular dentro de un savepoint.

### 2. Sincronización idempotente con Rama Judicial

- [x] Tratar `sin consultar` legacy como `SIN_CONSULTAR`; para una ficha nueva o sin `idProceso`, buscar por número y persistir el ID antes de descargar actuaciones.
- [x] Si la ficha ya tiene `idProceso`, consultar actuaciones directamente sin buscar de nuevo por número.
- [x] Mantener estados no encontrado, privado y error de API distintos de una consulta correcta; el fallo de un radicado no impide que la tarea por radicado informe su resultado.
- [x] Consultar actuaciones recientes y, en una sincronización incremental, paginar hasta la primera actuación ya conocida cuando se mantiene el orden reciente-primero de la API.
- [x] Fusionar el delta con el historial usando una clave estable y serializar la escritura por radicado con lock de fila en PostgreSQL para evitar sobrescrituras/duplicados concurrentes.

### 3. Lanzador de consultas periódicas

- [x] Registrar dos Cron protegidos en Vercel para los slots de Hobby: diarios, `0 17 * * *` y `0 22 * * *` (UTC). El handler valida secreto y slot; el backend filtra días deshabilitados antes de crear el Workflow.
- [x] Guardar en la DB la configuración del barrido: activo/inactivo y días habilitados. El Cron diario consulta esa configuración y no ejecuta si el día está deshabilitado.
- [x] El Workflow crea/actualiza un registro de ejecución, obtiene los radicados canónicos del ámbito y coordina su consulta. Tiene idempotencia por fecha/slot, prevención de solapamiento por radicado, leases, progreso y errores.
- [x] Llamar a FastAPI mediante el binding privado y autenticación de servicio. El endpoint ejecuta la consulta/persistencia directamente, no encola Celery.
- [x] Limitar concurrencia a cinco radicados y aislar fallos por expediente para que no detengan el resto.
- [x] Configurar hasta dos reintentos por radicado con backoff durable de 5 y 20 segundos (tres intentos totales); el step reutiliza la consulta idempotente. La integración local prueba recuperación tras dos fallos y agotamiento tras tres; TypeScript y ESLint pasan.
- [x] Reconciliar el historial completo cada 30 días por radicado: recorrer todas las páginas y reemplazar el snapshot para reflejar actuaciones antiguas agregadas, corregidas o retiradas por Rama. Pasan las pruebas de reconciliación, intervalo, idempotencia e incremental; suite backend: 50 tests.
- [x] Añadir al panel ADMIN configuración de días/estado, última y próxima ejecución, progreso, errores por radicado y botón `Consultar ahora`. El botón usa el mismo flujo marcado como manual.
- [x] Lanzar `Consultar ahora` desde el panel ADMIN del Preview; el Workflow terminó `completed`, validando el binding y la autenticación interna.
- [ ] Configurar `CRON_SECRET` y `WORKFLOW_SERVICE_TOKEN` en Production; confirmar el binding generado `BACKEND_SERVICE_URL` y verificar ambos Cron tras autorizar y completar el redeploy de Production.

### 4. Cruce y envío de novedades

- [ ] Persistir cada actuación nueva una vez en la ficha canónica.
- [ ] Encontrar los abogados vinculados dentro del ámbito y evaluar por separado rol, plan y preferencias de cada destinatario.
- [ ] Inventariar todos los tipos de mensaje actuales y futuros (actuaciones, asignaciones de tareas/subtareas, recordatorios, documentos y resúmenes); aplicarles una política común sin omitir productores de notificaciones.
- [ ] En Configuración, permitir a cada usuario no CLIENTE activar email y WhatsApp independientemente para cada tipo de mensaje. Respetar disponibilidad del canal, datos de contacto y límites del plan.
- [ ] Para CLIENTE, reemplazar las preferencias por tipo por la selección de un canal obligatorio (email o WhatsApp): entregar en ese canal todas las alertas que le correspondan, sin opt-out por tipo. No emitir alertas fuera de sus asignaciones/relaciones autorizadas.
- [ ] Definir la precedencia de la regla obligatoria del CLIENTE frente a `Subtarea.notificar_email`, `Subtarea.notificar_whatsapp` y controles de envío por evento; validar el canal seleccionado y resolver explícitamente el caso de contacto inválido o faltante.
- [ ] Migrar `Usuario.notificaciones_email` y `Usuario.notificaciones_whatsapp` a valores iniciales por tipo que conserven el comportamiento vigente hasta que cada usuario los cambie; retirar los flags globales solo cuando ningún productor dependa de ellos.
- [ ] Mostrar una matriz de preferencias por tipo para usuarios no CLIENTE y un selector de canal obligatorio para CLIENTE; no ofrecer al cliente interruptores que puedan suprimir alertas que le corresponden.
- [ ] Si un radicado tiene varias actuaciones nuevas, informar cuántas se detectaron y mostrar el detalle solo de la más reciente; conservar todas las actuaciones en la DB.
- [ ] Al terminar un barrido, agrupar los procesos con novedades por usuario y enviar un único mensaje consolidado por usuario y canal habilitado. Incluir una sección por proceso, con el número de actuaciones nuevas y el detalle de su más reciente; omitir procesos sin novedades.
- [ ] Aplicar el mismo formato a consultas manuales; cuando se consulten varios procesos en una acción manual, consolidar por usuario igual que en el barrido.
- [ ] Enviar WhatsApp y email cuando estén habilitados. El envío actual de novedades consulta WhatsApp; falta integrar email para este flujo.
- [ ] Registrar entrega por actuación, usuario y canal con idempotencia/reintentos. Un fallo de notificación no debe volver a consultar ni duplicar las demás alertas.

### 5. Lanzador individual de recordatorios

- [ ] Al crear un recordatorio, guardarlo y emitir de forma confiable el evento que inicia su Workflow. Resolver la frontera DB/inicio mediante outbox o mecanismo de reconciliación.
- [ ] Calcular la fecha de ejecución desde `fecha_hora` o desde `fecha_limite - anticipacion_minutos`, respetando la zona horaria acordada.
- [ ] El Workflow espera hasta la fecha; antes de notificar vuelve a leer DB y verifica que el recordatorio siga activo, pendiente, vigente y asociado a una tarea válida.
- [ ] Edición, reprogramación, desactivación o eliminación deben invalidar la versión anterior; reintentos nunca duplican el envío. Definir canales disponibles; hoy el modelo permite WhatsApp.
- [ ] Migrar el procesamiento actual Celery/QStash solo después de probar el Workflow, evitando que ambos mecanismos envíen el mismo recordatorio.

### 6. Consola operativa ADMIN y agenda de la firma

- [ ] Añadir al panel ADMIN un apartado de operación para iniciar consultas manuales de todos los radicados o de una selección, reutilizando el mismo Workflow y controles de idempotencia.
- [ ] Mostrar ejecuciones manuales y automáticas con estado, progreso, hora de inicio/fin, radicados consultados, novedades, errores y opción segura de reintento cuando aplique.
- [ ] Añadir pruebas diagnósticas de las integraciones configuradas: API de Rama Judicial, Workflow, WhatsApp, SMTP y otros servicios que se incorporen. Separar verificar conexión/configuración de enviar un mensaje real.
- [ ] Proteger las pruebas de envío real: solo ADMIN, destinatario de prueba explícito, confirmación antes del envío, resultado sin exponer credenciales y registro de auditoría.
- [ ] Añadir al dashboard ADMIN la agenda general de la firma con vista calendario y listado de tareas asociadas a abogados internos (`ABOGADO_ADMIN`), incluyendo responsable, cliente/proceso/radicado, estado y vencimiento.
- [ ] Filtrar la agenda por rango/mes, abogado responsable, estado y vencimientos; permitir abrir el contexto autorizado de la tarea sin exponer tareas ni datos de abogados SaaS individuales.
- [ ] Definir si la agenda ADMIN es de solo lectura o permite reasignar/actualizar tareas; cualquier mutación debe respetar permisos y quedar auditada.

### 7. Pruebas y despliegue gradual

- [ ] Probar migración con duplicados: un radicado compartido dentro del ámbito produce una ficha y una consulta externa, pero mantiene tareas y destinatarios separados; quitar un vínculo no afecta a los demás.
- [ ] Probar primera búsqueda por número, persistencia de `idProceso` y consultas posteriores directas a actuaciones; cubrir paginación, privacidad, no encontrado, reintentos y errores parciales.
- [ ] Probar Cron en los dos slots, días deshabilitados, disparo manual, redelivery, ejecución concurrente y autenticación servicio-a-servicio.
- [ ] Probar recordatorios concretos y por anticipación, además de reprogramar, desactivar, eliminar, completar tarea y reintentar sin duplicar notificaciones.
- [ ] Usar destinatarios simulados en Preview; habilitar producción por etapas y verificar ejecuciones, consumo de Rama y entregas antes de iniciar el retiro de Celery/QStash.
- [ ] Eliminar el endpoint y workflow temporales `workflow-probe` cuando los lanzadores reales estén validados.

### 8. Retiro de infraestructura y dependencias sustituidas

- [ ] Inventariar cada tarea Celery, productor y schedule antes del corte: consultas individuales y por lote, recordatorios, notificaciones de email/WhatsApp y resumen mensual.
- [ ] Migrar o reemplazar cada productor consumidor por Workflow u otro mecanismo acordado. No retirar Celery/Redis mientras quede una ruta que invoque `.delay()` o dependa del worker.
- [ ] Tras validar el nuevo flujo de recordatorios en producción, desactivar la schedule de QStash y confirmar que no quedan entregas pendientes; luego retirar el endpoint QStash, verificación de firmas, paquete `qstash`, variables y documentación de Upstash.
- [ ] Tras migrar todos los trabajos Celery, detener Beat/workers y confirmar que no quedan tareas en vuelo ni llamadas `.delay()` activas.
- [ ] Si ya no existe otro consumidor, retirar Redis/Celery: dependencias Python, configuración `app/celery_app.py`, endpoint de diagnóstico Redis, indicador del panel ADMIN y servicio Redis del entorno local.
- [ ] Limpiar `REDIS_URL`, secretos/variables QStash y referencias operativas de `.env.example`, Vercel, Docker Compose y README; conservar solo las variables todavía utilizadas.
- [ ] Verificar con búsqueda global que no queden imports, endpoints, schedules, instrucciones o dependencias de Redis/Celery/QStash. Respaldar o confirmar como descartables los archivos locales de estado de Celery Beat antes de borrarlos.

## Criterios de salida

- [ ] No existen fichas duplicadas dentro del ámbito acordado y la base impide recrearlas bajo concurrencia.
- [ ] `SIN_CONSULTAR` hace la búsqueda inicial y guarda `idProceso`; las consultas posteriores omiten esa búsqueda.
- [ ] Los Cron consultan configuración diaria en los slots visibles 12:00/17:00 Colombia (`0 17 * * *` y `0 22 * * *` UTC), procesan solo los días habilitados y permiten ejecución manual dentro de la ventana de Hobby.
- [ ] Si un proceso trae varias actuaciones nuevas, se informa el total y solo se detalla la más reciente.
- [ ] Si varios procesos del mismo barrido tienen novedades, cada usuario recibe un único mensaje consolidado por canal, con resumen independiente por proceso y sin incluir procesos sin novedades.
- [ ] Usuarios no CLIENTE controlan email y WhatsApp por separado para cada tipo; CLIENTE recibe todas sus alertas aplicables en su canal obligatorio elegido, sin filtros por tipo.
- [ ] Las preferencias, disponibilidad de canal, alcance de destinatarios y límites del plan se aplican coherentemente a todos los productores de mensajes; las migraciones conservan preferencias existentes.
- [ ] ADMIN puede iniciar y seguir consultas manuales, probar integraciones sin exponer secretos ni enviar mensajes no confirmados y consultar el calendario agregado de tareas de abogados internos.
- [ ] La agenda ADMIN incluye las tareas de la firma y excluye tareas privadas de abogados SaaS individuales.
- [ ] Las novedades se consultan una vez por ficha canónica y se notifican solo a los destinatarios elegibles, sin duplicados.
- [ ] Crear un recordatorio programa su Workflow; cambios, cancelaciones y reintentos no producen envíos obsoletos ni duplicados.
- [ ] Cada error queda trazado por ejecución/radicado/destinatario, sin detener el resto del lote ni cruzar datos entre la firma y cuentas SaaS individuales.
- [ ] Redis, Celery y QStash solo se eliminan cuando todos sus productores y consumidores hayan migrado, las schedules estén apagadas y no haya trabajos pendientes; después no quedan referencias operativas ni dependencias sin uso.
