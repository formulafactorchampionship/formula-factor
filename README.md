# Formula Factor Championship (FFC)

Web + panel de administración + live timing del campeonato de sim racing FFC.

## Estructura

Raíz (sitio estático, servido tal cual por GitHub Pages y por el servidor Node):

- `index.html`, `script.js`, `style.css` — la SPA.
- `favicon.png`, `CNAME`, `reglamento-ffc.txt`, `live_timing_records.json`, `firebase-applet-config.json` — recursos que la web pide por ruta relativa (deben quedarse en la raíz).
- `components/` — módulos visuales WebGL (ShapeWaves, LightPillar, SideRays, BorderGlow, CobeGlobe) + sus CSS; se cargan de forma diferida desde `script.js`.

Servidor local / dev (Node) — carpeta `server/`:

- `server/server.js` — servidor Express (API de admin, auth, subidas, relay de live timing).
- `server/emailAuditService.js`, `server/envLoader.js` — auditoría de cuentas y carga de `.env` (de la raíz).
- `server/race-results-import.js`, `server/build-live-timing-records.mjs` — importación de resultados y publicación de records (los usa la GitHub Action).

Live timing (compartido con el relay de Cloud Run) — raíz:

- `live-timing-store.js`, `live-timing-upstream.js`.
- `relay/` — relay de Cloud Run que mantiene abierto el websocket del panel del juego y lo republica como SSE (ver `relay/README.md`).

Firebase:

- `firestore.rules` (reglas de seguridad) y `firebase.json`.
- `firebase-blueprint.json` / `metadata.json` — auxiliares de proyecto.

Recursos:

- `news_uploads/` — imágenes subidas a las noticias.

## Desarrollo

```bash
npm install
npm run dev          # node server/server.js  ->  http://localhost:3000
```

Publicación: la web es estática en GitHub Pages; el relay de live timing va en Cloud Run.

## Datos en tiempo de ejecución (no versionados)

`users_db.json`, `fantasy_teams_db.json`, `fantasy_lock_db.json`, `live_timing_db.json` y
`photos_db.json` son datos del servidor (se regeneran solos) y están en `.gitignore`.
