# Run from repo root: .\.cursor\skills\hostinger-vvr-deploy\scripts\make-archive.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..'))
npm run pack:hostinger
