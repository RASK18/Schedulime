# Validador de streaming en Cloudflare Workers

Schedulime mantiene el frontend en GitHub Pages y utiliza un Cloudflare Worker pequeno para consultar los datos de disponibilidad de los enlaces de streaming. Es un proxy transparente pero no generico: solo acepta un `slug` y un numero de episodio, siempre consulta el host y la ruta previstos por la aplicacion, y devuelve sin interpretar el cuerpo y el estado HTTP de AnimeAV1.

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
https://schedulime-streaming-validator.<subdominio>.workers.dev/v2/availability
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
VITE_STREAMING_VALIDATOR_URL=http://localhost:8787/v2/availability
```

En otra terminal, iniciar la aplicacion:

```powershell
npm run dev
```

El Worker permite los origenes de desarrollo `http://localhost:5173` y `http://localhost:4173`, ademas de los origenes de produccion `https://rask18.github.io` y `https://disboard.es`.

## Prueba rapida

Sustituir el subdominio por el asignado por Cloudflare:

```powershell
Invoke-RestMethod 'https://schedulime-streaming-validator.<subdominio>.workers.dev/v2/availability?slug=rezero-kara-hajimeru-isekai-seikatsu-4th-season&episode=2'
```

La respuesta debe ser el JSON original de AnimeAV1. Por ejemplo, una respuesta con error interno se conserva completa:

```json
{
  "type": "data",
  "nodes": [
    null,
    {
      "type": "error",
      "error": {
        "message": "Internal Error"
      }
    }
  ]
}
```

El Worker anade las cabeceras `X-Upstream-Status`, `X-Upstream-URL` y `X-Worker-Cache` para facilitar el diagnostico. Actualmente `X-Worker-Cache` siempre es `BYPASS`: cada validacion consulta AnimeAV1 y la respuesta utiliza `Cache-Control: no-store`.

El frontend interpreta el JSON transparente. Cualquier nodo con `type: "error"` se considera no disponible, incluso si AnimeAV1 responde con HTTP 200. Un fallo de red o una respuesta no exitosa sin ese nodo produce estado `unknown` en la interfaz.

## Despliegues posteriores

Mientras Wrangler siga autenticado, basta con ejecutar:

```powershell
npm run worker:deploy
```

Si mas adelante se automatiza este despliegue mediante GitHub Actions, las credenciales de Cloudflare deben guardarse como secretos `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`, nunca dentro del repositorio.
