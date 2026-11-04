# Frontend

Next.js del sistema de la firma: sitio público, portal de clientes y abogados y consola de administración. La descripción general, las variables de entorno y cómo correr todo junto están en el [README de la raíz](../README.md).

```bash
npm install
npm run dev          # http://localhost:3000 y http://admin.localhost:3000
npm run api:tipos    # regenera lib/api-v2/esquema.ts desde lib/api-v2/openapi.json
npm run lint
npx tsc --noEmit
npm run build
```

- `app/`: rutas. `gestion-procesos/{auth,cliente,abogado,admin}` son las áreas privadas; el resto es el sitio público.
- `components/`: componentes por área (`expediente`, `tareas`, `admin`, `portal-cliente`, …) y `ui/` con los comunes.
- `lib/api-v2/cliente.ts`: cliente tipado de la API (`api.GET`, `api.POST`, …) y `mensajeDeError`.
- `proxy.ts`: qué área sirve cada dominio según el rol de la sesión.
- `workflows/`: flujos programados (Vercel Workflow) que llaman a la API interna del backend.

El diseño sigue [`DESIGN.md`](../DESIGN.md): tokens en `app/globals.css`, modo oscuro con la clase `.dark`.
