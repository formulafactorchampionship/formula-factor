# Relay de LIVE TIMING (Cloud Run)

`formulafactorchampionship.eu` se sirve desde GitHub Pages, que es **estático**: no
puede mantener abierto el websocket del panel del juego. Este servicio sí lo
mantiene y republica la señal para el navegador.

| Endpoint | Para qué |
| --- | --- |
| `GET /api/live-timing/stream` | Server-Sent Events con el JSON del panel |
| `GET /api/live-timing/records?track=X&config=Y` | tiempos guardados (histórico + sesión actual) |
| `GET /health` | estado de la conexión con el panel |

No tiene dependencias (solo `node:http` + `node:tls`), así que la imagen es
minúscula y el build tarda segundos.

---

## 1. Activar facturación

Cloud Run exige una cuenta de facturación con tarjeta, no hay forma de usarlo con
el plan gratuito de Firebase. Para el proyecto de Firebase del sitio eso es
pasarlo al plan **Blaze**:

1. Consola de Firebase → ⚙️ → **Uso y facturación** → **Detalles y
   configuración** → **Modificar plan** → Blaze.
2. En Google Cloud, pon una **alerta de presupuesto** para que avise (no corta el
   servicio, solo avisa). Desde la consola: Facturación → **Presupuestos y
   alertas** → Crear presupuesto. O por comando:

   ```powershell
   gcloud billing accounts list
   gcloud billing budgets create --billing-account=TU_BILLING_ID `
     --display-name="Aviso relay" --budget-amount=3EUR
   ```

Coste esperado con este diseño (el panel solo se escucha mientras hay alguien
viendo la web):

| Uso | Coste |
| --- | --- |
| Nadie mirando | 0 € — la instancia se apaga y el socket se cierra |
| Hasta 50 h de directo al mes | 0 € (nivel gratuito de Cloud Run) |
| 2 h al día (~60 h/mes) | ≈ 1 €/mes |

El nivel gratuito de Cloud Run es de **180.000 vCPU-segundos + 360.000
GiB-segundos + 2 millones de peticiones al mes** por cuenta de facturación, y se
renueva cada mes. Compilar la imagen entra en los 120 min/día gratis de Cloud
Build.

> Si prefieres no tocar el proyecto de Firebase, crea un proyecto de Google Cloud
> aparte solo para el relay: mismo coste y Firestore se queda con el tope duro
> del plan Spark.

## 2. La CLI (o Cloud Shell, sin instalar nada)

**Opción A — Cloud Shell** (recomendada, cero instalación): en la consola de
Google Cloud pulsa el icono `>_` (arriba a la derecha). Ya trae `gcloud` y `git`:

```bash
git clone https://github.com/formulafactorchampionship/formula-factor.git
cd formula-factor
```

**Opción B — en tu PC**: `winget install --id Google.CloudSDK -e` y abrir una
consola nueva (para que el `PATH` se actualice).

En cualquiera de las dos no hace falta Docker: `gcloud run deploy --source .`
compila en la nube con Cloud Build.

## 3. Desplegar

Desde la raíz del repositorio:

```powershell
gcloud auth login
gcloud projects list                       # el ID del proyecto de Firebase
gcloud config set project TU_PROJECT_ID

gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

gcloud run deploy ffc-live-relay `
  --source . `
  --region europe-west1 `
  --allow-unauthenticated `
  --timeout 3600 `
  --memory 256Mi `
  --cpu 1 `
  --min-instances 0 `
  --max-instances 1 `
  --port 8080 `
  --set-env-vars "ALLOWED_ORIGINS=https://formulafactorchampionship.eu,https://formulafactorchampionship.github.io,http://localhost:3000"
```

En Cloud Shell (bash) lo mismo en una línea, cambiando las `` ` `` por `\`.

Al terminar, la CLI imprime la `Service URL`, del estilo
`https://ffc-live-relay-xxxxxxxxxx-ew.a.run.app`. Comprobar que responde:

```powershell
curl https://ffc-live-relay-xxxxxxxxxx-ew.a.run.app/health
```

## 4. Conectar la web

En `index.html` está la etiqueta que apunta al relay:

```html
<meta name="ffc-live-timing-relay" content="">
```

Poner ahí la Service URL (sin barra final), subir el `?v=` de `style.css` /
`script.js` y hacer push. Vacío = mismo origen (como en local). Si el relay no
responde, la web no se rompe: cae sola al fichero publicado
`live_timing_records.json` y muestra "SIN RETRANSMISIÓN".

## 5. Dominio propio (opcional pero recomendado)

Así la dirección no cambia nunca, aunque borres y vuelvas a crear el servicio:

```powershell
gcloud run domain-mappings create `
  --service ffc-live-relay `
  --domain relay.formulafactorchampionship.eu `
  --region europe-west1
```

La CLI devuelve los registros DNS que hay que añadir en el proveedor del
dominio. Después se pone `https://relay.formulafactorchampionship.eu` en la
etiqueta del paso 4.

## 6. Cómo encaja el coste

El relay **solo mantiene la conexión con el panel mientras hay alguien viendo
la web**. Cuando se cierra la última pestaña, espera `IDLE_MS` (60 s por
defecto) y corta la conexión; con `--min-instances 0` la instancia se apaga y
no se factura nada. Con `--cpu 1` y 256 MiB, un par de horas de retransmisión
al día caben dentro del nivel gratuito de Cloud Run.

## 7. Operación

```powershell
# Estado de la conexión con el panel
curl https://TU-SERVICIO/health

# Logs
gcloud run services logs read ffc-live-relay --region europe-west1 --limit 50

# Redesplegar tras un cambio en relay/ o en los módulos compartidos
gcloud run deploy ffc-live-relay --source . --region europe-west1
```

Variables de entorno soportadas:

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `PORT` | `8080` | la inyecta Cloud Run |
| `ALLOWED_ORIGINS` | `*` | orígenes autorizados (CORS), separados por comas |
| `IDLE_MS` | `60000` | ms que se mantiene la conexión sin nadie mirando |
| `UPSTREAM_HOST` / `UPSTREAM_PORT` / `UPSTREAM_PATH` | `fr.assettohosting.com` / `60290` / `/api/race-control` | panel del juego |
| `PUBLISHED_RECORDS_URL` | `https://formulafactorchampionship.eu/live_timing_records.json` | fichero con el histórico, para que la API nunca sepa menos que la web |
| `PUBLISHED_REFRESH_MS` | `600000` | cada cuánto se relee ese fichero |

## 8. Detalles que conviene saber

- **Corte cada hora:** Cloud Run cierra cualquier petición a los 60 minutos, así
  que el `EventSource` se reconecta solo (con `retry: 3000`) y no se nota.
- **Arranque en frío:** la primera visita tras un rato sin nadie tarda 1-3 s en
  pintar el directo; mientras tanto la web muestra los récords publicados.
- **Un solo visitante basta:** todos los navegadores de la misma instancia
  comparten la conexión con el panel (esa es la razón de `--max-instances 1`).
- **El fichero `live_timing_records.json` sigue mandando** en la web pública: lo
  regenera cada 15 minutos la GitHub Action, y el relay solo lo relee para
  enriquecer la API con los tiempos de la sesión en curso.
