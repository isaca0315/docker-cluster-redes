# Gateway del Laboratorio 14

Capa de acceso con **Basic Auth** delante de la aplicación y de Portainer.
Escucha **solo en loopback** (`127.0.0.1`), así que no abre puertos a la red
local. El laboratorio se usa desde la misma máquina o con un túnel SSH.

> **Cloudflare Tunnel es opcional.** Esta guía no lo requiere. Si publicas la app
> en Internet, el túnel es un camino de salida hacia el gateway; si no, ignora
> esa sección.

## Requisitos

- Docker y Docker Compose v2.
- El stack del laboratorio levantado (`web` en `127.0.0.1:8080`).
- Portainer levantado (`127.0.0.1:9001`).
- Un archivo `.htpasswd` con el usuario y la contraseña del gateway.

## Preparación (solo la primera vez)

```bash
cd infra/gateway

# 1) Pide la contraseña sin mostrarla en pantalla
read -r -s -p 'Clave para el usuario lab14: ' GATEWAY_PASS; echo

# 2) Genera el hash para nginx
docker run --rm httpd:alpine htpasswd -nbB lab14 "$GATEWAY_PASS" > .htpasswd

# 3) Guarda la contraseña solo para tu usuario
mkdir -p ~/.config/lab14
printf '%s' "$GATEWAY_PASS" > ~/.config/lab14/gateway.pass
chmod 600 .htpasswd ~/.config/lab14/gateway.pass

# 4) Levanta el gateway
docker compose up -d
```

> `.htpasswd` está en `.gitignore`. **Nunca** lo subas al repositorio ni
> escribas la contraseña en la documentación.

Si ya había un gateway con el mismo nombre, detenlo antes de levantar este:

```bash
docker rm -f lab14-gateway 2>/dev/null || true
docker compose up -d
```

## Mapa de puertos

| Qué | URL local | Destino real |
|---|---|---|
| **App** (con Basic Auth) | `http://localhost:9000/` | `http://127.0.0.1:8080` (`web`) |
| App → API | `http://localhost:9000/api/...` | `web` reenvía a `api:5000` |
| Portainer (por el gateway) | `http://localhost:9000/portainer/` | `http://127.0.0.1:9001/` |
| App (acceso local directo) | `http://localhost:8088/` | `http://127.0.0.1:8080` |
| Portainer (acceso local directo) | `http://localhost:9090/portainer/` | `http://127.0.0.1:9001/` |

## Flujo completo de la app

```text
navegador (local o túnel SSH)
  └─ http://localhost:8088/               (Basic Auth)
       └─ nginx gateway 127.0.0.1:9000
            └─ web 127.0.0.1:8080
                 ├─ /              → HTML, CSS y JavaScript
                 └─ /api/*         → api:5000  (red front)
                                      └─ db:5432 (red back, internal)
```

Si además publicas con Cloudflare, el mismo gateway recibe
`https://<tu-dominio>/` en el puerto `9000` (ver la sección opcional del final).

`web` usa `web/nginx.conf`:

```nginx
location /api/ {
    proxy_pass http://api:5000/;
}
```

La app (`web/index.html`, `styles.css` y `app.js`) es un panel con diagrama
SVG animado y estado en vivo. Llama a `/api/health`, `/api/db` y `/api/info`,
así que el navegador ve la infraestructura y la API sin exponer la API ni la
base de datos directamente.

## Comprobar que funciona

```bash
# Sin credenciales: debe responder 401
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:9000/

# Con credenciales: debe responder 200
GATEWAY_PASS=$(cat ~/.config/lab14/gateway.pass)
curl -s -o /dev/null -w '%{http_code}\n' \
  -u "lab14:$GATEWAY_PASS" http://127.0.0.1:9000/

# App y Portainer por el gateway
curl -s -o /dev/null -w '%{http_code}\n' \
  -u "lab14:$GATEWAY_PASS" http://127.0.0.1:8088/
curl -s -o /dev/null -w '%{http_code}\n' \
  -u "lab14:$GATEWAY_PASS" http://127.0.0.1:9090/portainer/
```

## Acceso desde tu computadora

El gateway solo escucha en `127.0.0.1`. Si el navegador está en otra máquina,
usa un túnel SSH desde tu computadora:

```bash
ssh -L 8088:127.0.0.1:8088 \
    -L 9090:127.0.0.1:9090 \
    usuario@<IP_DEL_MAESTRO>
```

Luego abre:

- `http://localhost:8088/` → app con Basic Auth.
- `http://localhost:9090/portainer/` → Portainer con Basic Auth + login.

Portainer también escucha en `0.0.0.0:9001`, así que puedes abrirlo
directamente en `http://<IP_DEL_MAESTRO>:9001/` desde la red local. Esa ruta
**no** pasa por el Basic Auth del gateway: solo la protege el login de
Portainer.

## Túnel de Cloudflare (opcional, no requerido)

**No lo necesitas para el laboratorio.** Solo sirve para publicar la app en
Internet. El túnel es saliente: **no hay que abrir puertos** en el router ni en
el host. En el panel de Cloudflare crea un túnel y agrega dos *public hostnames*:

| Public hostname | Servicio local | Qué sirve |
|---|---|---|
| `app-red.<tu-dominio>` | `http://localhost:9000` | App completa con Basic Auth |
| `cluster-red.<tu-dominio>` | `http://localhost:9001` | Portainer directo (solo login) |

Rutas:

| URL pública | Qué hay |
|---|---|
| `https://app-red.<tu-dominio>/` | App (HTML + estado de API/DB) |
| `https://app-red.<tu-dominio>/api/db` | API → DB (Basic Auth) |
| `https://app-red.<tu-dominio>/portainer/` | Portainer con Basic Auth |
| `https://cluster-red.<tu-dominio>/` | Portainer (sin Basic Auth) |

> `cluster-red` apunta directo al `9001`, así que **no pasa por el Basic Auth**
> del gateway. Si quieres que sí pase, usa
> `https://app-red.<tu-dominio>/portainer/` o mueve Portainer a otro puerto y
> coloca el gateway en el `9001`.

Como segunda capa, agrega **Cloudflare Access** sobre los hostnames (OTP por
correo, Google, GitHub, etc.), además del Basic Auth.

No publiques los puertos `2377`, `7946` ni `4789`, el puerto `8000` (Edge de
Portainer) ni el socket de Docker.

## Cambios en `nginx.conf`

El archivo se monta como volumen al **crear** el contenedor. Después de
editarlo, recrea el contenedor; no basta con un `reload` desde fuera:

```bash
cd infra/gateway
docker compose up -d --force-recreate gateway
```

## Diagnóstico rápido

```bash
# ¿El gateway está escuchando?
ss -ltnp | grep -E ':(9000|8088|9090) '

# ¿Los upstreams responden?
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:9001/

# ¿El Basic Auth funciona?
curl -s -D - -o /dev/null http://127.0.0.1:9000/ | head -3
curl -s -D - -o /dev/null -u "lab14:$GATEWAY_PASS" \
  http://127.0.0.1:9000/ | head -3

# Registros del gateway
docker logs -f lab14-gateway
```

Si publicaste el túnel y devuelve `502`, revisa en este orden:
`cloudflared` → gateway (`9000`) → `web` (`8080`). Si `8080` responde pero
`9000` no, el problema está en el gateway o en el Basic Auth. Si `9000`
responde pero el túnel no, el problema está en Cloudflare. En un laboratorio sin
túnel este diagnóstico no aplica: usa directamente `8088` y `9090`.
