# UI Redesign Progress

## Fase 0 — Inventory ✅
- Branch: `financiero-contable`
- Baseline: tsc ✅ (0 errors), lint ✅ (1 pre-existing warning), plan-ui.md read ✅
- Pre-existing lint error: `abogado/clientes/page.tsx` line 134 (setState in effect)

### Routes mapped
- **ADMIN**: 35 pages under `/gestion-procesos/admin/`
- **ABOGADO**: 20 pages under `/gestion-procesos/abogado/`
- **CLIENTE**: 13 pages under `/gestion-procesos/cliente/`
- **Dashboard (shared)**: under `/gestion-procesos/dashboard/`

### Current architecture
- Layouts: admin (AdminConsoleShell), abogado (AppShell variant=lawyer), cliente (AppShell variant=client)
- Design tokens: CSS custom properties in globals.css (Brand `#002060`, Gold `#CCB56B`, complete neutral and semantic scales)
- Tailwind v4 with `@theme inline` block
- Dark mode: `.dark` class on documentElement, token overrides
- Icons: lucide-react
- Components: Button, Badge, Card, DataTable, EmptyState, Modal, ConfirmDialog, FilterBar, LoadingState, PageHeader, StatCard, AttentionPanel, SectionHeader, StatusMap.

## Fase 1 — Visual Foundation ✅
- [x] Replace CSS tokens with brand palette (#002060, #CCB56B, full neutral/semantic scales)
- [x] Update Tailwind theme inline block
- [x] Rebuild Button component with new variants (primary brand-900, secondary, outline, ghost, danger, gold)
- [x] Rebuild Badge with brand-aware tones
- [x] Rebuild Card
- [x] Add PageHeader component (title, description, overline, action)
- [x] Add StatCard component (KPI card with tone variants)
- [x] Add AttentionPanel & SectionHeader components
- [x] Add StatusMap (backend state mapping)
- [x] Update DataTable (onRowClick, hideOnMobile, emptyAction)
- [x] Update EmptyState, LoadingState, FilterBar, Modal, ToastProvider
- [x] Verify dark mode tokens

## Fase 2 — Layout & Navigation ✅
- [x] Rebuild AdminConsoleShell sidebar + header (5 grouped collapsible sections, brand-900 active state, collapse toggle, user menu)
- [x] Rebuild Sidebar (AppShell lawyer/client variants with grouped navigation)
- [x] Rebuild AppShell (CSS var width, chat viewport, mobile drawer)
- [x] Grouped navigation per spec (Trabajo, Expedientes, Comunicación, Cuenta for Abogado; Inicio, Mis asuntos, Pendientes, Comunicación, Mi cuenta for Cliente)
- [x] Mobile drawer with backdrop
- [x] Collapsible sidebar (desktop)

## Fase 3 — ADMIN pages ✅
- [x] `admin/page.tsx` (Dashboard con PageHeader, StatCard con indicadores tonales, Card, DataTable)
- [x] `admin/usuarios/page.tsx` (`AdminUsersPage` con PageHeader, Button, Badge, modal overlays con brand-950/40)
- [x] `admin/usuarios/[id]/page.tsx` (`AdminUserDetailPage` con PageHeader, StatCards de KPIs, acciones con Button)
- [x] `admin/solicitudes/page.tsx` (`AdminRequestsPage` con PageHeader, Button de decisión, modal overlays)
- [x] `admin/solicitudes-perfil/page.tsx` (ClientProfileRequestsReviewPage)
- [x] `admin/alertas/page.tsx` (`AdminAlertsPage` con PageHeader, StatCard, FilterBar)
- [x] `admin/actividad/page.tsx` & `admin/auditoria/page.tsx` (`AdminAuditPage` con PageHeader, Button, Badge)
- [x] `admin/agenda/page.tsx` (`AdminFirmAgendaPage` con PageHeader, Button de nuevo evento y controles)
- [x] `admin/operacion/page.tsx` y subrutas (`AdminOperationsPage`, `AdminMessageTemplatesPage`, `IntegrationSettingsPanel`)
- [x] `admin/notificaciones/page.tsx` y `entregas` (`AdminNotificationCenterPage`, `AdminNotificationDeliveriesPage`)
- [x] `admin/planes/page.tsx` (`AdminPlansPage` con PageHeader, Badge, Button, modal overlays)
- [x] `admin/cuenta/page.tsx` (`AdminAccountPage` con PageHeader, Button)
- [x] `admin/firma/page.tsx` (`AdminFirmSettingsPage` con PageHeader, Button)
- [x] `admin/almacenamiento/page.tsx` (`AdminStoragePage` con PageHeader, Button)
- [x] `admin/chat/page.tsx` y subrutas (`ChatWorkspace`, `AdminChatCleanupPage` con PageHeader, Button)
- [x] `admin/metricas/page.tsx` (`WorkloadDashboard` con PageHeader, StatCard, Card)
- [x] `admin/procesos`, `radicados`, `tareas`, `documentos`, `global`, `saas` (`AdminResourcePage` / `SectorInventoryPage` con PageHeader, Button)
- [x] `admin/contenido/page.tsx` (Preservado intacto sin romper funcionalidad de CMS público)

## Fase 4 — ABOGADO pages ✅
- [x] `abogado/page.tsx` (Dashboard con PageHeader, StatCards, Card, tokens de marca)
- [x] `abogado/agenda/page.tsx` (PageHeader, Button, filtros de rango temporal)
- [x] `abogado/clientes/page.tsx` & `clientes/[id]/page.tsx` (PageHeader, StatCard, Badge, Button)
- [x] `abogado/configuracion/page.tsx` (PageHeader, Button, Card de ajustes)
- [x] `abogado/contratos/page.tsx` & `components/contracts/AllContractsPage.tsx`
- [x] `abogado/metricas/page.tsx` (WorkloadDashboard adaptado a métricas del abogado)
- [x] `abogado/notificaciones/page.tsx` (PageHeader, Button, filtros leído/no leído, Card)
- [x] `abogado/perfil/page.tsx` (PageHeader, Button, inputs estilizados con tokens)
- [x] `abogado/solicitudes-perfil/page.tsx` (ClientProfileRequestsReviewPage)
- [x] `abogado/documentos/page.tsx` (PageHeader, StatCard, toolbar moderna, Button, modales)
- [x] `abogado/procesos/page.tsx` (PageHeader, StatCard, toolbar, filtros, Badge, Button, modal de creación)
- [x] `abogado/procesos/[id]/page.tsx` & `[subpagina]/page.tsx` (PageHeader, StatCard, navegación de expediente)
- [x] `abogado/radicados/page.tsx` & `radicados/[id]/page.tsx` (PageHeader, StatCard, Button, Badge)
- [x] `abogado/tareas/page.tsx` & `tareas/[id]/page.tsx` (PageHeader, StatCard, Badge, Button, tabs kanban/calendario/lista)
- [x] `abogado/chat/page.tsx` & subrutas (ChatWorkspace integrado en AppShell)

## Fase 5 — CLIENTE pages ✅
- [x] `cliente/page.tsx` (Dashboard de cliente con PageHeader, StatCard, AttentionPanel, Badge, Card)
- [x] `cliente/procesos/page.tsx` (PageHeader, Badge de estado procesal, EmptyState, tarjetas de procesos)
- [x] `cliente/procesos/[id]/page.tsx` (PageHeader, Badge, banner de chat directo con abogado asignado, tabs de expediente)
- [x] `cliente/tareas/page.tsx` (PageHeader, Button, Badge, filtros, integración de calendario)
- [x] `cliente/documentos/page.tsx` (PageHeader, Button, Badge, barra de progreso y subida asistida)
- [x] `cliente/calendario/page.tsx` (PageHeader, Button, Badge, selector de vista lista/calendario)
- [x] `cliente/notificaciones/page.tsx` (PageHeader, Button, Badge, filtros leído/no leído)
- [x] `cliente/perfil/page.tsx` & `ClientProfilePage.tsx` (PageHeader, Button, Badge, formularios de datos)
- [x] `cliente/configuracion/page.tsx` & `ClientSettingsPage.tsx` (PageHeader, Button, gestión de notificaciones push)
- [x] `cliente/ayuda/page.tsx` (PageHeader, Button, acordeón de preguntas frecuentes)
- [x] `cliente/mensajes/page.tsx` (Redirección unificada a `/chat`)
- [x] `cliente/chat/page.tsx` & subrutas (ChatWorkspace adaptado al cliente con layout AppShell)
- [x] `cliente/layout.tsx`, `error.tsx`, `loading.tsx`, `not-found.tsx` (AppShell, PortalErrorState, PortalLoadingState, PanelNotFound)

## Fase 6 — Pulido Transversal ✅
- [x] Verificación de contraste y variables CSS en modo claro y modo oscuro (`globals.css`)
- [x] Compatibilidad móvil: drawer deslizable con backdrop, tablas con overflow horizontal y padding responsive
- [x] Estados de carga (`LoadingState`, `PortalLoadingState`) y vacíos (`EmptyState`) consistentes
- [x] Consistencia de bordes redondeados (`var(--radius-*)`) y sombras sutiles en tarjetas y modales

## Fase 7 — Validación y Regresión ✅
- [x] TypeScript check (`tsc --noEmit`): 0 errores
- [x] Next.js build check (`next build`): 89/89 rutas compiladas exitosamente (código 0)
- [x] Reconstrucción del grafo de conocimiento AST (`graphify update .`): 2545 nodos, 7504 bordes, 113 comunidades
