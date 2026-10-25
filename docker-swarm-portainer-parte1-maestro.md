# Docker Swarm con Portainer - Parte 1: Crear el Maestro

Esta guía explica cómo inicializar un clúster Docker Swarm y configurar Portainer en el nodo maestro.

> **Archivos del proyecto que se usan aquí:**
> - `docker-compose-portainer.yml` — stack de Portainer
> - `docker-compose-examples.yml` — stack nginx de ejemplo
> - `scripts/init-swarm.sh` — automatiza esta guía completa
> - `scripts/validate-swarm.sh` — verifica el resultado

## Requisitos Previos

- Un servidor con Docker Engine instalado
- Al menos 1 nodo (podrás agregar más workers después)
- Puerto 9001 libre (para Portainer; el 9000 queda para el gateway con Basic Auth)

```bash
docker --version && docker compose version
ss -ltn | grep -q ':9001' && echo "¡9001 ocupado!" || echo "puerto 9001 libre"
```

## Paso 1: Inicializar Docker Swarm

### En el nodo maestro:

```bash
# Inicializar el swarm
docker swarm init --advertise-addr <IP_DEL_NODO>

# Ejemplo:
docker swarm init --advertise-addr 192.168.1.100
```

### Nota importante:

Al ejecutar este comando, Docker te mostrará el comando de unión con token que necesitarás para agregar workers. Guárdalo (también lo puedes recuperar después):

```bash
docker swarm join-token worker
```

## Paso 2: Instalar Portainer

Portainer es una herramienta de gestión visual para Docker que facilita el manejo del swarm.

### Opción A: Usando Docker Stack (recomendado)

```bash
# Crear el volumen para Portainer
docker volume create portainer_data

# Desplegar Portainer con el archivo del proyecto
docker stack deploy -c docker-compose-portainer.yml portainer
```

### Contenido de `docker-compose-portainer.yml`:

```yaml
# docker-compose-portainer.yml (versión real del laboratorio)
# Sin `name:`: `docker stack deploy` toma el nombre del argumento de la CLI.
services:
  portainer:
    image: portainer/portainer-ce:latest
    command: -H unix:///var/run/docker.sock
    ports:
      - "9001:9000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - portainer_data:/data
    deploy:
      placement:
        constraints:
          - node.role == manager
      restart_policy:
        condition: on-failure

volumes:
  portainer_data:
    driver: local
```

> En el laboratorio Portainer se publica en **9001** para no chocar con el
> gateway (`9000`). No se mapea el puerto Edge (`8000`).

### Opción B: Usando docker run (más rápido para prueba)

```bash
docker run -d \
  -p 9001:9000 \
  --name portainer \
  --restart=always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```

### Opción C: Con agente (multi-nodo)

Para gestionar varios nodos desde un solo Portainer, despliega el agente en todos los nodos:

```bash
docker stack deploy -c docker-compose-agent.yml portainer-agent
```

## Paso 3: Configurar Firewall (si es necesario)

```bash
# Abrir puertos necesarios
sudo ufw allow 2377/tcp    # Docker Swarm management
sudo ufw allow 4789/udp    # Docker overlay network
sudo ufw allow 7946/tcp    # Docker Swarm gossip
sudo ufw allow 7946/udp    # Docker Swarm gossip
sudo ufw allow 9001/tcp    # Portainer (9000 es solo loopback para el gateway)
# No abras 8000: Edge no se usa en este laboratorio
```

## Paso 4: Acceder a Portainer

1. Abre tu navegador
2. Visita: `http://<IP_DEL_NODO>:9001`
3. Configura el admin user
4. Conéctate al endpoint local

## Paso 5: Verificar el estado del swarm

```bash
# Ver nodos del swarm
docker node ls

# Ver stacks desplegados
docker stack ls

# Ver servicios
docker service ls
```

O usa el script de validación del proyecto:

```bash
chmod +x scripts/*.sh
./scripts/validate-swarm.sh
```

## Paso 6: Crear primer stack de ejemplo

El proyecto ya incluye `docker-compose-examples.yml` (servicio `web` con 3 réplicas de nginx + un servicio `hello` en `mode: global`):

```bash
docker stack deploy -c docker-compose-examples.yml my-nginx
```

O crea uno mínimo al vuelo:

```bash
cat > nginx.yml << 'EOF'
version: '3.8'

services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"
    deploy:
      replicas: 3
      placement:
        constraints:
          - node.role == worker
EOF

docker stack deploy -c nginx.yml my-nginx
```

También puedes usar el script:

```bash
./scripts/deploy-stack.sh nginx docker-compose-examples.yml
```

## Paso 7: Obtener token para workers

Guarda esta salida, la necesitarás en la **Parte 2**:

```bash
# Ver token para workers
docker swarm join-token worker

# Ver token para managers (si agregas más maestros)
docker swarm join-token manager
```

## Atajo: todo automatizado

El script `scripts/init-swarm.sh` hace los pasos 1, 2 y 7 de una vez:

```bash
./scripts/init-swarm.sh
```

## Resumen de puertos

| Puerto | Uso |
|--------|-----|
| 2377 | Docker Swarm (TCP) |
| 4789 | Overlay network (UDP) |
| 7946 | Gossip protocol (TCP/UDP) |
| 8000 | Portainer Edge (no usado) |
| 9001 | Portainer UI (`9001 → 9000`) |
| 9000 | Gateway nginx (solo loopback) |

## Comandos útiles

```bash
# Ver información del swarm
docker info

# Ver nodos con detalle
docker node inspect --pretty $(docker node ls -q)

# Actualizar Portainer
docker service update portainer_portainer --image portainer/portainer-ce:latest

# Ver logs de Portainer
docker service logs portainer_portainer -f
```

## Pasos siguientes

- **Parte 2** (`docker-swarm-portainer-parte2-worker.md`): unir workers al clúster.
- **Parte 3** (`docker-swarm-portainer-parte3-segmentacion.md`): laboratorio de segmentación de redes front/back (UTP L14).
