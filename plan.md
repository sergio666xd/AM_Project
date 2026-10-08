# Plan de contratos y gestión financiero-contable

## Propósito y alcance

Construir en el sistema de gestión jurídica un flujo de contratos de prestación de servicios y un módulo de honorarios, cuentas de cobro, pagos y estados de cuenta. El abogado de la firma editará y generará los contratos para firma física; después adjuntará el escaneado firmado al proceso para que el cliente pueda verlo/descargarlo y reciba una copia por correo. También podrá cobrar a sus clientes, comunicar documentos financieros y consultar/descargar sus PDF desde los paneles. `ADMIN` tendrá supervisión y administración global.

El desarrollo se hará primero sin conexión a una pasarela: los registros y flujos de cobro manuales deberán funcionar de forma completa antes de conectar ePayco. Las últimas fases integrarán ePayco sobre las interfaces de proveedor diseñadas en las fases iniciales.

Este plan no autoriza implementar todas las fases de una vez. En cada instrucción de continuación se implementará solamente la siguiente fase pendiente, se validará, se actualizará este archivo y se detendrá.

## Reglas de negocio y actores

- **ABOGADO_ADMIN (acreedor/remitente del cobro):** crea cuentas de cobro para clientes relacionados con sus procesos, registra pagos recibidos, consulta estados de cuenta y gestiona los documentos financieros que emitió. El producto representa el cobro de honorarios/servicios del abogado o despacho.
- **CLIENTE (deudor/pagador):** solo consulta obligaciones, pagos y documentos propios, puede descargar sus PDF y, cuando se habilite ePayco, iniciar el pago de una obligación suya.
- **ADMIN (administración de plataforma):** puede consultar, corregir por acciones auditadas, administrar y reportar toda la información financiera. ADMIN supervisa el módulo, pero no es el acreedor ni recibe por defecto el dinero del cliente.
- **ABOGADO:** no recibe por defecto privilegios financieros por su rol. Se definirá en Fase 0 si algún permiso de consulta limitado es necesario; no podrá emitir cobros ni alterar pagos sin autorización explícita.
- Una obligación debe enlazar al cliente y al abogado responsable; opcionalmente a uno de los procesos de ese cliente. No se permitirá cruzar cobros entre clientes o abogados. El backend validará cada vínculo, aunque el frontend oculte acciones.
- Se inicia con la firma única existente; no se introducirán organizaciones o multi-tenancy.
- Moneda inicial: COP. Los importes se almacenan como enteros en pesos o tipo decimal exacto, nunca `float`; el formato localizado es solo presentación. No se aplicarán impuestos automáticamente: los componentes tributarios y retenciones deben ser explícitos y revisados antes de emitir documentos.
- Los documentos financieros emitidos guardarán en la base de datos una instantánea inmutable de emisor, cliente, concepto, fechas, importes y referencias. Su PDF es una representación generada bajo demanda y no se almacena como archivo. Una corrección posterior se hará mediante anulación y nuevo documento o ajuste trazable; no se reescribe silenciosamente el documento histórico.
- Los contratos guardarán su contenido editable y versiones en base de datos. El PDF aún no firmado se genera bajo demanda y no se almacena. El ejemplar firmado que `ABOGADO_ADMIN` cargue tras escanearlo sí se conserva como archivo del expediente con los controles documentales existentes, y puede enviarse como adjunto al cliente.
- Un saldo se calcula a partir de obligaciones, pagos asignados y ajustes/reversiones registrados. No se edita directamente un campo de saldo.
- Las transacciones y eventos financieros no se borran físicamente desde operaciones normales. Pagos incorrectos se corrigen con reversión/ajuste compensatorio y motivo, conservando autor, fecha y evidencia.

## Alcance documental y tributario

El sistema debe diferenciar tres conceptos:

1. **Cuenta de cobro:** documento de solicitud/recaudo generado por el despacho, con número, emisor, cliente, concepto, proceso opcional, fecha de emisión y vencimiento, detalle de valores, saldo y medios de pago. No afirmar que por sí sola es factura electrónica, título valor o documento equivalente.
2. **Recibo de pago:** comprobante interno que acredita el pago recibido y su aplicación a una o varias obligaciones. Debe identificar importe, fecha, medio, referencia y quién lo registró; para pagos electrónicos incluir identificadores del proveedor una vez exista esa integración.
3. **Factura electrónica:** documento regulado que se emitirá mediante un proveedor tecnológico autorizado/solución DIAN solo si el despacho está obligado o decide implementarlo. Queda fuera del alcance de las fases iniciales y no se simulará una factura oficial con un PDF interno.

La DIAN indica que las personas o empresas que prestan servicios deben facturar salvo excepciones legales. Por ello, Fase 0 deberá confirmar con el responsable contable/tributario del despacho quién factura, cuál es el tratamiento de honorarios, impuestos/retenciones y si se requiere integración de factura electrónica. Hasta tener esa decisión, los PDF del módulo se titularán claramente “Cuenta de cobro” y “Recibo de pago”, con una nota de alcance configurable y sin afirmar cumplimiento fiscal.

Referencias oficiales para revisión antes de producción:

- [DIAN — ¿Debe facturar electrónicamente?](https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/debes-facturar-electronicamente/)
- [DIAN — trámites tributarios y obligación de facturar](https://www.dian.gov.co/tramiteservicios/tramites-y-servicios/tributarios/Paginas/tramites-tributarios.aspx)
- [DIAN — Concepto 7217 de 2026](https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_7217_2026.htm), relevante para distinguir cuentas de cobro de factura electrónica.
- [Ley 527 de 1999 — mensajes de datos y comercio electrónico](https://www.funcionpublica.gov.co/eva/gestornormativo/norma_pdf.php?i=4276). Conservar integridad, fecha, autor y trazabilidad de registros electrónicos.

Esto es una decisión de producto y de documentación, no un concepto tributario. El responsable del despacho debe confirmar las obligaciones concretas con su contador/asesor antes de emitir documentos a clientes.

## Sistema de contratos

El módulo administrará contratos de prestación de servicios jurídicos asociados obligatoriamente a un expediente. El cliente y abogado responsable deben corresponder a las relaciones de ese expediente; no se crearán contratos independientes sin expediente. En el repositorio ya están `CPS.pdf` y `CPS.docx`: **`CPS.pdf` será la referencia visual canónica** de la estructura final —paginación, líneas, imágenes, figuras y posiciones—; el DOCX servirá como fuente auxiliar para recuperar texto y contenido, no como garantía de que una conversión preserve el diseño. No convertir el DOCX a PDF esperando fidelidad de posiciones. `ABOGADO_ADMIN` podrá editar todo el contenido del contrato dentro del panel; no quedará limitado a rellenar campos predefinidos. El contrato editable debe reproducir el diseño de referencia del PDF y sus campos variables podrán tomar datos del cliente, abogado, expediente, honorarios y fechas, siempre editables antes de emitir la versión para firma.

El contrato tendrá contenido editable, metadatos, expediente obligatorio, cliente vinculado al expediente, abogado responsable, fechas de creación/actualización, historial de versiones, estado, autor y relación al evento de firma. Al preparar una versión para firma se conserva una instantánea inmutable del texto y los datos usados. Cambiar el texto luego crea una nueva versión o un nuevo contrato; no altera lo ya generado o firmado.

Estados de contrato propuestos:

- `BORRADOR`: contenido editable, aún no preparado para firma.
- `LISTO_PARA_FIRMA`: versión de contenido cerrada para generar/imprimir el documento; si requiere cambios, se crea una nueva versión borrador.
- `EN_FIRMA`: documento entregado para firma física; la fecha agendada vive como evento independiente en el proceso.
- `FIRMADO`: `ABOGADO_ADMIN` cargó el escaneado firmado y quedó asociado a la versión correspondiente. No se marca firmado solo por agendar una cita o generar el PDF.
- `TERMINADO`: contrato firmado cuya relación contractual finalizó; requiere registrar fecha y motivo/causal, conserva versiones y escaneado y no equivale a anularlo ni eliminarlo.
- `ANULADO`: contrato invalidado con motivo y trazabilidad; no se borra.

Transiciones: el ciclo normal es `BORRADOR` → `LISTO_PARA_FIRMA` → `EN_FIRMA` → `FIRMADO` → `TERMINADO`. `ANULADO` es una transición excepcional con motivo y auditoría desde un estado permitido por la política jurídica definida en Fase 0. Un contrato `TERMINADO` o `ANULADO` queda de solo lectura; correcciones posteriores se registran como nuevo contrato/versionado según corresponda.

Flujo previsto:

1. `ABOGADO_ADMIN` crea el contrato desde la ficha del expediente, selecciona un cliente asociado a ese expediente, edita íntegramente su contenido y guarda borrador/versiones. La edición parte del texto/contenido recuperado de `CPS.docx` cuando sea útil, pero el resultado visual se ajusta a `CPS.pdf`.
2. Al dejarlo listo, el sistema genera el PDF bajo demanda para vista previa/descarga e impresión. El PDF sin firmar no se persiste; se puede volver a generar desde la instantánea.
3. Desde los eventos del proceso, `ABOGADO_ADMIN` agenda una fecha/hora de firma mediante un evento `FIRMA_CONTRATO` vinculado al contrato. El evento registra lugar/instrucciones, participantes y estado de agenda, pero no cambia por sí mismo el contrato a firmado.
4. Tras la firma física, `ABOGADO_ADMIN` carga el escaneado firmado y lo relaciona con la versión emitida. El sistema conserva ese archivo como documento del proceso; no lo modifica ni reemplaza sin historial.
5. El cliente relacionado con el expediente puede ver y descargar el escaneado desde su proceso/documentos. Al cargarlo, el sistema envía una copia al correo registrado del cliente y registra destinatario, fecha, versión, archivo/documento y resultado del envío. Un fallo de correo permite reintento sin duplicar contrato ni documento.

El acceso se valida en backend: el abogado solo gestiona contratos de sus clientes/procesos accesibles, el cliente solo consulta contratos ligados a su relación, y `ADMIN` puede administrar todo con auditoría. Los contratos y escaneados son documentos confidenciales; no se usan enlaces públicos permanentes. La carga valida tipo/tamaño y reutiliza almacenamiento, escaneo y permisos documentales existentes. El email y la copia del contrato firmado reutilizan SMTP; el correo de contratos puede tener plantilla propia y debe enviarse al email del cliente.

## Diseño del estado de cuenta y pagos

El estado de cuenta se deriva del historial completo del cliente y muestra, por obligación: número/fecha, concepto, vencimiento, valor original, pagos aplicados, notas/ajustes, saldo y estado. Debe ofrecer filtros por cliente, proceso, periodo y estado, además de saldo total y exportación/descarga cuando corresponda. El cliente ve únicamente su propio estado; el abogado ve el de sus clientes autorizados; ADMIN ve el global.

Estados sugeridos para **obligaciones** (confirmar compatibilidad con datos existentes en Fase 0): `BORRADOR`, `EMITIDA`, `PENDIENTE`, `PARCIAL`, `PAGADA`, `VENCIDA`, `ANULADA`. El vencimiento es derivable por fecha, saldo y estado abierto; no marcar como vencida una obligación pagada/anulada. Los estados deben tener transiciones autorizadas y registrarse en auditoría.

Estados sugeridos para **intentos/transacciones de pago**: `INICIADA`, `PENDIENTE`, `APROBADA`, `RECHAZADA`, `FALLIDA`, `ANULADA`, `REEMBOLSADA`, `EN_DISPUTA`. En la primera entrega solo se usarán los estados que correspondan al registro manual y no se simulará respuesta de pasarela. Separar estado del intento del saldo real de la obligación.

Un pago puede aplicarse parcial o totalmente a una o varias obligaciones, según las reglas que se aprueben. Toda aplicación debe conservar importe aplicado, obligación, fecha y responsable. Los reembolsos/reversiones generan movimientos compensatorios y pueden recalcular saldos; nunca se elimina la transacción original. Evitar duplicados mediante claves idempotentes internas y, para ePayco, los identificadores únicos del proveedor.

Controles mínimos del libro auxiliar: secuencia/numeración no ambigua por tipo documental, importes exactos, fecha de negocio y fecha de registro, autor, origen (manual/pasarela), referencia/evidencia, estado, vínculo a obligación, cliente, abogado y proceso opcional, auditoría de cambios y conciliación entre movimientos y saldo. Los reportes deben poder explicar el saldo mostrando cada movimiento que lo compone.

## Correo financiero

- Los mensajes financieros son transaccionales y se envían **siempre al correo registrado del cliente** al emitir una cuenta de cobro, al registrar un pago/recibo, al emitir una corrección/anulación relevante y en otros eventos definidos por fase. No dependen de las preferencias de notificación de marketing o avisos ordinarios.
- Registrar intento, destinatario usado, versión de datos del documento, fecha, resultado y error técnico resumido; ofrecer reintento administrativo sin duplicar movimientos ni versiones del documento. No almacenar el PDF ni el adjunto enviado.
- La identidad del correo financiero (nombre y dirección `From`, `Reply-To` y plantillas) se configura independientemente de la identidad de notificaciones. Reutiliza el mismo host, puerto, TLS, usuario y secreto SMTP cifrado de la configuración existente; no crea un segundo servidor SMTP ni copia credenciales.
- Mantener privacidad: no incluir información de otros clientes ni datos sensibles innecesarios en asunto/cuerpo; generar el PDF desde la instantánea vigente justo antes del envío y adjuntarlo de forma transitoria, sin persistir el archivo. Añadir un botón autenticado para abrir/descargarlo. El enlace no sustituye los controles de sesión/autorización.
- Guardar evidencia del envío sin almacenar contraseñas/tokens SMTP en logs. Manejar rebotes/fallos como entrega pendiente y mostrarlo al personal.

## ePayco: investigación y diseño de integración

La integración se pospone a las últimas fases. Antes de activarla, confirmar en la cuenta real de ePayco las llaves, el entorno de pruebas/producción, métodos disponibles, tarifas, tiempos de abono, reembolsos, disputa/contracargo, moneda, límites y condiciones del comercio. La documentación cambia; verificarla de nuevo al ejecutar la fase, no codificar contra recuerdos de esta investigación.

### Flujo documentado de Smart Checkout

La documentación oficial consultada describe ePayco Smart Checkout v2 de este modo:

1. El backend del comercio autentica contra `POST https://apify.epayco.co/login` enviando autenticación Basic con `PUBLIC_KEY:PRIVATE_KEY` codificado en Base64, y obtiene un token.
2. El backend crea una sesión con `POST https://apify.epayco.co/payment/session/create`, autorización Bearer y datos de la transacción. La documentación muestra `checkout_version: "2"`, `name`, `currency`, `amount` como requeridos y campos como `invoice`, `description`, `country`, `response`, `confirmation`, impuestos, método y cuotas como opciones.
3. El servidor asocia `invoice`/referencia del comercio a una obligación abierta y conserva el `sessionId`/referencias necesarias; nunca acepta del navegador el precio como autoridad.
4. El frontend carga `https://checkout.epayco.co/checkout-v2.js` y abre el checkout con `ePayco.checkout.configure({ sessionId, type: "onpage" | "standard", test: true | false })`. `test` debe permanecer habilitado en sandbox y solo cambia mediante configuración controlada en producción.
5. La URL `response` y hooks del navegador sirven para mostrar al pagador que el flujo terminó y actualizar la interfaz, pero no prueban el pago. Puede cerrarse el navegador o manipularse la respuesta.
6. La URL HTTPS `confirmation` recibe la notificación servidor-a-servidor. Validar la firma `x_signature`, el comercio, referencia/`invoice`, transacción, importe y moneda contra la obligación local. La fórmula documentada es `SHA256(p_cust_id_cliente^p_key^x_ref_payco^x_transaction_id^x_amount^x_currency_code)`; verificar que coincida con la versión actual de la documentación/cuenta antes de activarla. Procesar de forma idempotente, guardar el evento original necesario para auditoría, responder rápido con HTTP 200 cuando se haya recibido de forma segura y hacer el trabajo pesado en segundo plano si hace falta. Reintentos de webhook no deben duplicar pago/recibo.
7. Si hay duda o demora, consultar desde el backend la referencia mediante el endpoint de validación vigente (la documentación actual del flujo de confirmación indica `GET https://secure.epayco.co/validation/v1/reference/{ref_payco}`); documentar este paso con las referencias reales del SDK/cuenta durante la fase de integración. Nunca marcar pagado solo porque el navegador vuelva con “Aceptada”.

Los secretos ePayco serán de servidor, cifrados en reposo y editables por ADMIN con auditoría. No exponer `PRIVATE_KEY`, `P_KEY`, tokens Apify ni secretos de firma en frontend, variables públicas, URLs o logs. Separar sandbox y producción. No almacenar números completos de tarjeta ni CVC; el checkout alojado/tokenización del proveedor debe manejar credenciales de tarjeta.

No habilitar inicialmente tokenización de tarjetas, cobros recurrentes, suscripciones ni `split payment`. El acreedor es el abogado/despacho; no se requiere dividir el pago entre beneficiarios salvo que una futura decisión de negocio/legal lo autorice.

Fuentes oficiales de ePayco consultadas (releerlas en la fase de integración):

- [Smart Checkout — implementación](https://docs.epayco.com/docs/checkout-implementacion)
- [Smart Checkout — respuesta y confirmación](https://docs.epayco.com/docs/checkout-respuesta-y-confirmacion)
- [URL de confirmación (documentación de recaudo)](https://docs.epayco.com/docs/url-de-confirmacion)
- [Documentación general de ePayco](https://docs.epayco.com/)
- [API de ePayco](https://docs.epayco.com/docs/api)
- [Tokenización](https://docs.epayco.com/docs/cobrar-con-token) — referencia para evaluar posteriormente, no habilitar en las primeras entregas.

## Fases

Al crear este plan, todas las fases iniciaron como **Pendientes**. No se asume trabajo completado por el plan anterior. Las fases posteriores a la solicitada se mantienen sin implementar.

### Fase 0 — Descubrimiento y decisiones de contratos/finanzas

**Objetivo:** verificar solo los modelos, roles, procesos/clientes, eventos, documentos, auditoría, SMTP y patrones de editor/PDF/permisos que inciden en contratos y pagos; decidir reglas antes de persistir movimientos.

- Confirmar identidad del acreedor (abogado responsable/despacho), datos que se imprimirán en cuentas/recibos, quién recibe el recaudo y si existe un único comercio ePayco para toda la firma.
- Inspeccionar `CPS.pdf` como autoridad de diseño (páginas, coordenadas, líneas, figuras, imágenes y elementos fijos) y `CPS.docx` como fuente auxiliar de texto. Determinar cómo mantener la fidelidad visual y permitir edición integral sin depender de una conversión DOCX que altere posiciones; definir campos dinámicos, historial, permisos, retención del escaneado firmado y plantilla de correo.
- Revisar el calendario/eventos y los documentos existentes para vincular fecha de firma al proceso, reusar carga segura y evitar duplicar almacenamiento. Agendar firma no equivale a contrato firmado.
- Acordar catálogo de conceptos, vencimientos, pagos parciales, aplicación de pagos, anticipos, descuentos, ajustes, anulaciones, reembolsos, impuestos/retenciones y zona horaria.
- Confirmar con responsable contable si corresponde factura electrónica y tratamiento tributario. Delimitar con precisión qué valor probatorio/tributario se atribuirá a cuenta de cobro y recibo internos.
- Inspeccionar únicamente el proveedor SMTP actual, modelo de usuario/roles, vínculo abogado-cliente-proceso, auditoría, generación/descarga bajo demanda de PDF y migrations/schema updater que se reutilizarían.
- Entregar mapa de entidades/API/permisos, riesgos de consistencia y reglas firmadas para construir el libro auxiliar; revisar vigencia de endpoints/documentación ePayco sin pedir ni escribir secretos.

**Aceptación:** decisiones y acceso a la plantilla anotados antes de construir contratos/pagos; ningún cobro real ni llamada ePayco en esta fase.

### Fase 1 — Contratos de prestación de servicios

**Objetivo:** implementar el ciclo de preparación, firma física y entrega al cliente usando `CPS.pdf` como referencia visual canónica y `CPS.docx` como fuente auxiliar de contenido.

- Reproducir la estructura visual de `CPS.pdf`, incluidas líneas, imágenes, figuras y posiciones, y ofrecer a `ABOGADO_ADMIN` edición integral del contenido, no solo sustitución de campos. Puede aprovecharse el texto de `CPS.docx`, pero no usar una conversión directa como resultado final si desplaza elementos. Facilitar campos dinámicos editables para cliente, abogado, expediente, servicios, honorarios, obligaciones y fechas.
- Guardar contenido fuente, metadatos y versiones en base de datos; congelar una instantánea al pasar a `LISTO_PARA_FIRMA`/`EN_FIRMA`. Registrar actor y cambios importantes.
- Implementar estados `BORRADOR`, `LISTO_PARA_FIRMA`, `EN_FIRMA`, `FIRMADO`, `TERMINADO` y `ANULADO`, transiciones autorizadas, fecha/motivo de terminación, motivo de anulación e historial. No inferir firma desde fecha/evento.
- Generar PDF sin firmar bajo demanda para vista, descarga e impresión desde la instantánea. No almacenar ese PDF generado.
- Desde el proceso, permitir crear/vincular un evento `FIRMA_CONTRATO` con fecha, hora, participantes, lugar/instrucciones y estado. Reutilizar los eventos existentes si cubren el flujo.
- Permitir que `ABOGADO_ADMIN` cargue el escaneado firmado, enlazarlo a contrato y versión, conservar el original en el almacenamiento documental existente y mostrarlo al cliente relacionado para ver/descargar.
- Enviar automáticamente una copia del escaneado firmado al correo registrado del cliente; auditar entrega, adjunto/referencia y reintentos. Conservar archivo cargado una sola vez; reintentar correo no duplica documento ni contrato.
- `ADMIN` puede ver/administrar todos los contratos y documentos con trazabilidad; los clientes no pueden acceder a archivos de otros clientes.

**Aceptación:** ciclo de borrador a firmado trazable; el PDF previo a firma se genera sin quedar almacenado, el escaneado sí se conserva; el cliente autorizado ve/descarga el firmado y recibe copia por correo.

### Fase 2 — Modelo de dominio y persistencia manual

**Objetivo:** crear la fuente de verdad del sistema financiero sin conectividad de pago.

- Diseñar persistencia para obligaciones/cuentas, líneas de concepto, pagos recibidos, asignaciones de pagos, ajustes/anulaciones, recibos, configuración de correo financiero y trazas de entrega.
- Implementar importes exactos, secuencias seguras, transiciones de estado, autor/fechas, instantáneas documentales e integridad de relaciones cliente-abogado-proceso.
- Crear servicio de dominio para emitir/anular cuentas, registrar pago manual, aplicar pago y producir saldo; un pago debe ser transaccional y no duplicable.
- Crear una abstracción `PaymentProvider`/equivalente y un origen de pago manual. Definir referencias/campos externos e idempotencia para ePayco, pero no instalar SDK ni realizar llamadas al proveedor.
- Migración compatible, restricciones e índices necesarios; no confiar en creación automática de tablas como único despliegue.

**Aceptación:** balances recalculables desde movimientos, estados coherentes y datos existentes intactos; las operaciones manuales funcionan con proveedor deshabilitado.

### Fase 3 — API y permisos de operación

**Objetivo:** habilitar flujos del abogado y controles administrativos en servidor.

- Endpoints protegidos para listar/detallar clientes, cuentas, movimientos, registrar pagos manuales, asignar pagos, emitir recibos, anular/corregir con motivo y consultar historial.
- ABOGADO_ADMIN solo opera clientes/procesos a los que tiene acceso y aparece como actor/acreededor responsable.
- ADMIN consulta y administra globalmente, con motivo y auditoría reforzada al corregir datos financieros.
- CLIENTE queda limitado a consultar sus propios datos (las acciones del portal se incorporarán en Fase 5); impedir acceso por IDOR y vínculos cruzados.
- Paginación, filtros, validación de importes/moneda/fecha, errores funcionales claros y claves idempotentes para peticiones de registro.

**Aceptación:** permisos comprobados en API, historial inmutable de operaciones y casos negativos de aislamiento cubiertos por pruebas.

### Fase 4 — PDF, correo financiero y panel del abogado

**Objetivo:** emitir y entregar documentos financieros desde el flujo diario del abogado.

- Generar bajo demanda PDF legibles e imprimibles de cuenta de cobro y recibo, usando únicamente la instantánea financiera persistida en la base de datos: numeración, datos de emisor y cliente, concepto, detalle, total, vencimiento, pagos, saldo, medio/referencia y nota tributaria aprobada.
- Ver/descargar los documentos desde el panel abogado generando el PDF en esa petición (o en una vista previa); transmitirlo al navegador con controles de autorización y sin guardarlo en disco, almacenamiento de objetos ni como blob en base de datos.
- Configurar remitente financiero (nombre, `From`, `Reply-To`, plantilla y datos de contacto) separado del remitente de avisos; reutilizar el transporte y secreto SMTP existentes.
- Envío transaccional forzado al email vigente del cliente al emitir cuenta o recibo: generar el PDF desde los datos persistidos, adjuntarlo durante el envío y descartarlo al terminar. Incluir botón autenticado a su detalle. Guardar destino, identificador/versión de datos, resultado y fecha, nunca el binario; avisar al abogado si entrega falla y permitir reintento regenerando el PDF.
- No permitir que preferencias de avisos ordinarios desactiven el correo que entrega un documento financiero solicitado/emitido.

**Aceptación:** los datos y versiones documentales están conservados en la base de datos; cada vista, descarga o correo genera el PDF al momento y no deja un archivo persistido. Correo auditado; reintentos no duplican cobros ni versiones y regeneran el adjunto.

### Fase 5 — Portal del cliente y estado de cuenta

**Objetivo:** ofrecer al cliente visibilidad clara de lo que debe y de lo que ya pagó.

- Pantalla de resumen con saldo total y cuentas pendientes, parciales, pagadas y vencidas.
- Detalle cronológico por obligación con movimientos, pagos aplicados, recibos, correcciones y documentos descargables.
- Generación bajo demanda y descarga del estado de cuenta PDF y de cada cuenta/recibo; encabezado claro sobre periodo y fecha de corte, sin conservar los archivos generados.
- Si se habilita pago fuera de línea: mostrar únicamente instrucciones aprobadas por el despacho y flujo opcional para reportar soporte. Ese reporte no marca la obligación como pagada ni reemplaza la verificación del abogado.
- Email transaccional con enlace contextual mantiene sesión requerida; nunca incluir enlaces públicos permanentes a documentos financieros.

**Aceptación:** cliente A no puede consultar datos/documentos de cliente B alterando ruta, ID o petición; estado de cuenta concilia con todos los movimientos.

### Fase 6 — Consola ADMIN, configuración e informes

**Objetivo:** permitir administración y supervisión financiera global.

- Listado global filtrable por cliente, abogado, proceso, estado, vencimiento, período, origen y referencia; detalle con vista previa del PDF generado al abrir, registro del correo enviado e historial de auditoría. No se guardan PDFs.
- Acciones administrativas con permisos y motivo: corrección compensatoria, anulación controlada, reintento de correo, conciliación manual y bloqueo de nuevas operaciones ante anomalía. No borrar movimientos.
- Panel de configuración del remitente financiero y política de envío independiente; credenciales SMTP compartidas sin duplicación.
- Reportes de cartera/saldos por período, abogado, cliente y estado; exportación controlada, consistente con los filtros. Mostrar fecha de corte y reglas de cómputo.
- Tablero de conciliación de cuentas, recibos, pagos sin aplicar, correos fallidos y diferencias; sin llamar ePayco todavía.

**Aceptación:** ADMIN puede localizar y administrar cualquier registro sin aparecer como acreedor, cada acción queda auditada y exportaciones respetan filtros/permisos.

### Fase 7 — Endurecimiento, conciliación y preparación de proveedor

**Objetivo:** dejar el núcleo manual fiable y revisar la integración en sandbox antes de habilitar pagos en vivo.

- Pruebas de importes, pagos parciales, pagos múltiples, doble envío, idempotencia, concurrencia de numeración, saldos, anulaciones/reversiones y permisos.
- Procedimientos de conciliación manual, cierre de período, respaldo/retención de los datos financieros y snapshots documentales, manejo de incidentes y reintento de entrega. No hay recuperación de archivos PDF almacenados; se regeneran desde su snapshot.
- Definir interfaz de proveedor, configuración cifrada y separada por ambiente; mostrar estado “no conectado” sin afectar pagos manuales.
- Inspección de seguridad y revisión contable/tributaria de PDF, correos, auditoría, retención y nomenclatura.
- Aceptación de ambiente ePayco sandbox y credenciales por el propietario autorizado, fuera del código y sin exponerlas.

**Aceptación:** no hay defectos críticos conocidos, se concilian saldos y se puede operar manualmente si ePayco está apagado o falla.

### Fase 8 — ePayco Smart Checkout en sandbox

**Objetivo:** integrar el flujo de cobro electrónico en pruebas sin acreditar una obligación por una respuesta de navegador.

- Implementar autenticación backend Apify, creación de sesiones por obligación, checkout v2 en frontend y retorno `response` solo como interfaz informativa.
- Validar importe/saldo/moneda y estado de obligación en servidor antes de crear sesión; guardar intento pendiente, `invoice` único/referencia local y datos externos mínimos.
- Implementar endpoint HTTPS `confirmation`, validación de firma en tiempo constante, coincidencia de importe/moneda/referencia/merchant y protección idempotente ante reintentos y eventos fuera de orden.
- Persistir notificación recibida y resultado de procesamiento; responder sin redirección y dentro del SLA de ePayco; trabajos lentos en cola. Consultar API de validación cuando se requiera confirmar discrepancias.
- Solo una confirmación autenticada y verificada crea pago aplicado y recibo; rechazo/fallo deja saldo pendiente. La pantalla de respuesta nunca es autoridad.
- Sandbox exclusivamente, pruebas de firmas inválidas, webhook duplicado/retrasado, pagos aprobados/rechazados, usuario que abandona checkout y API no disponible.

**Aceptación:** conciliación entre obligación, intento, confirmación y recibo demostrada en sandbox; funciones manuales siguen operativas.

### Fase 9 — Habilitación gradual y operación de ePayco

**Objetivo:** llevar pagos a producción con control de riesgo y soporte.

- Validar llaves/cuenta y datos legales/comerciales, URLs HTTPS públicas, webhook productivo, correos, monto, moneda y entorno `test: false` con doble control ADMIN.
- Habilitación gradual con interruptor para desactivar nuevo checkout sin perder registros ni impedir pagos manuales; límites y monitoreo de transacciones pendientes.
- Conciliación diaria contra reportes ePayco y seguimiento de comisiones, abonos, reversos, reembolsos y contracargos; determinar explícitamente si esos eventos deben producir ajuste, deuda abierta o investigación.
- Alertas para webhook ausente, firma inválida, diferencias de valores, reintentos agotados, alta tasa de rechazo y discrepancias de conciliación; guía operativa de soporte.
- Revisar obligaciones de factura electrónica/proveedor DIAN antes de ofrecer documentos como facturas oficiales. Una eventual integración se planificará aparte.

**Aceptación:** conciliación de producción verificada, ruta de reversión/desactivación ensayada, secretos protegidos y soporte con trazabilidad; lanzamiento aprobado por el propietario del comercio.

## Decisiones aprobadas

Completar durante Fase 0. Hasta entonces se asumen solo estos límites seguros: acreedor = abogado/despacho responsable; pagador = cliente vinculado; ADMIN = supervisor global; COP como moneda inicial; cuenta de cobro/recibo interno no se presentan como factura DIAN; ePayco desactivado hasta las Fases 8–9.

| Decisión | Responsable | Estado |
|---|---|---|
| Identidad legal y datos que identifican al acreedor en los PDF | Despacho | Pendiente |
| Confirmar responsable de recaudo y si se usa una única cuenta ePayco de la firma | Despacho | Pendiente |
| Tratamiento de honorarios, IVA, retenciones y obligación de factura electrónica | Contador/asesor del despacho | Pendiente |
| Política de vencimientos, pagos parciales, anticipos, descuentos y aplicación de un pago a varias cuentas | Despacho | Pendiente |
| Política de anulación, devolución, reversión, disputa y soportes | Despacho | Pendiente |
| Retención y acceso a documentos financieros después de cerrar/archivar un proceso | Despacho | Pendiente |
| Campos del remitente financiero y correo de respuesta | Despacho | Pendiente |
| `CPS.pdf` como referencia visual y `CPS.docx` como contenido auxiliar; fidelidad visual/editorial requerida | Despacho | Archivos presentes; método de edición por definir en Fase 0 |
| Datos y cláusulas editables del contrato; flujo para generar nuevas versiones/adendas | Despacho/asesor jurídico | Pendiente |
| Información de evento de firma (lugar, participantes, instrucciones y notificaciones) | Despacho | Pendiente |
| Retención del escaneado firmado y política de reenvío al correo del cliente | Despacho | Pendiente |

## Criterios de ejecución para cada fase

1. Leer este plan y solo los archivos directamente relacionados con la fase pendiente; no auditar el repositorio completo.
2. Reutilizar modelos, autorización, auditoría, SMTP, generación de PDF bajo demanda, componentes y patrones de API existentes cuando sirvan. No introducir almacenamiento persistente de PDFs.
3. No implementar funcionalidad de fases futuras ni hacer refactors ajenos al módulo financiero.
4. Ejecutar validaciones focalizadas apropiadas a los archivos cambiados; no afirmar pruebas no ejecutadas.
5. Actualizar el estado de la fase, decisiones relevantes, archivos/modelos/API tocados, migraciones y validaciones en este documento.
6. Detenerse al finalizar esa fase y esperar instrucciones.

## Registro de progreso

- Rama de trabajo: `financiero-contable`, creada desde `origin/main`.
- Plan anterior reemplazado por esta hoja de ruta independiente.
- Investigación documental para ePayco y DIAN incorporada con enlaces oficiales; la documentación de ePayco debe revalidarse al ejecutar Fases 8–9.
- Contratos añadidos como Fase 1, antes de las fases financieras; `CPS.pdf` y `CPS.docx` están presentes en el repositorio.
- `CPS.pdf` es la referencia visual canónica para conservar estructura/posiciones; `CPS.docx` es una fuente auxiliar de contenido y no se asumirá que convertirlo conserva su diseño. El escaneado firmado se conserva en el expediente; el PDF previo a firma se genera bajo demanda.
- **Fase 0 — descubrimiento:** inspeccionados los modelos de proceso/cliente, calendario, documentos, roles, SMTP, almacenamiento R2 y el inicializador de esquema. Se confirmó que `CPS.pdf` tiene tres páginas carta, no contiene campos de formulario y el proyecto no incluye un motor PDF. Quedan pendientes decisiones tributarias/contables del despacho (facturación DIAN, impuestos/retenciones, tratamiento y recepción del recaudo); no se presume cumplimiento fiscal. Sin llamadas a ePayco ni pagos reales.
- **Fase 1 — contratos: EN PROGRESO, no aceptada todavía.** Se añadieron persistencia de contratos/versiones/entregas, endpoints protegidos bajo `/api/contratos`, evento `FIRMA_CONTRATO`, pestaña en la ficha del abogado, consola Admin, carga del original firmado a R2, descarga del cliente, email adjunto/reintento y estados incluido `TERMINADO`. El registro `LISTO_PARA_FIRMA` congela versión y solo agendar el evento lleva a `EN_FIRMA`; el cliente sigue viendo el firmado al terminarse el contrato. Los PDFs previos a firma no se guardan: el panel imprime desde el contenido persistido. **Pendiente de aceptación:** esa impresión refluye el texto y no reproduce líneas, figuras, imágenes y posiciones de `CPS.pdf`; el PDF no tiene campos editables y no hay renderer/compositor PDF en las dependencias. Tampoco se implementó aún edición posicional del documento de referencia. No afirmar que Fase 1 está completa hasta resolver este punto.
- **Fase 2 — persistencia financiera manual: IMPLEMENTADA.** Se añadieron tablas de cuentas/líneas, pagos/idempotencia, aplicaciones parciales repetibles, ajustes, reversiones, snapshots, configuración y trazas de entrega de correo; `Numeric(14,2)`, restricciones e índices; servicio de dominio para crear/emitir/anular, registrar, aplicar/revertir pagos y recalcular saldo/estado. Se definió `PaymentProvider` con proveedor deshabilitado: ningún SDK ni llamada externa. Migración PostgreSQL idempotente: `migrations/2026_10_08_contracts_finance.sql`; se conservaron las alteraciones compatibles del inicializador existente para columnas `contrato_id`. Fase 2 no añade todavía endpoints/UI (Fase 3 en adelante).
- **Validaciones ejecutadas:** `py_compile` para modelos, schemas, routers, servicio financiero, `main.py` y correo; configuración de mappers SQLAlchemy (46 tablas); `tsc --noEmit -p frontend-saas/tsconfig.json`; ESLint focalizado (sin errores, un warning de `<img>` preexistente en la ficha del abogado); `git diff --check`. No se ejecutaron pruebas automatizadas.
- **Assets de plantilla:** `CPS.docx` y `CPS.pdf` permanecen como archivos locales no versionados; el backend espera encontrarlos en la raíz del proyecto. Deben incluirse en el despliegue/versionado antes de publicar el flujo de contratos.
