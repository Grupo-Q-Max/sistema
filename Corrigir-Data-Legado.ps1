param([string]$ProjectPath = '.')
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path -LiteralPath $ProjectPath).Path
$file = Join-Path $project 'scripts\legacy\convert.ts'
if (!(Test-Path -LiteralPath $file)) { throw 'convert.ts nao encontrado.' }
$text = [System.IO.File]::ReadAllText($file)
$pattern = '(?m)^export function legacyDate\(value:any\):Date\|null \{[^\r\n]*\}'
$matchesFound = [regex]::Matches($text, $pattern)
if ($matchesFound.Count -ne 1) { throw 'Funcao diferente da analisada. Nenhum arquivo foi alterado.' }
$replacement = @'
export function legacyDate(value:any):Date|null {if(value===null||value===undefined)return null;const text=String(value).trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return null;const year=Number(text.slice(0,4));if(year<1000||year>9999)return null;const date=new Date(text+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===text?date:null;}
'@
$updated = $text.Substring(0,$matchesFound[0].Index) + $replacement.Trim() + $text.Substring($matchesFound[0].Index+$matchesFound[0].Length)
$backupDirectory = Join-Path $project ('relatorios_importacao\backup_validacao_data_' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $backupDirectory | Out-Null
Copy-Item -LiteralPath $file -Destination (Join-Path $backupDirectory 'convert.ts')
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($file,$updated,$utf8)
Write-Host 'Validacao corrigida. Datas fora da faixa suportada permanecerao nulas.'
Write-Host 'O banco e o SQL original nao foram alterados.'
Write-Host "Backup do codigo: $backupDirectory"
