# Schedulime

PWA estática para consultar un calendario semanal de estrenos anime y resaltar qué series ver cada día sin depender de backend propio. La aplicación descarga datos desde AniList directamente en el cliente, guarda una snapshot local en `IndexedDB` y sigue funcionando offline aunque el hosting o AniList no estén disponibles más tarde.

## Lo que incluye esta base

- Calendario semanal de lunes a domingo en hora local.
- Persistencia local de:
  - Configuración (`usuario AniList`, `máximo de episodios recomendados por día`, `ocultar ignorados`).
  - Snapshot normalizada del calendario semanal.
- Decisiones manuales del usuario: `viendo`, `dudando`, `ignorar`.
  - Estado de sincronización y versión disponible.
  - Lista pública de animes vistos/completados del usuario para detectar continuaciones.
- Sincronización progresiva:
  - Carga siempre desde local primero.
  - Si hay red y la snapshot está caducada, refresca en segundo plano desde AniList.
  - Si AniList falla, conserva la última snapshot buena y muestra aviso.
- PWA instalable con `vite-plugin-pwa`.
- Prompt de nueva versión por `service worker` y comparación opcional contra `public/version.json`.

## Requisitos

- Node.js 20 o superior.
- npm 10 o superior.

## Scripts

```bash
npm install
npm run dev
npm run build
npm run test
```

## Flujo de datos

1. La app arranca y lee `IndexedDB`.
2. Renderiza la última snapshot disponible.
3. Si hay conexión y la snapshot está caducada o pertenece a otra semana, llama a AniList.
4. Guarda la nueva semana, la lista pública del usuario y recalcula recomendaciones localmente.
5. El motor de recomendación marca por día:
   - Primero `viendo` manual.
   - Después continuaciones de series ya vistas.
   - Después títulos con mejor `meanScore` y `popularity`.

## Limitaciones actuales

- V1 usa solo usuario público de AniList; no hay OAuth ni acceso a listas privadas.
- Si el navegador borra los datos locales, se pierden ajustes y decisiones.
- El placeholder de streaming no tiene acción real todavía.
- La primera carga necesita red para poblar la snapshot inicial.

## Deploy estático recomendado

Cualquier hosting estático sirve: GitHub Pages, Netlify, Cloudflare Pages o similar. La app no necesita backend, pero sí un host para servir el primer acceso, los assets y `version.json`.

## Notas sobre el entorno actual

Durante esta implementación no había `node` ni `npm` disponibles en el PATH del entorno, así que la estructura y el código quedaron preparados, pero no se pudo ejecutar `npm install`, `build` ni `test` desde aquí.
