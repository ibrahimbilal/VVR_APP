# Run from repo root: .\.cursor\skills\hostinger-vvr-deploy\scripts\make-archive.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..'))

if (Test-Path vvr-app.zip) {
  Remove-Item vvr-app.zip -Force
}

tar -a -c -f vvr-app.zip `
  --exclude=node_modules `
  --exclude=client/node_modules `
  --exclude=server/node_modules `
  --exclude=server/tmp `
  --exclude=.git `
  --exclude=vvr-app.zip .

$bytes = (Get-Item vvr-app.zip).Length
Write-Host "Created vvr-app.zip ($bytes bytes)"
