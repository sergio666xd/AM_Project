
# PLAN MAESTRO — EVOLUCIÓN INTEGRAL DE GESTIÓN DE PROCESOS SaaS

## 0. Propósito

Este documento define la hoja de ruta para evolucionar el proyecto `AM_Project` desde su estado funcional actual hacia una plataforma integral de gestión jurídica con tres experiencias diferenciadas:

- `ADMIN`: administración global de la plataforma y de la firma.
- `ABOGADO_ADMIN`: operación diaria de la firma, clientes y procesos.
- `CLIENTE`: portal privado orientado a claridad, participación y confianza.

Además, se incluye la transformación del módulo de **edición del sitio público** desde un formulario rígido basado en campos hacia un **CMS visual con bloques, edición enriquecida, vista previa, borradores, publicación e historial de versiones**.

El objetivo no es simplemente agregar páginas o CRUDs.

La evolución debe conseguir que:

> **ADMIN controle y supervise.**
> **ABOGADO_ADMIN trabaje y gestione.**
> **CLIENTE entienda, participe y confíe.**

---

# 1. Contexto actual

## 1.1 Proyecto

Repositorio:

`sergio666xd/AM_Project`

Rama de trabajo actual de referencia:

`test-workflows`

Stack principal:

- Backend: FastAPI
- ORM: SQLAlchemy
- Base de datos: PostgreSQL
- Autenticación: JWT
- Frontend: Next.js 16.3.6
- Tailwind CSS
- Integraciones externas existentes, incluyendo consultas judiciales y WhatsApp

Frontend principal:

`frontend-saas/`

---

# 2. Reglas arquitectónicas fundamentales

Estas reglas son obligatorias durante toda la implementación.

## 2.1 No introducir multi-tenancy

La organización actual corresponde a una única firma:

**Alejandra Muñoz | Abogada y Asociados**

No implementar:

- tenants
- múltiples firmas
- organizaciones independientes
- separación por tenant
- selector de firma

La existencia del rol `ADMIN` no significa que el sistema sea multi-firma.

---

## 2.2 Mantener separación de responsabilidades

### ADMIN

Debe responder:

> ¿Qué está pasando en la plataforma y en la firma?

Responsabilidades:

- supervisión
- administración
- usuarios
- operación
- auditoría
- configuración
- planes SaaS
- solicitudes
- contenido público
- visión global

---

### ABOGADO_ADMIN

Debe responder:

> ¿Qué tengo que hacer y qué está pasando con mis asuntos?

Responsabilidades:

- procesos
- clientes
- radicados
- actuaciones
- tareas
- agenda
- documentos
- solicitudes
- comunicaciones
- seguimiento
- trabajo jurídico

No convertirlo en un segundo ADMIN.

---

### CLIENTE

Debe responder:

> ¿Qué está pasando con mi caso y qué tengo que hacer?

Responsabilidades:

- consultar sus procesos
- consultar actualizaciones
- entregar documentos
- completar tareas
- responder solicitudes
- consultar fechas
- comunicarse con el despacho
- recibir notificaciones
- participar en su proceso

No mostrar información interna del despacho.

---

## 2.3 Diferencia entre Proceso y Radicado

Mantener estrictamente esta distinción:

**Proceso**

Es la entidad/concepto principal dentro de la aplicación.

**Radicado**

Es el número/registro judicial que se consulta.

Un proceso puede contener uno o varios radicados.

No mezclar ambos conceptos en la UI, API ni modelos nuevos.

---

# 3. Principios generales de UX

Todos los paneles deben evolucionar hacia una interfaz consistente.

## 3.1 Lenguaje

Usar lenguaje humano y orientado a la acción.

Evitar mostrar innecesariamente:

- IDs internos
- estados técnicos
- errores internos
- nombres de endpoints
- información de scraping
- logs
- estructuras internas

Especialmente para CLIENTE.

---

## 3.2 Estados visuales

Utilizar estados consistentes:

- Normal
- Atención
- Riesgo
- Pendiente
- Vencido
- Completado
- En revisión
- Rechazado
- Archivado

No inventar estados incompatibles con los modelos existentes.

Primero revisar los enums/valores actuales.

---

## 3.3 Estados de interfaz

Todas las vistas nuevas deben contemplar:

- loading
- empty state
- error state
- success feedback
- disabled state
- skeleton cuando tenga sentido
- responsive
- mobile
- estados de permisos

No implementar únicamente el "happy path".

---

## 3.4 Consistencia visual

Reutilizar:

- AppShell
- Sidebar
- componentes existentes
- tarjetas
- botones
- modales
- tablas
- estados
- tokens visuales
- sistema dark/light ya existente

No crear un segundo sistema visual independiente.

---

# 4. FASE 0 — Auditoría y preparación

## Objetivo

Antes de modificar código, comprender exactamente el estado actual.

## Obligatorio

Codex debe revisar:

### Backend

- `app/main.py`
- `app/models.py`
- `app/schemas.py`
- `app/security.py`
- routers existentes
- servicios
- tareas
- permisos
- autenticación
- modelos relacionados con:
  - usuarios
  - procesos
  - clientes
  - radicados
  - actuaciones
  - tareas
  - documentos
  - solicitudes
  - notificaciones
  - contenido público
  - auditoría

### Frontend

Revisar:

- `frontend-saas/app/`
- `frontend-saas/components/`
- `frontend-saas/lib/`
- `SessionContext`
- `AppShell`
- `Sidebar`
- componentes ADMIN
- componentes ABOGADO_ADMIN
- componentes CLIENTE
- módulo de páginas públicas
- `publicPageContent.ts`
- APIs utilizadas por el frontend

### Tests

Revisar:

- `tests/`
- configuración de testing
- workflows existentes
- lint
- typecheck
- build

---

## Regla crítica

NO comenzar implementando.

Primero producir un diagnóstico interno de:

1. qué existe;
2. qué funciona;
3. qué está incompleto;
4. qué puede reutilizarse;
5. qué debe modificarse;
6. qué debe crearse;
7. qué riesgos de regresión existen.

No reescribir componentes existentes sin necesidad.

---

# 5. FASE 1 — Sistema transversal de diseño, permisos y navegación

## Objetivo

Crear una base común para que las fases posteriores no dupliquen código.

### Implementar/revisar

- AppShell
- Sidebar
- Header
- navegación por rol
- breadcrumbs
- estados de carga
- estados vacíos
- alertas
- modales
- confirmaciones
- toast/feedback
- cards
- tablas
- filtros
- paginación
- botones de acción
- badges
- responsive

---

## Permisos

Centralizar la lógica de permisos.

No confiar únicamente en ocultar elementos del frontend.

El backend debe seguir validando permisos.

Cada endpoint nuevo debe comprobar:

- usuario autenticado
- rol
- relación con el recurso
- propiedad/visibilidad
- permisos específicos

---

# 6. FASE 2 — ADMIN: Dashboard de comando

## Objetivo

Convertir el dashboard ADMIN en un verdadero centro de control.

Actualmente la información administrativa existe, pero debe pasar de:

> "consultar registros"

a:

> "entender qué necesita atención".

---

## Dashboard

Debe incluir:

### Encabezado

- saludo
- fecha
- contexto de la firma
- acciones rápidas

### Resumen

Cards para:

- usuarios activos
- solicitudes pendientes
- procesos activos
- tareas pendientes
- documentos pendientes
- alertas
- errores operativos

---

## Sección "Requiere atención"

Mostrar elementos como:

- solicitudes pendientes
- usuarios pendientes de aprobación
- procesos en riesgo
- tareas vencidas
- documentos pendientes
- consultas judiciales con error
- errores de operación
- notificaciones críticas

Cada tarjeta debe permitir navegar directamente al recurso.

---

## Actividad reciente

Timeline legible:

- usuario creado
- solicitud aprobada
- proceso actualizado
- documento cargado
- tarea completada
- radicado consultado
- error detectado

Evitar mostrar únicamente JSON o logs técnicos.

---

## Procesos críticos

Tabla con:

- proceso
- cliente
- responsable
- estado
- última actividad
- riesgo
- próxima acción

Filtros:

- todos
- atención
- riesgo
- sin actividad
- vencidos

---

## Acciones rápidas

Ejemplos:

- Crear usuario
- Revisar solicitudes
- Ver procesos
- Ver documentos pendientes
- Ver operación
- Abrir auditoría
- Editar sitio público

---

# 7. FASE 3 — ADMIN: Alertas y centro de atención

## Crear módulo

`/gestion-procesos/admin/alertas`

Debe centralizar:

- pendientes
- advertencias
- errores
- riesgos
- eventos importantes

Cada alerta debe incluir:

- tipo
- prioridad
- fecha
- descripción
- recurso relacionado
- acción recomendada
- estado

Acciones:

- marcar como atendida
- abrir recurso
- descartar cuando corresponda

No crear alertas falsas simplemente para llenar la interfaz.

---

# 8. FASE 4 — ADMIN: Actividad y auditoría

## Actividad

Crear una vista humana de actividad.

Ejemplo:

> Sergio aprobó la solicitud de registro de un abogado.

en lugar de:

> `POST /api/admin/users/approve 200`

---

## Auditoría

Mantener el detalle técnico disponible mediante drawer/modal.

Debe existir:

### Vista humana

- quién
- qué hizo
- sobre qué
- cuándo
- resultado

### Detalle técnico

- endpoint
- método
- recurso
- ID
- metadata
- error técnico si existe

Filtros:

- usuario
- acción
- módulo
- fecha
- resultado

---

# 9. FASE 5 — ADMIN: Usuarios, equipo y clientes

## Usuarios

Mejorar la administración de usuarios.

Ficha detallada:

- datos personales
- rol
- estado
- actividad
- procesos asociados
- tareas
- documentos
- solicitudes
- último acceso

Acciones según permisos:

- editar
- activar/desactivar
- cambiar rol cuando corresponda
- revisar solicitudes
- restablecer acceso
- consultar actividad

---

## Desactivación

Cuando sea jurídicamente y técnicamente apropiado, preferir desactivación lógica sobre eliminación física.

No eliminar datos históricos de procesos por una eliminación accidental de usuario.

---

## Equipo

Diferenciar claramente:

- usuarios de plataforma
- abogados del despacho
- clientes
- administradores

No mezclar todo en una tabla sin contexto.

---

# 10. FASE 6 — ADMIN: Procesos y salud operativa

Crear una visión global de procesos.

Debe permitir detectar:

- procesos activos
- procesos sin actividad
- procesos con tareas vencidas
- procesos con documentos pendientes
- procesos con problemas en consultas
- procesos sin responsable

---

## Salud del proceso

Implementar una clasificación visual:

### Normal

Todo está en orden.

### Atención

Existe algo que revisar.

### Riesgo

Existe una situación que requiere intervención.

### Archivado

Proceso cerrado/inactivo.

La lógica debe derivarse de datos reales.

No almacenar una etiqueta redundante si puede calcularse correctamente, salvo que exista una razón clara.

---

# 11. FASE 7 — ADMIN: Agenda, tareas y documentos

## Agenda

Implementar vistas:

- día
- semana
- mes

Separar conceptualmente:

- eventos
- tareas
- vencimientos
- audiencias
- reuniones
- recordatorios

Filtros:

- responsable
- proceso
- cliente
- tipo
- estado

---

## Tareas

Agregar:

- lista
- Kanban
- calendario

Estados:

- pendientes
- en curso
- vencidas
- completadas

Mostrar responsable y proceso.

---

## Documentos

Crear centro documental administrativo.

Estados:

- solicitado
- pendiente
- recibido
- en revisión
- aprobado
- requiere corrección
- rechazado
- vencido

Mantener trazabilidad.

---

# 12. FASE 8 — ADMIN: Comunicaciones y notificaciones

Crear centro de notificaciones.

Categorías:

- procesos
- tareas
- documentos
- solicitudes
- usuarios
- operación
- sistema

Permitir:

- leer/no leído
- marcar todo como leído
- abrir recurso relacionado

---

## Comunicaciones

Preparar arquitectura para:

- mensajes internos
- comunicaciones abogado-cliente
- historial
- contexto del proceso

No implementar un chat complejo antes de tener definida la persistencia y seguridad.

---

# 13. FASE 9 — ADMIN: Operación y automatizaciones

El módulo "Operación" debe ser un monitor administrativo.

Mostrar:

- tareas/background jobs
- consultas judiciales
- errores
- reintentos
- integraciones
- estado de servicios

No exponer esto a CLIENTE.

---

## Automatizaciones

Diseñar base para workflows futuros:

Ejemplo:

> Cuando se crea un proceso → crear tarea → notificar responsable → registrar actividad.

Otro:

> Cuando se solicita documento → notificar cliente.

La arquitectura debe evitar acoplar todas estas acciones directamente dentro de los routers.

---

# 14. FASE 10 — ADMIN: Configuración de firma

Crear configuración central de:

- datos de la firma
- contacto
- logo
- información pública
- canales de comunicación
- preferencias de notificación
- parámetros generales

No mezclar configuración de plataforma SaaS con configuración de la firma.

---

# 15. FASE 11 — CMS PÚBLICO VISUAL

Esta fase transforma radicalmente el módulo actual de "Páginas del sitio".

## Objetivo

Pasar de:

> formularios rígidos por campos

a:

> editor visual basado en bloques.

Debe conservarse la capacidad de la página pública actual.

---

# 16. Arquitectura del CMS

No guardar simplemente HTML arbitrario.

Utilizar una estructura de contenido estructurada.

Conceptualmente:

```text
Página
 ├── metadatos
 ├── draft
 │    └── bloques
 ├── published
 │    └── bloques
 ├── versión
 └── timestamps
```

---

## Bloques iniciales

Crear únicamente los necesarios.

### Texto

- párrafo
- título
- subtítulo
- lista
- cita

### Media

- imagen
- imagen + texto

### Acción

- botón
- grupo de botones

### Layout

- sección
- dos columnas
- tres columnas

### Contenido jurídico

- servicio
- tarjeta
- testimonio
- miembro del equipo
- información de contacto

Los bloques deben reutilizar componentes existentes cuando sea posible.

---

# 17. Editor visual

El administrador debe poder:

- agregar bloques
- eliminar bloques
- duplicar bloques
- mover bloques
- reordenar
- editar contenido
- editar propiedades
- ver resultado visual
- deshacer
- rehacer

---

## Editor de texto enriquecido

Dentro de los bloques de texto:

- negrita
- cursiva
- subrayado
- títulos
- listas
- enlaces
- alineación
- citas
- separación

No intentar convertirlo en Microsoft Word completo.

El objetivo es una experiencia suficientemente familiar.

---

# 18. Media

El editor debe permitir:

- cargar imágenes
- seleccionar imágenes existentes
- previsualizar
- reemplazar
- eliminar cuando corresponda
- texto alternativo
- dimensiones/responsive cuando corresponda

Validar:

- tipo
- tamaño
- seguridad

---

# 19. Drag & Drop

Los bloques deben poder reorganizarse visualmente.

Debe existir:

- indicador de posición
- feedback visual
- persistencia del orden
- undo/redo

No guardar cambios en cada movimiento.

Usar estado local y guardar explícitamente.

---

# 20. Vista previa

Debe existir:

### Vista previa del borrador

El administrador ve exactamente cómo quedaría la página antes de publicar.

Idealmente:

- misma estructura
- mismos componentes
- mismos estilos

Evitar crear una versión visual diferente únicamente para preview.

---

# 21. Borrador y publicación

Estados:

```text
Borrador
Publicado
```

Flujo:

```text
Editar
  ↓
Guardar borrador
  ↓
Vista previa
  ↓
Publicar
  ↓
Contenido público actualizado
```

Nunca publicar automáticamente por guardar.

---

# 22. Historial de versiones

Registrar:

- número de versión
- usuario
- fecha
- estado
- contenido

Acciones:

- visualizar
- comparar cuando sea viable
- restaurar

Restaurar debe generar una nueva versión, no destruir el historial.

---

# 23. Seguridad CMS

Nunca confiar en HTML recibido desde el navegador.

Sanitizar contenido enriquecido.

Validar:

- URLs
- imágenes
- enlaces
- archivos
- tipos MIME
- permisos

El cliente nunca debe poder modificar contenido público.

---

# 24. SEO del CMS

Cada página debe poder tener:

- título SEO
- descripción SEO
- slug
- imagen social/Open Graph si aplica

No mezclar SEO con el contenido visual.

---

# 25. Migración del contenido actual

No eliminar el sistema actual inmediatamente.

Crear una estrategia de migración:

```text
Contenido actual
      ↓
Adaptador
      ↓
Bloques
      ↓
Nuevo CMS
```

Mantener compatibilidad durante la transición.

No perder contenido existente.

---

# 26. FASE 12 — ABOGADO_ADMIN: Dashboard profesional

El dashboard debe convertirse en centro de trabajo.

Debe responder:

> ¿Qué requiere mi atención hoy?

---

## Resumen

Cards:

- procesos activos
- tareas pendientes
- tareas vencidas
- documentos pendientes
- solicitudes de clientes
- consultas judiciales con error
- próximos eventos

---

## Requiere atención

Mostrar:

- tareas vencidas
- tareas próximas
- procesos en riesgo
- procesos sin actividad
- documentos pendientes
- solicitudes pendientes
- errores judiciales
- procesos sin responsable

---

## Actividad reciente

Mostrar:

- cambios en procesos
- actuaciones
- documentos
- tareas
- clientes
- solicitudes
- comunicaciones

---

## Acciones rápidas

- nuevo proceso
- nuevo cliente
- agregar radicado
- crear tarea
- solicitar documento
- agendar evento

---

# 27. FASE 13 — ABOGADO_ADMIN: Procesos

La lista de procesos debe evolucionar hacia una herramienta de trabajo.

Filtros:

- todos
- propios
- colaborativos
- activos
- atención
- riesgo
- archivados

Buscar por:

- nombre
- cliente
- radicado
- responsable

---

## Salud del proceso

Mostrar:

- estado
- última actividad
- próxima actividad
- tareas pendientes
- documentos pendientes
- radicados
- responsable

---

# 28. FASE 14 — ABOGADO_ADMIN: Detalle del proceso

El detalle actual es una de las partes fuertes del sistema.

No reemplazarlo.

Evolucionarlo.

Debe funcionar como:

> expediente digital.

---

## Cabecera

- nombre
- cliente
- responsable
- estado
- salud
- última actualización
- acciones rápidas

---

## Secciones

- resumen
- actividad
- clientes
- colaboradores
- radicados
- actuaciones
- tareas
- documentos
- solicitudes
- comunicaciones

---

# 29. Timeline del proceso

Crear timeline unificado.

Eventos posibles:

- creación
- modificación
- actuación
- documento
- tarea
- solicitud
- comunicación
- consulta judicial

Cada evento debe indicar:

- fecha
- actor
- acción
- descripción
- recurso

---

# 30. Visibilidad de eventos

Introducir concepto de:

```text
INTERNAL
CLIENT_VISIBLE
```

o equivalente.

Esto es fundamental.

No todo lo que ocurre internamente en un proceso debe mostrarse al cliente.

El backend debe filtrar.

No confiar solamente en el frontend.

---

# 31. FASE 15 — ABOGADO_ADMIN: Tareas

Implementar:

### Lista

Filtros por:

- responsable
- proceso
- cliente
- estado
- vencimiento

### Kanban

Columnas configurables según estados existentes.

### Calendario

Visualización por fecha.

---

## Tareas para clientes

Agregar diferenciación entre:

- tarea interna
- tarea visible para cliente

Una tarea visible para cliente debe tener lenguaje accionable.

Ejemplo:

> "Entrega tu certificado laboral"

No:

> "Revisión documental etapa 2".

---

# 32. FASE 16 — ABOGADO_ADMIN: Agenda

La agenda actual debe evolucionar.

Vistas:

- día
- semana
- mes

Tipos:

- audiencia
- reunión
- vencimiento
- recordatorio
- cita
- evento procesal

Debe distinguirse claramente de las tareas.

---

# 33. FASE 17 — ABOGADO_ADMIN: Clientes

Evolucionar clientes hacia un pequeño CRM jurídico.

Ficha:

- información personal
- procesos
- documentos
- tareas
- solicitudes
- actividad
- comunicaciones
- último contacto

---

## Estado de relación

Mostrar indicadores como:

- activo
- pendiente
- requiere atención

No crear estados que no tengan soporte en negocio.

---

# 34. FASE 18 — ABOGADO_ADMIN: Documentos

Centro documental más completo.

Estados:

- solicitado
- pendiente
- recibido
- revisión
- aprobado
- corrección
- rechazado
- vencido

Acciones:

- solicitar
- revisar
- aprobar
- rechazar
- solicitar corrección
- descargar

---

# 35. FASE 19 — ABOGADO_ADMIN: Comunicaciones

Crear historial de comunicación por cliente/proceso.

Debe poder distinguir:

- comunicación interna
- comunicación con cliente

Preparar integración futura con:

- correo
- WhatsApp
- mensajes internos

No mezclar automáticamente canales hasta tener trazabilidad clara.

---

# 36. FASE 20 — ABOGADO_ADMIN: Notificaciones

Centro de notificaciones funcional.

Categorías:

- proceso
- tarea
- documento
- cliente
- solicitud
- radicado
- sistema

Debe existir contador de no leídas.

---

# 37. FASE 21 — CLIENTE: Rediseño completo del portal

El CLIENTE no debe sentir que está usando una versión recortada del panel del abogado.

Debe sentirse como:

> Portal privado del cliente.

Objetivos:

- claridad
- confianza
- participación
- transparencia
- simplicidad

---

# 38. FASE 22 — CLIENTE: Dashboard

La ruta:

`/gestion-procesos/cliente`

debe evolucionar desde una simple lista de procesos hacia un dashboard.

---

## Encabezado

Mostrar:

- saludo
- fecha
- nombre del despacho
- acceso a notificaciones

---

## Resumen

Cards:

- mis procesos
- pendientes
- documentos por entregar
- próximos eventos

---

## "Tienes pendiente"

Priorizar acciones:

- entregar documento
- completar tarea
- responder solicitud
- revisar información
- asistir a evento

---

## Mis procesos

Cada proceso debe mostrar:

- nombre
- estado amigable
- abogado responsable
- última actualización
- próxima acción
- documentos pendientes
- tareas pendientes

---

## Actividad reciente

Mostrar únicamente actividad visible para cliente.

---

# 39. FASE 23 — CLIENTE: Detalle del proceso

Crear:

`/gestion-procesos/cliente/procesos/[id]`

Debe tener:

### Resumen

- qué es el proceso
- estado
- responsable
- próxima acción

### Actualizaciones

Timeline simplificado.

### Documentos

Documentos relacionados.

### Tareas

Tareas que el cliente debe realizar.

### Radicados

Información comprensible.

---

# 40. FASE 24 — CLIENTE: Estado comprensible

No exponer estados técnicos sin explicación.

Ejemplo:

En lugar de:

> `ACTIVO_JUDICIAL_3`

mostrar:

> **En trámite**

Y opcionalmente:

> "El despacho está realizando seguimiento al proceso."

---

# 41. FASE 25 — CLIENTE: Timeline

Crear timeline filtrado.

Ejemplos:

- proceso iniciado
- documento recibido
- actualización judicial
- actuación relevante
- reunión
- solicitud
- tarea completada

Nunca exponer automáticamente todo el timeline interno.

---

# 42. FASE 26 — CLIENTE: Tareas

La funcionalidad actual de tareas debe mantenerse.

Evolucionar hacia:

- pendientes
- próximas
- completadas
- vencidas

Cada tarea debe explicar:

- qué debe hacer
- por qué
- fecha límite
- proceso relacionado

El cliente debe poder completarla cuando corresponda.

---

# 43. FASE 27 — CLIENTE: Documentos

El módulo actual ya es funcional y debe evolucionar.

Centro documental:

### Por entregar

Documentos solicitados.

### En revisión

Documentos enviados.

### Aprobados

Documentos aceptados.

### Requieren corrección

Documentos que deben reemplazarse.

### Compartidos por el despacho

Documentos disponibles para consulta.

---

## Acciones

- cargar
- descargar
- reemplazar
- consultar estado

---

# 44. FASE 28 — CLIENTE: Calendario

Crear calendario simplificado.

Mostrar solamente eventos relevantes para el cliente:

- citas
- reuniones
- audiencias
- fechas importantes
- vencimientos que requieran acción

No mostrar agenda interna del abogado.

---

# 45. FASE 29 — CLIENTE: Notificaciones

Crear centro:

`/gestion-procesos/cliente/notificaciones`

Tipos:

- nueva actualización
- documento solicitado
- documento revisado
- tarea
- recordatorio
- evento
- mensaje

Acciones:

- leer
- marcar todo como leído
- abrir recurso

---

# 46. FASE 30 — CLIENTE: Comunicación

Crear arquitectura para comunicación abogado-cliente.

Idealmente contextual:

```text
Proceso
  └── Conversación
```

Debe registrar:

- remitente
- destinatario
- fecha
- mensaje
- archivos si se implementan
- estado de lectura

Nunca mezclar conversaciones de otros clientes.

---

# 47. FASE 31 — CLIENTE: Contacto del abogado

Mostrar:

- nombre
- cargo
- foto si existe
- correo
- WhatsApp si está habilitado
- botón de contacto

Debe ser información controlada por permisos.

---

# 48. FASE 32 — CLIENTE: Solicitudes, aprobaciones y firma

Preparar soporte para:

- solicitudes de información
- aprobación de documentos
- aceptación de información
- firma electrónica/firma integrada futura

No implementar firma electrónica real hasta definir proveedor y requisitos jurídicos.

---

# 49. FASE 33 — CLIENTE: Perfil y configuración

Mantener funcionalidades actuales:

- solicitud de edición de perfil
- historial de solicitudes
- preferencias de notificación

Mejorar interfaz.

Agregar cuando corresponda:

- cambio de contraseña
- sesiones
- seguridad
- privacidad

---

# 50. FASE 34 — CLIENTE: Ayuda

Crear sección sencilla:

- preguntas frecuentes
- cómo entregar documentos
- cómo consultar procesos
- cómo funcionan las notificaciones
- cómo contactar al despacho

No convertirlo inicialmente en un sistema de soporte complejo.

---

# 51. FASE 35 — Seguridad y privacidad transversal

Revisar todos los endpoints.

Especialmente:

- procesos
- clientes
- documentos
- tareas
- radicados
- actuaciones
- comunicaciones
- notificaciones

Un CLIENTE solo puede acceder a recursos que realmente le pertenecen o le hayan sido compartidos.

---

## Reglas

Nunca confiar exclusivamente en:

```text
if (user.role === "CLIENTE")
```

Debe verificarse relación real con el recurso.

---

# 52. FASE 36 — Sistema de visibilidad

Introducir, donde sea necesario, conceptos equivalentes a:

```text
INTERNAL
CLIENT_VISIBLE
```

Aplicarlo a:

- eventos
- tareas
- documentos
- comunicaciones
- actualizaciones
- notas

No exponer notas internas.

---

# 53. FASE 37 — Búsqueda global

Para ADMIN y ABOGADO_ADMIN:

Implementar búsqueda global tipo:

`Ctrl + K`

Buscar:

- clientes
- procesos
- radicados
- tareas
- documentos

CLIENTE puede tener una búsqueda mucho más limitada o incluso no necesitarla inicialmente.

---

# 54. FASE 38 — Métricas y carga de trabajo

Para ADMIN y ABOGADO_ADMIN:

Mostrar:

- procesos por responsable
- tareas por responsable
- vencimientos
- actividad
- carga de trabajo

No utilizar esto para CLIENTE.

---

# 55. FASE 39 — Pruebas

Cada fase debe incluir pruebas.

## Backend

- endpoints
- permisos
- errores
- casos límite
- aislamiento por rol

## Frontend

- navegación
- loading
- empty
- error
- responsive
- permisos

## Seguridad

Probar explícitamente:

- CLIENTE intentando acceder a otro proceso
- CLIENTE intentando acceder a documentos ajenos
- CLIENTE intentando modificar contenido público
- ABOGADO_ADMIN intentando acceder a módulos ADMIN
- ADMIN manteniendo acceso global según diseño

---

# 56. FASE 40 — Regresión

Antes de considerar terminada cada fase:

```text
lint
typecheck
tests
build
```

Cuando corresponda.

No avanzar si una modificación rompe funcionalidades existentes.

---

# 57. Orden de implementación recomendado

La ejecución debe seguir este orden:

## Bloque A — Fundaciones

1. Auditoría
2. permisos
3. componentes UI comunes
4. navegación
5. estados
6. sistema de notificaciones transversal

---

## Bloque B — ADMIN

7. Dashboard
8. Alertas
9. Actividad
10. Usuarios
11. Procesos/riesgo
12. Agenda
13. Tareas
14. Documentos
15. Operación
16. Auditoría
17. Configuración

---

## Bloque C — CMS

18. modelo de bloques
19. API
20. editor
21. rich text
22. media
23. drag & drop
24. preview
25. draft/publish
26. historial
27. migración

---

## Bloque D — ABOGADO_ADMIN

28. Dashboard
29. procesos
30. timeline
31. tareas
32. agenda
33. clientes
34. documentos
35. notificaciones
36. comunicaciones

---

## Bloque E — CLIENTE

37. Dashboard
38. detalle de proceso
39. estado/timeline
40. tareas
41. documentos
42. calendario
43. notificaciones
44. comunicaciones
45. contacto abogado
46. perfil/configuración
47. ayuda

---

## Bloque F — Seguridad y calidad

48. aislamiento por rol
49. visibilidad interna/cliente
50. pruebas
51. regresión
52. optimización
53. revisión final

---

# 58. Reglas para Codex durante la implementación

Estas instrucciones son obligatorias.

## Regla 1 — No ejecutar todo el plan de una vez

El plan es un roadmap.

Codex debe trabajar **una fase por vez**.

No intentar implementar todas las fases en una sola ejecución.

---

## Regla 2 — Auditar antes de modificar

Antes de tocar una funcionalidad:

1. localizar archivos;
2. leer implementación actual;
3. localizar endpoints;
4. localizar modelos;
5. localizar schemas;
6. localizar componentes;
7. comprobar reutilización posible;
8. identificar dependencias.

---

## Regla 3 — No reescribir innecesariamente

Si una funcionalidad existe:

> evolucionarla.

No:

> reemplazarla desde cero.

Especialmente:

- proceso detail
- documentos
- tareas
- perfil
- autenticación
- AppShell
- Sidebar

---

## Regla 4 — No inventar APIs

Antes de crear un endpoint comprobar:

- si ya existe
- si existe uno equivalente
- si puede ampliarse
- qué schema utiliza
- qué permisos aplica

---

## Regla 5 — Backend primero cuando haya cambio de datos

Si una funcionalidad requiere:

- modelo
- campo
- relación
- endpoint
- permiso

resolver primero el contrato backend.

Después adaptar frontend.

---

## Regla 6 — No duplicar lógica

Preferir:

- servicios
- helpers
- componentes reutilizables
- hooks
- schemas compartidos
- funciones de permisos

Evitar copiar y pegar lógica entre roles.

---

## Regla 7 — Mantener contratos existentes

Si se cambia un endpoint utilizado actualmente:

1. localizar consumidores;
2. adaptar consumidores;
3. probar;
4. evitar romper respuestas existentes sin necesidad.

---

## Regla 8 — Migraciones

Toda modificación de modelo persistente debe considerar:

- migración
- datos existentes
- valores por defecto
- compatibilidad

Nunca asumir que una base de datos vacía es el único escenario.

---

# 59. Regla especial para el CMS

El CMS no debe convertirse en un editor HTML sin estructura.

Preferir:

```text
Block
 ├── type
 ├── order
 ├── content
 └── settings
```

sobre almacenar una página completa como HTML arbitrario.

El renderizador público y el editor deben utilizar el mismo concepto de bloque.

---

# 60. Regla especial para CLIENTE

Antes de exponer cualquier información preguntarse:

> ¿El cliente necesita saber esto?

Si la respuesta es no:

no mostrarlo.

Ejemplos que deben permanecer internos:

- notas internas
- logs
- errores técnicos
- información de otros clientes
- carga de trabajo
- datos administrativos
- auditoría
- configuración
- procesos internos
- tareas internas
- detalles técnicos de scraping

---

# 61. Regla especial para ADMIN

ADMIN sí puede tener visión amplia, pero la interfaz debe priorizar información accionable.

No convertir el dashboard en una pared de estadísticas.

La pregunta principal debe ser:

> ¿Qué requiere atención?

---

# 62. Regla especial para ABOGADO_ADMIN

No convertirlo en:

> ADMIN con menos opciones.

Debe ser una herramienta de productividad.

La pregunta principal debe ser:

> ¿Qué tengo que hacer hoy y qué procesos necesitan atención?

---

# 63. Criterios generales de aceptación

La evolución se considera satisfactoria cuando:

### ADMIN

Puede:

- entender el estado general
- detectar problemas
- administrar usuarios
- supervisar procesos
- revisar actividad
- controlar operación
- administrar contenido público
- auditar acciones

---

### ABOGADO_ADMIN

Puede:

- saber qué requiere atención
- gestionar procesos
- gestionar clientes
- gestionar tareas
- consultar radicados
- gestionar documentos
- gestionar agenda
- comunicarse con clientes
- consultar historial

---

### CLIENTE

Puede:

- entender sus procesos
- saber qué está pasando
- conocer qué debe hacer
- entregar documentos
- completar tareas
- consultar actualizaciones
- recibir notificaciones
- consultar fechas
- comunicarse con el despacho

---

### CMS

El ADMIN puede:

- editar visualmente
- crear bloques
- ordenar bloques
- editar texto enriquecido
- subir imágenes
- previsualizar
- guardar borrador
- publicar
- consultar historial
- restaurar versiones

sin tener que editar manualmente JSON, HTML o múltiples campos rígidos.

---

# 64. Estrategia para evitar consumo innecesario de créditos

Codex debe utilizar una estrategia incremental.

## Antes de cada fase

Leer solamente:

- archivos directamente relacionados
- dependencias inmediatas
- modelos/endpoints necesarios

No volver a inspeccionar todo el repositorio si ya existe un diagnóstico vigente.

---

## Después de cada fase

Ejecutar únicamente las validaciones necesarias.

Por ejemplo:

```text
typecheck
lint
tests relacionados
```

No ejecutar una batería gigantesca después de cada pequeño cambio si no es necesario.

---

## Commits

Hacer commits pequeños y semánticos:

```text
feat(admin): add attention dashboard
feat(admin): add activity center
feat(cms): add block model
feat(cms): add visual editor
feat(client): add process detail
```

Esto permite identificar fácilmente regresiones.

---

# 65. Protocolo de trabajo de Codex

Para cada fase:

### PASO 1

Leer esta fase del `plan.md`.

### PASO 2

Auditar únicamente los archivos relacionados.

### PASO 3

Crear una lista breve:

```text
EXISTE
REUTILIZAR
MODIFICAR
CREAR
```

### PASO 4

Implementar.

### PASO 5

Validar.

### PASO 6

Corregir errores introducidos.

### PASO 7

Actualizar este `plan.md` marcando la fase como completada.

### PASO 8

Informar:

- archivos modificados
- archivos creados
- endpoints creados/modificados
- modelos modificados
- migraciones
- tests
- validaciones
- problemas pendientes

### PASO 9

DETENERSE.

No comenzar automáticamente la siguiente fase.

---

# 66. Formato de estado

Codex debe mantener una sección de progreso:

```text
FASE 0 — [x]
FASE 1 — [x]
FASE 2 — [x]
FASE 3 — [x]
FASE 4 — [x]
FASE 5 — [x]
FASE 6 — [x]
FASE 7 — [x]
FASE 8 — [x]
FASE 9 — [x]
FASE 10 — [x]
FASE 11 — [ ]
...
```

Y debajo:

```text
Última fase completada:
Fase 10 — ADMIN: Configuración de firma (6 de octubre de 2026)

Siguiente fase:
Fase 11 — CMS público visual

Bloqueadores:
La validación de Python no pudo ejecutarse: este entorno bloquea el launcher de Python. TypeScript y ESLint sí se ejecutaron; ESLint encontró un error preexistente en la página de documentos.
```

### Registro de implementación — Fases 7–10 (6 de octubre de 2026)

- **Fase 7 — Agenda, tareas y documentos:** se ampliaron las vistas de agenda de firma a día, semana, mes y listado; se añadieron filtros por responsable/proceso/cliente/estado/tipo, CRUD de eventos, audiencias y reuniones, y visibilidad de tareas y recordatorios existentes. Las tareas administrativas cuentan con lista/Kanban/calendario; el centro documental relaciona solicitudes con archivos y permite actualizar estado de revisión y comentario con trazabilidad. Se añadió fecha límite opcional a solicitudes documentales.
- **Fase 8 — Comunicaciones y notificaciones:** se creó un centro administrativo de notificaciones por categoría, estado leído/no leído y recurso relacionado, con marcar individual y todo como leído. El estado de lectura es por usuario ADMIN. Se reutiliza el historial existente de comunicaciones/notificaciones de proceso; no se creó chat ni persistencia paralela.
- **Fase 9 — Operación y automatizaciones:** se reutilizaron las páginas operativas ya separadas para resumen, consultas, integraciones y notificaciones, con estado de ejecuciones, errores/reintentos y salud de servicios. Se mantiene el acceso restringido a ADMIN y la ejecución durable desacoplada de los routers mediante los workflows existentes; no se duplicó esta infraestructura.
- **Fase 10 — Configuración de firma:** se añadió una configuración central editable para identidad, contacto, logo, información pública, canales, preferencias y parámetros generales, separada de la configuración SaaS. Los correos del sistema consumen los datos públicos configurados y mantienen valores predeterminados compatibles.
- **Backend/endpoints:** `/api/admin/agenda/tareas` amplía filtros y respuesta con recordatorios; se añadieron `/api/admin/agenda/eventos` (GET/POST/PATCH/DELETE), `/api/admin/documentos/solicitudes` (GET), `/api/admin/notificaciones/leer` (POST), `/api/admin/notificaciones/leer-todas` (POST), y `/api/admin/configuracion/firma` (GET/PUT). Los recursos documentales ADMIN incorporan estado y comentario de revisión.
- **Modelos y migración:** se añadieron `EventoAgenda`, `ConfiguracionFirma` y `LecturaNotificacionAdmin`; `DocumentoProceso` incorpora campos de revisión. El inicio aplica columnas nuevas a tablas existentes y `create_all` crea las tablas nuevas. No se añadió archivo de migración Alembic.
- **Validación:** `tsc --noEmit` aprobado; `git diff --check` aprobado. ESLint de archivos relacionados reporta un error en `AdminNotificationCenterPage` que se corrigió, y otro preexistente en `app/gestion-procesos/abogado/documentos/page.tsx` (`react-hooks/set-state-in-effect` en la carga inicial); las advertencias detectadas son imports sin uso preexistentes e `<img>` en vista previa. No fue posible ejecutar `py_compile` porque el launcher Python del entorno no es accesible. No se ejecutaron pruebas automatizadas.
- **Archivos principales:** backend `app/models.py`, `app/schemas.py`, `app/main.py`, `app/routers/admin.py`, `app/routers/expedientes.py`, `app/integration_settings.py`, `app/email_service.py`; frontend `AdminFirmAgendaPage`, `AdminResourcePage`, `AdminAlertBell`, `AdminNotificationCenterPage`, `AdminFirmSettingsPage`, `AdminConsoleShell`, y las rutas ADMIN correspondientes; formulario de solicitudes de documento en el área de abogado.

### Registro de preparación — Fase 0 (6 de octubre de 2026)

Auditoría de preparación completada sobre los puntos de entrada y componentes compartidos directamente relacionados. No se modificó código funcional.

- **EXISTE — backend:** `app/main.py` registra los routers ADMIN, tareas, expedientes y workflows y contiene autenticación, perfil, dashboard, solicitudes, registro, preferencias y radicados. `app/models.py` separa Proceso y Radicado y relaciona procesos con múltiples clientes/radicados; también modela actuaciones, tareas, subtareas, recordatorios, solicitudes/documentos, notificaciones, auditoría y contenido público. Hay servicios para acceso a firma/proceso, auditoría, notificaciones, almacenamiento, documentos y workflows. Los routers ofrecen operaciones de procesos/clientes/documentos/notificaciones, administración global, tareas y ejecución de workflows.
- **EXISTE — frontend:** Next.js separa layouts y controles de rol para ADMIN, ABOGADO/ABOGADO_ADMIN y CLIENTE. Cuenta con `SessionContext`, `AdminConsoleShell`, `AppShell`, `Sidebar`, páginas de las tres áreas, pantallas públicas que consumen `publicPageContent.ts` y funciones API compartidas. El contenido público editable actual persiste JSON por página con valores por defecto en el cliente.
- **FUNCIONA SEGÚN EVIDENCIA ESTÁTICA:** Las protecciones de backend están centralizadas en dependencias/helpers para usuario autenticado, ADMIN, acceso a proceso y gestión de tareas; frontend `RoleGate` también limita navegación por rol. Los tests existentes cubren, entre otros, aislamiento de ámbito, permisos por rol y recurso, carga/descarga de documentos, contenido público, auditoría, notificaciones, tareas y workflows. Esto confirma cobertura automatizada existente, no el estado de ejecución actual.
- **REUTILIZAR:** Modelos/relaciones actuales, dependencias de autenticación y helpers de acceso, servicios de auditoría/notificación, las dos estructuras de shell ya existentes, navegación y utilidades API/componentes por rol. El dominio existente corresponde a una firma y ámbitos internos/SaaS; no hace falta introducir multi-tenancy.
- **MODIFICAR:** No se identifican cambios transversales obligatorios a partir de esta auditoría. En cada fase concreta se deben evolucionar sus endpoints/componentes existentes cuando cubran el requisito, después de verificar los archivos de esa fase.
- **CREAR:** Fase 0 no requiere crear archivos funcionales. Para las fases siguientes, la necesidad de nuevos componentes, endpoints o modelos se determina contra sus requisitos específicos; esta auditoría no los anticipa.
- **INCOMPLETO / POR VERIFICAR:** No se verificó comportamiento en ejecución ni se ejecutaron tests, lint o build. Frontend declara `lint`, `build` y `test:workflow`; no tiene script `typecheck`. Backend tiene una suite `pytest` concentrada en `tests/test_security_tenant.py`, pero `pytest` no está declarado en `pyproject.toml` ni `requirements.txt`. No aparecieron manifiestos de CI en la búsqueda de configuraciones de workflows habituales.
- **RIESGOS:** El control de permisos debe permanecer en backend con validación de rol y relación/visibilidad, sin depender solo del frontend. Mantener distintos Proceso y Radicado. `publicPageContent.ts` consume una URL de API fija y cae a defaults ante fallos; revisar ese comportamiento solo si la fase CMS lo requiere. La auditoría estática y acotada no certifica funcionamiento integral ni descarta regresiones.

**Siguiente paso:** seguir el estado de fases consignado arriba y auditar únicamente los archivos directamente vinculados a la siguiente fase solicitada. Esta entrada no autoriza implementación de fases posteriores.

### Registro de implementación — Fase 1 (6 de octubre de 2026)

- Se integraron breadcrumbs y encabezados compartidos en `AppShell` y `AdminConsoleShell`; la navegación indica la ruta activa y el menú móvil expone su estado accesible.
- Se añadió `ToastProvider` global y componentes reutilizables para botones, badges, cards, alertas, estados de carga/vacío, filtros, tablas, paginación, modales y confirmaciones. Los componentes usan los tokens existentes, ampliados con tonos claros ya presentes en el tema.
- La política de gestión de tareas se trasladó a `app.firm_access` junto a los helpers existentes de rol/acceso. Se mantienen los endpoints actuales y se conserva la importación desde el router de tareas para compatibilidad.
- No se añadieron endpoints, modelos ni migraciones.
- **Validación:** typecheck aprobado; ESLint sobre los archivos de Fase 1 aprobado; 4 pruebas existentes de permisos aprobadas. `git diff --check` aprobado.
- **Pendiente de entorno:** el lint global encuentra errores preexistentes en otras páginas/contexto; el build no puede resolver `workflow` y el escaneo del plugin `@workflow/next` falla al leer `../../../../..` desde este entorno restringido. No se modificó esa configuración ajena al alcance.

### Registro de implementación — Fase 2 (6 de octubre de 2026)

- Se completó el dashboard ADMIN con saludo y contexto de firma, acciones rápidas, métricas agregadas, alertas accionables con enlaces, actividad reciente en lenguaje legible y una tabla filtrable de procesos críticos.
- El endpoint existente `/api/admin/dashboard` agrega los datos desde la base de datos y mantiene las claves anteriores de respuesta. Se reutilizaron la autorización ADMIN y los componentes compartidos de Fase 1; no se añadieron modelos, migraciones ni endpoints.
- **Validación:** `tests/test_admin_dashboard.py` aprobado (1 prueba); ESLint del dashboard aprobado; `tsc --noEmit` aprobado; `git diff --check` aprobado.
- **Pendiente de entorno:** `npm run build` se detuvo durante el escaneo de Next.js por acceso denegado al directorio `../../../../..` y no pudo resolver `workflow` desde `workflows/task-reminder.ts`. No se alteró la configuración/dependencia ajena al alcance.

### Registro de implementación — Fase 3 (6 de octubre de 2026)

- Se creó `/gestion-procesos/admin/alertas` y se añadió a la navegación ADMIN. El centro presenta pendientes, advertencias, errores, riesgos y eventos importantes con prioridad, fecha, descripción, recurso, recomendación y estado, además de filtros por categoría/estado.
- El backend genera alertas únicamente desde solicitudes, tareas urgentes/vencidas, documentos pendientes, consultas/entregas fallidas y eventos de auditoría existentes. Permite marcarlas atendidas; el descarte solo está habilitado para eventos informativos. Las decisiones se conservan en la auditoría y no requieren tablas ni migraciones.
- **Validación:** pruebas focalizadas de alertas y dashboard aprobadas (2); `py_compile`, ESLint de los archivos ADMIN relacionados, `tsc --noEmit` y `git diff --check` aprobados.

### Registro de implementación — Fase 4 (6 de octubre de 2026)

- Se amplió la vista ADMIN de auditoría con modos Actividad y Auditoría. La actividad usa descripciones humanas; la tabla muestra quién, qué hizo, sobre qué, cuándo y el estado de registro. El drawer presenta los datos técnicos conocidos y enlace al recurso.
- El endpoint existente ahora enriquece los eventos con actor y nombres de módulo, y filtra por usuario, acción, módulo, fecha y resultado. Middleware captura endpoint y método para nuevos eventos; el esquema soporta metadata/error opcionales. Los eventos históricos conservan esos campos vacíos y se muestran como no registrados.
- **Validación:** prueba focalizada de descripción, detalle técnico y filtros aprobada; py_compile, ESLint del componente, typecheck TypeScript y diff check aprobados.

### Registro de implementación — Fase 5 (6 de octubre de 2026)

- La consola separa Firma, Clientes, Abogados SaaS y Administradores; las cuentas de administrador de plataforma son visibles en modo consulta.
- La ficha ADMIN muestra datos personales, rol/estado, plan/responsable, último acceso, procesos, tareas, documentos, solicitudes y actividad. Las acciones existentes permiten editar datos, activar/suspender lógicamente y exigir cambio de contraseña; los cambios de rol se permiten solo para cuentas activas sin información asociada y con validación de plan/responsable.
- Se registra `ultimo_acceso` al iniciar sesión y se agrega la columna de forma compatible en el actualizador de esquema; no se eliminan cuentas ni datos históricos.
- Antes del paso a Fase 6 se corrigió la ruta de suspensión (la ruta masiva estaba detrás de una ruta dinámica), se añadió el estado `SUSPENDIDO` con bloqueo de inicio de sesión y una ruta por usuario para suspender/reactivar. La eliminación física requiere confirmación y se rechaza cuando hay procesos, radicados, tareas, documentos, solicitudes, notificaciones u otro historial vinculado; en esos casos se conserva la opción de suspensión.
- **Validación:** prueba focalizada de segmentación, ficha y guardas de cambio de rol aprobada; `py_compile`, ESLint de las pantallas, `tsc --noEmit` y `git diff --check` aprobados.

### Registro de implementación — Fase 6 (6 de octubre de 2026)

- El inventario ADMIN de procesos deriva Normal, Atención, Riesgo o Archivado a partir de actividad registrada, tareas vencidas, solicitudes de documentos pendientes, consultas judiciales fallidas y estado del responsable. Expone la última actividad y las señales detectadas; no almacena etiquetas de salud.
- La tabla permite filtrar por salud y conserva la vista separada de procesos archivados. No se añadieron modelos, migraciones ni endpoints.
- **Validación:** prueba focalizada del inventario y aislamiento por sector aprobada; `py_compile`, ESLint, `tsc --noEmit` y `git diff --check` aprobados.



---

# 67. Regla de no sobreingeniería

No implementar una funcionalidad compleja simplemente porque está contemplada en el plan.

Si una fase puede resolverse reutilizando arquitectura existente:

hacerlo.

Si una funcionalidad futura no es necesaria para completar la fase:

no implementarla anticipadamente.

Especialmente:

- chat avanzado
- firma electrónica
- automatizaciones complejas
- analítica avanzada
- IA
- multicanal avanzado

deben permanecer fuera hasta que su fase llegue.

---

# 68. Arquitectura objetivo

La arquitectura conceptual final debe aproximarse a:

```text
                         PLATAFORMA
                              │
             ┌────────────────┼────────────────┐
             │                │                │
           ADMIN        ABOGADO_ADMIN       CLIENTE
             │                │                │
       CONTROL GLOBAL      OPERACIÓN        PARTICIPACIÓN
             │                │                │
             └────────────────┼────────────────┘
                              │
                       DOMINIO COMPARTIDO
                              │
       ┌──────────┬───────────┼──────────┬───────────┐
       │          │           │          │           │
   Procesos   Clientes    Radicados   Tareas    Documentos
       │          │           │          │           │
       └──────────┴───────────┼──────────┴───────────┘
                              │
                        Notificaciones
                              │
                         Comunicaciones
                              │
                           Auditoría
                              │
                         Automatización
```

Y el CMS:

```text
                    ADMIN
                      │
                      ▼
                EDITOR VISUAL
                      │
              ┌───────┴───────┐
              │               │
           DRAFT           PREVIEW
              │
              ▼
          PUBLICACIÓN
              │
              ▼
        SITIO PÚBLICO
```

---

# 69. Prioridad final

Si el tiempo o presupuesto obliga a reducir alcance, priorizar:

## Prioridad crítica

1. Seguridad/permisos
2. Dashboard ADMIN
3. Dashboard ABOGADO_ADMIN
4. Dashboard CLIENTE
5. Detalle de proceso
6. Timeline
7. Tareas
8. Documentos
9. Notificaciones
10. CMS visual básico

## Prioridad alta

11. Agenda
12. Clientes/CRM
13. Alertas
14. Actividad
15. Comunicaciones
16. Historial CMS

## Prioridad media

17. Kanban
18. Métricas
19. Automatizaciones
20. Ayuda
21. SEO avanzado
22. Firma/aprobaciones

---

# 70. Instrucción maestra para ejecutar este plan

Cuando se solicite a Codex continuar con este plan, utilizar esta instrucción:

> **"Trabaja exclusivamente sobre la siguiente fase pendiente de `plan.md`. Antes de modificar código, audita únicamente los archivos, modelos, endpoints y componentes directamente relacionados con esa fase. No implementes fases futuras. No reescribas funcionalidades existentes si pueden evolucionarse. Reutiliza la arquitectura actual y respeta estrictamente la separación ADMIN / ABOGADO_ADMIN / CLIENTE y la distinción Proceso / Radicado. Implementa la fase completa, valida los cambios con las pruebas y verificaciones apropiadas, corrige cualquier regresión introducida, actualiza `plan.md` marcando la fase como completada y reporta archivos modificados, endpoints/modelos afectados, migraciones y validaciones realizadas. Después de eso, DETENTE y espera instrucciones. No hagas trabajo adicional."**

---

# 71. Instrucción para ahorrar créditos

Para continuar el desarrollo de forma eficiente, usar preferiblemente:

> **"Continúa desde la última fase completada de `plan.md`. No vuelvas a auditar todo el repositorio. Lee únicamente el estado de `plan.md` y los archivos directamente relacionados con la siguiente fase. Implementa solo esa fase. No hagas refactors no relacionados ni anticipes fases futuras. Al terminar, ejecuta únicamente las validaciones necesarias, actualiza `plan.md`, resume los cambios y DETENTE."**

Esta debe ser la **instrucción estándar de continuación** para cada sesión de Codex.

---

# 72. Resultado esperado

El resultado final no debe sentirse como tres paneles CRUD independientes.

Debe sentirse como una única plataforma coherente con tres experiencias:

```text
ADMIN
"Yo controlo y superviso."

        ↓

ABOGADO_ADMIN
"Yo gestiono y trabajo."

        ↓

CLIENTE
"Yo entiendo y participo."
```

Y un CMS que permita al despacho modificar su presencia pública sin depender del desarrollador:

```text
ADMIN
  ↓
Editor visual
  ↓
Borrador
  ↓
Vista previa
  ↓
Publicar
  ↓
Sitio público
```

La meta final es pasar de una aplicación funcional a un **producto jurídico integral, visualmente consistente, seguro, accionable y mantenible**.

### Registro de implementación — Fases 12–20 (7 de octubre de 2026)

- **Fase 12 — Dashboard profesional:** agrega indicadores reales, lista de asuntos que requieren atención, actividad reciente y accesos rápidos a los módulos de trabajo del abogado.
- **Fase 13 — Procesos:** incorpora filtros por ámbito/atención/riesgo y búsqueda por proceso, cliente, radicado y responsable; muestra salud, actividad reciente/próxima, tareas y documentos pendientes.
- **Fase 14 — Expediente digital:** la ficha conserva las secciones existentes y organiza resumen, clientes, radicados/actuaciones, agenda, tareas, documentos, solicitudes, comunicaciones y timeline. Las tareas pueden crearse dentro del proceso y opcionalmente ligarse a cliente, radicado y actuación; el backend valida que el radicado y la actuación correspondan al proceso. La revisión documental se realiza en vista emergente.
- **Fases 15–16 — Tareas y agenda:** se añaden lista/Kanban/calendario y filtros de responsable, proceso, cliente, estado, contexto y vencimiento. La agenda de abogado distingue tareas de eventos, ofrece día/semana/mes/lista y permite registrar eventos desde la ficha del proceso.
- **Fase 17 — Clientes:** la ficha incorpora relación derivada de procesos vigentes, último contacto y actividad/comunicaciones relacionadas, incluidas notificaciones de actuaciones existentes; las consultas quedan limitadas a procesos accesibles al abogado.
- **Fase 18 — Documentos:** el centro permite previsualizar imágenes/PDF en modal, revisar, aprobar, rechazar o solicitar correcciones con comentario y trazabilidad.
- **Fases 19–20 — Comunicaciones y notificaciones:** la ficha conserva historial interno/visible al cliente por proceso sin enviar automáticamente por canales externos. El centro de notificaciones agrega categorías, lectura individual/masiva, filtros y navegación al recurso; el contador refleja pendientes de lectura.
- **Modelos/API:** se añadieron persistencia de comunicaciones del proceso y lecturas de notificaciones de abogado, CRUD de eventos de agenda, endpoints de timeline/comunicaciones/revisión y validaciones de ámbito para tareas. No se implementó funcionalidad de fases 21 en adelante.
- **Validación:** `tsc --noEmit`, ESLint focalizado (sin errores; quedan avisos de `<img>` en previsualizaciones), `py_compile` de modelos/esquemas/routers y `git diff --check` aprobados. No se ejecutaron pruebas automatizadas.

### Registro de implementación — Fases 21–34 (7 de octubre de 2026)

- **Fases 21–22 — Portal y dashboard del cliente:** la navegación del rol ahora incluye inicio, procesos, tareas, documentos/solicitudes, calendario, notificaciones, mensajes, ayuda, perfil y configuración. El inicio resume procesos, pendientes, solicitudes documentales, eventos, actividad compartida y avisos sin leer.
- **Fases 23–25 — Detalle, estado y actividad:** cada proceso tiene una ficha privada con estado explicado, responsable, próximas citas, documentos, tareas, radicados, timeline y conversación. El timeline del cliente filtra eventos por su relación y anonimiza las anotaciones judiciales; no se devuelven auditorías internas.
- **Fases 26–27 — Tareas y documentos:** las tareas del cliente indican contexto del proceso, fecha y estado, permiten completar/reprogramar y separan las completadas. El centro documental organiza lo solicitado y agrupa archivos por estado de revisión, muestra comentarios y permite descargar o reemplazar documentos que requieren corrección. Los documentos compartidos por el despacho aparecen cuando están asociados al cliente mediante el modelo documental actual.
- **Fases 28–29 — Calendario y notificaciones:** el calendario utiliza eventos asignados al cliente y sus vencimientos. El centro de avisos ofrece lectura individual y masiva con enlaces al recurso relacionado.
- **Fases 30–32 — Comunicación y solicitudes:** se habilita mensajería contextual por proceso, con remitente, fecha y estado de lectura. Las solicitudes y revisiones documentales permiten entregar, consultar aprobación o corregir. La firma electrónica queda expresamente pendiente de un proveedor y definición jurídica; no se simula una firma.
- **Fases 33–34 — Cuenta y ayuda:** se conserva la solicitud de cambio de perfil e historial, las preferencias de notificación y se añade el cambio de contraseña protegido con el flujo OTP existente (persistencia del reto vigente, temporizador y reenvío/cambio de canal). Se incorpora ayuda con instrucciones de documentos, procesos, avisos y contacto.
- **API cliente:** se añaden consultas protegidas para ficha, agenda, actividad compartida, notificaciones/lectura y mensajes; todas validan rol y vínculo cliente-proceso. La migración de `leido_en` para mensajes es compatible con instalaciones existentes.
- **Última actuación:** el cliente ve únicamente la actuación más reciente por radicado, tanto en la ficha como en los timelines/actividad compartida; las vistas de abogado conservan el historial completo.
- **Validación:** `tsc --noEmit`, ESLint focalizado de las rutas y componentes del cliente, `py_compile` de modelos/esquemas/routers y `git diff --check` aprobados. No se ejecutaron pruebas automatizadas.
