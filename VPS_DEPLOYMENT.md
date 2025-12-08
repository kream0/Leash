# VPS Deployment Guide for Leash Server

This guide walks you through deploying the Leash server on a VPS (Virtual Private Server) so you can connect to it from anywhere over the internet.

## Prerequisites

- Ubuntu 22.04+ VPS with public IP address
- SSH access to your VPS
- Node.js 20+ installed
- Domain name (optional, for SSL/TLS)

## Quick Start

### 1. Install Dependencies

```bash
# Update package list
sudo apt update

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should be 20.x or higher
npm --version
```

### 2. Upload Server Files

```bash
# On your local machine, package the server
cd server
npm run build

# Upload to VPS (replace USER and VPS_IP)
scp -r dist package.json package-lock.json USER@VPS_IP:~/leash-server/
```

Alternatively, clone from your git repository:

```bash
# On VPS
cd ~
git clone https://github.com/yourusername/leash.git
cd leash/server
npm install
npm run build
```

### 3. Configure Environment

Create `.env` file in the server directory:

```bash
cd ~/leash-server  # or ~/leash/server if cloned from git
nano .env
```

Add the following configuration:

```env
# REQUIRED: Set a strong password for authentication
LEASH_PASSWORD=your-secure-password-here

# Port (default: 3001)
PORT=3001
```

**Security Note:** Choose a strong password (16+ characters recommended).

### 4. Install Dependencies and Test

```bash
# If you uploaded built files
npm install --production

# Test the server
node dist/index.js
```

You should see output like:
```
[Server] 🔒 Authentication ENABLED - password required for all connections
[Server] Auto-detection enabled...
```

Press `Ctrl+C` to stop.

### 5. Create Systemd Service

Create a systemd service file for automatic startup:

```bash
sudo nano /etc/systemd/system/leash.service
```

Paste the following (adjust paths and user as needed):

```ini
[Unit]
Description=Leash Server - AI Agent Monitor
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/home/YOUR_USERNAME/leash-server
EnvironmentFile=/home/YOUR_USERNAME/leash-server/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=leash

[Install]
WantedBy=multi-user.target
```

Replace `YOUR_USERNAME` with your actual user.

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable leash
sudo systemctl start leash
sudo systemctl status leash
```

### 6. Configure Firewall

```bash
# Allow SSH (if not already allowed)
sudo ufw allow OpenSSH

# Allow Leash server port
sudo ufw allow 3001/tcp

# Enable firewall (if not already enabled)
sudo ufw enable
sudo ufw status
```

### 7. Test Connection from Android

In the Leash Android app:

1. Open the connection screen
2. Enter server URL: `ws://YOUR_VPS_IP:3001/ws`
3. Enter the password you set in `.env`
4. Tap Connect

You should see your AI agents appear!

### 8. Access Web UI

You can also view the connection QR code in your browser:

1. Open browser and navigate to: `http://YOUR_VPS_IP:3001`
2. You'll see a beautiful web interface with:
   - QR code for easy mobile scanning
   - Connection URLs (WebSocket and REST API)
   - Authentication status indicator
   
This is especially useful for VPS deployments where you can't see the terminal QR code!

### 9. Configure Hooks for VPS

If you're using Claude Code hooks to monitor agent activity, you need to configure the hooks to send data to your VPS instead of localhost.

**Set environment variable on your development machine:**

Windows (PowerShell):
```powershell
[System.Environment]::SetEnvironmentVariable('LEASH_SERVER_URL', 'http://YOUR_VPS_IP:3001', 'User')
```

Linux/Mac:
```bash
echo "export LEASH_SERVER_URL='http://YOUR_VPS_IP:3001'" >> ~/.bashrc
source ~/.bashrc
```

For detailed hook configuration, see [HOOK_VPS_SETUP.md](file:///c:/Users/Karim/Documents/work/sandbox/leash/HOOK_VPS_SETUP.md).

## Production Setup with SSL/TLS (Recommended)

For production use, it's highly recommended to use SSL/TLS encryption.

### Using NGINX as Reverse Proxy

#### 1. Install NGINX

```bash
sudo apt install -y nginx
```

#### 2. Install Certbot for Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
```

#### 3. Configure NGINX

Create NGINX configuration:

```bash
sudo nano /etc/nginx/sites-available/leash
```

Paste the following (replace `yourdomain.com`):

```nginx
server {
    listen 80;
    server_name leash.yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_read_timeout 86400;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/leash /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 4. Obtain SSL Certificate

```bash
sudo certbot --nginx -d leash.yourdomain.com
```

Follow the prompts. Certbot will automatically configure NGINX for HTTPS.

#### 5. Connect with SSL

In the Android app, use:
- URL: `wss://leash.yourdomain.com/ws` (note: `wss://` instead of `ws://`)
- Password: Your configured password

## Monitoring and Logs

### View Logs

```bash
# View real-time logs
sudo journalctl -u leash -f

# View recent logs
sudo journalctl -u leash -n 100

# View logs from specific time
sudo journalctl -u leash --since "1 hour ago"
```

### Restart Service

```bash
sudo systemctl restart leash
```

### Update Server

```bash
cd ~/leash-server
git pull  # If using git
npm run build
sudo systemctl restart leash
```

## Troubleshooting

### Server won't start

Check logs:
```bash
sudo journalctl -u leash -n 50
```

Common issues:
- **Port already in use:** Change `PORT` in `.env`
- **Missing `.env` file:** Create it with `LEASH_PASSWORD`
- **Node.js version:** Ensure Node.js 20+ is installed

### Can't connect from Android

1. **Check firewall:** Ensure port 3001 is open (`sudo ufw status`)
2. **Test connectivity:** From your phone, try pinging the VPS IP
3. **Check server logs:** Look for authentication failures
4. **Verify password:** Ensure you're using the correct password
5. **Check URL format:** 
   - HTTP: `ws://YOUR_IP:3001/ws`
   - HTTPS: `wss://yourdomain.com/ws`

### Authentication failures

Check server logs for `[WebSocket] Authentication failed` or `[Routes] Authentication failed`

- Verify password is set in `.env`
- Ensure you're entering the exact password in the Android app
- Restart the server after changing `.env`: `sudo systemctl restart leash`

## Security Best Practices

1. **Use a strong password** (16+ characters, mix of letters/numbers/symbols)
2. **Enable SSL/TLS** for production use
3. **Keep server updated** regularly
4. **Monitor logs** for unauthorized access attempts
5. **Use firewall** to restrict access to only necessary ports
6. **Consider IP whitelisting** if you have a static IP

## Performance Tuning

For better performance on VPS:

```bash
# Increase max file descriptors
sudo nano /etc/security/limits.conf
```

Add:
```
*  soft  nofile  65536
*  hard  nofile  65536
```

Reboot for changes to take effect.

## Getting Help

If you encounter issues:

1. Check server logs: `sudo journalctl -u leash`
2. Verify configuration in `.env`
3. Test network connectivity
4. Ensure Node.js version is 20+
5. Check firewall rules

---

**Happy monitoring!** 🐕
