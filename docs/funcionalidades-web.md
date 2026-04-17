# Funcionalidades de la web

## Pantalla principal

La web muestra un calendario semanal de lunes a domingo. La semana visible puede ser la actual, una anterior o una posterior, y siempre se presenta en la hora local del dispositivo.

La cabecera principal incluye:

- logo y texto descriptivo del producto;
- navegacion semanal con botones para ir a la semana anterior o siguiente;
- acciones rapidas para actualizar, abrir ajustes y consultar ignorados;
- version compacta en movil, donde esas acciones pasan a un menu desplegable.

Si la app no tiene ninguna snapshot local todavia, muestra un estado vacio indicando que hace falta abrirla al menos una vez con conexion para descargar la semana inicial.

## Navegacion semanal

La navegacion semanal cambia la semana visible completa. La etiqueta central muestra el rango de fechas de la semana seleccionada.

Comportamiento relevante:

- la semana se calcula de lunes a domingo;
- la semana visible puede ser distinta de la semana actual;
- el boton de actualizar refresca la semana visible, no siempre la actual;
- cuando la semana visible es la actual, el dia de hoy se resalta visualmente;
- en movil, al cambiar de semana, el dia activo pasa a ser hoy si se esta viendo la semana actual, o el lunes si se esta viendo otra semana.

## Resumen superior

La zona de estado muestra cuatro tarjetas:

- ultima actualizacion: fecha relativa de la ultima sincronizacion exitosa;
- semana visible: rango exacto de la semana que esta en pantalla;
- recomendados esta semana: relacion entre episodios recomendados y episodios visibles;
- hoy: cuantos episodios destacados y cuantas emisiones visibles tiene el dia actual.

Estas tarjetas no consultan AniList por separado. Se construyen a partir de la snapshot ya cargada en memoria.

## Banners y mensajes

La app puede mostrar varios mensajes al mismo tiempo en una pila superior:

- mensajes informativos, por ejemplo sincronizacion completada o guardado offline;
- avisos de error cuando la ultima sincronizacion ha fallado;
- aviso de nueva version disponible cuando `version.json` indica una version mas reciente;
- aviso de actualizacion del shell PWA cuando el service worker detecta una nueva build lista para instalar.

Ademas existen toasts temporales para acciones puntuales, como:

- la app ya esta lista para funcionar offline;
- sincronizacion completada;
- datos locales restablecidos.

## Toolbar funcional

Debajo de los banners aparece una barra con dos elementos funcionales:

- el modo horario actual, que hoy siempre es "Hora local del dispositivo";
- el toggle `Ocultar ignorados`.

El toggle `Ocultar ignorados` se guarda en la configuracion local y afecta al calendario principal:

- activado: los ignorados manuales y los autoignorados desaparecen del calendario principal;
- desactivado: esos elementos siguen visibles en el calendario, pero tambien siguen apareciendo en el modal de ignorados.

Aunque un ignorado siga visible, no vuelve a entrar en el ranking de recomendaciones.

## Navegacion diaria en movil

En pantallas compactas aparece una fila de pills con los siete dias de la semana. Sirve para mostrar un solo dia cada vez.

Comportamiento:

- cada pill cambia el dia activo;
- el texto puede aparecer abreviado a una sola letra;
- la navegacion solo cambia la vista compacta, no altera la snapshot ni las recomendaciones.

## Columnas de dia

Cada dia visible se renderiza como una columna con:

- nombre del dia;
- fecha corta;
- indicador `Hoy` si coincide con el dia actual dentro de la semana actual;
- lista de estrenos visibles de ese dia.

Si un dia no tiene estrenos visibles, se muestra el mensaje `Sin estrenos visibles este dia`.

## Marcador de hora actual

Cuando se esta viendo la semana actual, la columna del dia de hoy puede mostrar un marcador horizontal con la hora actual.

Reglas del marcador:

- solo aparece en el dia actual de la semana actual;
- si la hora actual es anterior al primer estreno visible, se coloca antes de la primera tarjeta;
- si cae entre dos estrenos, se coloca entre ambas;
- si es posterior al ultimo estreno visible, se coloca al final;
- no aparece en otros dias ni en semanas pasadas o futuras.

## Tarjetas de anime

Cada estreno visible se representa con una tarjeta que incluye:

- portada, con fallback a la inicial del titulo si no hay imagen;
- titulo clicable;
- hora local del estreno;
- numero de episodio si AniList lo devuelve;
- score medio y popularidad;
- hasta tres generos;
- enlace directo a AniList.

Las tarjetas usan el color de portada de AniList como acento cuando ese dato existe.

## Badges de recomendacion

Una tarjeta puede aparecer marcada como recomendada. En ese caso muestra un badge visual sobre la portada.

Los dos motivos posibles son:

- `Continuacion`: el anime tiene una precuela y esa precuela aparece en la lista publica del usuario como `CURRENT` o `COMPLETED`;
- `Top score`: no se ha detectado continuidad, asi que entra por posicion en el ranking general del dia.

La recomendacion no significa reproduccion automatica ni seguimiento obligado. Solo indica que ese episodio ha entrado entre los mejores candidatos visibles del dia segun las reglas del motor.

## Estados manuales por anime

Cada tarjeta permite guardar una decision local para ese anime:

- `Viendo`
- `Dudando`
- `Ignorar`

La decision se puede cambiar desde dos zonas:

- el boton-resumen junto al titulo, que abre un mini menu;
- la fila inferior de acciones rapidas.

Si ya existe una decision, aparece tambien un boton para quitar la seleccion y volver al estado neutro.

Efectos funcionales:

- `Ignorar` lo convierte en ignorado manual;
- `Viendo` y `Dudando` no eliminan el anime del calendario;
- `Viendo` y `Dudando` tambien sirven para rescatar animes que habian quedado autoignorados;
- todas las decisiones se guardan localmente en IndexedDB.

## Modal de detalle del anime

Al pulsar la portada o el titulo se abre un modal de detalle. Este modal muestra:

- portada grande;
- titulo;
- hora y episodio;
- score y popularidad;
- lista completa de generos;
- descripcion normalizada desde AniList;
- enlace a AniList;
- accion `Ver Online` cuando se puede construir un enlace de streaming.

La descripcion se sanea para eliminar ruido comun de AniList, como bloques redundantes de fuente y etiquetas no permitidas.

## Flujo de "Ver Online"

El boton `Ver Online` funciona en modo best-effort. No forma parte del calendario base de AniList y depende de varios pasos auxiliares.

Estados posibles:

- `Preparando enlace de streaming`: se esta resolviendo el titulo final para construir la URL;
- `Ver Online` habilitado: se pudo construir una URL y no consta como faltante;
- `Ver Online` deshabilitado por no disponible: la validacion ha detectado que ese episodio no existe en el destino;
- `Streaming pronto`: no se pudo generar enlace, normalmente porque falta el episodio o no se pudo obtener un slug util.

Detalles importantes:

- se intenta usar `idMal` para pedir a Jikan el titulo mas util para el slug;
- si eso falla, se usa el titulo de AniList como fallback;
- la validacion del enlace se cachea en memoria durante la sesion;
- un estado `unknown` no bloquea el enlace si la URL existe.

## Modal de ajustes

El modal `Ajustes` permite modificar configuracion local persistente.

Campos disponibles:

- usuario publico de AniList;
- episodios recomendados por dia;
- ocultar ignorados.

Comportamiento del usuario AniList:

- si hay conexion y el campo no esta vacio, se valida online antes de guardar;
- si no hay conexion, se guarda sin validar;
- si se deja vacio, la app sigue funcionando en modo manual, pero pierde la priorizacion automatica por continuaciones.

Comportamiento del limite diario:

- el valor minimo es 1;
- el valor maximo es 12;
- el motor de recomendaciones nunca destacara mas episodios por dia que este limite.

Guardar ajustes:

- persiste la configuracion en IndexedDB;
- cierra el modal;
- si hay conexion, dispara una sincronizacion de la semana visible con la nueva configuracion;
- si no hay conexion, deja el cambio guardado para la proxima sincronizacion.

## Reset local

Desde el modal de ajustes existe una accion `Reset` que borra los datos locales de la app tras confirmacion del usuario.

El reset:

- borra la snapshot semanal almacenada;
- borra decisiones guardadas;
- borra ignorados manuales, porque dependen de esas decisiones;
- restaura la configuracion por defecto;
- deja la app vacia hasta que se vuelva a pulsar `Actualizar` con conexion.

No borra datos de AniList ni hace ningun cambio en servicios externos. Solo afecta al navegador actual.

## Modal de ignorados

El modal `Ignorados` centraliza los animes excluidos del flujo principal de la semana.

Puede contener dos tipos de entradas:

- ignorados manuales, creados por el usuario al marcar `Ignorar`;
- autoignorados, filtrados por reglas internas del motor.

Cada fila permite:

- abrir el detalle del anime;
- ver el motivo del ignorado cuando aplica;
- restaurar la entrada.

## Motivos de autoignorado

La app puede autoignorar un anime cuando no existe una decision manual y se cumple alguna de estas condiciones:

- score medio menor de 50;
- formato `ONA` o `OVA` con duracion de 3 minutos o menos;
- pais de origen distinto de Japon;
- sigue sin score a partir del episodio 3.

## Restauracion desde ignorados

La accion `Restaurar` no hace exactamente lo mismo en todos los casos:

- si el anime estaba ignorado manualmente, lo devuelve al estado neutro eliminando la decision;
- si el anime estaba autoignorado, lo restaura como `Dudando`.

Este detalle es importante: un autoignorado no vuelve simplemente a "sin estado", sino que se marca de forma explicita para que deje de caer otra vez en el filtro automatico.

## Comportamiento offline visible para el usuario

Despues de una primera sincronizacion correcta, la web puede:

- abrir la ultima snapshot local sin conexion;
- seguir mostrando decisiones locales;
- seguir mostrando ignorados y recomendaciones calculadas sobre la snapshot guardada.

Sin conexion no puede:

- descargar una semana nueva;
- validar el usuario de AniList;
- refrescar la lista publica del usuario;
- resolver nueva informacion remota que no exista ya en la snapshot local.
