// api/install.ps1.js — Vercel Serverless Function
// Returns the PowerShell install script with correct Content-Type
export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');

  const script = `
# ============================================================
#  SteamVault — Installateur automatique
#  Usage : irm steamvault.vercel.app/api/install.ps1 | iex
# ============================================================

$ErrorActionPreference = "Stop"

$APP_NAME    = "SteamVault"
$VERSION     = "2.0.0"
$GITHUB_REPO = "https://github.com/contactwebdevpro-cmyk/steamvault/releases/tag/SteamVault"   # <- remplace par ton repo
$RELEASE_URL = "https://github.com/$GITHUB_REPO/releases/latest/download/SteamVault.exe"
$DESKTOP     = [Environment]::GetFolderPath("Desktop")
$DEST        = Join-Path $DESKTOP "SteamVault.exe"

function Write-Banner {
  Write-Host ""
  Write-Host "  =====================================" -ForegroundColor Cyan
  Write-Host "   ███████╗████████╗███████╗ █████╗ ███╗   ███╗" -ForegroundColor Cyan
  Write-Host "   ██╔════╝╚══██╔══╝██╔════╝██╔══██╗████╗ ████║" -ForegroundColor Cyan
  Write-Host "   ███████╗   ██║   █████╗  ███████║██╔████╔██║" -ForegroundColor Cyan
  Write-Host "   ╚════██║   ██║   ██╔══╝  ██╔══██║██║╚██╔╝██║" -ForegroundColor Cyan
  Write-Host "   ███████║   ██║   ███████╗██║  ██║██║ ╚═╝ ██║" -ForegroundColor Cyan
  Write-Host "   ╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝" -ForegroundColor Cyan
  Write-Host "            VAULT  v$VERSION" -ForegroundColor DarkCyan
  Write-Host "  =====================================" -ForegroundColor Cyan
  Write-Host ""
}

function Write-Step {
  param([string]$Icon, [string]$Text)
  Write-Host "  $Icon  $Text" -ForegroundColor White
}

function Write-OK {
  param([string]$Text)
  Write-Host "  [OK] $Text" -ForegroundColor Green
}

function Write-Fail {
  param([string]$Text)
  Write-Host "  [ERR] $Text" -ForegroundColor Red
}

Clear-Host
Write-Banner

Write-Step "►" "Téléchargement de SteamVault $VERSION..."
Write-Host "     Source : $RELEASE_URL" -ForegroundColor DarkGray
Write-Host ""

try {
  # Téléchargement avec barre de progression
  $webClient = New-Object System.Net.WebClient
  $webClient.DownloadFile($RELEASE_URL, $DEST)

  Write-OK "Téléchargement terminé !"
  Write-Step "►" "Emplacement : $DEST"
  Write-Host ""

  # Optionnel : débloquer le fichier téléchargé depuis internet
  Unblock-File -Path $DEST -ErrorAction SilentlyContinue

  Write-Host ""
  Write-Host "  =====================================" -ForegroundColor Green
  Write-Host "   Installation terminee avec succes !" -ForegroundColor Green
  Write-Host "  =====================================" -ForegroundColor Green
  Write-Host ""
  Write-Host "  SteamVault est maintenant sur votre Bureau." -ForegroundColor Cyan
  Write-Host "  Double-cliquez sur SteamVault.exe pour lancer." -ForegroundColor Cyan
  Write-Host ""

  # Ouvrir le dossier Bureau
  Start-Process explorer.exe -ArgumentList $DESKTOP

} catch {
  Write-Host ""
  Write-Fail "Erreur lors du telechargement :"
  Write-Host "  $_" -ForegroundColor Red
  Write-Host ""
  Write-Host "  Téléchargez manuellement :" -ForegroundColor Yellow
  Write-Host "  https://github.com/$GITHUB_REPO/releases/latest" -ForegroundColor Yellow
  Write-Host ""
  exit 1
}

Read-Host "  Appuyez sur Entrée pour fermer"
`;

  res.status(200).send(script);
}
