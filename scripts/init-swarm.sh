#!/bin/bash
# init-swarm.sh - Inicializar Docker Swarm y Portainer

set -e

echo "🔧 Inicializando Docker Swarm..."

# Verificar si Docker está instalado
if ! command -v docker &> /dev/null; then
    echo "❌ Docker no está instalado"
    exit 1
fi

# Verificar si ya es un swarm
if docker info 2>/dev/null | grep -q "Swarm: active"; then
    echo "⚠️  El nodo ya es parte de un swarm"
    read -p "¿Continuar? (s/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Ss]$ ]]; then
        exit 0
    fi
fi

# Obtener IP del nodo
IP_ADDRESS=$(hostname -I | awk '{print $1}')

if [ -z "$IP_ADDRESS" ]; then
    echo "❌ No se pudo obtener la IP del nodo"
    exit 1
fi

echo "📍 IP detectada: $IP_ADDRESS"
read -p "¿Usar esta IP? (s/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Ss]$ ]]; then
    read -p "Ingresar IP manualmente: " IP_ADDRESS
fi

# Inicializar swarm
echo "🚀 Inicializando swarm..."
docker swarm init --advertise-addr $IP_ADDRESS

# Mostrar token para workers
echo -e "\n🔑 Token para agregar workers:"
docker swarm join-token worker

# Desplegar Portainer
echo -e "\n📊 Desplegando Portainer..."
if [ -f "docker-compose-portainer.yml" ]; then
    docker stack deploy -c docker-compose-portainer.yml portainer
    echo "✅ Portainer desplegado"
else
    echo "❌ No se encontró docker-compose-portainer.yml"
fi

echo -e "\n✅ ¡Swarm inicializado correctamente!"
echo "🌐 Accede a Portainer en: http://$IP_ADDRESS:9001"