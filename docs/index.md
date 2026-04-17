# Documentacion tecnica de Schedulime

## Vision general

Schedulime es una PWA estatica hecha con React y Vite para consultar un calendario semanal de estrenos anime sin depender de un backend propio. La aplicacion descarga datos desde AniList en el navegador, guarda una snapshot local en IndexedDB y puede seguir mostrando la ultima semana sincronizada aunque la web se abra sin conexion.

La app esta pensada para tres objetivos a la vez:

- mostrar los estrenos de la semana en la hora local del dispositivo;
- ayudar a decidir que ver cada dia con recomendaciones calculadas en cliente;
- seguir siendo util offline despues de la primera sincronizacion correcta.

## Stack y dependencias funcionales

- UI: React 18
- Bundler: Vite 5
- PWA: `vite-plugin-pwa`
- Persistencia local: IndexedDB
- Fuente principal de datos: AniList GraphQL
- Fuente auxiliar para streaming: Jikan API
- Destino de enlace de streaming: `animeav1.com`
- Hosting previsto: GitHub Pages

## Como leer esta documentacion

- [Funcionalidades de la web](./funcionalidades-web.md): describe toda la experiencia de usuario, pantalla principal, modales, estados y flujos visibles.
- [Arquitectura y datos](./arquitectura-y-datos.md): explica como arranca la app, como se sincroniza, como persiste datos y como calcula recomendaciones.
- [PWA, offline y despliegue](./pwa-offline-y-despliegue.md): documenta el service worker, el funcionamiento offline, la version de la app y el despliegue en GitHub Pages.

## Ideas clave del sistema

- No hay backend propio ni base de datos remota de la aplicacion.
- La snapshot semanal y las decisiones del usuario viven en el navegador.
- El calendario visible siempre se construye desde el estado local actual.
- La sincronizacion puede actualizar la snapshot en segundo plano sin bloquear la primera renderizacion.
- El modo horario actual esta fijado a la hora local del dispositivo.
- El soporte offline depende de haber completado al menos una sincronizacion previa con datos.

## Alcance de esta carpeta

Esta carpeta documenta la implementacion actual de la web tal y como existe en el codigo. No describe roadmap, funcionalidades futuras ni integraciones no implementadas.
