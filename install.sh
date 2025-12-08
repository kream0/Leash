#!/bin/bash
#
# 🐕 Leash Setup Script
# Interactive installer for Leash - AI Agent Remote Monitor
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/user/leash/main/install.sh | bash
#   OR
#   ./install.sh
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Configuration
LEASH_HOME="${LEASH_HOME:-$HOME/.leash}"
LEASH_REPO="https://github.com/user/leash.git"
CLAUDE_HOOKS_DIR="$HOME/.claude/hooks"
MIN_NODE_VERSION=18

# State
DEPLOYMENT_MODE=""
SERVER_PASSWORD=""
INSTALL_HOOKS=true
CREATE_SERVICE=false
VPS_URL=""
CUSTOM_DOMAIN=""
EXTERNAL_PORT=""

# ============================================================================
# Utility Functions
# ============================================================================

print_banner() {
    echo -e "${PURPLE}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                    🐕 LEASH SETUP WIZARD                     ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_step() {
    local step=$1
    local total=$2
    local message=$3
    echo -e "\n${CYAN}[${step}/${total}]${NC} ${BOLD}${message}${NC}"
}

print_success() {
    echo -e "  ${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "  ${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "  ${RED}✗${NC} $1"
}

print_info() {
    echo -e "  ${BLUE}ℹ${NC} $1"
}

confirm() {
    local prompt=$1
    local default=${2:-y}
    local response
    
    if [[ "$default" == "y" ]]; then
        read -rp "  $prompt [Y/n]: " response
        response=${response:-y}
    else
        read -rp "  $prompt [y/N]: " response
        response=${response:-n}
    fi
    
    [[ "$response" =~ ^[Yy] ]]
}

# ============================================================================
# Prerequisite Checks
# ============================================================================

check_prerequisites() {
    print_step 1 5 "Checking prerequisites..."
    
    local missing=false
    
    # Check Node.js
    if command -v node &> /dev/null; then
        local node_version=$(node -v | sed 's/v//' | cut -d. -f1)
        if [[ $node_version -ge $MIN_NODE_VERSION ]]; then
            print_success "Node.js $(node -v)"
        else
            print_error "Node.js $(node -v) - requires v${MIN_NODE_VERSION}+"
            missing=true
        fi
    else
        print_error "Node.js not found"
        missing=true
    fi
    
    # Check npm
    if command -v npm &> /dev/null; then
        print_success "npm $(npm -v)"
    else
        print_error "npm not found"
        missing=true
    fi
    
    # Check git (optional but helpful)
    if command -v git &> /dev/null; then
        print_success "git $(git --version | cut -d' ' -f3)"
    else
        print_warning "git not found (will download zip instead)"
    fi
    
    # Check curl or wget
    if command -v curl &> /dev/null; then
        print_success "curl available"
    elif command -v wget &> /dev/null; then
        print_success "wget available"
    else
        print_error "Neither curl nor wget found"
        missing=true
    fi
    
    if $missing; then
        echo ""
        print_error "Missing prerequisites. Please install them first:"
        echo ""
        echo "  Ubuntu/Debian:"
        echo "    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
        echo "    sudo apt install -y nodejs git"
        echo ""
        echo "  macOS:"
        echo "    brew install node git"
        echo ""
        exit 1
    fi
}

# ============================================================================
# Wizard Prompts
# ============================================================================

prompt_deployment_mode() {
    print_step 2 5 "Select deployment mode:"
    echo ""
    echo "  1) ${BOLD}Local${NC}  - Server runs on this machine"
    echo "  2) ${BOLD}VPS${NC}    - Connect to remote server"
    echo "  3) ${BOLD}Both${NC}   - Run local server AND configure VPS connection"
    echo ""
    
    while true; do
        read -rp "  Choice [1]: " choice
        choice=${choice:-1}
        
        case $choice in
            1) DEPLOYMENT_MODE="local"; break ;;
            2) DEPLOYMENT_MODE="vps"; break ;;
            3) DEPLOYMENT_MODE="both"; break ;;
            *) echo -e "  ${RED}Invalid choice. Enter 1, 2, or 3.${NC}" ;;
        esac
    done
    
    # If VPS mode, get URL
    if [[ "$DEPLOYMENT_MODE" == "vps" || "$DEPLOYMENT_MODE" == "both" ]]; then
        echo ""
        read -rp "  VPS Server URL (e.g., http://your-vps.com:3001): " VPS_URL
        
        if [[ -z "$VPS_URL" ]]; then
            print_error "VPS URL is required for VPS mode"
            exit 1
        fi
    fi
    
    # If local/both mode and server will run on VPS, get domain settings
    if [[ "$DEPLOYMENT_MODE" == "local" || "$DEPLOYMENT_MODE" == "both" ]]; then
        echo ""
        echo "  Will this server be accessed from the internet (VPS/cloud)?"
        if confirm "Configure custom domain for external access?" "n"; then
            echo ""
            read -rp "  Domain or public IP (e.g., leash.example.com): " CUSTOM_DOMAIN
            
            if [[ -n "$CUSTOM_DOMAIN" ]]; then
                echo ""
                echo "  External port (typically 443 for HTTPS with reverse proxy)"
                read -rp "  External port [443]: " EXTERNAL_PORT
                EXTERNAL_PORT=${EXTERNAL_PORT:-443}
                print_success "Domain: $CUSTOM_DOMAIN:$EXTERNAL_PORT"
            fi
        fi
    fi
    
    print_success "Mode: $DEPLOYMENT_MODE"
}

prompt_authentication() {
    print_step 3 5 "Configure authentication:"
    echo ""
    
    if [[ "$DEPLOYMENT_MODE" == "vps" ]]; then
        echo "  Enter the password for your VPS server."
    else
        echo "  Set a password to protect your server (recommended for VPS)."
        echo "  Leave empty to skip authentication (OK for local-only use)."
    fi
    echo ""
    
    read -rsp "  Password: " SERVER_PASSWORD
    echo ""
    
    if [[ -n "$SERVER_PASSWORD" ]]; then
        print_success "Password configured"
    else
        print_warning "No password set (authentication disabled)"
    fi
}

prompt_hooks() {
    print_step 4 5 "Claude Code hooks integration:"
    echo ""
    echo "  Hooks allow Leash to monitor Claude Code sessions in real-time."
    echo "  This installs a script at: ~/.claude/hooks/leash_hook.js"
    echo ""
    
    if confirm "Install Claude Code hooks?" "y"; then
        INSTALL_HOOKS=true
        print_success "Hooks will be installed"
    else
        INSTALL_HOOKS=false
        print_info "Skipping hooks installation"
    fi
}

prompt_service() {
    print_step 5 5 "Startup configuration:"
    
    # Only offer service for local/both modes
    if [[ "$DEPLOYMENT_MODE" == "vps" ]]; then
        print_info "Skipping (VPS mode - no local server)"
        return
    fi
    
    echo ""
    echo "  Create a systemd service to start Leash automatically on boot?"
    echo ""
    
    if confirm "Create systemd service?" "n"; then
        CREATE_SERVICE=true
        print_success "Will create systemd service"
    else
        CREATE_SERVICE=false
        print_info "Manual start required: leash start"
    fi
}

# ============================================================================
# Installation Functions
# ============================================================================

install_server() {
    if [[ "$DEPLOYMENT_MODE" == "vps" ]]; then
        print_info "Skipping server installation (VPS mode)"
        return
    fi
    
    echo ""
    echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}                    📦 INSTALLING SERVER...${NC}"
    echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    # Create directory
    mkdir -p "$LEASH_HOME"
    
    # Clone or download
    if command -v git &> /dev/null; then
        print_info "Cloning repository..."
        if [[ -d "$LEASH_HOME/server" ]]; then
            cd "$LEASH_HOME/server"
            git pull --quiet
        else
            git clone --quiet --depth 1 "$LEASH_REPO" "$LEASH_HOME/repo"
            mv "$LEASH_HOME/repo/server" "$LEASH_HOME/server"
            rm -rf "$LEASH_HOME/repo"
        fi
    else
        print_info "Downloading release..."
        # Fallback to downloading zip
        local temp_zip="/tmp/leash-main.zip"
        curl -fsSL "https://github.com/user/leash/archive/main.zip" -o "$temp_zip"
        unzip -q "$temp_zip" -d /tmp
        mv /tmp/leash-main/server "$LEASH_HOME/server"
        rm -rf /tmp/leash-main "$temp_zip"
    fi
    
    print_success "Server files downloaded"
    
    # Install dependencies
    print_info "Installing dependencies..."
    cd "$LEASH_HOME/server"
    npm install --silent
    print_success "Dependencies installed"
    
    # Build
    print_info "Building server..."
    npm run build --silent
    print_success "Server built"
    
    # Create config
    create_config
}

create_config() {
    print_info "Creating configuration..."
    
    # Create .env file
    cat > "$LEASH_HOME/server/.env" << EOF
# Leash Server Configuration
# Generated by install.sh on $(date)

PORT=3001
EOF

    if [[ -n "$SERVER_PASSWORD" ]]; then
        echo "LEASH_PASSWORD=$SERVER_PASSWORD" >> "$LEASH_HOME/server/.env"
    fi
    
    if [[ -n "$CUSTOM_DOMAIN" ]]; then
        echo "LEASH_DOMAIN=$CUSTOM_DOMAIN" >> "$LEASH_HOME/server/.env"
    fi
    
    if [[ -n "$EXTERNAL_PORT" ]]; then
        echo "LEASH_EXTERNAL_PORT=$EXTERNAL_PORT" >> "$LEASH_HOME/server/.env"
    fi
    
    # Create config.json
    mkdir -p "$LEASH_HOME"
    
    local config_json="{\n"
    config_json+="  \"mode\": \"$DEPLOYMENT_MODE\",\n"
    config_json+="  \"server\": {\n"
    config_json+="    \"port\": 3001,\n"
    config_json+="    \"path\": \"$LEASH_HOME/server\"\n"
    config_json+="  }"
    
    if [[ -n "$VPS_URL" ]]; then
        config_json+=",\n  \"vps\": {\n"
        config_json+="    \"url\": \"$VPS_URL\"\n"
        config_json+="  }"
    fi
    
    config_json+="\n}"
    
    echo -e "$config_json" > "$LEASH_HOME/config.json"
    
    print_success "Configuration saved"
}

install_hooks() {
    if ! $INSTALL_HOOKS; then
        return
    fi
    
    print_info "Installing Claude Code hooks..."
    
    # Create hooks directory
    mkdir -p "$CLAUDE_HOOKS_DIR"
    
    # Determine server URL for hooks
    local hook_server_url
    if [[ "$DEPLOYMENT_MODE" == "vps" ]]; then
        hook_server_url="$VPS_URL"
    elif [[ "$DEPLOYMENT_MODE" == "both" ]]; then
        # Try VPS first, fallback to localhost
        hook_server_url="$VPS_URL"
    else
        hook_server_url="http://localhost:3001"
    fi
    
    # Create hook script
    cat > "$CLAUDE_HOOKS_DIR/leash_hook.js" << 'HOOKEOF'
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
    'http://127.0.0.1:3001',
    'http://host.docker.internal:3001'
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
            
            return; // Success - exit loop
        } catch (err) {
            // Try next server
            continue;
        }
    }
}

// Parse event from stdin
async function main() {
    const input = [];
    for await (const chunk of process.stdin) {
        input.push(chunk);
    }
    
    try {
        const event = JSON.parse(Buffer.concat(input).toString());
        await sendEvent(event.type || 'unknown', event);
    } catch (err) {
        // Silently fail - don't disrupt Claude Code
    }
}

main();
HOOKEOF

    chmod +x "$CLAUDE_HOOKS_DIR/leash_hook.js"
    
    # Set environment variable for VPS mode
    if [[ "$DEPLOYMENT_MODE" == "vps" || "$DEPLOYMENT_MODE" == "both" ]]; then
        # Add to shell config
        local shell_rc=""
        if [[ -f "$HOME/.zshrc" ]]; then
            shell_rc="$HOME/.zshrc"
        elif [[ -f "$HOME/.bashrc" ]]; then
            shell_rc="$HOME/.bashrc"
        fi
        
        if [[ -n "$shell_rc" ]]; then
            if ! grep -q "LEASH_SERVER_URL" "$shell_rc"; then
                echo "" >> "$shell_rc"
                echo "# Leash - AI Agent Remote Monitor" >> "$shell_rc"
                echo "export LEASH_SERVER_URL='$hook_server_url'" >> "$shell_rc"
            fi
        fi
        
        # Set for current session
        export LEASH_SERVER_URL="$hook_server_url"
    fi
    
    print_success "Hooks installed at $CLAUDE_HOOKS_DIR/leash_hook.js"
    
    # Check if Claude settings need updating
    local claude_settings="$HOME/.claude/settings.json"
    if [[ -f "$claude_settings" ]]; then
        print_info "Found Claude settings - hooks may need manual configuration"
        print_info "See: https://docs.anthropic.com/claude-code/hooks"
    fi
}

create_service() {
    if ! $CREATE_SERVICE; then
        return
    fi
    
    if [[ "$DEPLOYMENT_MODE" == "vps" ]]; then
        return
    fi
    
    print_info "Creating systemd service..."
    
    local service_file="/tmp/leash.service"
    cat > "$service_file" << EOF
[Unit]
Description=Leash Server - AI Agent Monitor
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$LEASH_HOME/server
EnvironmentFile=$LEASH_HOME/server/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

    if sudo mv "$service_file" /etc/systemd/system/leash.service; then
        sudo systemctl daemon-reload
        sudo systemctl enable leash
        print_success "Systemd service created and enabled"
    else
        print_warning "Could not create systemd service (requires sudo)"
    fi
}

create_cli_command() {
    if [[ "$DEPLOYMENT_MODE" == "vps" ]]; then
        return
    fi
    
    print_info "Creating 'leash' command..."
    
    # Create wrapper script
    mkdir -p "$HOME/.local/bin"
    
    cat > "$HOME/.local/bin/leash" << EOF
#!/bin/bash
# Leash CLI wrapper

LEASH_HOME="$LEASH_HOME"

case "\$1" in
    start)
        cd "\$LEASH_HOME/server"
        if [[ -f .env ]]; then
            set -a; source .env; set +a
        fi
        node dist/index.js
        ;;
    stop)
        pkill -f "node.*leash.*dist/index.js" || true
        ;;
    status)
        if pgrep -f "node.*leash.*dist/index.js" > /dev/null; then
            echo "Leash is running"
        else
            echo "Leash is not running"
        fi
        ;;
    *)
        echo "Usage: leash {start|stop|status}"
        exit 1
        ;;
esac
EOF

    chmod +x "$HOME/.local/bin/leash"
    
    # Ensure ~/.local/bin is in PATH
    if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
        local shell_rc=""
        if [[ -f "$HOME/.zshrc" ]]; then
            shell_rc="$HOME/.zshrc"
        elif [[ -f "$HOME/.bashrc" ]]; then
            shell_rc="$HOME/.bashrc"
        fi
        
        if [[ -n "$shell_rc" ]] && ! grep -q "/.local/bin" "$shell_rc"; then
            echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$shell_rc"
        fi
    fi
    
    print_success "'leash' command created"
}

# ============================================================================
# Completion
# ============================================================================

print_completion() {
    echo ""
    echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}                    ✅ SETUP COMPLETE!${NC}"
    echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    if [[ "$DEPLOYMENT_MODE" != "vps" ]]; then
        echo -e "${BOLD}Start the server:${NC}"
        echo "  leash start"
        echo ""
        echo -e "${BOLD}Or with systemd:${NC}"
        echo "  sudo systemctl start leash"
        echo ""
        echo -e "${BOLD}Open web UI:${NC}"
        if [[ -n "$CUSTOM_DOMAIN" ]]; then
            echo "  https://$CUSTOM_DOMAIN"
        else
            echo "  http://localhost:3001"
        fi
        echo ""
        
        if [[ -n "$CUSTOM_DOMAIN" ]]; then
            echo -e "${BOLD}Custom Domain:${NC}"
            echo "  Domain: $CUSTOM_DOMAIN"
            echo "  External Port: $EXTERNAL_PORT"
            echo "  WebSocket: wss://$CUSTOM_DOMAIN/ws"
            echo ""
        fi
    fi
    
    if [[ "$DEPLOYMENT_MODE" == "vps" || "$DEPLOYMENT_MODE" == "both" ]]; then
        echo -e "${BOLD}VPS Server:${NC}"
        echo "  $VPS_URL"
        echo ""
    fi
    
    echo -e "${BOLD}Connect from Android:${NC}"
    if [[ "$DEPLOYMENT_MODE" != "vps" ]]; then
        echo "  Scan QR code at http://localhost:3001"
    else
        echo "  Scan QR code at $VPS_URL"
    fi
    echo ""
    
    if $INSTALL_HOOKS; then
        echo -e "${BOLD}Claude hooks:${NC}"
        echo "  Installed at ~/.claude/hooks/leash_hook.js"
        if [[ -n "$VPS_URL" ]]; then
            echo "  Will send events to: $VPS_URL"
        fi
        echo ""
    fi
    
    echo -e "${BOLD}Configuration:${NC}"
    echo "  $LEASH_HOME/config.json"
    echo ""
    
    echo -e "${PURPLE}Thank you for using Leash! 🐕${NC}"
    echo ""
}

# ============================================================================
# Main
# ============================================================================

main() {
    print_banner
    check_prerequisites
    prompt_deployment_mode
    prompt_authentication
    prompt_hooks
    prompt_service
    
    install_server
    install_hooks
    create_service
    create_cli_command
    
    print_completion
}

main "$@"
