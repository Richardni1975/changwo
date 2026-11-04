$ErrorActionPreference = 'SilentlyContinue'
$root = $PSScriptRoot
$logDir = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$env:NODE_ENV = 'production'
$node = 'C:\Program Files\nodejs\node.exe'
$cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
$relayJs = Join-Path $root 'server\relay.js'

# 1) WebSocket relay (port 8080) - idempotent
$listening = $false
try { $listening = [bool](Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction Stop) } catch { $listening = $false }
if (-not $listening) {
    Start-Process -FilePath $node -ArgumentList ('"' + $relayJs + '"') `
        -WorkingDirectory (Join-Path $root 'server') -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logDir 'relay.log') `
        -RedirectStandardError (Join-Path $logDir 'relay.err.log')
}

# 2) Cloudflare Tunnel - idempotent
$tunnel = $false
try { $tunnel = [bool](Get-Process cloudflared -ErrorAction Stop) } catch { $tunnel = $false }
if (-not $tunnel) {
    Start-Process -FilePath $cloudflared -ArgumentList 'tunnel run' -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logDir 'cloudflared.log') `
        -RedirectStandardError (Join-Path $logDir 'cloudflared.err.log')
}

# 3) register watchdog task (one-time; skip if exists)
$taskName = 'ChangWoWatchdog'
if (-not (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)) {
    $ps = Join-Path $root 'start-production.ps1'
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $ps + '"')
    $principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
        -LogonType Interactive -RunLevel Limited
    $t1 = New-ScheduledTaskTrigger -AtLogOn
    $t2 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
        -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 365)
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($t1, $t2) `
        -Principal $principal -Settings $settings -Force | Out-Null
}
