#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # Sem Cor

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}        SENTINEL MONITOR - INSTALADOR DO AGENTE       ${NC}"
echo -e "${BLUE}======================================================${NC}"
echo -e "${YELLOW}O que esta instalacao faz:${NC}"
echo -e " - Cria ambiente Python isolado em /opt/sentinel-agent (psutil)"
echo -e " - Registra daemon systemd (usuario restrito sentinel-agent)"
echo -e " - NAO abre nenhuma porta de entrada na sua VPS (apenas envia"
echo -e "   telemetria de saida a cada 30s para a API do Sentinel)."
echo -e "${BLUE}======================================================${NC}"

if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}[ERRO] Este script precisa ser executado como root.${NC}"
    echo "Por favor, execute: sudo bash $0 $@"
    exit 1
fi

TEMP_TOKEN=""
API_URL="http://localhost:10203/api/v1"

while [ $# -gt 0 ]; do
    case "$1" in
        --token=*)
            TEMP_TOKEN="${1#*=}"
            ;;
        --token)
            TEMP_TOKEN="$2"
            shift
            ;;
        --api-url=*)
            API_URL="${1#*=}"
            ;;
        --api-url)
            API_URL="$2"
            shift
            ;;
        *)
            ;;
    esac
    shift
done

if [ -z "$TEMP_TOKEN" ]; then
    echo -e "${RED}[ERRO] Parâmetro obrigatório ausente: --token=SEU_TOKEN_TEMPORARIO${NC}"
    exit 1
fi

systemctl stop sentinel-agent 2>/dev/null || true
rm -f /var/lib/sentinel-agent/buffer.json 2>/dev/null || true

echo -e "${GREEN}[1/5] Validando ambiente e dependências do sistema...${NC}"

NEED_DEPS=0
if ! command -v python3 &> /dev/null || ! command -v curl &> /dev/null; then
    NEED_DEPS=1
elif ! python3 -c "import ensurepip" &> /dev/null || ! python3 -m venv -h &> /dev/null; then
    NEED_DEPS=1
fi

if [ "$NEED_DEPS" -eq 1 ]; then
    echo "Instalando dependências essenciais (python3, python3-venv, python3-pip, curl)..."
    if command -v apt-get &> /dev/null; then
        apt-get update -y && apt-get install -y python3 python3-pip python3-venv curl
    elif command -v dnf &> /dev/null; then
        dnf install -y python3 python3-pip curl
    elif command -v yum &> /dev/null; then
        yum install -y python3 python3-pip curl
    fi
fi

echo -e "${GREEN}[2/5] Configurando diretórios do agente...${NC}"
mkdir -p /opt/sentinel-agent
mkdir -p /etc/sentinel-agent
mkdir -p /var/lib/sentinel-agent

echo -e "${GREEN}[3/5] Configurando ambiente Python isolado...${NC}"
rm -rf /opt/sentinel-agent/venv
if ! python3 -m venv /opt/sentinel-agent/venv; then
    echo "Falha ao criar venv. Instalando python3-venv e recriando..."
    if command -v apt-get &> /dev/null; then
        apt-get update -y && apt-get install -y python3-venv python3-pip
    fi
    rm -rf /opt/sentinel-agent/venv
    python3 -m venv /opt/sentinel-agent/venv
fi
/opt/sentinel-agent/venv/bin/pip install --upgrade pip --quiet
/opt/sentinel-agent/venv/bin/pip install "psutil>=5.9.0" --quiet

echo -e "${GREEN}[4/5] Baixando módulos do agente...${NC}"
for FILE in collector.py buffer.py agent.py; do
    if ! curl -fsSL "${API_URL}/agent-files/${FILE}" -o "/opt/sentinel-agent/${FILE}"; then
        echo -e "${RED}[FALHA] Não foi possível baixar ${FILE} de ${API_URL}/agent-files/${FILE}${NC}"
        exit 1
    fi
done

HOSTNAME=$(hostname)
OS_NAME="Linux"
OS_VERSION=""
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_NAME="${NAME:-Linux}"
    OS_VERSION="${VERSION_ID:-}"
fi
KERNEL=$(uname -r)
ARCH=$(uname -m)

echo -e "${GREEN}[5/5] Realizando handshake com o Sentinel Monitor...${NC}"
HANDSHAKE_PAYLOAD=$(cat <<EOF
{
  "temp_token": "$TEMP_TOKEN",
  "hostname": "$HOSTNAME",
  "os_name": "$OS_NAME",
  "os_version": "$OS_VERSION",
  "kernel": "$KERNEL",
  "arch": "$ARCH",
  "agent_version": "1.1.0"
}
EOF
)

HANDSHAKE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/agents/handshake" \
    -H "Content-Type: application/json" \
    -d "$HANDSHAKE_PAYLOAD")

HTTP_STATUS=$(echo "$HANDSHAKE_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$HANDSHAKE_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" -ne 200 ]; then
    echo -e "${RED}[FALHA] Não foi possível autenticar o agente (HTTP $HTTP_STATUS).${NC}"
    echo "Detalhes: $RESPONSE_BODY"
    exit 1
fi

PERMANENT_TOKEN=$(python3 -c "import json, sys; data = json.loads('''$RESPONSE_BODY'''); print(data.get('agent_token', ''))")

if [ -z "$PERMANENT_TOKEN" ]; then
    echo -e "${RED}[FALHA] A resposta da API não continha a credencial permanente.${NC}"
    exit 1
fi

cat <<EOF > /etc/sentinel-agent/agent.conf
# Sentinel Monitor - Configuração Local do Agente
API_URL="${API_URL}"
AGENT_TOKEN="${PERMANENT_TOKEN}"
INTERVAL_SECONDS=30
SERVICES="nginx,docker,postgres,mysqld,apache2"
EOF

chmod 600 /etc/sentinel-agent/agent.conf
chmod 755 /opt/sentinel-agent
chmod 755 /var/lib/sentinel-agent

cat <<EOF > /etc/systemd/system/sentinel-agent.service
[Unit]
Description=Sentinel Monitor Agent Daemon
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/sentinel-agent
ExecStart=/opt/sentinel-agent/venv/bin/python3 /opt/sentinel-agent/agent.py
Restart=always
RestartSec=5s

Environment=SENTINEL_CONFIG_PATH=/etc/sentinel-agent/agent.conf
Environment=SENTINEL_BUFFER_PATH=/var/lib/sentinel-agent/buffer.json

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable sentinel-agent || true
systemctl restart sentinel-agent || true

echo -e "${GREEN}======================================================${NC}"
echo -e "${GREEN}  SENTINEL AGENT INSTALADO E ATIVADO COM SUCESSO!   ${NC}"
echo -e "${GREEN}======================================================${NC}"
echo -e "O servidor já está conectado e enviando telemetria para o painel."
