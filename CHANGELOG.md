# Cambios

Cada actualización que se publica en `main` sube la versión con
`python scripts/version.py patch|minor|major -m "nota"`. La versión vive en
el archivo `VERSION` y el script la copia a `frontend-saas/package.json` y a
`pyproject.toml`; los paneles la muestran en el menú de la cuenta.

- **major**: cambios que rompen algo (se retira una API, cambia un flujo completo).
- **minor**: funciones nuevas.
- **patch**: arreglos y ajustes pequeños.

Las versiones anteriores a 2.3.0 se reconstruyeron a partir de los PR
fusionados en `main`, agrupados por día de publicación.

## 2.3.0 · 2026-11-13

- Número de versión visible en el menú de la cuenta de los paneles de administración, abogado y cliente.
- Contratos: fecha del día de la firma; zoom y panel plegable en el editor de plantillas (#63).
- WhatsApp: se registran en el log los mensajes que Meta no entregó (#61).

## 2.2.1 · 2026-11-12

- Verificación del dominio en Meta (#60).

## 2.2.0 · 2026-11-11

- WhatsApp por la Cloud API de Meta: plantillas, envío, webhook, confirmación de entrega y lectura, y estado de cada plantilla en Meta (#56–#59).

## 2.1.0 · 2026-11-05

- Etapas editables en cada proceso; datos del cliente y valor en letras en recibos y cuentas de cobro; la app instalada abre en el panel; contratos con plantillas sobre el documento base CPS; sitio público en azul con borradores en el admin (#51–#55).

## 2.0.0 · 2026-11-04

- Toda la aplicación pasa a la API v2 y se retira la API v1, el portal SaaS y las cuentas ABOGADO (#39–#50).

## 1.3.0 · 2026-10-29

- Rediseño por fases: documentos, clientes, contratos, mensajes, portal del cliente, finanzas, administración y sitio público (#21–#36).

## 1.2.0 · 2026-10-28

- Sistema de diseño Expediente foliado, núcleo de la API v2 con sesión por cookie, bandeja Hoy, tareas y agenda (#14–#20).

## 1.1.0 · 2026-10-27

- Optimización y limpieza, rediseño de portales, eliminar solicitudes de documentos, animaciones en los paneles, logo propio de los correos y arreglos del menú y las alertas de actuaciones (#3–#13).

## 1.0.0 · 2026-10-26

- Primera versión en `main`: paneles financiero-contables, avisos push, chat y sitio público (#1–#2).
