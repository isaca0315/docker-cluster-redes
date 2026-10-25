#!/bin/bash
# verificar.sh - Verificación automática de segmentación y DNS (UTP Lab 14)
# Uso:  ./scripts/verificar.sh
# Esperado: Resultado: 7 OK, 0 FALLO

COMPOSE_FILE="docker-compose-network.yml"
COMPOSE="docker compose -f $COMPOSE_FILE"
DNS_IP="172.28.10.53"
DB_IP="172.28.20.20"

echo "🔍 Verificando segmentación y DNS..."
echo "=================================="

# Comprobar que el stack está levantado
if ! $COMPOSE ps --status running 2>/dev/null | grep -q "web"; then
    echo "❌ El stack no está levantado."
    echo "   Ejecuta primero:  docker compose -f $COMPOSE_FILE up -d"
    exit 1
fi

PASS=0
FAIL=0

# 1) web NO resuelve db por nombre
echo -n "1) web no resuelve db por nombre... "
if $COMPOSE exec -T web getent hosts db >/dev/null 2>&1; then
    echo "❌ FALLO - web resuelve db (debería no hacerlo)"
    FAIL=$((FAIL+1))
else
    echo "✅ OK"
    PASS=$((PASS+1))
fi

# 2) web NO alcanza db por IP (172.28.20.20:5432)
echo -n "2) web no alcanza db por IP... "
if $COMPOSE exec -T web sh -c "nc -z -w 3 $DB_IP 5432" >/dev/null 2>&1; then
    echo "❌ FALLO - web conecta a db por IP (debería no hacerlo)"
    FAIL=$((FAIL+1))
else
    echo "✅ OK"
    PASS=$((PASS+1))
fi

# 3) api SÍ alcanza db por IP (es el puente front -> back)
echo -n "3) api alcanza db por IP... "
if $COMPOSE exec -T api python -c \
    "import socket as s; s.create_connection(('$DB_IP', 5432), 3); print('connect')" >/dev/null 2>&1; then
    echo "✅ OK"
    PASS=$((PASS+1))
else
    echo "❌ FALLO - api no conecta a db"
    FAIL=$((FAIL+1))
fi

# 4) DNS: web.local -> 172.28.10.10
echo -n "4) nslookup web.local... "
if $COMPOSE exec -T web nslookup web.local $DNS_IP 2>/dev/null | grep -q "172.28.10.10"; then
    echo "✅ OK"
    PASS=$((PASS+1))
else
    echo "❌ FALLO - DNS web.local incorrecto"
    FAIL=$((FAIL+1))
fi

# 5) DNS: api.local -> 172.28.10.20
echo -n "5) nslookup api.local... "
if $COMPOSE exec -T web nslookup api.local $DNS_IP 2>/dev/null | grep -q "172.28.10.20"; then
    echo "✅ OK"
    PASS=$((PASS+1))
else
    echo "❌ FALLO - DNS api.local incorrecto"
    FAIL=$((FAIL+1))
fi

# 6) DNS: db.local -> 172.28.20.20
echo -n "6) nslookup db.local... "
if $COMPOSE exec -T api nslookup db.local $DNS_IP 2>/dev/null | grep -q "172.28.20.20"; then
    echo "✅ OK"
    PASS=$((PASS+1))
else
    echo "❌ FALLO - DNS db.local incorrecto"
    FAIL=$((FAIL+1))
fi

# 7) web responde HTTP 200
echo -n "7) web responde HTTP 200... "
if curl -s -o /dev/null -w "%{http_code}" http://localhost:8080 | grep -q "200"; then
    echo "✅ OK"
    PASS=$((PASS+1))
else
    echo "❌ FALLO - web no responde 200"
    FAIL=$((FAIL+1))
fi

echo ""
echo "=================================="
echo "Resultado: $PASS OK, $FAIL FALLO"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
