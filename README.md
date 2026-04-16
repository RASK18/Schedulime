# Schedulime

PWA estatica para consultar un calendario semanal de estrenos anime y resaltar que series ver cada dia sin depender de backend propio. La aplicacion descarga datos desde AniList directamente en el cliente, guarda una snapshot local en `IndexedDB` y sigue funcionando offline aunque el hosting o AniList no esten disponibles mas tarde.

La version publicada vive en GitHub Pages:

- https://rask18.github.io/Schedulime/

## Que incluye

- Calendario semanal de lunes a domingo en hora local del dispositivo.
- Persistencia local de configuracion, snapshot semanal, decisiones del usuario y estado de sincronizacion.
- Decisiones manuales por anime: `viendo`, `dudando`, `ignorar`.
- Recomendaciones diarias basadas en continuaciones, `meanScore` y `popularity`.
- Sincronizacion progresiva: primero carga desde local y despues refresca en segundo plano si la snapshot esta caducada.
- Modo offline tras la primera carga con datos.
- PWA instalable con `vite-plugin-pwa`.
- Aviso de nueva version mediante service worker.

## Requisitos

- Node.js 20 o superior.
- npm 10 o superior.

## Scripts

```bash
npm install
npm run dev
npm run build
npm run preview
npm run test
```

## Flujo de datos

1. La app arranca y lee `IndexedDB`.
2. Renderiza la ultima snapshot disponible.
3. Si hay conexion y la snapshot esta caducada o pertenece a otra semana, consulta AniList.
4. Guarda la nueva semana, la lista publica del usuario y recalcula recomendaciones localmente.
5. El motor de recomendacion prioriza `viendo`, despues continuaciones, y despues titulos con mejor `meanScore` y `popularity`.

## Limitaciones actuales

- V1 usa solo usuario publico de AniList; no hay OAuth ni acceso a listas privadas.
- Si el navegador borra los datos locales, se pierden ajustes y decisiones.
- El boton de streaming sigue siendo un placeholder salvo cuando se puede construir una URL valida.
- La primera carga necesita red para poblar la snapshot inicial.

## Desarrollo local

```bash
npm install
npm run dev
```

La app usa Vite y React. En local se sirve desde la raiz (`/`), pero el build de produccion esta configurado para publicarse bajo `/Schedulime/`.

## Deploy en GitHub Pages

El repositorio incluye un workflow en `.github/workflows/deploy-pages.yml` que:

1. Instala dependencias con `npm ci`.
2. Ejecuta `npm run build`.
3. Publica `dist/` en GitHub Pages con GitHub Actions.

Para que funcione correctamente en este repositorio:

- GitHub Pages debe usar `GitHub Actions` como fuente de despliegue.
- La `base` de Vite esta fijada a `/Schedulime/` en produccion.
- Los assets publicos deben resolverse con la base de Vite y no con rutas absolutas tipo `/archivo.png`.

## Verificacion reciente

Se ha verificado en este entorno que:

- `npm run build` funciona correctamente.
- El despliegue de Pages se realiza desde `main` mediante GitHub Actions.

Nota: `npm run test` existe como script del proyecto, pero en esta sesion no se pudo completar por una restriccion del entorno (`spawn EPERM` al arrancar Vite/Vitest).

Otras paginas similares: 
- https://www.livechart.me/schedule
- https://animegratis.net/horario
- https://simkl.com/anime/today/
- https://animecountdown.com/
- https://animeschedule.net/
