# Sentinel Monitor

> Plataforma SaaS Multi-Tenant de Monitoramento de Infraestrutura, Servidores VPS, Sites, APIs e Portas TCP.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.109+-009688.svg?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-15+-000000.svg?style=flat&logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB.svg?style=flat&logo=python&logoColor=white)](https://www.python.org)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4+-38B2AC.svg?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com)

---

## 📌 Visão Geral

O **Sentinel Monitor** é uma solução completa para observabilidade de servidores e serviços web, combinando agentes autônomos multiplataforma (Linux, macOS e Windows) com monitores sintéticos externos protegidos contra SSRF, gerenciamento de incidentes e alertas em tempo real.

---

## 🚀 Principais Funcionalidades

### 🖥️ Agente Multiplataforma (Linux, macOS e Windows)
- **Instalação One-Liner:** Scripts de instalação automatizados com configuração de serviço nativo do sistema operacional:
  - **Linux:** Daemon `systemd` sob usuário de privilégio mínimo `sentinel-agent`.
  - **macOS:** Daemon `launchd` como serviço de sistema sem criar usuário na tela de login.
  - **Windows:** Tarefa agendada nativa rodando sob `NT AUTHORITY\SYSTEM` com tempo de execução perpétuo.
- **Segurança de Rede:** O agente opera exclusivamente em modo outbound (HTTPS POST). Nenhuma porta de entrada é aberta na máquina monitorada.
- **Buffer Offline Resiliente:** Em caso de oscilação de conexão, as métricas são armazenadas localmente em buffer criptografado e descarregadas automaticamente assim que a conectividade for restabelecida.

### 📊 Telemetria Avançada em Tempo Real
- **Hardware:** Consumo de CPU, carga média (load average), memória RAM física, memória Swap, frequência de clock, temperatura de sensores e nível de bateria/tomada.
- **Armazenamento e Disco:** Partições montadas, espaço livre/ocupado e taxa de I/O em tempo real (leitura e escrita em KB/s).
- **Rede e Conexões:** Taxa de transferência de rede (download/upload em KB/s), portas em escuta (LISTEN) e contagem de conexões TCP ativas (ESTABLISHED, TIME_WAIT, CLOSE_WAIT).
- **Processos e Aplicações:** Top 8 processos que mais consomem CPU e memória, detecção de containers Docker, status e contagem de restarts de aplicações PM2.
- **Auditoria de Acesso:** Usuários conectados ao servidor e histórico de falhas de login SSH.

### 🌐 Monitores Sintéticos Externos
- Suporte a verificação periódica de **HTTP**, **HTTPS** e **Portas TCP** (com suporte a domínios ou IPs diretos no formato `IP:Porta`).
- Monitoramento contínuo de status code, tempo de resposta (latência) e expiração de certificados SSL/TLS.
- **Proteção Anti-SSRF:** Bloqueio automático pós-resolução de DNS contra loopback, redes privadas RFC 1918 e endpoints de metadados em nuvem (`169.254.169.254`).

### 🏢 Multi-Tenancy e Controle de Acesso (RBAC)
- Suporte completo a múltiplos Tenants (Organizações) com isolamento rigoroso de dados no banco.
- Níveis de permissão por organização: `Owner`, `Admin`, `Operator` e `Viewer`.
- **Painel Master Exclusivo:** Gestão global de usuários cadastrados e controle centralizado do pipeline de distribuição de atualizações do agente.

### 🔔 Alertas e Notificações Personalizadas
- Gatilhos globais da organização e limites personalizados por servidor (CPU, RAM, Disco e Timeout de Queda).
- Integração SMTP (Gmail ou servidor dedicado) com templates HTML para incidentes, recuperação e boas-vindas.
- Abertura e encerramento automático de incidentes baseado na saúde dos servidores e monitores.

---

## 🏗️ Estrutura do Repositório

```text
SentinelMonitor/
├── backend/                  # API REST FastAPI + SQLAlchemy 2.0 (Async) + Pydantic v2
│   ├── app/
│   │   ├── api/              # Endpoints REST (Auth, Servers, Monitors, Alerts, Incidents, Admin)
│   │   ├── core/             # Configurações de ambiente, segurança e JWT
│   │   ├── database/         # Sessões assíncronas do banco de dados (MySQL / PostgreSQL)
│   │   ├── models/           # Modelos de entidades SQLAlchemy
│   │   ├── schemas/          # Schemas de validação e serialização Pydantic
│   │   └── services/         # Scheduler de monitoramento, despachante de alertas e verificadores
│   ├── tests/                # Testes automatizados com pytest e aiosqlite
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                 # Interface Web em Next.js 15 (App Router) + Tailwind CSS
│   ├── src/
│   │   ├── app/              # Páginas e rotas do Next.js
│   │   ├── components/       # Componentes visuais, cards e gráficos (Recharts)
│   │   ├── contexts/         # Contexto de autenticação e controle de tenant
│   │   ├── lib/              # Utilitários de API e formatação de data/hora pt-BR
│   │   ├── services/         # Clientes de comunicação com a API REST
│   │   └── types/            # Tipagens TypeScript compartilhadas
│   ├── package.json
│   └── tsconfig.json
├── agent/                    # Código-fonte do Sentinel Agent
│   ├── linux/                # Coletor psutil, buffer offline e instalador Linux
│   ├── macos/                # Instalador e serviço launchd para macOS
│   └── windows/              # Instalador PowerShell e tarefa agendada SYSTEM para Windows
├── docker-compose.yml        # Orquestração de containers para desenvolvimento
├── .env.example              # Modelo de variáveis de ambiente do backend
└── README.md
```

---

## 🛠️ Como Executar o Projeto

### Pré-requisitos
- [Python 3.10+](https://www.python.org/)
- [Node.js 18+](https://nodejs.org/)
- [MySQL 8.0+](https://www.mysql.com/) ou [PostgreSQL 16+](https://www.postgresql.org/)

---

### 1. Configurando o Backend

```bash
# Clone o repositório
git clone https://github.com/edu-mguerra/SentinelMonitor.git
cd SentinelMonitor/backend

# Crie e ative o ambiente virtual
python3 -m venv .venv
source .venv/bin/activate  # No Windows: .venv\Scripts\activate

# Instale as dependências
pip install -r requirements.txt

# Configure as variáveis de ambiente
cp ../.env.example .env
# Edite as variáveis no arquivo .env (banco de dados, SECRET_KEY, SMTP)

# Inicie o servidor da API
uvicorn app.main:app --host 0.0.0.0 --port 10203 --reload
```

A documentação Swagger estará disponível em: `http://localhost:10203/docs`

---

### 2. Configurando o Frontend

```bash
cd ../frontend

# Configure as variáveis de ambiente do frontend
cp .env.local.example .env.local

# Instale os pacotes e execute o servidor de desenvolvimento
npm install
npm run dev
```

Acesse o painel web em: `http://localhost:3000`

---

### 3. Executando a Suíte de Testes

```bash
cd backend
.venv/bin/pytest -v
```

---

## 🛡️ Segurança e Privacidade

1. **Privilégio Mínimo:** Processos do agente executam sem permissões administrativas desnecessárias e sem expor portas TCP/UDP na VPS.
2. **Criptografia e Senhas:** Hashing de senhas com `bcrypt` e autenticação baseada em tokens JWT.
3. **Isolamento Multi-Tenant:** Todas as consultas no banco de dados aplicam o filtro de escopo por `organization_id`.
4. **Proteção Anti-SSRF:** Validação rigorosa dos destinos dos monitores externos antes da execução das sondagens de rede.

---

## 📄 Licença

Este projeto é disponibilizado sob a licença [MIT](LICENSE).
