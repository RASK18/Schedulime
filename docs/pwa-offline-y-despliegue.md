# PWA, offline y despliegue

## Naturaleza PWA

Schedulime se publica como Progressive Web App usando `vite-plugin-pwa`.

La configuracion actual define:

- nombre y `short_name` de la app;
- descripcion para instalacion;
- `display: standalone`;
- `start_url` bajo `/Schedulime/`;
- icono SVG maskable;
- color de tema y color de fondo.

El registro del service worker se hace desde React con `useRegisterSW`.

## Flujo de instalacion y actualizacion del shell

La PWA usa `registerType: prompt`, lo que significa que una nueva version del shell no se activa silenciosamente de inmediato. La app espera a que la UI decida.

Estados visibles relacionados:

- `offlineReady`: indica que el service worker ya ha dejado la app preparada para funcionar offline;
- `needRefresh`: indica que hay una nueva version del shell lista para instalar.

Cuando `needRefresh` es `true`, la UI muestra un banner con el boton `Actualizar ahora`, que llama a `updateServiceWorker(true)`.

## Que se cachea

El service worker trabaja sobre dos niveles de recursos.

### Recursos del propio build

Se incluyen en cache los assets del build que coinciden con:

- JavaScript
- CSS
- HTML
- SVG
- JSON
- Web manifest

Esto permite que el shell de la aplicacion siga arrancando aunque no haya red, siempre que el usuario haya cargado la app al menos una vez con exito.

### Cache runtime

La configuracion actual tambien define caches runtime para:

- `version.json`, con estrategia `NetworkFirst`;
- imagenes de AniList, con estrategia `CacheFirst`.

La cache de imagenes mejora la experiencia offline visual, pero no sustituye la snapshot de datos, que sigue viviendo en IndexedDB.

## Funcionamiento offline real

Despues de la primera sincronizacion con datos, offline siguen funcionando:

- apertura de la app;
- lectura de la snapshot local;
- renderizado del calendario ya guardado;
- decisiones manuales sobre anime;
- vista de ignorados;
- recomendaciones recalculadas a partir de datos ya persistidos.

Offline no funcionan o quedan degradados:

- descarga de una semana nueva;
- validacion del usuario publico de AniList;
- lectura de la lista publica del usuario;
- consulta directa a AniList;
- resolucion remota de titulos via Jikan cuando aun no estaban en memoria;
- verificacion online de disponibilidad del enlace de streaming.

## Relacion entre offline y snapshot local

El soporte offline de Schedulime no depende de un cache HTTP del calendario de AniList, sino de una snapshot persistida en IndexedDB.

La separacion es esta:

- el service worker mantiene accesible el shell de la app y ciertos assets;
- IndexedDB conserva el contenido funcional de la semana;
- la UI reconstruye el calendario desde IndexedDB al arrancar.

Por eso la primera carga con conexion es obligatoria: sin snapshot inicial, la app puede abrir, pero no tiene contenido semanal que mostrar.

## Versionado de la app

La constante `APP_VERSION` se inyecta en build desde Vite.

La version final se calcula asi:

- base: `major.minor` de `package.json`;
- patch: numero de commits de Git si esta disponible;
- fallback: patch del `package.json` si no se puede contar commits;
- override opcional: variable de entorno `APP_VERSION`.

Tambien se genera `APP_UPDATED_AT`, con valor de entorno si existe o timestamp UTC del build.

## `version.json`

La app expone un `version.json` con:

- `version`
- `updatedAt`

Ese archivo se genera de dos maneras:

- durante desarrollo, con un middleware de Vite;
- durante build, como asset emitido al bundle final.

La UI consulta `version.json` para detectar si existe una version remota superior a la que esta ejecutando el navegador.

## Deteccion de version remota

Despues de una sincronizacion correcta, la app intenta leer `version.json` sin usar cache del navegador.

Si la version remota es mayor:

- se guarda en `syncState.availableVersion`;
- se muestra un banner informando de que hay una version nueva disponible;
- la actualizacion no se impone automaticamente.

Esto convive con `needRefresh`, pero no es exactamente lo mismo:

- `availableVersion` informa de una version remota mas nueva detectada por JSON;
- `needRefresh` indica que el service worker ya tiene una nueva shell lista para instalar.

## Base path y publicacion

La build de produccion esta configurada con base `/Schedulime/`. Esto es importante porque la app esta pensada para publicarse en GitHub Pages bajo el nombre del repositorio.

Consecuencias:

- `start_url` del manifest usa esa base;
- recursos publicos, logo e iconos se resuelven bajo esa base;
- `version.json` tambien cuelga de esa base.

## Build local

Scripts relevantes:

- `npm run dev`: servidor de desarrollo Vite;
- `npm run build`: compilacion TypeScript y build de produccion;
- `npm run preview`: previsualizacion del build;
- `npm run test`: ejecucion de pruebas con Vitest.

La build no modifica el comportamiento funcional de la app; empaqueta el cliente, la configuracion PWA y el `version.json`.

## Despliegue en GitHub Pages

El workflow actual vive en `.github/workflows/deploy-pages.yml`.

Resumen del pipeline:

1. se ejecuta en `push` a `main` y tambien manualmente;
2. hace checkout con historial suficiente para contar commits;
3. instala Node 20;
4. ejecuta `npm ci`;
5. calcula `APP_VERSION` y `APP_UPDATED_AT`;
6. ejecuta `npm run build`;
7. sube `dist/` como artefacto de Pages;
8. despliega el artefacto al entorno `github-pages`.

## Limitaciones actuales

- no existe backend que pueda forzar actualizaciones o rehidratar datos del usuario;
- no hay OAuth ni acceso a listas privadas de AniList;
- si el navegador pierde IndexedDB, se pierde la snapshot funcional;
- la primera carga con contenido sigue necesitando conexion;
- el streaming es una capa auxiliar best-effort y puede fallar aunque el calendario funcione.
