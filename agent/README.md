# Sentinel Monitor - Agentes

Este diretório contém os códigos dos agentes autônomos que serão instalados nas VPS e servidores monitorados pelos clientes.

## Estrutura:
- `linux/`: Agente Python nativo para servidores Linux (Ubuntu, Debian, CentOS, AlmaLinux, Rocky, etc.).
  - Executa sob usuário restrito `sentinel-agent` (sem root).
  - Coleta CPU, RAM, Disco e Rede via `psutil`.
  - Buffer local com tolerância a falhas de rede.
  - Instalador one-liner com token temporário e serviço systemd.
- `windows/`: Agente para Windows Server (Fase 6).
