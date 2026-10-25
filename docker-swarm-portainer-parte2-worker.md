# Docker Swarm con Portainer - Parte 2: Crear el Worker

Esta guía explica cómo agregar un nodo worker al clúster Docker Swarm creado en la Parte 1.

> **Archivos del proyecto que se usan aquí:**
> - `scripts/join-worker.sh` — automatiza esta guía
> - `scripts/validate-swarm.sh` — verifica que el worker se unió
> - `docker-compose-agent.yml` — agente Portainer para gestión multi-nodo

## Requisitos Previos

- Haber completado la **Parte 1: Crear el Maestro**
- IP del nodo maestro (ej: 192.168.1.100)
- El token de unión del worker (del **Paso 7** de la Parte 1)

## Paso 1: Preparar el Worker

### Asegúrate de tener Docker instalado:

```bash
# Verificar Docker
docker --version

# Si no está instalado (Ubuntu/Debian):
sudo apt update
sudo apt install -y docker.io
```

### Reiniciar el servicio Docker:

```bash
sudo systemctl restart docker
sudo systemctl enable docker
```

## Paso 2: Unir el Worker al Swarm

### Usa el comando del Paso 7 de la Parte 1:

```bash
# Ejemplo del comando (DEBES usar el TUYO del Paso 7):
docker swarm join --token SWMTKN_1_<TOKEN_AQUI> <IP_MAESTRO>:2377

# Ejemplo real:
docker swarm join --token SWMTKN_1_1a2b3c4d5e6f... 192.168.1.100:2377
```

### Si no tienes el token, obténlo desde el maestro:

```bash
# Ejecuta esto en el nodo maestro:
docker swarm join-token worker
```

Copia el comando completo que aparece y ejecútalo en el worker.

### Atajo: con el script del proyecto

```bash
chmod +x scripts/*.sh

# Con argumentos
./scripts/join-worker.sh <IP_MAESTRO> <TOKEN>

# O interactivo (pregunta IP y token)
./scripts/join-worker.sh
```

## Paso 3: Verificar que se unió al Swarm

### En el nodo worker:

```bash
# Verificar estado
docker info | grep -i swarm

# Deberías ver algo como:
# Swarm: active
```

### En el nodo maestro:

```bash
# Ver nodos
docker node ls

# Deberías ver el worker con status "Ready" y "Active"
# Ejemplo de salida:
# ID             HOSTNAME       STATUS  AVAILABILITY  MANAGER STATUS
# abc123def456 * maestro        Ready   Active        Leader
# xyz789uvw012   worker-node1   Ready   Active
```

O con el script:

```bash
./scripts/validate-swarm.sh
```

## Paso 4: Configurar Firewall en el Worker

```bash
# Abrir puertos necesarios
sudo ufw allow 2377/tcp    # Docker Swarm management
sudo ufw allow 4789/udp    # Docker overlay network
sudo ufw allow 7946/tcp    # Docker Swarm gossip
sudo ufw allow 7946/udp    # Docker Swarm gossip
```

## Paso 5: Probar la convergencia del stack de ejemplo

Si desplegaste el stack nginx en la Parte 1:

```bash
# Ver servicios del stack
docker service ls

# Ver réplicas (se distribuyen entre maestro y worker)
docker service ps my-nginx_web

# Deberías ver las tareas repartidas entre nodos
```

## Paso 6: Verificar desde Portainer

1. Accede a Portainer en el maestro: `http://<IP_MAESTRO>:9000`
2. Ve a la sección **Nodes**
3. Deberías ver tu worker listado
4. Ve a **Stacks** y verifica los servicios

Para ver el agente en cada nodo:

```bash
docker stack deploy -c docker-compose-agent.yml portainer-agent
```

## Paso 7: Comandos de diagnóstico del Worker

```bash
# Ver sistema operativo del nodo
docker node inspect --pretty $(hostname)

# Ver etiquetas (labels) del nodo
docker node ls --format "table {{.ID}}\t{{.Hostname}}\t{{.Availability}}"

# Añadir etiquetas al worker (opcional)
docker node update --label-add env=production --label-add role=web-worker $(docker info --format '{{.Swarm.NodeID}}')
```

## Paso 8: Agregar otro worker (repetir)

```bash
# En el nuevo worker:
docker swarm join --token SWMTKN_1_<TOKEN> <IP_MAESTRO>:2377
```

## Comandos útiles

```bash
# Desde el worker, ver tareas del maestro
docker node ps --no-trunc

# Verificar conectividad al swarm
docker info

# Forzar salida del worker (si necesitas removerlo)
docker swarm leave --force

# En el maestro, remover nodo:
docker node rm <NODE_ID>
```

## Solución de Problemas Comunes

### Error: "Error response to daemon: this node is not a swarm manager"

**Causa:** El comando se ejecutó en un worker sin permisos de manager.

**Solución:** Ejecuta estos comandos desde el nodo maestro.

### Error: "Error response to daemon: could not reach swarm manager"

**Causa:** Problemas de red entre el worker y el maestro.

**Solución:**
1. Verifica conectividad: `ping <IP_MAESTRO>`
2. Verifica puertos con: `nc -zv -w 3 <IP_MAESTRO> 2377`
3. Asegúrate de que los firewalls permitan el tráfico necesario

### Worker no aparece en `docker node ls`

**Causa:** El join no se completó correctamente.

**Solución:**
```bash
# En el worker, dejar de unirse
docker swarm leave --force

# Volver a intentar:
docker swarm join --token SWMTKN_1_<TOKEN> <IP_MAESTRO>:2377
```

### Portainer no muestra el worker

**Causa:** El worker está conectado pero no se sincroniza.

**Solución:**
1. Refresca la página de Portainer
2. Ve a **Nodes** y actualiza
3. Verifica que el worker tenga status "Ready"

## Resumen de flujo

```
Parte 1 (Maestro):
docker swarm init --advertise-addr <IP>
→ Guardar token del worker (Paso 7)

Parte 2 (Worker):
docker swarm join --token <TOKEN> <IP_MAESTRO>:2377

Verificación:
docker node ls (desde maestro)  o  ./scripts/validate-swarm.sh
```

## Próximos pasos

Con el worker conectado, puedes:
- Escalar servicios horizontalmente (`docker service scale <service>=5`)
- Asignar tareas específicas a workers usando labels
- Desplegar stacks con distribución multi-nodo
- Configurar servicios con `placement` y `constraints`
- Continuar con la **Parte 3** (`docker-swarm-portainer-parte3-segmentacion.md`): segmentación de redes front/back.
