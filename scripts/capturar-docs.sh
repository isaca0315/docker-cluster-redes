#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Regenera la documentación visual del Laboratorio 14:
#   docs/salidas/*.txt   transcripciones reales de comandos
#   docs/capturas/*.png  capturas de la app y "fotos" de esas terminales
#
# Uso:
#   ./scripts/capturar-docs.sh            # texto + capturas
#   ./scripts/capturar-docs.sh --sin-pantallas   # solo transcripciones
#
# Requisitos: docker, curl, python3, jq y (para imágenes) Chrome + Node.
# La contraseña del gateway se lee de ~/.config/lab14/gateway.pass
# o de $GATEWAY_PASS; nunca se escribe en la documentación.
# ---------------------------------------------------------------------------
set -uo pipefail
cd "$(dirname "$0")/.."

SALIDAS=docs/salidas
CAPTURAS=docs/capturas
mkdir -p "$SALIDAS" "$CAPTURAS"

GATEWAY_USER=${GATEWAY_USER:-lab14}
GATEWAY_PASS=${GATEWAY_PASS:-$(cat "$HOME/.config/lab14/gateway.pass" 2>/dev/null || true)}
PORTAINER_USER=${PORTAINER_USER:-admin}
PORTAINER_PASS=${PORTAINER_PASS:-$(awk '/Portainer \(acceso directo/{f=1} f && /password:/{print $2; exit}' \
  "$HOME/.config/lab14/credentials.txt" 2>/dev/null || true)}
PUBLIC_APP=https://app-red.ponciop.online
PUBLIC_PORTAINER=https://cluster-red.ponciop.online
PROMPT='kernel@kernel-lab:~/docker-cluster-redes$'
CHROME=${CHROME:-google-chrome}

p() { printf '\n%s %s\n' "$PROMPT" "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

SIN_PANTALLAS=0
[ "${1:-}" = "--sin-pantallas" ] && SIN_PANTALLAS=1

echo "1/3 · Transcribiendo comandos..."

# ---------------------------------------------------------------- entorno ---
{
  p 'date -u +"%Y-%m-%dT%H:%M:%SZ"'
  date -u +"%Y-%m-%dT%H:%M:%SZ"

  p 'uname -srm'
  uname -srm

  p 'docker version --format "cliente {{.Client.Version}} · servidor {{.Server.Version}}"'
  docker version --format "cliente {{.Client.Version}} · servidor {{.Server.Version}}"

  p 'docker info --format "swarm={{.Swarm.LocalNodeState}} manager={{.Swarm.ControlAvailable}} nodos={{.Swarm.Nodes}}"'
  docker info --format "swarm={{.Swarm.LocalNodeState}} manager={{.Swarm.ControlAvailable}} nodos={{.Swarm.Nodes}}"

  p 'ss -ltn | grep -E ":(8080|8081|8088|9000|9001|9090) "'
  ss -ltn | grep -E ':(8080|8081|8088|9000|9001|9090) '

  p 'df -h /var/lib/docker | tail -1'
  df -h /var/lib/docker | tail -1
} > "$SALIDAS/entorno.txt" 2>&1

# ------------------------------------------------------------------ swarm ---
{
  p 'docker node ls'
  docker node ls

  p 'docker node inspect self --format "host={{.Description.Hostname}} rol={{.Spec.Role}} estado={{.Status.State}} lider={{.ManagerStatus.Leader}}"'
  docker node inspect self --format "host={{.Description.Hostname}} rol={{.Spec.Role}} estado={{.Status.State}} lider={{.ManagerStatus.Leader}}"

  p 'docker node inspect ubuntu24-cwl --format "host={{.Description.Hostname}} rol={{.Spec.Role}} estado={{.Status.State}} disponibilidad={{.Spec.Availability}}"'
  docker node inspect ubuntu24-cwl --format "host={{.Description.Hostname}} rol={{.Spec.Role}} estado={{.Status.State}} disponibilidad={{.Spec.Availability}}"

  p 'docker stack ls'
  docker stack ls

  p 'docker stack services portainer'
  docker stack services portainer

  p 'docker service ls'
  docker service ls
} > "$SALIDAS/swarm.txt" 2>&1

# ----------------------------------------------------------- contenedores ---
{
  p "docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'"
  docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'

  p "docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'"
  docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'
} > "$SALIDAS/contenedores.txt" 2>&1

# ------------------------------------------------------------------ redes ---
net_info() {
  docker network inspect "lab14-segmentado_$1" 2>/dev/null | jq -r '
    .[] | "red \(.Name)   driver=\(.Driver)   internal=\(.Internal)",
    (.IPAM.Config[] | "  subred \(.Subnet)   gateway \(.Gateway)"),
    "  miembros:", (.Containers | to_entries[] | "    \(.value.Name)  \(.value.IPv4Address)")
  '
}

{
  p 'docker network ls --filter name=lab14-segmentado'
  docker network ls --filter name=lab14-segmentado

  p 'docker network inspect lab14-segmentado_front | jq -r ...'
  net_info front

  p 'docker network inspect lab14-segmentado_back | jq -r ...'
  net_info back
} > "$SALIDAS/redes.txt" 2>&1

# ----------------------------------------------------------- segmentación ---
{
  p './scripts/verificar.sh'
  ./scripts/verificar.sh

  p 'docker exec web getent hosts db || echo "(vacío: db no resuelve desde web)"'
  docker exec web getent hosts db || echo "(vacío: db no resuelve desde web)"

  p 'docker exec web sh -c "nc -z -w 2 db 5432; echo exit=\$?"'
  docker exec web sh -c 'nc -z -w 2 db 5432; echo exit=$?'

  p 'docker exec web sh -c "nc -z -w 2 172.28.20.20 5432; echo exit=\$?"'
  docker exec web sh -c 'nc -z -w 2 172.28.20.20 5432; echo exit=$?'

  p 'docker exec api sh -c "nc -z -w 2 db 5432; echo exit=\$?"'
  docker exec api sh -c 'nc -z -w 2 db 5432; echo exit=$?'

  p 'docker exec web nslookup api.local 172.28.10.53'
  docker exec web nslookup api.local 172.28.10.53 2>&1

  p 'docker exec api nslookup db.local 172.28.10.53'
  docker exec api nslookup db.local 172.28.10.53 2>&1
} > "$SALIDAS/segmentacion.txt" 2>&1

# -------------------------------------------------------------------- API ---
{
  p 'curl -s -o /dev/null -w "GET /           -> %{http_code} %{content_type}\n" http://127.0.0.1:8080/'
  curl -s -o /dev/null -w "GET /           -> %{http_code} %{content_type}\n" http://127.0.0.1:8080/

  p 'curl -s -o /dev/null -w "GET /app.js     -> %{http_code} %{content_type}\n" http://127.0.0.1:8080/app.js'
  curl -s -o /dev/null -w "GET /app.js     -> %{http_code} %{content_type}\n" http://127.0.0.1:8080/app.js

  for ep in health db info; do
    p "curl -s -w ' [%{http_code}]\\n' http://127.0.0.1:8080/api/$ep"
    curl -s -w ' [%{http_code}]\n' "http://127.0.0.1:8080/api/$ep"
    echo
  done

  p 'docker exec api hostname'
  docker exec api hostname

  p 'docker exec api python -c "import platform; print(platform.platform())"'
  docker exec api python -c 'import platform; print(platform.platform())'
} > "$SALIDAS/api.txt" 2>&1

# ---------------------------------------------------------------- portainer ---
{
  p 'curl -s http://127.0.0.1:9001/api/status'
  curl -s -m 15 http://127.0.0.1:9001/api/status
  echo

  if [ -n "$PORTAINER_PASS" ]; then
    p 'TOKEN=$(curl -s -H "Content-Type: application/json" -d "{\"username\":\"$PORTAINER_USER\",\"password\":\"$PORTAINER_PASS\"}" http://127.0.0.1:9001/api/auth | jq -r .jwt)'
    TOKEN=$(curl -s -m 15 -H 'Content-Type: application/json' \
      -d "{\"username\":\"$PORTAINER_USER\",\"password\":\"$PORTAINER_PASS\"}" \
      http://127.0.0.1:9001/api/auth | jq -r '.jwt // empty')

    if [ -n "$TOKEN" ]; then
      p 'curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:9001/api/stacks'
      curl -s -m 15 -H "Authorization: Bearer $TOKEN" http://127.0.0.1:9001/api/stacks
      echo

      p 'curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:9001/api/endpoints | jq -r ...'
      curl -s -m 15 -H "Authorization: Bearer $TOKEN" http://127.0.0.1:9001/api/endpoints \
        | jq -r '.[] | "endpoint \(.Id)  \(.Name)  \(.URL)  status=\(.Status)"'

      p 'curl -s -H "Authorization: Bearer $TOKEN" .../services | jq -r ...'
      curl -s -m 15 -H "Authorization: Bearer $TOKEN" \
        http://127.0.0.1:9001/api/endpoints/1/docker/services \
        | jq -r '.[] | "\(.Spec.Name)  réplicas=\(.Spec.Mode.Replicated.Replicas)  puerto=\(.Endpoint.Ports[0].PublishedPort)->\(.Endpoint.Ports[0].TargetPort)"'

      p 'curl -s -H "Authorization: Bearer $TOKEN" .../networks | jq -r ...'
      curl -s -m 15 -H "Authorization: Bearer $TOKEN" \
        http://127.0.0.1:9001/api/endpoints/1/docker/networks \
        | jq -r '.[] | select(.Name | test("lab14")) | "\(.Name)  driver=\(.Driver)  internal=\(.Internal)  subred=\(.IPAM.Config[0].Subnet)"'
    else
      echo "(login de Portainer falló: se omite la parte autenticada)"
    fi
  else
    echo "(sin PORTAINER_PASS: se omite la parte autenticada)"
  fi
} > "$SALIDAS/portainer.txt" 2>&1

# ---------------------------------------------------------------- gateway ---
{
  p 'curl -s -o /dev/null -w "9000 sin auth   -> %{http_code}\n" http://127.0.0.1:9000/'
  curl -s -o /dev/null -w "9000 sin auth   -> %{http_code}\n" http://127.0.0.1:9000/

  p 'curl -s -o /dev/null -w "9000 con auth   -> %{http_code}\n" -u "$GATEWAY_USER:$GATEWAY_PASS" http://127.0.0.1:9000/'
  curl -s -o /dev/null -w "9000 con auth   -> %{http_code}\n" -u "$GATEWAY_USER:$GATEWAY_PASS" http://127.0.0.1:9000/

  p 'curl -s -o /dev/null -w "8088 app local  -> %{http_code}\n" -u "$GATEWAY_USER:$GATEWAY_PASS" http://127.0.0.1:8088/'
  curl -s -o /dev/null -w "8088 app local  -> %{http_code}\n" -u "$GATEWAY_USER:$GATEWAY_PASS" http://127.0.0.1:8088/

  p 'curl -s -o /dev/null -w "9090 Portainer  -> %{http_code}\n" -u "$GATEWAY_USER:$GATEWAY_PASS" http://127.0.0.1:9090/portainer/'
  curl -s -o /dev/null -w "9090 Portainer  -> %{http_code}\n" -u "$GATEWAY_USER:$GATEWAY_PASS" http://127.0.0.1:9090/portainer/

  p "curl -s -o /dev/null -w \"público sin auth -> %{http_code}\\n\" $PUBLIC_APP/"
  curl -s -m 20 -o /dev/null -w "público sin auth -> %{http_code}\n" "$PUBLIC_APP/"

  p "curl -s -o /dev/null -w \"público con auth -> %{http_code}\\n\" -u \"\$GATEWAY_USER:\$GATEWAY_PASS\" $PUBLIC_APP/"
  curl -s -m 20 -o /dev/null -w "público con auth -> %{http_code}\n" -u "$GATEWAY_USER:$GATEWAY_PASS" "$PUBLIC_APP/"

  p "curl -s -u \"\$GATEWAY_USER:\$GATEWAY_PASS\" $PUBLIC_APP/api/db"
  curl -s -m 20 -u "$GATEWAY_USER:$GATEWAY_PASS" "$PUBLIC_APP/api/db"
  echo

  p "curl -s -D - -o /dev/null -u \"\$GATEWAY_USER:\$GATEWAY_PASS\" $PUBLIC_APP/api/health | head -6"
  curl -s -m 20 -D - -o /dev/null -u "$GATEWAY_USER:$GATEWAY_PASS" "$PUBLIC_APP/api/health" | head -6

  p "curl -s -o /dev/null -w \"cluster-red     -> %{http_code}\\n\" $PUBLIC_PORTAINER/"
  curl -s -m 20 -o /dev/null -w "cluster-red     -> %{http_code}\n" "$PUBLIC_PORTAINER/"
} > "$SALIDAS/gateway.txt" 2>&1

# ------------------------------------------------------------------- logs ---
{
  p 'docker logs web --tail 6'
  docker logs web --tail 6 2>&1

  p 'docker logs api --tail 4'
  docker logs api --tail 4 2>&1

  p 'docker service logs portainer_portainer --tail 4'
  PORTAINER_C=$(docker ps --filter name=portainer_portainer --format '{{.Names}}' | head -1)
  docker logs "$PORTAINER_C" --tail 4 2>&1 | sed -r 's/\x1B\[[0-9;]*[mK]//g'
} > "$SALIDAS/logs.txt" 2>&1

# ------------------------------------------------- capturas de pantalla -----
# Un solo Chrome headless sirve para "fotografiar" las terminales y para
# capturar la app: las terminales se miden por CDP (altura real, sin recortes).
if [ "$SIN_PANTALLAS" -eq 0 ]; then
  echo "2/3 · Renderizando capturas..."

  if ! have "$CHROME" || ! have node; then
    echo "  (sin Chrome o Node: se omiten las imágenes)"
  else
    rm -rf /tmp/opencode/chrome-docs
    "$CHROME" --headless=new --no-sandbox --disable-gpu \
      --remote-debugging-port=9333 --user-data-dir=/tmp/opencode/chrome-docs \
      about:blank >/tmp/opencode/chrome-docs.log 2>&1 &
    CHROME_PID=$!
    trap 'kill "$CHROME_PID" 2>/dev/null' EXIT

    for _ in $(seq 1 40); do
      curl -sf http://127.0.0.1:9333/json/version >/dev/null 2>&1 && break
      sleep 0.5
    done

    render_terminal() {
      local name=$1 title=$2
      local txt="$SALIDAS/$name.txt"
      local html="/tmp/opencode/term-$name.html"
      [ -s "$txt" ] || return 0
      python3 scripts/docs/render-terminal.py "$txt" "$html" "$title" >/dev/null || return 0
      node scripts/docs/capturar-html.js "$html" "$PWD/$CAPTURAS/terminal-$name.png" 1260
    }

    render_terminal entorno       "entorno · kernel-lab"
    render_terminal swarm         "swarm · docker node ls"
    render_terminal contenedores  "contenedores · docker ps"
    render_terminal redes         "redes · front y back"
    render_terminal segmentacion  "segmentación · ./scripts/verificar.sh"
    render_terminal api           "api · endpoints por web"
    render_terminal gateway       "gateway · 401 vs 200"
    render_terminal portainer     "portainer · servicios y redes"
    render_terminal logs          "logs · web / api / portainer"

    echo "3/3 · Capturando pantallas de la app..."
    # Portainer se captura por loopback: sus bundles (>10 MB) por el túnel son
    # demasiado lentos para el presupuesto de espera del headless. Si hay
    # contraseña, además de la pantalla de login se capturan servicios y redes.
    BASIC_AUTH="$GATEWAY_USER:$GATEWAY_PASS" \
    PORTAINER_USER="$PORTAINER_USER" \
    PORTAINER_PASS="$PORTAINER_PASS" \
      node scripts/docs/capturar-pantallas.js \
      --out "$CAPTURAS" \
      --app http://127.0.0.1:9000 \
      --portainer http://127.0.0.1:9001 || echo "  (falló la captura de pantallas)"
  fi
else
  echo "2/3 · Capturas omitidas (--sin-pantallas)"
  echo "3/3 · Capturas omitidas (--sin-pantallas)"
fi

rm -f /tmp/opencode/term-*.html

echo
echo "Salidas:   $SALIDAS/ ($(ls -1 "$SALIDAS" 2>/dev/null | wc -l) archivos)"
echo "Capturas:  $CAPTURAS/ ($(ls -1 "$CAPTURAS" 2>/dev/null | wc -l) imágenes)"
