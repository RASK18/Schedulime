# Validador de streaming en Cloudflare Workers

Schedulime mantiene el frontend en GitHub Pages y utiliza un Cloudflare Worker pequeno para validar la disponibilidad de los enlaces de streaming. El Worker no es un proxy generico: solo acepta un `slug` y un numero de episodio, y siempre consulta el host y la ruta previstos por la aplicacion.

## Primer despliegue

Desde la raiz del repositorio:

```powershell
npm install
npx wrangler login --use-keyring
npx wrangler whoami
npm run worker:deploy
```

El inicio de sesion abre el navegador para autorizar Wrangler en la cuenta de Cloudflare. El despliegue devuelve una URL similar a:

```text
https://schedulime-streaming-validator.<subdominio>.workers.dev
```

El endpoint completo que necesita el frontend es:

```text
https://schedulime-streaming-validator.<subdominio>.workers.dev/v1/availability
```

## Conectar GitHub Pages

En el repositorio de GitHub:

1. abrir `Settings > Secrets and variables > Actions`;
2. seleccionar la pestana `Variables`;
3. crear la variable de repositorio `VITE_STREAMING_VALIDATOR_URL`;
4. asignarle la URL completa del endpoint del Worker;
5. volver a ejecutar el workflow `Deploy GitHub Pages` o hacer un nuevo despliegue de `main`.

La URL no es un secreto. El workflow la incorpora a la build de Vite.

## Desarrollo local

En una terminal:

```powershell
npm run worker:dev
```

Crear un archivo `.env.local` con:

```dotenv
VITE_STREAMING_VALIDATOR_URL=http://localhost:8787/v1/availability
```

En otra terminal, iniciar la aplicacion:

```powershell
npm run dev
```

El Worker permite los origenes de desarrollo `http://localhost:5173` y `http://localhost:4173`, ademas del origen de produccion `https://rask18.github.io`.

## Prueba rapida

Sustituir el subdominio por el asignado por Cloudflare:

```powershell
Invoke-RestMethod 'https://schedulime-streaming-validator.<subdominio>.workers.dev/v1/availability?slug=rezero-kara-hajimeru-isekai-seikatsu-4th-season&episode=2'
```

La respuesta debe contener uno de estos estados:

```json
{ "state": "available" }
```

`unknown` indica que el origen no pudo comprobarse o devolvio una respuesta inesperada; no bloquea el enlace en la interfaz.

## Despliegues posteriores

Mientras Wrangler siga autenticado, basta con ejecutar:

```powershell
npm run worker:deploy
```

Si mas adelante se automatiza este despliegue mediante GitHub Actions, las credenciales de Cloudflare deben guardarse como secretos `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`, nunca dentro del repositorio.
