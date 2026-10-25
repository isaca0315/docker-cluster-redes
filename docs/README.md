# Laboratorio 14 — Docker Swarm, segmentación y panel visual

Documentación completa del laboratorio levantado en **kernel-lab**
(UTP, Redes de Computadoras). Incluye el clúster Swarm, Portainer, el stack
segmentado `front`/`back`, el DNS interno, la aplicación visual y la cadena de
exposición por túnel con Basic Auth.

> **Estado:** operativo y verificado el **2026-10-25** (transcripciones
> 22:15–22:16 UTC; capturas entre 22:13 y 22:16 UTC).
> `./scripts/verificar.sh` → **7 OK, 0 FALLO**.

## Accesos

| Qué | URL | Protección |
|---|---|---|
| App del laboratorio | <https://app-red.ponciop.online/> | Basic Auth del gateway |
| API a través de la app | `https://app-red.ponciop.online/api/*` | Basic Auth del gateway |
| Portainer | <https://cluster-red.ponciop.online/> | login propio de Portainer |
| App en local | <http://127.0.0.1:8088/> | Basic Auth del gateway |
| Portainer en local | <http://127.0.0.1:9090/portainer/> | Basic Auth del gateway |
| App directa (sin auth) | <http://127.0.0.1:8080/> | solo loopback |

Las credenciales están en `~/.config/lab14/credentials.txt` (modo `600`).
Este repositorio **no** contiene contraseñas: en los comandos se usan
`$GATEWAY_USER` y `$GATEWAY_PASS`.

## Índice

| # | Página | Contenido |
|---|---|---|
| 01 | [Arquitectura](01-arquitectura.md) | Componentes, topología, flujo de una petición y decisiones de diseño |
| 02 | [Despliegue](02-despliegue.md) | Swarm, worker, Portainer, stack segmentado, gateway y túnel, paso a paso |
| 03 | [Redes y segmentación](03-redes-segmentacion.md) | `front`/`back`, `internal: true`, DNS interno y las 7 pruebas |
| 04 | [Aplicación visual](04-aplicacion.md) | Panel animado, pestañas, endpoints, polling y validación |
| 05 | [Gateway y túnel](05-gateway-tunel.md) | Basic Auth, mapa de puertos, Cloudflare Tunnel y riesgos |
| 06 | [Operación](06-operacion.md) | Runbook: estado, logs, reinicios, respaldo y regeneración de docs |
| 07 | [Troubleshooting](07-troubleshooting.md) | Problemas reales encontrados y su causa raíz |
| 08 | [Pendientes](08-pendientes.md) | Entregable, deuda técnica y siguientes pasos |

## Evidencia reproducible

Todo lo que aparece en esta documentación se genera con un solo comando:

```bash
./scripts/capturar-docs.sh              # transcripciones + capturas
./scripts/capturar-docs.sh --sin-pantallas   # solo transcripciones
```

- **Requisitos:** `docker`, `curl`, `python3`, `jq`, Google Chrome y Node.js.
- **Contraseña del gateway:** se lee de `~/.config/lab14/gateway.pass` o de
  `$GATEWAY_PASS`; nunca se escribe en los archivos.
- **Portainer:** las capturas autenticadas usan `PORTAINER_PASS` o la clave de
  `~/.config/lab14/credentials.txt`; tampoco se escribe en `docs/`.
- **Salidas crudas:** [`salidas/`](salidas/) — 9 transcripciones de terminal.
- **Imágenes:** [`capturas/`](capturas/) — 17 capturas (app, Portainer y
  terminales renderizadas).

### Transcripciones

| Archivo | Comando principal | Imagen |
|---|---|---|
| [`salidas/entorno.txt`](salidas/entorno.txt) | `date`, `uname`, `docker version`, `ss -ltn` | [terminal](capturas/terminal-entorno.png) |
| [`salidas/swarm.txt`](salidas/swarm.txt) | `docker node ls`, `docker stack ls`, `docker service ls` | [terminal](capturas/terminal-swarm.png) |
| [`salidas/contenedores.txt`](salidas/contenedores.txt) | `docker ps`, `docker stats` | [terminal](capturas/terminal-contenedores.png) |
| [`salidas/redes.txt`](salidas/redes.txt) | `docker network inspect` de `front` y `back` | [terminal](capturas/terminal-redes.png) |
| [`salidas/segmentacion.txt`](salidas/segmentacion.txt) | `./scripts/verificar.sh`, `getent`, `nc`, `nslookup` | [terminal](capturas/terminal-segmentacion.png) |
| [`salidas/api.txt`](salidas/api.txt) | `curl /api/health`, `/api/db`, `/api/info` | [terminal](capturas/terminal-api.png) |
| [`salidas/gateway.txt`](salidas/gateway.txt) | `curl` 401/200 local y público | [terminal](capturas/terminal-gateway.png) |
| [`salidas/portainer.txt`](salidas/portainer.txt) | API de Portainer: `stacks`, `endpoints`, `services`, `networks` | [terminal](capturas/terminal-portainer.png) |
| [`salidas/logs.txt`](salidas/logs.txt) | `docker logs web`, `api`, Portainer | [terminal](capturas/terminal-logs.png) |

### Capturas de la aplicación

| Imagen | Qué muestra |
|---|---|
| [`01-panel-escritorio.png`](capturas/01-panel-escritorio.png) | Pestaña Infraestructura completa (1440 px) |
| [`02-panel-redes.png`](capturas/02-panel-redes.png) | Pestaña Redes: subredes, IPs y pruebas |
| [`03-panel-desarrollo.png`](capturas/03-panel-desarrollo.png) | Pestaña Desarrollo: endpoints y JSON real |
| [`04-panel-movil.jpg`](capturas/04-panel-movil.jpg) | Vista móvil a 390 px |
| [`05-diagrama.png`](capturas/05-diagrama.png) | Diagrama SVG aislado |
| [`06-portainer-login.png`](capturas/06-portainer-login.png) | Pantalla de login de Portainer |
| [`07-portainer-servicios.png`](capturas/07-portainer-servicios.png) | Servicios del Swarm vistos en Portainer |
| [`08-portainer-redes.png`](capturas/08-portainer-redes.png) | Redes `lab14` vistas en Portainer |

## Cómo leer los datos

- Los **nombres, IPs, versiones y salidas** son los del entorno real. Si
  reconstruyes el laboratorio, algunos valores (IDs de tarea, hostname del
  contenedor, uptime, IP pública de origen) cambiarán.
- Las terminales se renderizaron a partir de las transcripciones y se
  fotografiaron con Chrome a la **altura real** del contenido, sin recortes.
- La app se capturó a través del gateway con Basic Auth; Portainer se capturó
  por loopback (`127.0.0.1:9001`) porque sus bundles superan los 10 MB y por el
  túnel tardan más que el presupuesto del navegador headless. El acceso real
  documentado sigue siendo el túnel.
- La fecha de generación está en `salidas/entorno.txt`.

## Estructura de esta carpeta

```text
docs/
├── README.md                  # este índice
├── 01-arquitectura.md         # componentes y flujos
├── 02-despliegue.md           # cómo se construyó
├── 03-redes-segmentacion.md   # aislamiento y DNS
├── 04-aplicacion.md           # panel visual
├── 05-gateway-tunel.md        # exposición segura
├── 06-operacion.md            # día a día
├── 07-troubleshooting.md      # problemas y soluciones
├── 08-pendientes.md           # lo que falta
├── capturas/                  # 17 PNG/JPG
└── salidas/                   # 9 transcripciones .txt
```
