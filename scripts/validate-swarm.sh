#!/bin/bash
# validate-swarm.sh - Validar configuración de Docker Swarm

echo "🔍 Validando configuración de Docker Swarm..."
echo "==============================================="

# 1. Verificar Docker
echo -e "\n1️⃣ Verificando Docker..."
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    echo "   ✅ $DOCKER_VERSION"
else
    echo "   ❌ Docker no está instalado"
    exit 1
fi

# 2. Verificar estado del Swarm
echo -e "\n2️⃣ Estado del Swarm..."
if docker info 2>/dev/null | grep -q "Swarm: active"; then
    echo "   ✅ Swarm está activo"
else
    echo "   ⚠️  Swarm no está activo (ejecuta init-swarm.sh)"
fi

# 3. Mostrar nodos
echo -e "\n3️⃣ Nodos del clúster:"
docker node ls 2>/dev/null --format "table {{.ID}}\t{{.Hostname}}\t{{.Status}}\t{{.Availability}}\t{{.ManagerStatus}}" || echo "   No hay nodos o Swarm no está activo"

# 4. Verificar Puertos
echo -e "\n4️⃣ Verificando puertos necesarios..."
PORTS=(2377/tcp 4789/udp 7946/tcp 7946/udp 9000/tcp 8000/tcp)
for port in "${PORTS[@]}"; do
    PORT=${port%/*}
    if ss -tuln | grep -q ":$PORT "; then
        echo "   ✅ Puerto $port está activo"
    else
        echo "   ⚠️  Puerto $port no está activo"
    fi
done

# 5. Verificar stacks corriendo
echo -e "\n5️⃣ Stacks desplegados:"
STACKS=$(docker stack ls 2>/dev/null --format '{{.Name}}')
if [ -n "$STACKS" ]; then
    echo "$STACKS" | while read stack; do
        VERSION=$(docker stack ps "$stack" 2>/dev/null | grep -c "Running" | head -1)
        echo "   - $stack (${VERSION} tareas)"
    done
else
    echo "   No hay stacks desplegados"
fi

# 6. Verificar recursos
echo -e "\n6️⃣ Recursos del sistema:"
if command -v free &> /dev/null; then
    MEM=$(free -h | awk '/^Mem:/ {print $2}')
    echo "   Memoria total: $MEM"
fi

# 7. Estado de discos
if command -v df &> /dev/null; then
    echo -e "\n7️⃣ Uso de discos:"
    df -h / 2>/dev/null | tail -1 | awk '{print "   / (raíz): " $3 "/" $2 " (" $5 " usado)"}'
fi

echo -e "\n✅ Validación completada"