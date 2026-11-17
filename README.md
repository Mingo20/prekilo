# Prekilo

PWA de energía prepago de Edesur. Muestra en grande los **kWh disponibles**, los **días y horas de luz** que quedan, la barra de progreso regresiva y el consumo real que reporta el medidor, con notificaciones push cuando el saldo baja del umbral.

Aplicación personal para el NIC **7014973** (Edesur, Santo Domingo).

## Cómo está hecha

| Capa | Tecnología |
| --- | --- |
| Interfaz | HTML + CSS + JavaScript sin dependencias, dos layouts (móvil vertical tipo app nativa, escritorio horizontal tipo web) |
| Sin internet | Service Worker + IndexedDB: la app arranca y navega completa sin red y recalcula el saldo con el promedio real |
| Backend | Deno (Base44 functions, `prekiloApi`) — consulta el reporte oficial de teleconsumo de Edesur con solo el NIC |
| Datos en la nube | Base44 (entidades `PkEstado`, `PkConsumoDia`, `PkRecarga`, `PkSuscripcion`) |
| Hosting | GitHub Pages (`main`, raíz del repo) |
| Notificaciones | Web Push (VAPID) enviadas por el backend Deno |

## De dónde salen los datos

1. `teleconsumoapi.edesur.com.do/teleconsumos/GenerarURL?FechaReporte=dd/mm/aaaa&Nic=<NIC>` devuelve un hash de sesión.
2. `teleconsumoapi.edesur.com.do/teleconsumos/GetDataTeleconsumoHash?hash=<hash>` devuelve el reporte: cliente, medidor, consumo diario y mensual, promedios y escala de precios.

No hace falta usuario ni clave. El hash caduca, y se regenera en cada consulta: por eso la sincronización diaria de las 2:00 p. m. siempre obtiene datos frescos.

## Cálculo del saldo

El medidor publica el consumo con un día de retraso. El saldo se calcula así:

```
saldo = ancla_kWh + recargas − consumo_medido_desde_ancla − estimado_del_día_en_curso
```

El **ancla** es el último saldo real conocido (el que muestra el medidor). Se puede recalibrar desde Ajustes → "Saldo real del medidor". El estimado usa el promedio de los últimos 7 días medidos.

## API (`prekiloApi`)

`POST https://ca-68f01a11.base44.app/functions/prekiloApi`

| action | qué hace |
| --- | --- |
| `state` | saldo, días, horas, porcentaje, historial y configuración |
| `sync` | consulta Edesur y guarda el consumo diario del medidor |
| `daily` | sync + push si el saldo está por debajo del umbral (lo llama el trabajo de las 2 p. m.) |
| `recarga` | `{kwh, monto_rd?}` registra una recarga |
| `reanclar` | `{kwh, ts?}` fija el saldo real del medidor |
| `config` | `{umbral, recarga_habitual}` |
| `subscribe` | guarda la suscripción push del navegador |
| `pushTest` | envía una notificación de prueba |

## Migrar el backend a Deno Deploy

En `server/prekiloApi.ts` está el mismo backend listo para Deno Deploy (sin cuenta todavía). Para publicarlo:

```bash
deployctl deploy --project=prekilo server/prekiloApi.ts
```

Solo hay que cambiar el almacenamiento: hoy usa las entidades de Base44; en Deno Deploy puede usar `Deno.openKv()` o seguir llamando a las entidades de Base44 por REST con una API key.

## Instalación en el teléfono

Android (Chrome): abrir https://mingo20.github.io/prekilo/ → menú ⋮ → *Instalar aplicación*.
iPhone (Safari): Compartir → *Añadir a pantalla de inicio*. Las notificaciones push en iOS solo funcionan desde la app instalada (iOS 16.4+).

## Desarrollo local

```bash
python3 -m http.server 8080
# abrir http://localhost:8080
```
