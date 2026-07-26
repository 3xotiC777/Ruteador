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

La aplicación queda disponible en `http://localhost:3000/` y las credenciales
locales se guardan en `.dev.vars`, archivo excluido de Git.

## Presentación

Para la demostración, inicia el servidor local y abre la dirección anterior.
Los Excel y el export diario permanecen en el almacenamiento local del entorno
de desarrollo.
