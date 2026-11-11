# Instala o robo de eventos de Goias neste PC (Windows 10/11).
#
#   powershell -ExecutionPolicy Bypass -File windows\instala.ps1
#   powershell -ExecutionPolicy Bypass -File windows\instala.ps1 -Hora 09:15
#   powershell -ExecutionPolicy Bypass -File windows\instala.ps1 -SemAgendar
#
# 1) cria o .venv da pasta e instala o openpyxl;
# 2) roda um teste rapido (planilha em saida\eventos_goias.xlsx);
# 3) agenda a rodada diaria no Agendador de Tarefas. Se o PC estiver desligado
#    na hora, roda assim que ligar.
# Pode rodar de novo quantas vezes quiser: so atualiza o que ja existe.
# (Arquivo sem acento de proposito: o PowerShell 5 le .ps1 sem BOM como ANSI.)
param(
    [string]$Hora = "08:10",
    [switch]$SemAgendar
)
$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz
$tarefa = "Eventos Goias - robo diario"

# --- Python ---
$py = $null
foreach ($cand in @("py -3", "python")) {
    try {
        $v = & cmd /c "$cand --version 2>&1"
        if ($LASTEXITCODE -eq 0 -and $v -match "Python 3\.(\d+)" -and [int]$Matches[1] -ge 9) { $py = $cand; break }
    } catch {}
}
if (-not $py) {
    Write-Host "Python 3.9+ nao encontrado. Instale com:" -ForegroundColor Yellow
    Write-Host "    winget install -e --id Python.Python.3.12"
    Write-Host "(ou pelo python.org, marcando 'Add python.exe to PATH') e rode este script de novo."
    exit 1
}
Write-Host "Python: $py"

# --- .venv + dependencias ---
if (-not (Test-Path "$raiz\.venv\Scripts\pythonw.exe")) {
    Write-Host "Criando .venv..."
    & cmd /c "$py -m venv `"$raiz\.venv`""
    if ($LASTEXITCODE -ne 0) { throw "falha ao criar o .venv" }
}
& "$raiz\.venv\Scripts\python.exe" -m pip install --quiet --upgrade pip
& "$raiz\.venv\Scripts\python.exe" -m pip install --quiet -r "$raiz\requirements.txt"
if ($LASTEXITCODE -ne 0) { throw "falha ao instalar as dependencias" }

# --- teste rapido ---
Write-Host "Teste rapido (1 a 2 minutos)..."
& "$raiz\.venv\Scripts\python.exe" "$raiz\robo_eventos.py" --rapido
if ($LASTEXITCODE -ne 0) { Write-Host "O teste falhou: veja logs\robo_eventos.log" -ForegroundColor Yellow }

# --- agendamento ---
if (-not $SemAgendar) {
    $acao = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$raiz\windows\robo_eventos.vbs`"" -WorkingDirectory $raiz
    $gatilho = New-ScheduledTaskTrigger -Daily -At $Hora
    $ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $tarefa -Action $acao -Trigger $gatilho -Settings $ajustes `
        -Description "Varre as ticketeiras e atualiza a planilha de eventos de Goias" -Force | Out-Null
    Write-Host "Agendado: '$tarefa', todo dia as $Hora." -ForegroundColor Green
    Write-Host "Rodar agora pelo Agendador:  schtasks /run /tn `"$tarefa`""
}
Write-Host "Planilha: $raiz\saida\eventos_goias.xlsx" -ForegroundColor Green
