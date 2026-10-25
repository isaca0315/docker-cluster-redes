# 02 — Despliegue

Secuencia real seguida para reconstruir el laboratorio desde cero. Todos los
comandos se ejecutan en **kernel-lab** salvo los marcados como worker.
Los valores entre `<...>` son secretos o dependen del entorno y **no** se
guardan en el repositorio.

## 0. Requisitos

| Recurso | Valor usado |
|---|---|
| Manager | `kernel-lab` · `172.25.208.103` · Linux 6.8 · Docker 29.8.1 |
| Worker | `ubuntu24-cwl` · `172.25.208.110` · Docker 29.1.3 |
| Repositorio | `/home/kernel/docker-cluster-redes` |
| Gateway | `/home/kernel/lab14-gateway` |
| DNS interno | `172.28.10.53` |
| Túnel | Cloudflare, modo *remotely managed* |

```bash
cd ~/docker-cluster-redes
docker --version && docker compose version
chmod +x scripts/*.sh
```

## 1. Inicializar el Swarm (manager)

```bash
docker swarm init --advertise-addr 172.25.208.103
docker swarm join-token worker
```

El segundo comando imprime el `docker swarm join --token ...` que se usa en el
worker. **No copies ese token a la documentación ni al repositorio**: se
regenera con `docker swarm join-token --rotate worker`.

En el worker:

```bash
# ubuntu24-cwl
docker swarm join --token <TOKEN> 172.25.208.103:2377
```

Verificación:

```bash
docker node ls
docker info --format 'swarm={{.Swarm.LocalNodeState}} manager={{.Swarm.ControlAvailable}} nodos={{.Swarm.Nodes}}'
```

Salida real:

```text
ID                            HOSTNAME       STATUS    AVAILABILITY   MANAGER STATUS   ENGINE VERSION
qwxje8515jzlaabeab1qzu9pn *   kernel-lab     Ready     Active         Leader           29.8.1
1z32d1kilxflg1com9tqeavdl     ubuntu24-cwl   Ready     Active                          29.1.3

swarm=active manager=true nodos=2
```

Evidencia: [`salidas/swarm.txt`](salidas/swarm.txt) ·
[`terminal-swarm.png`](capturas/terminal-swarm.png).

## 2. Portainer como servicio Swarm

`docker-compose-portainer.yml` publica **9001 → 9000** y fija el servicio al
manager:

```bash
docker stack deploy -c docker-compose-portainer.yml portainer
docker stack services portainer
```

```text
NAME                  MODE         REPLICAS   IMAGE                           PORTS
portainer_portainer   replicated   1/1        portainer/portainer-ce:latest   *:9001->9000/tcp
```

El volumen `portainer_data` conserva el usuario admin y la configuración.
La primera vez se abre `http://127.0.0.1:9001/` y se crea el administrador; las
credenciales quedan en `~/.config/lab14/credentials.txt` (modo `600`).

Comprobación:

```bash
curl -s http://127.0.0.1:9001/api/status
# {"Version":"2.45.3","InstanceID":"..."}
```

> El endpoint `/api/status` está deprecado en Portainer 2.45; el vigente es
> `/api/system/status`. Ambos responden si la UI está sana.

## 3. Stack segmentado del Laboratorio 14

```bash
docker compose -f docker-compose-network.yml up -d --build
docker compose -f docker-compose-network.yml ps
```

Esto crea, en el proyecto `lab14-segmentado`:

- red `front` (`172.28.10.0/24`, con gateway),
- red `back` (`172.28.20.0/24`, `internal: true`),
- `dnsmasq` (`.53`), `web` (`.10`), `api` (`.20` + `.30`) y `db` (`.20`).

La API se construye desde `Dockerfile.api`. `web` monta `./web` y
`./web/nginx.conf` en solo lectura: los cambios de HTML/CSS/JS se ven al
recargar, sin reconstruir la imagen.

Salida real de contenedores:

```text
web      nginx:alpine                    Up (healthy)   127.0.0.1:8080->80/tcp
api      lab14-segmentado-api            Up (healthy)   5000/tcp
db       postgres:13-alpine              Up (healthy)   5432/tcp
dnsmasq  4km3/dnsmasq:2.85-r2            Up             53/tcp, 53/udp
```

Evidencia: [`salidas/contenedores.txt`](salidas/contenedores.txt) ·
[`terminal-contenedores.png`](capturas/terminal-contenedores.png).

## 4. Verificación de segmentación

```bash
./scripts/verificar.sh
```

```text
1) web no resuelve db por nombre... ✅ OK
2) web no alcanza db por IP...      ✅ OK
3) api alcanza db por IP...         ✅ OK
4) nslookup web.local...            ✅ OK
5) nslookup api.local...            ✅ OK
6) nslookup db.local...             ✅ OK
7) web responde HTTP 200...         ✅ OK

Resultado: 7 OK, 0 FALLO
```

Evidencia: [`salidas/segmentacion.txt`](salidas/segmentacion.txt) ·
[`terminal-segmentacion.png`](capturas/terminal-segmentacion.png).
El detalle de cada prueba está en [03-redes-segmentacion.md](03-redes-segmentacion.md).

## 5. Gateway con Basic Auth

El gateway vive fuera del repositorio, en `~/lab14-gateway`, y comparte el
loopback del host (`network_mode: host`).

```bash
cd ~/lab14-gateway

# 1) Crear el archivo de credenciales (una sola vez)
docker run --rm httpd:alpine \
  htpasswd -nbB lab14 "$GATEWAY_PASS" > .htpasswd

# 2) Guardar la contraseña solo para el operador
mkdir -p ~/.config/lab14
printf '%s' "$GATEWAY_PASS" > ~/.config/lab14/gateway.pass
chmod 600 ~/.config/lab14/gateway.pass ~/.config/lab14/credentials.txt

# 3) Levantar / recrear
docker compose up -d
```

El `nginx.conf` escucha en:

| Puerto | Uso | Upstream |
|---|---|---|
| `127.0.0.1:9000` | entrada del túnel (app + `/portainer/`) | `8080` / `9001` |
| `127.0.0.1:8088` | app local con auth | `8080` |
| `127.0.0.1:9090` | Portainer local con auth | `9001` |

Tras editar `nginx.conf` hay que **recrear** el contenedor; un `reload` desde
fuera no vuelve a montar el archivo:

```bash
docker compose up -d --force-recreate gateway
```

## 6. Túnel de Cloudflare

El túnel es **saliente** y se administra desde el panel de Cloudflare
(*remotely managed*). No hay que abrir puertos en el router.

| Public hostname | Servicio local | Qué sirve |
|---|---|---|
| `app-red.ponciop.online` | `http://localhost:9000` | App + API con Basic Auth |
| `cluster-red.ponciop.online` | `http://localhost:9001` | Portainer directo (login propio) |

Comprobación rápida:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://app-red.ponciop.online/            # 401
curl -s -o /dev/null -w '%{http_code}\n' -u "$GATEWAY_USER:$GATEWAY_PASS" \
     https://app-red.ponciop.online/                                                # 200
curl -s -o /dev/null -w '%{http_code}\n' https://cluster-red.ponciop.online/        # 200
```

Evidencia: [`salidas/gateway.txt`](salidas/gateway.txt) ·
[`terminal-gateway.png`](capturas/terminal-gateway.png).

> `cluster-red` apunta directo a `9001`, así que **no pasa por el Basic Auth**
> del gateway: solo lo protege el login de Portainer. Es una decisión explícita
> para no mover Portainer; el riesgo está anotado en
> [08-pendientes.md](08-pendientes.md).

## 7. Smoke test completo

```bash
# cadena app → api → db
curl -s -u "$GATEWAY_USER:$GATEWAY_PASS" https://app-red.ponciop.online/api/health
curl -s -u "$GATEWAY_USER:$GATEWAY_PASS" https://app-red.ponciop.online/api/db
curl -s -u "$GATEWAY_USER:$GATEWAY_PASS" https://app-red.ponciop.online/api/info

# estado del clúster
docker node ls
docker stack services portainer
docker compose -f docker-compose-network.yml ps
./scripts/verificar.sh
```

Salidas reales:

```json
{"service":"api","status":"healthy"}
{"db":"reachable","host":"db","port":5432}
{"back_ip":"172.28.20.30","db_target":"db:5432","front_ip":"172.28.10.20",
 "hostname":"587ac12aaa93","platform":"Linux","python":"3.9.25",
 "server_time":"2026-10-25T22:16:00Z","service":"api","uptime_seconds":2921.1}
```

Evidencia: [`salidas/api.txt`](salidas/api.txt) ·
[`terminal-api.png`](capturas/terminal-api.png).

## 8. Regenerar la documentación visual

```bash
./scripts/capturar-docs.sh
```

Genera las 9 transcripciones, las 9 terminales renderizadas y las 8 capturas
de app/Portainer (incluye servicios y redes autenticados). Requiere `docker`,
`curl`, `python3`, `jq`, Chrome y Node.
La contraseña del gateway se toma de `~/.config/lab14/gateway.pass` o
`$GATEWAY_PASS`; la de Portainer, de `~/.config/lab14/credentials.txt` o
`$PORTAINER_PASS`. Ninguna se escribe en `docs/`.

## Orden de arranque recomendado

1. Swarm (`docker swarm init` / `join`).
2. Portainer (`docker stack deploy`).
3. Stack segmentado (`docker compose up -d`).
4. Gateway (`docker compose up -d` en `~/lab14-gateway`).
5. Túnel (servicio de Cloudflare).
6. Smoke test y `./scripts/verificar.sh`.
