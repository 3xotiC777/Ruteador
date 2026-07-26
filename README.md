# Ruteador planeación

Aplicación web de Dichter & Neira para generar rutas diarias, consultar los
puntos asignados por auditor, descargar los CSV en ZIP y seguir el avance de
visitas mediante el export diario.

## Desarrollo local

Requiere Node.js 22 o superior.

```bash
pnpm install
pnpm run dev
pnpm run build
```

Las credenciales locales se guardan en `.dev.vars`, archivo excluido de Git.

## Despliegue automático en Cloudflare

El proyecto está preparado como Cloudflare Worker y utiliza un bucket R2 con
el binding `UPLOADS`. Wrangler puede crear este recurso automáticamente durante
el primer despliegue.

Al importar este repositorio desde **Workers & Pages**, utiliza:

- Rama de producción: `main`
- Build command: `pnpm run build`
- Deploy command: `pnpm run deploy:cloudflare`
- Root directory: `/`

Después del primer despliegue, abre **Settings > Variables and Secrets** del
Worker y crea estos secretos de producción:

- `ADMIN_PASSWORD`
- `FIELD_PASSWORD`
- `SESSION_SECRET`

Los usuarios `Admin` y `Campo` ya están declarados como variables no secretas
en `wrangler.jsonc`. `SESSION_SECRET` debe ser una cadena aleatoria larga.

Los Excel y el export diario se almacenan en R2 y no forman parte del
repositorio. En un despliegue nuevo se cargan nuevamente desde el modo
Administrador.
