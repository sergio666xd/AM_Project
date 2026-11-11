# WhatsApp Cloud API (Meta)

La aplicación envía los avisos de WhatsApp por la Cloud API de Meta
(`graph.facebook.com`). Este documento dice qué configurar, qué plantillas
aprobar en Meta y cómo probarlo.

## Cómo funciona

- **Envío.** Fuera de la ventana de 24 horas que abre un mensaje de la persona,
  Meta solo deja enviar **plantillas aprobadas**. Cada aviso de la aplicación
  (clave de `plantillas_mensaje`) tiene su plantilla de Meta en
  `app/whatsapp_plantillas.py`, que es la única fuente del texto: el script de
  abajo la usa para crearlas en Meta y el backend para llenarlas al enviar.
- **Datos de cada aviso.** Al crear una entrega por WhatsApp se guarda en
  `entregas_notificacion.datos_whatsapp` la clave del aviso y sus valores ya
  legibles (fechas en palabras, estados sin mayúsculas). La contraseña nunca se
  guarda ni viaja por WhatsApp.
- **Estados.** Meta devuelve un id por mensaje (`wamid`), que se guarda en
  `proveedor_mensaje_id`. El webhook actualiza `estado_proveedor`
  (`sent`, `delivered`, `read`, `failed`). Si Meta informa `failed`, la entrega
  pasa a `ERROR` con la causa, y aparece en Alertas.
- **Mensajes recibidos.** Lo que las personas escriben al número del despacho
  se guarda en `mensajes_whatsapp_recibidos`, enlazado al usuario cuando el
  número coincide. Todavía no hay pantalla para verlos.
- **Proveedor anterior.** Mientras `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`
  no estén configurados, se sigue usando la URL y el token guardados en
  Admin > Operación > Integraciones. Con esas dos variables, todo WhatsApp sale
  por Meta y ese formulario deja de usarse.
- **Admin > Operación > Integraciones.** «Probar conexión» consulta el número
  en Meta (nombre verificado y calidad) sin enviar nada; «Envío de prueba» manda
  la plantilla `am_prueba_envio`.

## Variables de entorno (servicio backend en Vercel)

Nunca van en el código ni en commits.

| Variable | Valor |
| --- | --- |
| `WHATSAPP_TOKEN` | Token permanente del usuario del sistema de Meta, con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`. |
| `WHATSAPP_PHONE_NUMBER_ID` | `634864400531550` (+57 350 8809878). |
| `WHATSAPP_WABA_ID` | `634496380588828`. Solo lo usa el script de plantillas. |
| `WHATSAPP_VERIFY_TOKEN` | Una cadena larga y aleatoria que tú inventas; la misma se escribe en Meta al configurar el webhook. |
| `WHATSAPP_APP_SECRET` | Clave secreta de la app «AM Notificaciones Panel» (Meta for Developers > Configuración de la app > Básica). Sin ella el webhook rechaza todo. |
| `WHATSAPP_GRAPH_VERSION` | Opcional. Por defecto `v23.0`. |
| `WHATSAPP_IDIOMA_PLANTILLAS` | Opcional. Por defecto `es`; debe ser el idioma con que se aprobaron las plantillas. |

`WHATSAPP_API_URL` solo la usa el proveedor anterior y se puede borrar cuando
Meta quede funcionando.

## Pasos

1. **Variables.** Configura las de la tabla en el servicio backend de Vercel
   (Production y Preview) y redespliega.
2. **Plantillas.** En tu computador, con las variables en el `.env`:

   ```bash
   python scripts/plantillas_whatsapp_meta.py            # ver lo que se va a crear, sin llamar a Meta
   python scripts/plantillas_whatsapp_meta.py --crear    # crear en Meta las que falten
   python scripts/plantillas_whatsapp_meta.py --estado   # ver si ya están aprobadas
   ```

   Meta suele aprobar las de utilidad en minutos u horas. Si rechaza una, el
   motivo aparece en el administrador de WhatsApp > Plantillas de mensajes.
   También se pueden crear a mano copiando los textos de abajo.
3. **Webhook.** En Meta for Developers > la app > WhatsApp > Configuración:
   - URL de devolución de llamada: `https://www.alejandramunozabogada.com/api/whatsapp/webhook`
   - Token de verificación: el valor de `WHATSAPP_VERIFY_TOKEN`.
   - Suscribirse al campo `messages`.
4. **Probar.**

   ```bash
   python scripts/plantillas_whatsapp_meta.py --probar 3001234567                       # hello_world, sin esperar aprobación
   python scripts/plantillas_whatsapp_meta.py --probar 3001234567 --plantilla PRUEBA_INTEGRACION
   ```

   Después usa «Envío de prueba» en Admin > Operación > Integraciones y revisa
   en Alertas que la entrega pase a entregada o leída.

## Errores frecuentes

| Código | Qué significa |
| --- | --- |
| 190 | El token venció o fue revocado. |
| 131030 | El número no está en la lista de prueba (solo pasa si la app sigue en modo desarrollo). |
| 131047 | Se intentó texto libre fuera de las 24 horas; la aplicación siempre usa plantillas, así que indica una plantilla faltante. |
| 132000 | La plantilla aprobada tiene otro número de variables que el catálogo. Vuelve a aprobarla con el texto actual. |
| 132001 | La plantilla no existe o no está aprobada en el idioma configurado. |
| 131026 | El número no tiene WhatsApp o no puede recibir el mensaje. |

## Cambiar un texto

Editar el texto en `app/whatsapp_plantillas.py` no cambia la plantilla ya
aprobada: hay que crearla otra vez en Meta (con otro nombre, o editarla en el
administrador de WhatsApp y esperar la aprobación) **antes** de desplegar el
cambio. Si el número de variables cambia y Meta aún tiene la versión anterior,
los envíos fallan con el código 132000.

Meta rechaza en automático las plantillas de utilidad que mencionan usuario,
contraseña u otros datos de acceso; por eso los avisos de acceso solo remiten
al correo. `--estado` muestra el motivo de cada rechazo.

Las plantillas del editor de Admin > Operación > Plantillas siguen siendo las
del correo y de las notificaciones del navegador. Para WhatsApp por Meta mandan
los textos de abajo.

## Plantillas que hay que aprobar

Todas en idioma `es`. El pie va como «Pie de página» en Meta. Los avisos de
correo que no salen por WhatsApp (contratos, cuentas de cobro, recibos,
recuperar contraseña, formulario del sitio) no necesitan plantilla.

### `am_actuacion_notificada`

- Avisos: `ACTUACION_NOTIFICADA`
- Categoría: Utilidad
- Variables: {{1}} saludo, {{2}} proceso, {{3}} actuacion, {{4}} fecha, {{5}} enlace

```text
👋 Hola, {{1}}.
Hay una novedad del juzgado en su proceso *{{2}}*.
📝 Actuación: {{3}}
📅 Fecha: {{4}}
Si esta novedad requiere algo de usted, se lo indicaremos.
🔗 Ver la actuación: {{5}}

Si tiene dudas, escríbanos por el chat del portal.
---
Alejandra Muñoz | Abogada y Asociados
```

### `am_novedades_juzgado`

- Avisos: `ACTUACIONES_DIGEST`
- Categoría: Utilidad
- Variables: {{1}} saludo, {{2}} novedades, {{3}} enlace

```text
👋 Hola, {{1}}.
Hay novedades del juzgado en sus procesos: {{2}}
🔗 Véalas en el portal: {{3}}

Si tiene dudas, escríbanos por el chat del portal.
---
Alejandra Muñoz | Abogada y Asociados
```

### `am_bienvenida_cliente`

- Avisos: `CLIENTE_CREDENCIALES`
- Categoría: Utilidad
- Variables: {{1}} saludo, {{2}} actor, {{3}} correo, {{4}} enlace

```text
👋 Hola, {{1}}.
{{2}} le dio acceso al portal del despacho, donde puede ver cómo va su proceso.
Le enviamos un correo a *{{3}}* con las indicaciones para entrar. Si no lo encuentra, revise la carpeta de correo no deseado.
🔗 Ir al portal: {{4}}

Si tiene dudas, escríbanos por el chat del portal.
---
Alejandra Muñoz | Abogada y Asociados
```

### `am_bienvenida_abogado`

- Avisos: `ABOGADO_CREDENCIALES`
- Categoría: Utilidad
- Variables: {{1}} saludo, {{2}} correo, {{3}} enlace

```text
👋 Hola, {{1}}.
Ya tiene acceso como abogado al portal del despacho.
Le enviamos un correo a *{{2}}* con las indicaciones para entrar.
🔗 Ir al portal: {{3}}

Si tiene dudas, escríbanos por el chat del portal.
---
Alejandra Muñoz | Abogada y Asociados
```

### `am_codigo_seguridad`

- Avisos: `CODIGO_SEGURIDAD`
- Categoría: Autenticación
- Variables: {{1}} codigo

Meta pone el texto de las plantillas de autenticación. Al crearla: idioma Español, «Copiar código» como botón, recomendación de seguridad activada y vencimiento de 3 minutos.

### `am_cambio_seguridad`

- Avisos: `CAMBIO_SEGURIDAD_CONFIRMADO`
- Categoría: Utilidad
- Variables: {{1}} saludo, {{2}} cambio

```text
👋 Hola, {{1}}.
Se actualizó el *{{2}}* de acceso a su cuenta del portal.
Si usted hizo este cambio, no tiene que hacer nada. Si no lo hizo, comuníquese de inmediato con el despacho.
---
Alejandra Muñoz | Abogada y Asociados
```

### `am_mensaje_chat`

- Avisos: `CHAT_MENSAJE`
- Categoría: Utilidad
- Variables: {{1}} saludo, {{2}} actor, {{3}} enlace

```text
👋 Hola, {{1}}.
*{{2}}* le está escribiendo por el chat del portal.
🔗 Leer los mensajes: {{3}}

Responda desde el portal para que su mensaje quede en el expediente.
---
Alejandra Muñoz | Abogada y Asociados
```

### `am_colaborador_agregado`

- Avisos: `COLABORADOR_AGREGADO`
- Categoría: Utilidad
- Variables: {{1}} saludo, {{2}} actor, {{3}} proceso, {{4}} responsable, {{5}} permiso, {{6}} enlace

```text
👋 Hola, {{1}}.
{{2}} le dio acceso al proceso *{{3}}*.
👤 Responsable: {{4}}
🔐 Su participación: {{5}}
🔗 Ver el proceso: {{6}}

Si tiene dudas, escríbanos por el chat del portal.
---
Alejandra Muñoz | Abogada y Asociados
```

### `am_mensaje_proceso`

- Avisos: `COMUNICACION_ABOGADO_CLIENTE`, `COMUNICACION_CLIENTE_ABOGADO`
- Categoría: Utilidad
- Variables: {{1}} saludo, {{2}} actor, {{3}} proceso, {{4}} mensaje, {{5}} enlace

```text
👋 Hola, {{1}}.
*{{2}}* le escribió sobre el proceso *{{3}}*:
💬 {{4}}
🔗 Leer y responder: {{5}}

Responda desde el portal para que su mensaje quede en el expediente.
---
Alejandra Muñoz | Abogada y Asociados
```

### `am_documento_recibido`

- Avisos: `DOCUMENTO_RECIBIDO`
- Categoría: Utilidad
- Variables: {{1}} saludo, {{2}} actor, {{3}} documento, {{4}} proceso, {{5}} enlace

```text
👋 Hola, {{1}}.
*{{2}}* entregó *{{3}}* para el proceso *{{4}}*.
Revíselo y apruébelo o pida una corrección.
🔗 Revisar el documento: {{5}}

Si tiene dudas, escríbanos por el chat del portal.
---
Alejandra Muñoz | Abogada y Asociados
```

### `am_documento_revisado`

- Avisos: `DOCUMENTO_REVISION`
- Categoría: Utilidad
- Variables: {{1}} saludo, {{2}} documento, {{3}} estado, {{4}} comentario, {{5}} enlace

```text
👋 Hola, {{1}}.
Revisamos su documento *{{2}}*.
📌 Resultado: *{{3}}*
💬 Comentario: {{4}}
Si necesita corrección, súbalo de nuevo desde el portal.
🔗 Ver mis documentos: {{5}}

Si tiene dudas, escríbanos por el chat del portal.
---
Alejandra Muñoz | Abogada y Asociados
```

### `am_actividad_agenda`

- Avisos: `EVENTO_AGENDA`
- Categoría: Utilidad
- Variables: {{1}} saludo, {{2}} proceso, {{3}} actor_accion, {{4}} actividad, {{5}} inicio, {{6}} estado, {{7}} enlace

```text
👋 Hola, {{1}}.
Hay un cambio en una actividad de su proceso *{{2}}*: {{3}}.
🗓️ Actividad: *{{4}}*
🗓️ Cuándo: {{5}}
📌 Estado: {{6}}
🔗 Ver la actividad: {{7}}

Si tiene dudas, escríbanos por el chat del portal.
---
Alejandra Muñoz | Abogada y Asociados
```

### `am_proceso_actualizado`

- Avisos: `PROCESO_ACTUALIZACION`
- Categoría: Utilidad
- Variables: {{1}} saludo, {{2}} proceso, {{3}} actor_accion, {{4}} enlace

```text
👋 Hola, {{1}}.
Hay una novedad en su proceso *{{2}}*: {{3}}.
No tiene que hacer nada por ahora.
🔗 Ver mi proceso: {{4}}

Si tiene dudas, escríbanos por el chat del portal.
---
Alejandra Muñoz | Abogada y Asociados
```

### `am_prueba_envio`

- Avisos: `PRUEBA_INTEGRACION`
- Categoría: Utilidad
- Variables: {{1}} saludo

```text
👋 Hola, {{1}}.
Este es un mensaje de prueba solicitado desde la administración del portal.
Si lo recibió, el canal de WhatsApp funciona bien. No tiene que hacer nada.
---
Alejandra Muñoz | Abogada y Asociados
```

### `am_reactivacion_mensaje`

- Avisos: `REACTIVACION_COMUNICACION`
- Categoría: Utilidad
- Variables: {{1}} saludo, {{2}} proceso, {{3}} asunto, {{4}} enlace

```text
👋 Hola, {{1}}.
Su cuenta está activa de nuevo y tiene un mensaje pendiente sobre *{{2}}*.
💬 Asunto: {{3}}
🔗 Leer el mensaje: {{4}}

Si tiene dudas, escríbanos por el chat del portal.
---
Alejandra Muñoz | Abogada y Asociados
```

### `am_reactivacion_actividad`

- Avisos: `REACTIVACION_EVENTO`
- Categoría: Utilidad
- Variables: {{1}} saludo, {{2}} actividad, {{3}} proceso, {{4}} fecha, {{5}} enlace

```text
👋 Hola, {{1}}.
Su cuenta está activa de nuevo. Le recordamos *{{2}}* de su proceso *{{3}}*.
🗓️ Cuándo: {{4}}
🔗 Ver la actividad: {{5}}

Si tiene dudas, escríbanos por el chat del portal.
---
Alejandra Muñoz | Abogada y Asociados
```

### `am_reactivacion_tarea`

- Avisos: `REACTIVACION_TAREA`
- Categoría: Utilidad
- Variables: {{1}} saludo, {{2}} tarea, {{3}} fecha_limite, {{4}} enlace

```text
👋 Hola, {{1}}.
Su cuenta está activa de nuevo y tiene una tarea pendiente: *{{2}}*.
⏰ Fecha límite: {{3}}
🔗 Ver la tarea: {{4}}

Si tiene dudas, escríbanos por el chat del portal.
---
Alejandra Muñoz | Abogada y Asociados
```

### `am_recordatorio_documentos`

- Avisos: `RECORDATORIO_DOCUMENTO`
- Categoría: Utilidad
- Variables: {{1}} saludo, {{2}} solicitud, {{3}} cuando, {{4}} pendientes, {{5}} proceso, {{6}} enlace

```text
👋 Hola, {{1}}.
Le recordamos que la solicitud *{{2}}* {{3}}.
📄 Faltan estos documentos: {{4}}
📁 Proceso: {{5}}
🔗 Subir los documentos: {{6}}

Si tiene dudas, escríbanos por el chat del portal.
---
Alejandra Muñoz | Abogada y Asociados
```

### `am_recordatorio_tarea`

- Avisos: `RECORDATORIO_TAREA`
- Categoría: Utilidad
- Variables: {{1}} saludo, {{2}} tarea, {{3}} fecha_limite, {{4}} proceso, {{5}} enlace

```text
👋 Hola, {{1}}.
Le recordamos la tarea *{{2}}*.
⏰ Fecha límite: {{3}}
📁 Proceso: {{4}}
🔗 Ver la tarea: {{5}}

Si tiene dudas, escríbanos por el chat del portal.
---
Alejandra Muñoz | Abogada y Asociados
```

### `am_resumen_mensual`

- Avisos: `RESUMEN_MENSUAL`
- Categoría: Utilidad
- Variables: {{1}} saludo, {{2}} mes, {{3}} resumen, {{4}} enlace

```text
👋 Hola, {{1}}.
Este es el resumen de sus procesos de *{{2}}*: {{3}}
🔗 Véalo completo en el portal: {{4}}

Si tiene dudas, escríbanos por el chat del portal.
---
Alejandra Muñoz | Abogada y Asociados
```

### `am_solicitud_documentos`

- Avisos: `SOLICITUD_DOCUMENTO`
- Categoría: Utilidad
- Variables: {{1}} saludo, {{2}} proceso, {{3}} documentos, {{4}} fecha_limite, {{5}} enlace

```text
👋 Hola, {{1}}.
Necesitamos estos documentos para su proceso *{{2}}*: {{3}}
⏰ Entregar antes del: {{4}}
Súbalos en PDF o como foto legible.
🔗 Subir los documentos: {{5}}

Si tiene dudas, escríbanos por el chat del portal.
---
Alejandra Muñoz | Abogada y Asociados
```

### `am_tarea_asignada`

- Avisos: `SUBTAREA_ASIGNADA`
- Categoría: Utilidad
- Variables: {{1}} saludo, {{2}} actor, {{3}} subtarea, {{4}} enlace

```text
👋 Hola, {{1}}.
{{2}} le asignó una tarea: *{{3}}*.
Ábrala para ver qué debe hacer.
🔗 Ver la tarea: {{4}}

Si tiene dudas, escríbanos por el chat del portal.
---
Alejandra Muñoz | Abogada y Asociados
```

### `am_tarea_actualizada`

- Avisos: `TAREA_ACCION`
- Categoría: Utilidad
- Variables: {{1}} saludo, {{2}} tarea, {{3}} actor_accion, {{4}} estado, {{5}} fecha_limite, {{6}} enlace

```text
👋 Hola, {{1}}.
Hay un cambio en la tarea *{{2}}*: {{3}}.
📌 Estado: {{4}}
⏰ Fecha límite: {{5}}
🔗 Ver mis tareas: {{6}}

Si tiene dudas, escríbanos por el chat del portal.
---
Alejandra Muñoz | Abogada y Asociados
```
