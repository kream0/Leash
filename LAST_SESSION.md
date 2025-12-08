# Last Session

**Date:** 2025-12-08
**Focus:** VPS Custom Domain Configuration

## Completed

### Server Enhancements
- **Fixed QR code on Web UI**: Added fallback to external QR API when JS library fails to load
- **Added custom domain support**: New env vars `LEASH_DOMAIN` and `LEASH_EXTERNAL_PORT`
- **VPS mode detection**: Terminal and Web UI show proper wss:// URLs when domain is configured
- **Port omission**: Standard ports (443, 80) are omitted from URLs for cleaner display

### Setup Scripts Updated
- **install.sh**: Added custom domain wizard prompt and .env generation
- **install.ps1**: Same changes for Windows PowerShell installer
- Both scripts now ask "Configure custom domain for external access?" in local/both modes

### Environment Variables
| Variable | Purpose | Example |
|----------|---------|---------|
| `LEASH_DOMAIN` | Custom domain/IP for VPS | `leash.example.com` |
| `LEASH_EXTERNAL_PORT` | External port for reverse proxy | `443` |

## Files Changed

### Server
- `server/src/index.ts` - Added LEASH_DOMAIN and LEASH_EXTERNAL_PORT support
- `server/public/index.html` - Fixed QR code with external API fallback
- `server/.env.example` - Added new environment variable documentation

### Setup Scripts
- `install.sh` - Added domain configuration wizard
- `install.ps1` - Added domain configuration wizard

## Next Steps
- Test VPS deployment end-to-end
- Windows MSI installer (InnoSetup)
- GitHub Releases integration
