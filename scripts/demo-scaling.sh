#!/bin/bash
# demo-scaling.sh - Demostrar escalado horizontal en el clúster Swarm
# Uso:  ./scripts/demo-scaling.sh [nombre_del_stack] [replicas]
# Ejemplo: ./scripts/demo-scaling.sh my-nginx 5

STACK=${1:-my-nginx}
SERVICE="${STACK}_web"
REPLICAS_TARGET=${2:-5}

echo "📈 Demostrando Escalado Horizontal"
echo "=================================="

# Comprobar que el servicio existe
if ! docker service ls --format '{{.Name}}' | grep -qx "$SERVICE"; then
    echo "❌ Servicio '$SERVICE' no encontrado."
    echo "   Servicios disponibles:"
    docker service ls --format '   - {{.Name}}'
    echo ""
    echo "Uso: $0 <nombre_del_stack> [replicas]"
    exit 1
fi

# Estado actual
echo -e "\n📊 Estado actual:"
docker service ls --filter "name=$SERVICE" \
  --format "table {{.Name}}\t{{.Mode}}\t{{.Replicas}}\t{{.Image}}"

# Escalar
echo -e "\n⬆️  Escalando '$SERVICE' a $REPLICAS_TARGET réplicas..."
docker service scale "${SERVICE}=${REPLICAS_TARGET}"

sleep 3

# Nuevo estado
echo -e "\n📊 Estado después del escalado:"
docker service ps "$SERVICE" \
  --format "table {{.ID}}\t{{.Name}}\t{{.Node}}\t{{.CurrentState}}"

echo -e "\n✅ Escalado completado"
echo "   Para volver a 1 réplica:  docker service scale ${SERVICE}=1"
