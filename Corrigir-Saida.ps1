param([string]$ProjectPath = '.')
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path -LiteralPath $ProjectPath).Path
$utf8 = New-Object System.Text.UTF8Encoding($false)
$changes = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'alteracoes.json')) | ConvertFrom-Json
$originals = @{}
$updated = @{}
foreach ($change in $changes) {
    $relative = ([string]$change.file).Replace('/', '\')
    $target = Join-Path $project $relative
    if (!$originals.ContainsKey($relative)) {
        if (!(Test-Path -LiteralPath $target -PathType Leaf)) { throw "Arquivo ausente: $target" }
        $originals[$relative] = [System.IO.File]::ReadAllText($target)
        $updated[$relative] = $originals[$relative]
    }
    $content = $updated[$relative]
    $ending = "`n"
    if ($content.Contains("`r`n")) { $ending = "`r`n" }
    $after = ([string]$change.after).Replace("`r`n", "`n").Replace("`n", $ending)
    if ($content.Contains($after)) { continue }
    $matched = $null
    foreach ($candidate in (@($change.before) + @($change.alternatives))) {
        $before = ([string]$candidate).Replace("`r`n", "`n").Replace("`n", $ending)
        $position = $content.IndexOf($before)
        if ($position -ge 0 -and $content.IndexOf($before, $position + $before.Length) -lt 0) {
            $matched = $before
            break
        }
    }
    if ($null -eq $matched) {
        throw "Codigo diferente do analisado ($($change.label)). Nenhum arquivo foi alterado. Envie o ZIP atual do codigo."
    }
    $updated[$relative] = $content.Replace($matched, $after)
}
$files = @($originals.Keys | Where-Object { $originals[$_] -cne $updated[$_] })
if ($files.Count -eq 0) { Write-Host 'Correcao de saida ja instalada.'; exit 0 }
$backup = Join-Path $project ('relatorios_importacao\backup_filtro_saida_' + [guid]::NewGuid().ToString('N'))
foreach ($relative in $files) {
    $destination = Join-Path $backup $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $project $relative) -Destination $destination
}
try {
    foreach ($relative in $files) {
        [System.IO.File]::WriteAllText((Join-Path $project $relative), $updated[$relative], $utf8)
    }
} catch {
    foreach ($relative in $files) {
        Copy-Item -LiteralPath (Join-Path $backup $relative) -Destination (Join-Path $project $relative) -Force
    }
    throw
}
Write-Host 'Regra corrigida: ultima competencia visivel = mes anterior ao mes da saida.'
Write-Host 'Nenhum dado do banco foi alterado. O historico permanece gravado.'
Write-Host "Backup do codigo: $backup"
Write-Host 'Reinicie a API e atualize a pagina.'
