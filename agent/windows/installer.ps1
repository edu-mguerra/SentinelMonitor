& {
    $ErrorActionPreference = "Stop"

    Write-Host "======================================================" -ForegroundColor Cyan
    Write-Host "    SENTINEL MONITOR - INSTALADOR DO AGENTE WINDOWS   " -ForegroundColor Cyan
    Write-Host "======================================================" -ForegroundColor Cyan
    Write-Host "O que esta instalacao faz:" -ForegroundColor Yellow
    Write-Host " - Cria ambiente Python isolado em C:\ProgramData\SentinelAgent"
    Write-Host " - Registra tarefa nativa SYSTEM (sem criar conta de usuario)"
    Write-Host " - NAO abre portas de entrada no Windows (apenas envia telemetria de saida)."
    Write-Host "======================================================" -ForegroundColor Cyan

    $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Host "[ERRO] Execute este script no PowerShell como Administrador (Botao direito -> Executar como administrador)." -ForegroundColor Red
        return
    }

    $TempToken = "__TEMP_TOKEN__"
    $ApiUrl = "__API_URL__"

    if ($env:SENTINEL_TOKEN) { $TempToken = $env:SENTINEL_TOKEN }
    if ($env:SENTINEL_API_URL) { $ApiUrl = $env:SENTINEL_API_URL }

    if ([string]::IsNullOrWhiteSpace($TempToken) -or $TempToken.StartsWith("__TEMP_")) {
        Write-Host "[ERRO] Token de instalacao nao informado." -ForegroundColor Red
        return
    }

    if ([string]::IsNullOrWhiteSpace($ApiUrl) -or $ApiUrl.StartsWith("__API_")) {
        $ApiUrl = "http://localhost:10203/api/v1"
    }
    $ApiUrl = $ApiUrl.TrimEnd("/")

    function Find-RealPython {
        foreach ($cand in @("python", "python3", "py")) {
            $cmdInfo = Get-Command $cand -ErrorAction SilentlyContinue
            if ($cmdInfo -and $cmdInfo.Source -notlike "*\WindowsApps\*") {
                try {
                    $prevPref = $ErrorActionPreference
                    $ErrorActionPreference = "Continue"
                    $ver = & $cmdInfo.Source -c "import sys; print(sys.version_info[0])" 2>$null
                    $code = $LASTEXITCODE
                    $ErrorActionPreference = $prevPref
                    if ($code -eq 0 -and "$ver".Trim() -eq "3") {
                        return $cmdInfo.Source
                    }
                } catch {}
            }
        }
        $searchRoots = @(
            (Join-Path $env:ProgramFiles "Python3*"),
            (Join-Path $env:LocalAppData "Programs\Python\Python3*")
        )
        foreach ($pattern in $searchRoots) {
            $dirs = Get-Item $pattern -ErrorAction SilentlyContinue | Sort-Object Name -Descending
            foreach ($d in $dirs) {
                $exe = Join-Path $d.FullName "python.exe"
                if (Test-Path $exe) {
                    return $exe
                }
            }
        }
        return $null
    }

    Write-Host "[1/5] Validando Python 3 no Windows..." -ForegroundColor Green
    $PythonCmd = Find-RealPython

    if (-not $PythonCmd) {
        if (Get-Command winget -ErrorAction SilentlyContinue) {
            Write-Host "Python 3 nao encontrado. Instalando Python 3.12 via winget (pode levar 1-2 minutos)..." -ForegroundColor Yellow
            $prevPref = $ErrorActionPreference
            $ErrorActionPreference = "Continue"
            winget install -e --id Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
            $ErrorActionPreference = $prevPref
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
            $PythonCmd = Find-RealPython
        }
    }

    if (-not $PythonCmd) {
        Write-Host "[ERRO] Python 3 nao encontrado no Windows. Instale em https://www.python.org/downloads/ (marque 'Add Python to PATH') e execute novamente." -ForegroundColor Red
        return
    }

    Write-Host "Python detectado: $PythonCmd" -ForegroundColor Gray

    $AppDir = Join-Path $env:ProgramData "SentinelAgent"
    Write-Host "[2/5] Criando diretorio do agente em $AppDir (sem criar usuario)..." -ForegroundColor Green
    New-Item -ItemType Directory -Force -Path $AppDir | Out-Null

    Write-Host "[3/5] Configurando ambiente Python isolado e instalando psutil..." -ForegroundColor Green
    $VenvDir = Join-Path $AppDir "venv"
    $prevPref = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $PythonCmd -m venv $VenvDir
    if ($LASTEXITCODE -ne 0) {
        $ErrorActionPreference = $prevPref
        Write-Host "[ERRO] Falha ao criar ambiente virtual Python (venv)." -ForegroundColor Red
        return
    }
    $VenvPython = Join-Path $VenvDir "Scripts\python.exe"
    & $VenvPython -m pip install --upgrade pip --quiet 2>$null
    & $VenvPython -m pip install "psutil>=5.9.0" --quiet
    $pipExit = $LASTEXITCODE
    $ErrorActionPreference = $prevPref
    if ($pipExit -ne 0) {
        Write-Host "[ERRO] Falha ao instalar a biblioteca psutil no ambiente virtual." -ForegroundColor Red
        return
    }

    Write-Host "[4/5] Baixando modulos do agente..." -ForegroundColor Green
    foreach ($File in @("collector.py", "buffer.py", "agent.py")) {
        $Dest = Join-Path $AppDir $File
        Invoke-WebRequest -Uri "$ApiUrl/agent-files/$File" -OutFile $Dest -UseBasicParsing
    }

    $OsInfo = Get-CimInstance Win32_OperatingSystem
    $Hostname = $env:COMPUTERNAME
    $OsName = "Windows"
    $OsVersion = "$($OsInfo.Caption) ($($OsInfo.Version))"
    $Kernel = $OsInfo.Version
    $Arch = $env:PROCESSOR_ARCHITECTURE

    Write-Host "[5/5] Realizando handshake e registrando servico SYSTEM..." -ForegroundColor Green
    $HandshakeJson = @{
        temp_token = $TempToken
        hostname = $Hostname
        os_name = $OsName
        os_version = $OsVersion
        kernel = $Kernel
        arch = $Arch
        agent_version = "1.1.0"
    } | ConvertTo-Json -Compress

    $HandshakeBytes = [System.Text.Encoding]::UTF8.GetBytes($HandshakeJson)
    try {
        $HandshakeResp = Invoke-RestMethod -Uri "$ApiUrl/agents/handshake" -Method Post -ContentType "application/json; charset=utf-8" -Body $HandshakeBytes
    } catch {
        Write-Host "[FALHA] Erro no handshake com a API ($ApiUrl/agents/handshake): $($_.Exception.Message)" -ForegroundColor Red
        return
    }

    $PermanentToken = $HandshakeResp.agent_token
    if ([string]::IsNullOrWhiteSpace($PermanentToken)) {
        Write-Host "[FALHA] A API nao retornou o token permanente do agente." -ForegroundColor Red
        return
    }

    $ConfPath = Join-Path $AppDir "agent.conf"
    $ConfContent = @"
API_URL="$ApiUrl"
AGENT_TOKEN="$PermanentToken"
INTERVAL_SECONDS=10
SERVICES="nginx,docker,postgres,mysqld,node"
"@
    [System.IO.File]::WriteAllText($ConfPath, $ConfContent, (New-Object System.Text.UTF8Encoding $false))

    $TaskName = "SentinelMonitorAgent"
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }

    $AgentScript = Join-Path $AppDir "agent.py"
    $VenvPythonW = Join-Path $VenvDir "Scripts\pythonw.exe"
    if (-not (Test-Path $VenvPythonW)) { $VenvPythonW = $VenvPython }
    $Action = New-ScheduledTaskAction -Execute $VenvPythonW -Argument "`"$AgentScript`"" -WorkingDirectory $AppDir
    $TriggerStartup = New-ScheduledTaskTrigger -AtStartup
    $TriggerLogon = New-ScheduledTaskTrigger -AtLogOn
    $Principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $Settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -RestartCount 999 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit ([TimeSpan]::Zero) `
        -Hidden

    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger @($TriggerStartup, $TriggerLogon) -Principal $Principal -Settings $Settings | Out-Null
    Start-ScheduledTask -TaskName $TaskName

    Write-Host "======================================================" -ForegroundColor Green
    Write-Host "  SENTINEL AGENT (Windows) INSTALADO COM SUCESSO!     " -ForegroundColor Green
    Write-Host "======================================================" -ForegroundColor Green
    Write-Host "O Windows esta rodando o agente como SYSTEM (sem criar usuario) e enviando telemetria." -ForegroundColor Gray
}
