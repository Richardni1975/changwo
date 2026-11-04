$root = $PSScriptRoot
$ps = Join-Path $root 'start-production.ps1'
# 路径含中文但无空格，不加内层引号，避免 PS5.1 原生参数内嵌引号 bug
$tr = 'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ' + $ps

# 先删掉占位任务
schtasks.exe /delete /tn "ChangWoWatchdog" /f 2>$null | Out-Null

# 用 schtasks（普通用户可用）创建每分钟看门狗
& schtasks.exe /create /tn "ChangWoWatchdog" /tr $tr /sc minute /mo 1 /f

Write-Output '--- verify ---'
& schtasks.exe /query /tn "ChangWoWatchdog" /v /fo list
