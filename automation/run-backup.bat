@echo off
setlocal
cd /d "%~dp0.."

echo ==================================================== >> "%USERPROFILE%\Desktop\backups_dominio\execucao.log" 2>&1
echo [INFO] Disparando Robo Dominio Backup: %date% %time% >> "%USERPROFILE%\Desktop\backups_dominio\execucao.log" 2>&1

call npx tsx automation/download-dominio-backup.ts --headless >> "%USERPROFILE%\Desktop\backups_dominio\execucao.log" 2>&1

echo [INFO] Finalizado com codigo: %ERRORLEVEL% >> "%USERPROFILE%\Desktop\backups_dominio\execucao.log" 2>&1
echo ==================================================== >> "%USERPROFILE%\Desktop\backups_dominio\execucao.log" 2>&1
endlocal
