#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}     SENTINEL MONITOR - INSTALADOR DO AGENTE MACOS    ${NC}"
echo -e "${BLUE}======================================================${NC}"
echo -e "O que esta instalacao faz:"
echo -e " - Cria ambiente Python isolado em /Library/Application Support/SentinelAgent"
echo -e " - Registra servico nativo launchd (sem criar usuario na tela de login)"
echo -e " - NAO abre portas de entrada no Mac (apenas envia telemetria de saida)."
echo -e "${BLUE}======================================================${NC}"

if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}[ERRO] Este script precisa ser executado com sudo.${NC}"
    echo "Por favor, execute com: sudo bash ..."
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

echo -e "${GREEN}[1/5] Validando Python 3 e curl no macOS...${NC}"
PYTHON_BIN=""
for CANDIDATE in /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do
    if [ -x "$CANDIDATE" ] && "$CANDIDATE" -c "import venv" &> /dev/null; then
        PYTHON_BIN="$CANDIDATE"
        break
    fi
done

if [ -z "$PYTHON_BIN" ] && command -v python3 &> /dev/null; then
    if python3 -c "import venv" &> /dev/null; then
        PYTHON_BIN="$(command -v python3)"
    fi
fi

if [ -z "$PYTHON_BIN" ]; then
    echo -e "${RED}[ERRO] Python 3 com suporte a venv não encontrado.${NC}"
    echo "Instale via Homebrew (brew install python) ou Xcode Command Line Tools (xcode-select --install) e tente novamente."
    exit 1
fi

APP_DIR="/Library/Application Support/SentinelAgent"
CONF_DIR="/etc/sentinel-agent"
PLIST_PATH="/Library/LaunchDaemons/com.sentinel.agent.plist"

echo -e "${GREEN}[2/5] Criando diretórios do agente (sem criar conta de usuário)...${NC}"
mkdir -p "$APP_DIR"
mkdir -p "$CONF_DIR"

echo -e "${GREEN}[3/5] Configurando ambiente Python isolado e instalando psutil...${NC}"
"$PYTHON_BIN" -m venv "$APP_DIR/venv"
"$APP_DIR/venv/bin/pip" install --upgrade pip --quiet
"$APP_DIR/venv/bin/pip" install "psutil>=5.9.0" --quiet

echo -e "${GREEN}[4/5] Baixando módulos do agente...${NC}"
for FILE in collector.py buffer.py agent.py; do
    if ! curl -fsSL "${API_URL}/agent-files/${FILE}" -o "${APP_DIR}/${FILE}"; then
        echo -e "${RED}[FALHA] Não foi possível baixar ${FILE} de ${API_URL}/agent-files/${FILE}${NC}"
        exit 1
    fi
done

HOSTNAME=$(scutil --get ComputerName 2>/dev/null || hostname)
OS_NAME="macOS"
OS_VERSION=$(sw_vers -productVersion 2>/dev/null || uname -r)
KERNEL=$(uname -r)
ARCH=$(uname -m)

echo -e "${GREEN}[5/5] Realizando handshake e registrando serviço launchd...${NC}"
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

PERMANENT_TOKEN=$("$PYTHON_BIN" -c "import json, sys; data = json.loads(sys.argv[1]); print(data.get('agent_token', ''))" "$RESPONSE_BODY")

if [ -z "$PERMANENT_TOKEN" ]; then
    echo -e "${RED}[FALHA] A resposta da API não continha a credencial permanente.${NC}"
    exit 1
fi

cat <<EOF > "${CONF_DIR}/agent.conf"
# Sentinel Monitor - Configuração Local do Agente (macOS)
API_URL="${API_URL}"
AGENT_TOKEN="${PERMANENT_TOKEN}"
INTERVAL_SECONDS=30
SERVICES="nginx,docker,postgres,mysqld,node"
EOF

chmod 600 "${CONF_DIR}/agent.conf"

cat <<EOF > "$PLIST_PATH"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.sentinel.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>${APP_DIR}/venv/bin/python3</string>
        <string>${APP_DIR}/agent.py</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${APP_DIR}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>SENTINEL_CONFIG_PATH</key>
        <string>${CONF_DIR}/agent.conf</string>
        <key>SENTINEL_BUFFER_PATH</key>
        <string>${APP_DIR}/buffer.json</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${APP_DIR}/agent.log</string>
    <key>StandardErrorPath</key>
    <string>${APP_DIR}/agent.err.log</string>
</dict>
</plist>
EOF

chmod 644 "$PLIST_PATH"
chown root:wheel "$PLIST_PATH"

launchctl bootout system/com.sentinel.agent 2>/dev/null || launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl bootstrap system "$PLIST_PATH" 2>/dev/null || launchctl load -w "$PLIST_PATH"

echo -e "${GREEN}======================================================${NC}"
echo -e "${GREEN}  SENTINEL AGENT (macOS) INSTALADO COM SUCESSO!       ${NC}"
echo -e "${GREEN}======================================================${NC}"
echo -e "O Mac já está conectado via launchd (sem criação de usuário) e enviando telemetria."
