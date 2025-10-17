# Notion Lite — Starter

Mini clon de Notion hecho con **HTML + CSS + JS** (sin frameworks) para estudiar la arquitectura de bloques.

## Características del MVP
- Páginas (crear, renombrar, eliminar) con sidebar
- Editor por bloques con tipos: **párrafo, H1, H2, viñetas, tarea, cita, código**
- Menú **/ (slash)** para cambiar el tipo de bloque
- **Enter** crea un bloque nuevo; **Backspace en vacío** borra el bloque
- **Drag & drop** para reordenar bloques
- Persistencia en **localStorage**
- **Exportar/Importar** a JSON

## Uso
1. Descomprime el ZIP.
2. Abre `index.html` en tu navegador.

> Consejo: si usas VS Code, abre una *Live Server* para mejores rutas y recarga inmediata.

## Próximos pasos (roadmap técnico)
- Reemplazar contentEditable por **TipTap/ProseMirror** o **Slate** para reglas de edición sólidas
- Persistencia en **IndexedDB** + **Dexie** para más datos
- Sincronización en tiempo real con **CRDTs (Y.js)** y WebRTC/WebSocket
- Autenticación + API (FastAPI, Express, Laravel…)
- Historial y **undo/redo** multi-bloque
- Soporte de **Markdown shortcuts** y `/comandos` avanzados
- Subpáginas, bases de datos (tablas), filtros y vistas
- Modo offline (PWA), atajos de teclado y tests

¡Disfrútalo!
