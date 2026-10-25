#!/bin/bash
# join-worker.sh - Unir un nodo como Worker al Swarm

set -e

echo "🔧 Uniendo nodo como Worker al Swarm..."

# Verificar si Docker está instalado
if ! command -v docker &> /dev/null; then
    echo "❌ Docker no está instalado"
    exit 1
fi

# Verificar si ya es parte de un swarm
if docker info 2>/dev/null | grep -q "Swarm: active"; then
    echo "⚠️  Este nodo ya es parte de un swarm"
    read -p "¿Dejar el swarm actual y unirse a uno nuevo? (s/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Ss]$ ]]; then
        exit 0
    fi
    docker swarm leave --force
fi

# IP del maestro (1er argumento) y token del worker (2do argumento)
MASTER_IP=${1:-}
WORKER_TOKEN=${2:-}

# Pedir IP del maestro si no se pasó por argumento
if [ -z "$MASTER_IP" ]; then
    echo -e "\n📍 Ingresar información del nodo maestro"
    read -p "IP del nodo maestro (ej: 192.168.1.100): " MASTER_IP
fi

if [ -z "$MASTER_IP" ]; then
    echo "❌ IP del maestro es requerida"
    exit 1
fi

# Pedir token si no se pasó por argumento
if [ -z "$WORKER_TOKEN" ]; then
    echo -e "\n🔑 Ejecuta en el maestro: docker swarm join-token worker"
    echo "Y copia el TOKEN aquí"
    read -p "Token del worker: " WORKER_TOKEN
fi

if [ -z "$WORKER_TOKEN" ]; then
    echo "❌ Token es requerida"
    exit 1
fi

# Unirse al swarm
echo "🚀 Uniendo al swarm..."
docker swarm join --token $WORKER_TOKEN ${MASTER_IP}:2377

echo -e "\n✅ Nodo unido correctamente al swarm!"
echo "💡 Verifica desde el maestro: docker node ls"