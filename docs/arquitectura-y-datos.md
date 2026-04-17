# Arquitectura y datos

## Arquitectura general

Schedulime es una SPA cliente-servidor solo en el sentido de consumo de APIs externas. La aplicacion en si no tiene backend propio. Toda la logica de interfaz, sincronizacion, persistencia y recomendaciones se ejecuta en el navegador.

Las piezas principales son:

- `src/app/App.tsx`: coordina UI, sincronizacion, mensajes, modales y acciones del usuario;
- `src/lib/db.ts`: encapsula IndexedDB;
- `src/lib/anilist.ts`: integra AniList GraphQL;
- `src/lib/recommendations.ts`: construye la vista semanal y calcula recomendados;
- `src/lib/sync.ts`: define criterios de staleness y flujo de sincronizacion;
- `src/lib/streaming.ts`: resuelve y valida enlaces de streaming;
- `src/lib/date.ts`: calcula semana local, formatos y etiquetas de tiempo.

## Arranque y construccion de snapshot

La app arranca leyendo primero el estado local. No espera a AniList para poder pintar interfaz.

Flujo de arranque:

1. se abre IndexedDB;
2. se leen configuracion, anime, schedule, decisiones y metadatos;
3. se construye un `AppSnapshot` en memoria;
4. la UI renderiza esa snapshot;
5. si la snapshot esta caducada y hay conexion, se lanza una sincronizacion en segundo plano.

Esto permite que la primera pantalla dependa del ultimo estado conocido, no del tiempo de red.

## Persistencia local con IndexedDB

La base local se llama `schedulime-db` y usa version `1`.

Object stores:

- `settings`: guarda la configuracion local;
- `anime`: guarda el catalogo de anime de la snapshot actual;
- `schedule`: guarda las emisiones semanales;
- `decisions`: guarda decisiones locales por `mediaId`;
- `meta`: guarda `syncState` y `watchedMediaIds`.

Datos persistidos relevantes:

- usuario publico de AniList;
- maximo de episodios recomendados por dia;
- preferencia de ocultar ignorados;
- snapshot semanal descargada;
- estado de sincronizacion;
- ids de series vistas o en curso en AniList;
- decisiones `watching`, `unsure` o `ignore`.

## Snapshot y tipos clave

### `Settings`

Representa la configuracion local del usuario. Hoy incluye:

- nombre publico de AniList;
- maximo diario de recomendados;
- preferencia para ocultar ignorados;
- modo horario, actualmente fijo a `local`.

### `SyncState`

Resume el ultimo estado de sincronizacion:

- version de la app;
- version remota disponible si existe;
- semana asociada a la snapshot;
- ultima tentativa y ultima sincronizacion exitosa;
- ultimo error conocido;
- indicador de snapshot caducada.

### `AppSnapshot`

Es la foto completa con la que trabaja la UI. Une configuracion, anime, emisiones, decisiones, lista vista del usuario y estado de sincronizacion.

### `CalendarEntryViewModel`

Es la proyeccion lista para pintar una tarjeta. Combina datos de schedule, anime, decision local, recomendacion, ignorado y etiquetas de tiempo.

### `WeeklyWindow`

Representa la semana visible y la ventana tecnica de sincronizacion. Incluye inicio, fin y una ventana extendida de un dia por cada lado para capturar emisiones cercanas a cambios de zona horaria.

## Semana local y ventana de sincronizacion

La semana visible siempre se calcula en local y comienza el lunes a las 00:00 del dispositivo.

Hay dos ventanas relacionadas:

- ventana visible: de lunes a lunes, usada para renderizar el calendario;
- ventana de sincronizacion: un dia antes y un dia despues, usada para consultar AniList con mas margen.

Despues de descargar datos, la app vuelve a filtrar por semana local para decidir que entra realmente en pantalla.

## Integracion con AniList

La fuente principal es `https://graphql.anilist.co`.

### Calendario semanal

La app consulta `airingSchedules` paginados con estas reglas:

- rango temporal acotado por la ventana de sincronizacion;
- orden por tiempo;
- paginas de 50 elementos;
- deduplicacion por id de schedule;
- exclusion de contenido adulto;
- normalizacion de campos opcionales a `null` o valores por defecto.

Cada entrada descargada genera:

- un `Anime` normalizado;
- una `ScheduleEntry` con `mediaId`, `airingAt` y episodio.

### Validacion de usuario publico

Cuando el usuario guarda un nombre de AniList y hay conexion, la app valida que ese usuario publico exista antes de aceptar el ajuste.

Si no hay conexion, el dato se guarda sin validacion y se intentara usar en la siguiente sincronizacion online.

### Lectura de lista publica

Si existe un usuario publico configurado, la sincronizacion intenta descargar su `MediaListCollection` de anime.

Solo se consideran como "visto o en seguimiento" los estados:

- `CURRENT`
- `COMPLETED`

Esa lista se convierte en `watchedMediaIds` y se usa despues para detectar continuaciones a partir de `prequelIds`.

## Reintentos y manejo de errores

La capa de AniList reintenta automaticamente en casos de:

- errores de red;
- `429`;
- `500`;
- `502`;
- `503`.

La estrategia actual usa hasta dos reintentos con pausas crecientes cortas.

Cuando AniList falla:

- la app no vacia la snapshot previa;
- se conserva la copia local disponible;
- el error se traduce a un mensaje legible para UI;
- el `SyncState` se marca como fallido y caducado.

## Flujos de sincronizacion

La app tiene tres motivos principales de sincronizacion.

### Sincronizacion automatica en background

Se lanza despues del arranque si se cumplen todas estas condiciones:

- la app ya ha cargado la snapshot local;
- hay conexion;
- no hay otra sincronizacion en curso;
- no se ha pausado el auto-sync por un reset;
- la snapshot se considera caducada para la semana visible.

La snapshot se considera caducada cuando:

- nunca hubo una sincronizacion exitosa;
- la semana guardada no coincide con la visible;
- han pasado mas de 6 horas desde la ultima sincronizacion correcta.

### Sincronizacion manual

Se activa con `Actualizar`. Fuerza una sincronizacion de la semana visible actual de la interfaz.

Si no hay conexion:

- no se lanza peticion remota;
- se informa de que se mantiene la ultima snapshot local.

### Sincronizacion al guardar ajustes

Cuando se guardan ajustes validos:

- la configuracion se persiste primero;
- si hay conexion, se sincroniza inmediatamente con el nuevo contexto;
- si no hay conexion, la UI confirma el guardado y aplaza la sincronizacion.

## Reemplazo de snapshot

Cuando una sincronizacion termina bien, la app:

1. recalcula el `SyncState`;
2. consulta si existe una version remota mas nueva;
3. reemplaza la snapshot persistida de anime y schedule;
4. actualiza `watchedMediaIds`;
5. actualiza el estado en memoria mediante transiciones de React.

Esto significa que el calendario visible siempre sale de una snapshot coherente, no de escrituras parciales.

## Motor de recomendaciones

La vista semanal se recalcula localmente a partir de la snapshot y las decisiones guardadas.

Proceso por dia:

1. se agrupan las emisiones visibles por dia local;
2. se determina si cada entrada esta autoignorada;
3. se apartan ignorados manuales y autoignorados para el panel de ignorados;
4. se eligen candidatos recomendables;
5. se ordenan y se limita el resultado por `maxEpisodesPerDay`;
6. se marcan como recomendados dentro de la lista final del dia.

## Prioridad del ranking

El ranking diario usa este orden:

1. continuaciones detectadas por `prequelIds`;
2. mayor `averageScore`;
3. mayor `popularity`;
4. orden alfabetico por titulo si aun hay empate.

Puntos importantes:

- una entrada marcada como `ignore` nunca puede ser recomendada;
- una entrada autoignorada nunca puede ser recomendada;
- `watching` y `unsure` no garantizan recomendacion, pero mantienen la entrada elegible si no cae en otro filtro;
- el ranking opera sobre las entradas visibles del dia y despues recorta por el maximo diario configurado.

## Reglas de autoignorado

Una entrada sin decision manual puede quedar autoignorada si cumple una de estas reglas:

- `averageScore` menor de 50;
- formato `ONA` o `OVA` con duracion menor o igual a 3 minutos;
- `countryOfOrigin` distinto de `JP`;
- `averageScore` ausente a partir del episodio 3.

Si existe decision manual `watching`, `unsure` o `ignore`, las reglas automaticas no intentan reinterpretarla.

## Ignorados y recuperacion

El sistema guarda ignorados manuales y automaticos en una coleccion auxiliar para el modal de recuperacion.

Detalles tecnicos:

- si el mismo anime aparece varias veces en la semana, el panel de ignorados conserva solo la emision mas temprana;
- los ignorados manuales se ordenan antes que los automaticos;
- restaurar un ignorado manual elimina la decision;
- restaurar un autoignorado crea una decision `unsure`.

## Streaming: resolucion y validacion

El streaming no viene de AniList. Se construye localmente con logica auxiliar.

Flujo:

1. si el anime tiene `idMal`, la app intenta pedir a Jikan un titulo conveniente;
2. si falla, usa el titulo de AniList;
3. con ese titulo genera un slug normalizado;
4. construye una URL del tipo `https://animeav1.com/media/<slug>/<episodio>`;
5. intenta validar la disponibilidad consultando `__data.json` a traves de `corsproxy.io`.

Hay dos caches en memoria por sesion:

- cache de titulos resueltos desde Jikan;
- cache del estado de validacion del enlace.

Consecuencias practicas:

- no todo anime tendra enlace;
- un enlace puede abrirse incluso con estado `unknown` si la URL es construible;
- si la validacion detecta episodio inexistente, el boton se deshabilita;
- este mecanismo es una ayuda auxiliar, no una garantia de disponibilidad.

## Renderizado y reactividad

La app usa `startTransition` y `useDeferredValue` para que actualizaciones grandes de snapshot o de vista semanal no bloqueen la sensacion de fluidez.

Esto es especialmente util en:

- carga inicial desde IndexedDB;
- reemplazo completo de snapshot tras sincronizacion;
- recalculo de vista al cambiar decisiones o ajustes.
