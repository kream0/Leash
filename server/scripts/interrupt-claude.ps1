param(
    [switch]$SendEnter
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName Microsoft.VisualBasic

# Find Claude window - it runs inside Windows Terminal
# Look for WindowsTerminal process, or windows with Claude-related titles
$processes = Get-Process | Where-Object {
    $_.ProcessName -eq 'WindowsTerminal' -or
    $_.ProcessName -eq 'claude' -or
    $_.MainWindowTitle -match 'claude|Claude|leash'
}

$found = $false
foreach ($proc in $processes) {
    if ($proc.MainWindowHandle -ne 0) {
        # Activate the window
        [Microsoft.VisualBasic.Interaction]::AppActivate($proc.Id)
        Start-Sleep -Milliseconds 150

        # Send ESC to interrupt Claude
        [System.Windows.Forms.SendKeys]::SendWait('{ESC}')

        if ($SendEnter) {
            Start-Sleep -Milliseconds 100
            [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
        }

        $found = $true
        Write-Host "Interrupt sent to Claude window (PID: $($proc.Id))"
        break
    }
}

if (-not $found) {
    Write-Error "No Claude window found"
    exit 1
}
