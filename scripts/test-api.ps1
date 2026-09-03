$ErrorActionPreference = 'Stop'
$dmRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $dmRoot
$dmPortableGo = Join-Path $dmRoot '.tools/go/bin/go.exe'
if (Test-Path -LiteralPath $dmPortableGo) {
    $dmGo = $dmPortableGo
    $env:GOPATH = Join-Path $dmRoot '.tools/gopath'
    $env:GOCACHE = Join-Path $dmRoot '.tools/gocache'
} else {
    $dmGo = (Get-Command go -ErrorAction Stop).Source
}
if (-not $env:TEST_DATABASE_URL -and (Test-Path -LiteralPath '.env')) {
    foreach ($dmLine in Get-Content -LiteralPath '.env') {
        if ($dmLine -match '^DATABASE_URL\s*=\s*(.+)$') {
            $env:TEST_DATABASE_URL = $matches[1].Trim().Trim('"').Trim("'")
        }
    }
}
& $dmGo -C backend test -count=1 -v ./...
if ($LASTEXITCODE -ne 0) { throw 'Falha nos testes da API.' }
& $dmGo -C backend vet ./...
if ($LASTEXITCODE -ne 0) { throw 'Falha no go vet.' }
