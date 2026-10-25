# 06 — Operación

Runbook para el día a día. Todos los comandos se ejecutan en **kernel-lab** y
asumen el repositorio en `~/docker-cluster-redes`.

## Chequeo de 30 segundos

```bash
cd ~/docker-cluster-redes

docker node ls
docker stack services portainer
docker compose -f docker-compose-network.yml ps
./scripts/verificar.sh

curl -s -o /dev/null -w 'app local   %{http_code}\n' -u "$GATEWAY_USER:$GATEWAY_PASS" http://127.0.0.1:8088/
curl -s -o /dev/null -w 'app pública %{http_code}\n' -u "$GATEWAY_USER:$GATEWAY_PASS" https://app-red.ponciop.online/
curl -s -o /dev/null -w 'portainer   %{http_code}\n' https://cluster-red.ponciop.online/
```

Estado normal esperado:

| Comprobación | Esperado |
|---|---|
| `docker node ls` | 2 nodos `Ready`, manager `Leader` |
| `docker stack services portainer` | `1/1` |
| `docker compose ps` | `web`, `api`, `db` en `healthy`; `dnsmasq` arriba |
| `./scripts/verificar.sh` | `7 OK, 0 FALLO` |
| App local/pública | `200` con auth |
| Portainer | `200` |

## Estado de los servicios

```bash
# Contenedores y salud
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

# Replicas del stack Swarm
docker service ls
docker service ps portainer_portainer

# Salud detallada
docker inspect --format '{{.Name}} → {{.State.Health.Status}}' web api db

# Consumo
docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'
```

Consumo observado (puede variar):

| Contenedor | CPU | Memoria |
|---|---|---|
| `web` | 0.00 % | 4.1 MiB |
| `api` | 0.02 % | 20.7 MiB (límite 512 MiB) |
| `db` | 0.00 % | 22.3 MiB |
| `dnsmasq` | 0.00 % | 584 KiB |
| `portainer` | 0.00 % | 19.1 MiB |
| `lab14-gateway` | 0.00 % | 3.4 MiB |

Evidencia: [`salidas/contenedores.txt`](salidas/contenedores.txt).

## Healthchecks

| Servicio | Prueba | Intervalo |
|---|---|---|
| `web` | `wget http://127.0.0.1/` | 30 s |
| `api` | `requests.get('http://localhost:5000/health')` | 30 s |
| `db` | `pg_isready -U appuser -d appdb` | 30 s |

> `web` usa `127.0.0.1` a propósito: con `localhost` el healthcheck fallaba
> porque el contenedor resuelve `localhost` a `::1` y no tiene IPv6. Ver
> [07-troubleshooting.md](07-troubleshooting.md).

## Logs

```bash
docker logs web --tail 50 -f
docker logs api --tail 50 -f
docker logs db --tail 50 -f
docker logs lab14-gateway --tail 50 -f
docker service logs portainer_portainer --tail 50 -f
```

Los logs de `web` muestran el usuario de Basic Auth y la IP de origen
(Cloudflare añade `X-Forwarded-For`):

```text
172.28.10.1 - lab14 [25/Oct/2026:22:16:02 +0000] "GET /api/db HTTP/1.1" 200 43
  "-" "curl/8.5.0" "190.219.101.129, 127.0.0.1"
172.28.10.1 - lab14 [25/Oct/2026:22:16:03 +0000] "GET /api/info HTTP/1.1" 200 215
  "https://app-red.ponciop.online/" "Mozilla/5.0 ..." "181.178.243.11, 127.0.0.1"
```

Evidencia: [`salidas/logs.txt`](salidas/logs.txt) ·
[`terminal-logs.png`](capturas/terminal-logs.png).

El log de Portainer muestra un aviso esperado: `/status` está deprecado y se
debe usar `/system/status`. No es un error del laboratorio.

## Reinicios y actualizaciones

### App estática (HTML/CSS/JS)

```bash
# web/ está montado en solo lectura: no hay que reconstruir
vim web/app.js
# subir ?v= en web/index.html si hay caché
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/
```

### API (Flask)

```bash
docker compose -f docker-compose-network.yml up -d --build api
docker compose -f docker-compose-network.yml ps api
docker logs api --tail 20
```

### Stack completo

```bash
docker compose -f docker-compose-network.yml up -d
docker compose -f docker-compose-network.yml restart web api db dnsmasq
docker compose -f docker-compose-network.yml down          # sin -v: conserva datos
```

### Gateway

```bash
cd ~/lab14-gateway
docker compose up -d --force-recreate gateway
docker logs lab14-gateway --tail 20
```

Recuerda: editar `nginx.conf` **no** basta con un reload externo; el archivo se
monta al crear el contenedor.

### Portainer

```bash
# Forzar recreación de la tarea
docker service update --force portainer_portainer

# Actualizar imagen (tag flotante)
docker service update --image portainer/portainer-ce:latest portainer_portainer

# Volver a desplegar el stack
docker stack deploy -c docker-compose-portainer.yml portainer
```

### Worker

```bash
# En el manager
docker node update --availability drain ubuntu24-cwl   # mantenimiento
docker node update --availability active ubuntu24-cwl # volver

# Si hay que reincorporarlo
docker swarm leave --force        # en el worker
docker swarm join --token <TOKEN> 172.25.208.103:2377
```

## Respaldo y restauración

### Base de datos

```bash
mkdir -p ~/backups
docker exec db pg_dump -U appuser -d appdb \
  | gzip > ~/backups/lab14-db-$(date +%F-%H%M).sql.gz

# Verificar que el archivo no está vacío
ls -lh ~/backups/lab14-db-*.sql.gz
gzip -t ~/backups/lab14-db-*.sql.gz && echo "gzip OK"
```

Restauración (detener la API primero para no escribir durante el proceso):

```bash
docker compose -f docker-compose-network.yml stop api
gunzip -c ~/backups/lab14-db-2026-10-25-2200.sql.gz \
  | docker exec -i db psql -U appuser -d appdb
docker compose -f docker-compose-network.yml start api
./scripts/verificar.sh
```

### Volumen de Portainer

```bash
docker run --rm \
  -v portainer_data:/data:ro \
  -v "$PWD":/backup \
  alpine tar czf /backup/portainer-data-$(date +%F).tar.gz -C /data .
```

> Los respaldos son un procedimiento estándar; no se ejecutaron durante la
> sesión de captura. Probar la restauración en un entorno de práctica antes de
> confiar en ella.

## Regenerar la documentación

```bash
cd ~/docker-cluster-redes

# Solo transcripciones (rápido)
./scripts/capturar-docs.sh --sin-pantallas

# Transcripciones + terminales + capturas de app/Portainer
./scripts/capturar-docs.sh
```

Requisitos: `docker`, `curl`, `python3`, `jq`, Google Chrome y Node.js.
La contraseña del gateway se toma de `~/.config/lab14/gateway.pass` o
`$GATEWAY_PASS`; la de Portainer, de `~/.config/lab14/credentials.txt` o
`$PORTAINER_PASS`. No se escriben en ningún archivo de `docs/`.

Salida esperada:

```text
1/3 · Transcribiendo comandos...
2/3 · Renderizando capturas...
  terminal-entorno.png           1245x657 · 104 KB
  ...
3/3 · Capturando pantallas de la app...
Salidas:   docs/salidas/ (9 archivos)
Capturas:  docs/capturas/ (17 imágenes)
```

Después revisa `git status` y haz commit de los cambios de docs.

## Ventana de mantenimiento

Orden recomendado para parar:

```bash
# 1) cortar la entrada pública
#    (desde el panel de Cloudflare o el servicio cloudflared)
sudo systemctl stop cloudflared 2>/dev/null || true

# 2) gateway
cd ~/lab14-gateway && docker compose down

# 3) stack del laboratorio (conserva volumen)
cd ~/docker-cluster-redes
docker compose -f docker-compose-network.yml down

# 4) Portainer (conserva volumen)
docker stack rm portainer
```

Para volver, invertir el orden: Swarm → Portainer → stack → gateway → túnel.
Después ejecutar el chequeo de 30 segundos y `./scripts/verificar.sh`.

## Higiene

- Rotar la contraseña de Basic Auth si se comparte por chat/correo.
- Mantener `~/.config/lab14/*` en modo `600`.
- No commitear `.htpasswd`, `gateway.pass` ni el token de worker.
- Revisar `docker image prune` y `docker system df` de vez en cuando.
- Fijar versiones de imágenes antes de congelar el entregable.

```bash
docker system df
docker image prune -f          # solo imágenes colgantes
docker builder prune -f        # caché de build
```
