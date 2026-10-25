#!/bin/bash
# deploy-stack.sh - Desplegar stacks con Portainer o CLI

STACK_NAME=${1:-my-app}
COMPOSE_FILE=${2:-docker-compose.yml}

if [ ! -f "$COMPOSE_FILE" ]; then
    echo "❌ Archivo $COMPOSE_FILE no existe"
    echo "Uso: $0 <stack-name> <docker-compose-file>"
    echo ""
    echo "Ejemplos:"
    echo "  $0 nginx docker-compose-examples.yml"
    echo "  $0 redis-stack docker-compose-redis-stack.yml"
    exit 1
fi

echo "📦 Desplegando stack: $STACK_NAME"
echo "📄 Archivo: $COMPOSE_FILE"

# Deploy con docker stack
docker stack deploy -c "$COMPOSE_FILE" "$STACK_NAME"

echo -e "\n✅ Stack desplegado: $STACK_NAME"
echo ""

# Mostrar estado
echo "📊 Estado del stack:"
docker stack services "$STACK_NAME" --format "table {{.NAME}}\t{{.MODE}}\t{{.REPS}}\t{{.IMAGE}}"

echo -e "\n📝 Notas:"
echo "  - Accede a los servicios desde Portainer en http://localhost:9000"
echo "  - Para eliminar: docker stack rm $STACK_NAME"
echo "  - Ver logs: docker service logs -f $STACK_NAME_<service>"