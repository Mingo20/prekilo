# AGENTS.md · SuperKilo

Guía para agentes de IA y para personas que necesiten modificar este proyecto. Léela completa antes de tocar el código.

## Contexto

- **Organización:** DGTech (República Dominicana). Fundador: Domingo Guerra.
- **Proyecto:** SuperKilo · versión actual **2.4.0** · estado **Producción**.
- **Repositorio:** `Mingo20/prekilo`
- **Aplicación en vivo:** https://mingo20.github.io/prekilo/
- **Hub del ecosistema:** https://mingo20.github.io/dtech/
- **Idioma de la interfaz y de las respuestas:** español dominicano.

## Qué resuelve

Los clientes de Edesur no ven su consumo real, no saben si una factura es justa y se enteran de las irregularidades tarde. Más del 80 % de los reclamos en RD son por facturación alta y la causa más común es la lectura estimada.

## Resumen técnico

**Tipo:** PWA + backend Base44

PWA estática en GitHub Pages que llama a funciones Base44. Un workflow a la 1:00 a. m. (hora de RD) sincroniza todas las cuentas, evalúa los escenarios de alerta y envía los push.

**Stack**

- HTML, CSS y JavaScript sin frameworks
- Service Worker y manifest (PWA instalable)
- Backend: funciones Deno en Base44
- Notificaciones: Web Push con VAPID
- Datos: API pública de teleconsumo de Edesur, solo con NIC
- Mapa: Leaflet y OpenStreetMap

**Backend**

- prekiloApi (registro, estado, sync, push)
- edekiloMedidor (ficha y lecturas)
- edekiloAlertas (escenarios de alerta)
- edekiloAvisos (preferencias por contrato)
- edekiloResumen (resumen diario)

**Datos**

- PkCuenta (whatsapp, nic, token)
- PkEstado (nic, clave, valor)
- PkConsumoDia (nic, fecha, kwh)
- PkRecarga (legado)
- PkSuscripcion (endpoint push)

## Reglas que no se pueden romper

- Las horas se muestran en formato 12 h dominicano (9:45 p.m.)
- En prepago NO se pide registrar recargas: el indicador muestra consumo acumulado creciente
- Los kWh disponibles NO son un saldo oficial de Edesur: se estiman y se corrigen al publicarse el día
- Los reportes de Edesur llevan un día de atraso
- Diseño: fondo blanco, grises claros, acentos naranja y azul marino

## Datos sensibles

Datos personales de terceros: nombre, dirección y consumo asociados a un NIC. El acceso es por token de dispositivo, sin contraseña.

## Cómo trabajar aquí

1. Lee el README y este archivo. Luego abre el código que vayas a cambiar.
2. Haz el cambio más pequeño que resuelva el problema. No reescribas lo que funciona.
3. Prueba en el navegador antes de dar algo por terminado: abre la aplicación, recorre el flujo afectado y revisa la consola.
4. Si la app tiene Service Worker, **sube el número de la caché** al cambiar archivos, o los usuarios seguirán viendo la versión vieja.
5. Registra cada cambio en `CHANGELOG.md` con la versión, la fecha y una línea clara.
6. Sube la versión según la regla: *mayor* si rompes algo, *menor* si añades una función, *parche* si corriges un error.

## Reglas de seguridad

- **Nunca** escribas contraseñas, tokens, claves de API ni PIN en el código, en los README ni en los mensajes de commit. Este repositorio es público.
- Las claves van como secretos del backend. En el navegador solo puede haber datos públicos.
- Si encuentras una credencial expuesta, avisa al dueño y recomienda rotarla antes de seguir.
- No borres datos de producción sin confirmación explícita del dueño.

## Pendientes conocidos

- Verificar el WhatsApp con un código antes de crear la cuenta
- Cifrar los tokens en reposo
- Deuda, facturas y pagos requieren sesión en la oficina virtual de Edesur

## Estilo

- Textos para el usuario en español dominicano, claros y cordiales.
- Horas en formato de 12 horas (9:45 p. m.). Fechas con el mes en letras.
- Diseño limpio, rápido y pensado primero para el celular.

## Contacto

Domingo Guerra · DGTech · WhatsApp 829-646-9885
