<div align="center">

<img src="https://raw.githubusercontent.com/Mingo20/dtech/main/assets/brand/dg-logo-512.png" width="84" alt="DGTech" />

# SuperKilo

**Control del consumo eléctrico de Edesur para cualquier contrato dominicano, prepago o por factura, usando solo el número de contrato.**

![Versión](https://img.shields.io/badge/versión-2.4.0-FF6A13?style=flat-square) ![Estado](https://img.shields.io/badge/estado-Producción-2EA44F?style=flat-square) ![Tipo](https://img.shields.io/badge/tipo-PWA_%2B_backend_Base44-0B2545?style=flat-square) ![DGTech](https://img.shields.io/badge/by-DGTech-FF6A13?style=flat-square)

[**Abrir la aplicación**](https://mingo20.github.io/prekilo/) · [Hub DGTech](https://mingo20.github.io/dtech/) · [Guía para agentes](AGENTS.md) · [Cambios](CHANGELOG.md)

<img src="https://raw.githubusercontent.com/Mingo20/dtech/main/assets/shots/superkilo.jpg" alt="SuperKilo" width="720" />

</div>

## El problema

Los clientes de Edesur no ven su consumo real, no saben si una factura es justa y se enteran de las irregularidades tarde. Más del 80 % de los reclamos en RD son por facturación alta y la causa más común es la lectura estimada.

## Qué hace

- Registro con WhatsApp y número de contrato (un contrato por cuenta, validado en servidor)
- Detección automática del tipo de contrato (prepago o factura) y adaptación de la interfaz
- Consumo acumulado con ventanas de 3, 7 y 30 días, sin registro manual de recargas
- Semáforo de consumo atípico y proyección de factura con la escala real de Edesur
- Ficha del contrato: medidor, lecturas, promedios, histórico por período y parámetros del reporte
- Histórico del medidor plegable, mapa de puntos de pago y hoja de reporte de avería
- Alertas push con seis interruptores independientes: atípico, estimada, medidor, sin datos, proyección y resumen diario

## Cómo está construido

**Tipo:** PWA + backend Base44

PWA estática en GitHub Pages que llama a funciones Base44. Un workflow a la 1:00 a. m. (hora de RD) sincroniza todas las cuentas, evalúa los escenarios de alerta y envía los push.

**Tecnologías**

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

## Datos sensibles

Datos personales de terceros: nombre, dirección y consumo asociados a un NIC. El acceso es por token de dispositivo, sin contraseña.

## Reglas del proyecto

- Las horas se muestran en formato 12 h dominicano (9:45 p.m.)
- En prepago NO se pide registrar recargas: el indicador muestra consumo acumulado creciente
- Los kWh disponibles NO son un saldo oficial de Edesur: se estiman y se corrigen al publicarse el día
- Los reportes de Edesur llevan un día de atraso
- Diseño: fondo blanco, grises claros, acentos naranja y azul marino

## Pendientes conocidos

- Verificar el WhatsApp con un código antes de crear la cuenta
- Cifrar los tokens en reposo
- Deuda, facturas y pagos requieren sesión en la oficina virtual de Edesur

## Estructura del repositorio

Consulta [AGENTS.md](AGENTS.md) para el mapa de archivos y las instrucciones de trabajo.

## Parte de DGTech

Este proyecto forma parte del ecosistema **DGTech**, un estudio de software dominicano que construye aplicaciones instalables para resolver problemas reales. Todas las aplicaciones están en [https://mingo20.github.io/dtech/](https://mingo20.github.io/dtech/).

---

<sub>© 2026 DGTech · Domingo Guerra · Todos los derechos reservados. Consulta el archivo NOTICE.</sub>
