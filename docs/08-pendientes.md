# 08 — Pendientes y deuda técnica

## Entregable del Laboratorio 14

| Criterio | Estado | Evidencia |
|---|---|---|
| Stack con redes `front`/`back` | ✅ | [`docker-compose-network.yml`](../docker-compose-network.yml), [`redes.txt`](salidas/redes.txt) |
| `back` con `internal: true` | ✅ | [`redes.txt`](salidas/redes.txt), [`02-panel-redes.png`](capturas/02-panel-redes.png) |
| `web` no resuelve ni alcanza `db` | ✅ | [`segmentacion.txt`](salidas/segmentacion.txt) |
| `api` sí alcanza `db` | ✅ | [`segmentacion.txt`](salidas/segmentacion.txt) |
| DNS `web.local`, `api.local`, `db.local` | ✅ | [`segmentacion.txt`](salidas/segmentacion.txt) |
| `web` responde HTTP 200 | ✅ | [`segmentacion.txt`](salidas/segmentacion.txt) |
| `./scripts/verificar.sh` = 7 OK, 0 FALLO | ✅ | [`terminal-segmentacion.png`](capturas/terminal-segmentacion.png) |
| Acceso público con contraseña | ✅ | [`gateway.txt`](salidas/gateway.txt) |
| App visual con estado en vivo | ✅ | [`01-panel-escritorio.png`](capturas/01-panel-escritorio.png) |
| Captura del stack y redes **dentro** de Portainer | ✅ | [servicios](capturas/07-portainer-servicios.png) y [redes](capturas/08-portainer-redes.png) |

## Evidencia ya cerrada

### Gateway versionado en el repositorio ✅

El compose, el `nginx.conf` y las instrucciones están en
[`infra/gateway/`](../infra/gateway/):

- [`docker-compose.yml`](../infra/gateway/docker-compose.yml) con
  `network_mode: host`.
- [`nginx.conf`](../infra/gateway/nginx.conf) con Basic Auth en `9000`, `8088` y
  `9090`.
- [`README.md`](../infra/gateway/README.md) con la preparación del `.htpasswd`,
  el mapa de puertos y el túnel.
- [`.gitignore`](../infra/gateway/.gitignore) que excluye `.htpasswd` y
  `gateway.pass`.

Así, `git clone` + las instrucciones permiten reproducir el gateway sin
secretos. El detalle está en [`05-gateway-tunel.md`](05-gateway-tunel.md).

### Capturas internas de Portainer ✅

Se capturaron con sesión iniciada y filtro de búsqueda:

- [`07-portainer-servicios.png`](capturas/07-portainer-servicios.png):
  `portainer_portainer`, `replicated 1/1`, puerto `9001:9000`.
- [`08-portainer-redes.png`](capturas/08-portainer-redes.png):
  `lab14-segmentado_front`, `lab14-segmentado_back` y `lab14-plano_plana`.

El script `scripts/docs/capturar-pantallas.js` hace login por CDP, filtra y
captura. La vista *Stacks* queda vacía porque el stack se creó por CLI y
Portainer no lo registró en su BD; los servicios y las redes son la evidencia
real. Detalle en [`05-gateway-tunel.md`](05-gateway-tunel.md).

## Prioridad 1 — pendientes críticos

### 1. Cloudflare Access como segunda capa

**Estado:** bloqueado. No hay API token ni `cert.pem`, así que no se puede
configurar por API ni editar el ingress desde aquí. Se puede hacer a mano en el
panel de Cloudflare.

**Propuesta:** una aplicación de Access para `app-red.ponciop.online` con OTP
por correo o Google/GitHub, además del Basic Auth. Para `cluster-red`, evaluar
si conviene migrarlo también al gateway (implica mover Portainer; ver riesgo
aceptado).

**Criterio de aceptación:** un navegador sin sesión de Access recibe la pantalla
de Access antes de llegar al gateway.

### 2. Fijar versiones de imágenes

Actualmente:

| Imagen | Tag | Riesgo |
|---|---|---|
| `portainer/portainer-ce` | `latest` | actualización silenciosa |
| `nginx` | `alpine` | rebuild con otra versión |
| `postgres` | `13-alpine` | parches menores |
| `dnsmasq` | `4km3/dnsmasq:2.85-r2` | ya fijado |
| `python` (API) | ver `Dockerfile.api` | revisar |

**Acción:** fijar digests o versiones exactas antes de congelar el entregable y
probar el redeploy. No se hizo para no romper el entorno durante la sesión.

### 3. Respaldo programado y probado

El procedimiento está en [06-operacion.md](06-operacion.md), pero no hay cron ni
restauración verificada. Añadir:

```bash
# /etc/cron.d/lab14-backup
0 3 * * * kernel docker exec db pg_dump -U appuser -d appdb \
  | gzip > /home/kernel/backups/lab14-db-$(date +\%F).sql.gz
```

**Criterio de aceptación:** un archivo diario, `gzip -t` OK y una restauración
de prueba en un contenedor desechable.

## Prioridad 2 — calidad y operación

### 4. Persistir las pruebas de interfaz

Las 21 comprobaciones de la app se hicieron con CDP durante el desarrollo, pero
no quedaron como script. Moverlas a `scripts/docs/test-ui.js` y ejecutarlas antes
de cada commit de `web/`.

**Criterio de aceptación:** `node scripts/docs/test-ui.js` devuelve `21 OK, 0
fallos` y falla con código distinto de cero si algo se rompe.

### 5. Monitoreo y alertas

No hay alertas si se cae la API o el túnel. Opciones:

- Un cron que ejecute `./scripts/verificar.sh` y avise por correo/Telegram.
- Uptime Kuma en otro stack (no en `back`).
- Healthchecks de Docker ya existen; falta el aviso externo.
- Vigilar el disco (`df -h /var/lib/docker`) y el crecimiento de logs.

**Criterio de aceptación:** si se para `api`, llega una notificación en menos de
5 minutos.

### 6. Rotación de credenciales

- Basic Auth: `lab14` → rotar y actualizar `~/.config/lab14/gateway.pass`.
- Portainer: `admin` → rotar desde la UI.
- PostgreSQL: el usuario `appuser` y su contraseña están en el compose; para
  producción, usar Docker secrets y no versionar la contraseña.
- Token de worker: `docker swarm join-token --rotate worker`.

**Criterio de aceptación:** las credenciales nuevas funcionan y las viejas ya no.

### 7. Limpieza del stack plano

`web-planos` y `db-planos` siguen arriba para demostrar “el problema”. Si ya no
se necesita:

```bash
docker compose -f docker-compose-network-planos.yml down -v --remove-orphans
```

Mantenerlo solo si se va a exponer la comparación en clase.

## Riesgos aceptados

| Riesgo | Por qué se aceptó | Mitigación actual |
|---|---|---|
| `cluster-red` no pasa por Basic Auth | Se decidió no mover Portainer | login propio de Portainer; TLS de Cloudflare |
| `9001` escucha en `0.0.0.0` y `[::]` | Portainer se usa también desde la LAN | login de Portainer; firewall de la red local |
| `web` directo en `127.0.0.1:8080` sin auth | Solo loopback, útil para depurar | no se publica en la LAN |
| Contraseña de PostgreSQL en el compose | Entorno de laboratorio | volumen local; cambiar si se publica |

## Ideas para clase (opcional)

- Comparar en vivo el stack plano (`web-planos` alcanza `db-planos`) contra el
  segmentado.
- Escalar la API en Swarm (`docker service scale`) para mostrar el límite del
  stack compose.
- Añadir una segunda API en el worker con labels y constraints.
- Medir latencia del túnel vs loopback con `curl -w`.
- Explicar el `X-Forwarded-For` de Cloudflare en los logs de `web`.

## Definición de “terminado”

El laboratorio se considera cerrado cuando:

1. `./scripts/verificar.sh` da **7 OK, 0 FALLO**.
2. `./scripts/capturar-docs.sh` termina sin errores y genera 9 transcripciones +
   17 imágenes.
3. La app pública responde `401` sin credenciales y `200` con credenciales.
4. Existe una captura del stack y las redes **dentro** de Portainer.
5. `git status` está limpio y `docs/` está commiteado.

Hoy se cumplen los cinco puntos.
