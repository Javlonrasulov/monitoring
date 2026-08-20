# Uploads the current working tree to the server and rebuilds the monitor stack.
# Usage: pwsh deploy/redeploy.ps1 [-SkipBuild]

param(
    [string]$ServerHost = "ubuntu@89.39.95.41",
    [string]$KeyPath = "$env:USERPROFILE\.ssh\vm58627_rsa",
    [string]$RemoteDir = "/opt/monitor",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$archive = Join-Path $env:TEMP "monitor-src.tar.gz"

Write-Host "Packing $repoRoot ..."
tar -czf $archive `
    --exclude=node_modules --exclude=.next --exclude=dist --exclude=build `
    --exclude=./apps/android --exclude=.idea --exclude=.gradle `
    --exclude=*.tsbuildinfo --exclude=generated --exclude=uploads `
    --exclude=.env.production --exclude=./deploy/public `
    -C $repoRoot .

Write-Host "Uploading ..."
scp -i $KeyPath $archive "${ServerHost}:/tmp/monitor-src.tar.gz"
ssh -i $KeyPath $ServerHost "tar -xzf /tmp/monitor-src.tar.gz -C $RemoteDir && rm /tmp/monitor-src.tar.gz"
Remove-Item $archive

if (-not $SkipBuild) {
    Write-Host "Building images (this takes a few minutes) ..."
    ssh -i $KeyPath $ServerHost "cd $RemoteDir/deploy && docker compose --env-file .env.production -f docker-compose.prod.yml build api admin user"
}

Write-Host "Restarting stack ..."
ssh -i $KeyPath $ServerHost "cd $RemoteDir/deploy && docker compose --env-file .env.production -f docker-compose.prod.yml up -d --force-recreate nginx && docker compose --env-file .env.production -f docker-compose.prod.yml up -d && docker compose --env-file .env.production -f docker-compose.prod.yml ps"

Write-Host "Smoke test ..."
ssh -i $KeyPath $ServerHost "bash $RemoteDir/deploy/smoke-test.sh"
