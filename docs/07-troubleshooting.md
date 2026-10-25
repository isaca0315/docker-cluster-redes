# 07 — Troubleshooting

Problemas reales encontrados durante el montaje y la generación de la
documentación. Cada entrada tiene síntoma, causa y solución comprobada.

## Resumen

| # | Síntoma | Causa | Solución |
|---|---|---|---|
| 1 | Healthcheck de `web` en `unhealthy` | `localhost` resolvía a `::1` sin IPv6 | usar `127.0.0.1` en el healthcheck |
| 2 | `nslookup` expira desde otros contenedores | `interface=0.0.0.0` en dnsmasq | quitar la línea `interface=` |
| 3 | Levantar un stack borra el otro | mismo proyecto compose | `name:` distinto por archivo |
| 4 | `docker stack deploy` rechaza IPs o `build:` | limitación de Swarm | usar `docker compose` para el L14 |
| 5 | `port is already allocated` | otro stack ocupa 8080/8081 | parar el stack anterior |
| 6 | `nc: bad address 'db'` | busybox sin `-w` / nombre no resuelto | usar `nc -z -w 3 <ip>` y probar por nombre e IP |
| 7 | Portainer no carga por el túnel | bundles de ~13 MB | capturar por loopback; esperar más en uso real |
| 8 | Captura de Portainer en blanco | SPA aún en “Loading Portainer…” | esperar condición + reintentos |
| 9 | `/api/status` devuelve 404 intermitente | caché/edge transitorio de Cloudflare | reintentar; usar `/api/system/status` |
| 10 | Terminal recortada o con franja vacía | viewport mínimo en la medición | medir con altura 200 y `getLayoutMetrics` |
| 11 | Logs con códigos ANSI en la captura | colores de Portainer | limpiar ANSI en el render |
| 12 | Banner de API caída siempre visible | `hidden` no ocultaba por `display` | `.banner[hidden] { display: none }` |
| 13 | Cambios en `nginx.conf` no aplican | el archivo se monta al crear | `docker compose up -d --force-recreate` |
| 14 | Emojis como cuadros en las capturas | no había fuente de emoji | instalar `Noto Emoji` |
| 15 | Versión de Docker incorrecta en la app | dato desactualizado | corregir a 29.8.1 en `app.js` e `index.html` |

## Detalle

### 1. Healthcheck de `web` en `unhealthy`

**Síntoma:** `docker ps` mostraba `web` como `unhealthy` aunque `curl
localhost:8080` respondía 200.

**Causa:** el healthcheck usaba `http://localhost/`. Dentro del contenedor,
`localhost` resolvía primero a `::1` (IPv6), pero nginx solo escuchaba en IPv4.
`wget` fallaba sin que la app estuviera rota.

**Solución:** usar `127.0.0.1` explícito en el compose:

```yaml
healthcheck:
  test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1/"]
```

Verificado: `web` pasó a `Up (healthy)`.

### 2. dnsmasq no responde a otros contenedores

**Síntoma:** dentro de `dnsmasq` funcionaba `nslookup web.local 127.0.0.1`,
pero desde `web` o `api` daba `connection timed out; no servers could be
reached`.

**Causa:** `dnsmasq.conf` tenía `interface=0.0.0.0`. La directiva espera un
**nombre** de interfaz (`eth0`, `lo`), no una IP; con un valor inválido dnsmasq
termina escuchando solo en loopback.

**Solución:** quitar `interface=` y dejar que escuche en todas las interfaces
del contenedor (comportamiento por defecto). El archivo actual solo declara
`no-resolv`, `no-hosts`, registros `address=` y `log-queries`.

```bash
docker compose -f docker-compose-network.yml restart dnsmasq
docker exec web nslookup api.local 172.28.10.53
```

### 3. Los stacks se pisan entre sí

**Síntoma:** al levantar el stack plano desaparecían los contenedores del
segmentado (o al revés).

**Causa:** ambos archivos usaban el nombre del directorio como proyecto compose
y repetían los servicios `web`/`db`.

**Solución:** cada archivo declara su propio `name:`:

```yaml
name: lab14-segmentado   # docker-compose-network.yml
name: lab14-plano        # docker-compose-network-planos.yml
```

Así conviven sin colisión y las redes se llaman
`lab14-segmentado_front` / `lab14-segmentado_back`.

### 4. `docker stack deploy` no acepta el stack del L14

**Síntoma:** errores con `ipv4_address`, `build:` o `container_name` al intentar
desplegar `docker-compose-network.yml` en Swarm.

**Causa:** Swarm no admite IPs estáticas en redes overlay ni construye imágenes;
tampoco acepta `name:`/`container_name` en el compose de un stack.

**Solución:** el stack del laboratorio se levanta con `docker compose` en el
manager. Swarm se usa para nodos y Portainer. El DNS de Swarm (`<servicio>`) no
sustituye a las zonas `.local` de dnsmasq.

### 5. `port is already allocated`

**Síntoma:** al levantar el segmentado, Docker no puede publicar `8080` u `8081`.

**Causa:** el stack plano u otro proceso ya ocupa el puerto.

**Solución:**

```bash
docker compose -f docker-compose-network-planos.yml down
docker compose -f docker-compose-network.yml up -d
```

Comprobar el puerto:

```bash
ss -ltnp | grep ':8080 '
```

### 6. `nc: bad address 'db'`

**Síntoma:** `docker exec web sh -c "nc -z -w 2 db 5432"` devuelve
`nc: bad address 'db'`.

**Causa:** `web` no está en la red `back`, así que el DNS embebido de Docker no
conoce `db`. Además, el `nc` de busybox requiere `-w`.

**Solución:** es el **comportamiento esperado** de la prueba 1/2. Para probar
conectividad por IP usa:

```bash
docker exec web sh -c "nc -z -w 2 172.28.20.20 5432; echo exit=\$?"   # exit=1
docker exec api sh -c "nc -z -w 2 db 5432; echo exit=\$?"             # exit=0
```

### 7. Portainer no carga por el túnel

**Síntoma:** por `https://cluster-red.ponciop.online/` la SPA se queda en
“Loading Portainer...” más de 45 s en el navegador headless.

**Causa:** Portainer CE 2.45 sirve ~13 MB de JavaScript (`vendor` 5.7 MB +
`main` 7 MB). A través del túnel, la carga supera el presupuesto de espera de
las capturas. En loopback tarda ~2,1 s.

**Solución:**

- Para personas: esperar la primera carga; luego el navegador cachea.
- Para las capturas: usar `http://127.0.0.1:9001` y documentar que el acceso
  real es el túnel.
- Si molesta en producción, considerar Portainer Business o un proxy con caché;
  no es un fallo del laboratorio.

### 8. Captura de Portainer en blanco

**Síntoma:** `Page.captureScreenshot` devolvía `data` vacío o la imagen solo
mostraba el spinner.

**Causa:** la captura se disparaba antes de que la SPA terminara de montar.

**Solución:** esperar una condición explícita y reintentar:

```js
await waitFor(
  `document.body && document.body.innerText.trim().length > 0 &&
   !/Loading Portainer/.test(document.body.innerText)`,
  45000
);
```

Además, `save()` reintenta la captura hasta 3 veces con 700 ms de espera.

### 9. `/api/status` 404 intermitente

**Síntoma:** una consulta a `https://cluster-red.ponciop.online/api/status`
devolvió `404` durante las pruebas; las siguientes devolvieron `200` con
`{"Version":"2.45.3",...}`.

**Causa:** respuesta transitoria del edge de Cloudflare durante la propagación;
el origen estaba sano (5/5 intentos posteriores dieron 200).

**Solución:** reintentar y usar el endpoint vigente
`/api/system/status`. El 404 de `/api/status` no indica que Portainer esté caído.

### 10. Terminal recortada o con franja vacía

**Síntoma:** las primeras capturas de terminal salían con 900 px de alto y una
franja vacía, o cortaban las últimas líneas.

**Causa:** se fijaba el viewport en 900 px y `getLayoutMetrics` devolvía como
mínimo ese alto; además el cálculo de líneas no contemplaba el wrapping.

**Solución:** viewport de 200 px, medir `cssContentSize` y capturar con
`captureBeyondViewport` y `clip` a la altura real. El render HTML usa
`white-space: pre-wrap` y calcula la altura según caracteres por línea. Las
terminales actuales van de 552 a 1959 px, sin recortes.

### 11. Códigos ANSI en los logs

**Síntoma:** los logs de Portainer aparecían con secuencias `\x1b[...]` en la
transcripción.

**Causa:** Portainer colorea la salida cuando detecta una terminal.

**Solución:** limpiar ANSI al capturar y al renderizar:

```bash
docker logs "$PORTAINER_C" --tail 4 2>&1 | sed -r 's/\x1B\[[0-9;]*[mK]//g'
```

```python
raw = re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", raw)
```

### 12. El banner de API caída no se ocultaba

**Síntoma:** al recuperar la API, el banner seguía visible.

**Causa:** el CSS del banner usaba `display: flex`, que gana sobre el atributo
`hidden` del navegador.

**Solución:**

```css
.banner[hidden] { display: none; }
```

Se subió `?v=2` para invalidar caché y se añadió un `poll()` inmediato en
`visibilitychange`. Validación: bloqueando `/api/*` el banner aparecía a los 2
fallos y desaparecía al restaurar.

### 13. Cambios en `nginx.conf` no se aplican

**Síntoma:** se edita `~/lab14-gateway/nginx.conf` y el comportamiento sigue
igual.

**Causa:** el archivo se monta como volumen al **crear** el contenedor; un
`nginx -s reload` desde fuera no vuelve a montar el archivo.

**Solución:**

```bash
cd ~/lab14-gateway
docker compose up -d --force-recreate gateway
```

### 14. Emojis como cuadros en las capturas

**Síntoma:** los iconos del panel y de las terminales aparecían como rectángulos
vacíos en Chrome headless.

**Causa:** el sistema no tenía ninguna fuente de emoji instalada.

**Solución:** instalar una fuente monocroma en el perfil y refrescar la caché:

```bash
mkdir -p ~/.local/share/fonts
curl -sL -o ~/.local/share/fonts/NotoEmoji.ttf \
  'https://raw.githubusercontent.com/google/fonts/main/ofl/notoemoji/NotoEmoji%5Bwght%5D.ttf'
fc-cache -f ~/.local/share/fonts
```

El CSS de las terminales usa `"DejaVu Sans Mono", "Noto Emoji", monospace`.

### 15. Versión de Docker equivocada en la app

**Síntoma:** el panel mostraba Docker `29.1.3` en el manager; `docker version`
decía `29.8.1`.

**Causa:** dato hardcodeado desactualizado en `TOPOLOGY` y en el SVG.

**Solución:** corregir `web/app.js` y `web/index.html`. El worker sí queda en
`29.1.3`, que es su versión real. Lección: los datos declarativos del panel hay
que revisarlos al cambiar el entorno.

## Diagnóstico por capas

| Capa | Comando | Si falla |
|---|---|---|
| DNS público | `dig +short app-red.ponciop.online` | revisar Cloudflare |
| Túnel | `docker ps \| grep cloudflared` / panel | reiniciar el servicio |
| Gateway | `curl -I http://127.0.0.1:9000/` | `docker logs lab14-gateway` |
| Auth | `curl -u ... http://127.0.0.1:9000/` | revisar `.htpasswd` |
| Web | `curl -I http://127.0.0.1:8080/` | `docker logs web` |
| API | `curl http://127.0.0.1:8080/api/health` | `docker logs api` |
| DB | `docker exec api nc -z -w 2 db 5432` | `docker logs db` |
| Segmentación | `./scripts/verificar.sh` | ver [03](03-redes-segmentacion.md) |

## Comandos que engañan

| Comando | Por qué no sirve solo |
|---|---|
| `curl localhost:8080` | `localhost` puede resolver a IPv6; usa `127.0.0.1` |
| `nc -z db 5432` | busybox necesita `-w` y `web` no resuelve `db` |
| `docker service logs` | puede incluir ANSI y mezclar tareas antiguas |
| `docker ps` | no muestra el estado de salud; usa `docker inspect` |
| `ss -ltn` | no muestra procesos sin `-p` (y a veces requiere root) |
