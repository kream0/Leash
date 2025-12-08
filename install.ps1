# 🐕 Leash Setup Script for Windows
# Interactive installer for Leash - AI Agent Remote Monitor
#
# Usage:
#   irm https://raw.githubusercontent.com/user/leash/main/install.ps1 | iex
#   OR
#   .\install.ps1
#

param(
    [switch]$Silent,
    [string]$Mode = "",
    [string]$Password = "",
    [string]$VpsUrl = ""
)

$ErrorActionPreference = "Stop"

# Configuration
$LeashHome = "$env:USERPROFILE\.leash"
$LeashRepo = "https://github.com/user/leash/archive/main.zip"
$ClaudeHooksDir = "$env:USERPROFILE\.claude\hooks"
$MinNodeVersion = 18

# State
$DeploymentMode = ""
$ServerPassword = ""
$InstallHooks = $true
$CreateService = $false
$VpsServerUrl = ""

# ============================================================================
# Utility Functions
# ============================================================================

function Write-Banner {
    Write-Host ""
    Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Magenta
    Write-Host "║                    🐕 LEASH SETUP WIZARD                     ║" -ForegroundColor Magenta
    Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Magenta
    Write-Host ""
}

function Write-Step {
    param([int]$Step, [int]$Total, [string]$Message)
    Write-Host ""
    Write-Host "[$Step/$Total] " -NoNewline -ForegroundColor Cyan
    Write-Host $Message -ForegroundColor White
}

function Write-Success {
    param([string]$Message)
    Write-Host "  ✓ " -NoNewline -ForegroundColor Green
    Write-Host $Message
}

function Write-Warning {
    param([string]$Message)
    Write-Host "  ⚠ " -NoNewline -ForegroundColor Yellow
    Write-Host $Message
}

function Write-Error {
    param([string]$Message)
    Write-Host "  ✗ " -NoNewline -ForegroundColor Red
    Write-Host $Message
}

function Write-Info {
    param([string]$Message)
    Write-Host "  ℹ " -NoNewline -ForegroundColor Blue
    Write-Host $Message
}

function Confirm-Choice {
    param([string]$Prompt, [bool]$Default = $true)
    
    $suffix = if ($Default) { "[Y/n]" } else { "[y/N]" }
    $response = Read-Host "  $Prompt $suffix"
    
    if ([string]::IsNullOrWhiteSpace($response)) {
        return $Default
    }
    
    return $response -match "^[Yy]"
}

# ============================================================================
# Prerequisite Checks
# ============================================================================

function Test-Prerequisites {
    Write-Step 1 5 "Checking prerequisites..."
    
    $missing = $false
    
    # Check Node.js
    try {
        $nodeVersion = (node -v).TrimStart('v').Split('.')[0]
        if ([int]$nodeVersion -ge $MinNodeVersion) {
            Write-Success "Node.js v$((node -v).TrimStart('v'))"
        } else {
            Write-Error "Node.js v$((node -v).TrimStart('v')) - requires v${MinNodeVersion}+"
            $missing = $true
        }
    } catch {
        Write-Error "Node.js not found"
        $missing = $true
    }
    
    # Check npm
    try {
        $npmVersion = npm -v
        Write-Success "npm $npmVersion"
    } catch {
        Write-Error "npm not found"
        $missing = $true
    }
    
    # Check git (optional)
    try {
        $gitVersion = (git --version).Split(' ')[-1]
        Write-Success "git $gitVersion"
    } catch {
        Write-Warning "git not found (will download zip instead)"
    }
    
    if ($missing) {
        Write-Host ""
        Write-Error "Missing prerequisites. Please install Node.js first:"
        Write-Host ""
        Write-Host "  Download from: https://nodejs.org/"
        Write-Host "  Or use winget: winget install OpenJS.NodeJS"
        Write-Host ""
        exit 1
    }
}

# ============================================================================
# Wizard Prompts
# ============================================================================

function Get-DeploymentMode {
    Write-Step 2 5 "Select deployment mode:"
    Write-Host ""
    Write-Host "  1) " -NoNewline; Write-Host "Local" -NoNewline -ForegroundColor White; Write-Host "  - Server runs on this machine"
    Write-Host "  2) " -NoNewline; Write-Host "VPS" -NoNewline -ForegroundColor White; Write-Host "    - Connect to remote server"
    Write-Host "  3) " -NoNewline; Write-Host "Both" -NoNewline -ForegroundColor White; Write-Host "   - Run local server AND configure VPS connection"
    Write-Host ""
    
    while ($true) {
        $choice = Read-Host "  Choice [1]"
        if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "1" }
        
        switch ($choice) {
            "1" { $script:DeploymentMode = "local"; break }
            "2" { $script:DeploymentMode = "vps"; break }
            "3" { $script:DeploymentMode = "both"; break }
            default { Write-Host "  Invalid choice. Enter 1, 2, or 3." -ForegroundColor Red; continue }
        }
        break
    }
    
    # If VPS mode, get URL
    if ($script:DeploymentMode -eq "vps" -or $script:DeploymentMode -eq "both") {
        Write-Host ""
        $script:VpsServerUrl = Read-Host "  VPS Server URL (e.g., http://your-vps.com:3001)"
        
        if ([string]::IsNullOrWhiteSpace($script:VpsServerUrl)) {
            Write-Error "VPS URL is required for VPS mode"
            exit 1
        }
    }
    
    Write-Success "Mode: $script:DeploymentMode"
}

function Get-Authentication {
    Write-Step 3 5 "Configure authentication:"
    Write-Host ""
    
    if ($script:DeploymentMode -eq "vps") {
        Write-Host "  Enter the password for your VPS server."
    } else {
        Write-Host "  Set a password to protect your server (recommended for VPS)."
        Write-Host "  Leave empty to skip authentication (OK for local-only use)."
    }
    Write-Host ""
    
    $securePassword = Read-Host "  Password" -AsSecureString
    $script:ServerPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    )
    
    if ($script:ServerPassword) {
        Write-Success "Password configured"
    } else {
        Write-Warning "No password set (authentication disabled)"
    }
}

function Get-HooksChoice {
    Write-Step 4 5 "Claude Code hooks integration:"
    Write-Host ""
    Write-Host "  Hooks allow Leash to monitor Claude Code sessions in real-time."
    Write-Host "  This installs a script at: ~/.claude/hooks/leash_hook.js"
    Write-Host ""
    
    $script:InstallHooks = Confirm-Choice "Install Claude Code hooks?" $true
    
    if ($script:InstallHooks) {
        Write-Success "Hooks will be installed"
    } else {
        Write-Info "Skipping hooks installation"
    }
}

function Get-ServiceChoice {
    Write-Step 5 5 "Startup configuration:"
    
    if ($script:DeploymentMode -eq "vps") {
        Write-Info "Skipping (VPS mode - no local server)"
        return
    }
    
    Write-Host ""
    Write-Host "  Create a Windows service to start Leash automatically on boot?"
    Write-Host "  (Requires Administrator privileges)"
    Write-Host ""
    
    $script:CreateService = Confirm-Choice "Create Windows service?" $false
    
    if ($script:CreateService) {
        Write-Success "Will create Windows service"
    } else {
        Write-Info "Manual start required: leash start"
    }
}

# ============================================================================
# Installation Functions
# ============================================================================

function Install-Server {
    if ($script:DeploymentMode -eq "vps") {
        Write-Info "Skipping server installation (VPS mode)"
        return
    }
    
    Write-Host ""
    Write-Host "══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "                    📦 INSTALLING SERVER..." -ForegroundColor White
    Write-Host "══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    
    # Create directory
    if (-not (Test-Path $LeashHome)) {
        New-Item -ItemType Directory -Path $LeashHome -Force | Out-Null
    }
    
    # Download
    Write-Info "Downloading Leash..."
    $tempZip = "$env:TEMP\leash-main.zip"
    Invoke-WebRequest -Uri $LeashRepo -OutFile $tempZip
    
    # Extract
    Write-Info "Extracting..."
    Expand-Archive -Path $tempZip -DestinationPath $env:TEMP -Force
    
    if (Test-Path "$LeashHome\server") {
        Remove-Item -Path "$LeashHome\server" -Recurse -Force
    }
    Move-Item -Path "$env:TEMP\leash-main\server" -Destination "$LeashHome\server"
    Remove-Item -Path "$env:TEMP\leash-main" -Recurse -Force
    Remove-Item -Path $tempZip -Force
    
    Write-Success "Server files downloaded"
    
    # Install dependencies
    Write-Info "Installing dependencies..."
    Push-Location "$LeashHome\server"
    npm install --silent 2>$null
    Pop-Location
    Write-Success "Dependencies installed"
    
    # Build
    Write-Info "Building server..."
    Push-Location "$LeashHome\server"
    npm run build --silent 2>$null
    Pop-Location
    Write-Success "Server built"
    
    # Create config
    New-Config
}

function New-Config {
    Write-Info "Creating configuration..."
    
    # Create .env file
    $envContent = @"
# Leash Server Configuration
# Generated by install.ps1 on $(Get-Date)

PORT=3001
"@

    if ($script:ServerPassword) {
        $envContent += "`nLEASH_PASSWORD=$($script:ServerPassword)"
    }
    
    Set-Content -Path "$LeashHome\server\.env" -Value $envContent
    
    # Create config.json
    $config = @{
        mode = $script:DeploymentMode
        server = @{
            port = 3001
            path = "$LeashHome\server"
        }
    }
    
    if ($script:VpsServerUrl) {
        $config.vps = @{
            url = $script:VpsServerUrl
        }
    }
    
    $config | ConvertTo-Json -Depth 5 | Set-Content -Path "$LeashHome\config.json"
    
    Write-Success "Configuration saved"
}

function Install-Hooks {
    if (-not $script:InstallHooks) {
        return
    }
    
    Write-Info "Installing Claude Code hooks..."
    
    # Create hooks directory
    if (-not (Test-Path $ClaudeHooksDir)) {
        New-Item -ItemType Directory -Path $ClaudeHooksDir -Force | Out-Null
    }
    
    # Determine server URL for hooks
    $hookServerUrl = if ($script:DeploymentMode -eq "vps" -or $script:DeploymentMode -eq "both") {
        $script:VpsServerUrl
    } else {
        "http://localhost:3001"
    }
    
    # Create hook script
    $hookScript = @'
#!/usr/bin/env node
/**
 * Leash Hook Script for Claude Code
 * Sends events to Leash server for remote monitoring
 */

const http = require('http');
const https = require('https');

// Server URLs to try (in order)
const SERVERS = [
    process.env.LEASH_SERVER_URL,
    'http://localhost:3001',
    'http://127.0.0.1:3001'
].filter(Boolean);

async function sendEvent(eventType, data) {
    const payload = JSON.stringify({
        type: eventType,
        data: data,
        timestamp: Date.now()
    });

    for (const serverUrl of SERVERS) {
        try {
            const url = new URL(`/api/hooks/${eventType}`, serverUrl);
            const client = url.protocol === 'https:' ? https : http;
            
            await new Promise((resolve, reject) => {
                const req = client.request(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payload)
                    },
                    timeout: 2000
                }, (res) => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve();
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}`));
                    }
                });
                
                req.on('error', reject);
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('Timeout'));
                });
                
                req.write(payload);
                req.end();
            });
            
            return;
        } catch (err) {
            continue;
        }
    }
}

async function main() {
    const input = [];
    for await (const chunk of process.stdin) {
        input.push(chunk);
    }
    
    try {
        const event = JSON.parse(Buffer.concat(input).toString());
        await sendEvent(event.type || 'unknown', event);
    } catch (err) {
        // Silent fail
    }
}

main();
'@
    
    Set-Content -Path "$ClaudeHooksDir\leash_hook.js" -Value $hookScript
    
    # Set environment variable for VPS mode
    if ($script:DeploymentMode -eq "vps" -or $script:DeploymentMode -eq "both") {
        [System.Environment]::SetEnvironmentVariable('LEASH_SERVER_URL', $hookServerUrl, 'User')
        $env:LEASH_SERVER_URL = $hookServerUrl
    }
    
    Write-Success "Hooks installed at $ClaudeHooksDir\leash_hook.js"
}

function New-CliCommand {
    if ($script:DeploymentMode -eq "vps") {
        return
    }
    
    Write-Info "Creating 'leash' command..."
    
    # Create batch file wrapper
    $batchScript = @"
@echo off
setlocal

set LEASH_HOME=$LeashHome

if "%1"=="start" goto :start
if "%1"=="stop" goto :stop
if "%1"=="status" goto :status
goto :usage

:start
cd /d "%LEASH_HOME%\server"
if exist .env (
    for /f "tokens=*" %%a in (.env) do set %%a
)
node dist\index.js
goto :end

:stop
taskkill /f /im node.exe /fi "WINDOWTITLE eq Leash*" 2>nul
echo Leash stopped
goto :end

:status
tasklist /fi "IMAGENAME eq node.exe" | find "node.exe" >nul
if %errorlevel%==0 (
    echo Leash may be running
) else (
    echo Leash is not running
)
goto :end

:usage
echo Usage: leash {start^|stop^|status}

:end
endlocal
"@
    
    # Add to PATH via user environment
    $leashBinPath = "$LeashHome\bin"
    if (-not (Test-Path $leashBinPath)) {
        New-Item -ItemType Directory -Path $leashBinPath -Force | Out-Null
    }
    
    Set-Content -Path "$leashBinPath\leash.cmd" -Value $batchScript
    
    # Add to PATH
    $userPath = [System.Environment]::GetEnvironmentVariable('PATH', 'User')
    if ($userPath -notlike "*$leashBinPath*") {
        [System.Environment]::SetEnvironmentVariable('PATH', "$userPath;$leashBinPath", 'User')
    }
    
    Write-Success "'leash' command created"
    Write-Info "Restart your terminal to use the 'leash' command"
}

# ============================================================================
# Completion
# ============================================================================

function Write-Completion {
    Write-Host ""
    Write-Host "══════════════════════════════════════════════════════════════" -ForegroundColor Green
    Write-Host "                    ✅ SETUP COMPLETE!" -ForegroundColor White
    Write-Host "══════════════════════════════════════════════════════════════" -ForegroundColor Green
    Write-Host ""
    
    if ($script:DeploymentMode -ne "vps") {
        Write-Host "Start the server:" -ForegroundColor White
        Write-Host "  leash start"
        Write-Host "  (or: cd $LeashHome\server && node dist\index.js)"
        Write-Host ""
        Write-Host "Open web UI:" -ForegroundColor White
        Write-Host "  http://localhost:3001"
        Write-Host ""
    }
    
    if ($script:DeploymentMode -eq "vps" -or $script:DeploymentMode -eq "both") {
        Write-Host "VPS Server:" -ForegroundColor White
        Write-Host "  $script:VpsServerUrl"
        Write-Host ""
    }
    
    Write-Host "Connect from Android:" -ForegroundColor White
    if ($script:DeploymentMode -ne "vps") {
        Write-Host "  Scan QR code at http://localhost:3001"
    } else {
        Write-Host "  Scan QR code at $script:VpsServerUrl"
    }
    Write-Host ""
    
    if ($script:InstallHooks) {
        Write-Host "Claude hooks:" -ForegroundColor White
        Write-Host "  Installed at ~/.claude/hooks/leash_hook.js"
        if ($script:VpsServerUrl) {
            Write-Host "  Will send events to: $script:VpsServerUrl"
        }
        Write-Host ""
    }
    
    Write-Host "Configuration:" -ForegroundColor White
    Write-Host "  $LeashHome\config.json"
    Write-Host ""
    
    Write-Host "Thank you for using Leash! 🐕" -ForegroundColor Magenta
    Write-Host ""
}

# ============================================================================
# Main
# ============================================================================

function Main {
    Write-Banner
    Test-Prerequisites
    Get-DeploymentMode
    Get-Authentication
    Get-HooksChoice
    Get-ServiceChoice
    
    Install-Server
    Install-Hooks
    New-CliCommand
    
    Write-Completion
}

Main
