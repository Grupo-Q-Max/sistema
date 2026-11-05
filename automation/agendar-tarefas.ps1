# Script PowerShell para criar o agendamento automatico do Robo no Windows
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$BatPath = Join-Path $ScriptDir "run-backup.bat"

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " CONFIGURANDO AGENDAMENTO AUTOMATICO - ROBO DOMINIO" -ForegroundColor Cyan
Write-Host " Projeto: $ProjectDir" -ForegroundColor Yellow
Write-Host " Executavel: $BatPath" -ForegroundColor Yellow
Write-Host "====================================================" -ForegroundColor Cyan

$Times = @("10:15", "12:15", "16:15", "19:15", "20:15")

foreach ($Time in $Times) {
    $CleanTime = $Time.Replace(":", "")
    $TaskName = "RoboDominio_$CleanTime"

    Write-Host "Criando agendamento para as $Time ($TaskName)..." -ForegroundColor White
    
    # Cria a tarefa no Agendador de Tarefas do Windows para executar diariamente no horario especificado
    schtasks.exe /create /tn $TaskName /tr "`"$BatPath`"" /sc daily /st $Time /f | Out-Null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host " [OK] Agendado para $Time com sucesso!" -ForegroundColor Green
    } else {
        Write-Host " [AVISO] Nao foi possivel agendar para $Time. Tente executar como Administrador." -ForegroundColor Red
    }
}

Write-Host "`nTodas as rotinas foram programadas no Windows Task Scheduler!" -ForegroundColor Green
Write-Host "Para conferir ou gerenciar, abra o 'Agendador de Tarefas' do Windows." -ForegroundColor Cyan
