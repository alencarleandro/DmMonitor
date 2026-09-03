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
New-Item -ItemType Directory -Force -Path (Join-Path $dmRoot '.tmp') | Out-Null
& $dmGo -C backend build -o ../.tmp/dmmonitor.exe ./cmd/server
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar a API.' }
& (Join-Path $dmRoot '.tmp/dmmonitor.exe')
