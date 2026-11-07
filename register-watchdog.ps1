$root = $PSScriptRoot
$vbs = Join-Path $root 'watchdog-hidden.vbs'
# wscript.exe has no console window -> no blue flash. Path has no spaces, no inner quotes.
$tr = 'wscript.exe ' + $vbs

# 先删掉占位任务
schtasks.exe /delete /tn "ChangWoWatchdog" /f 2>$null | Out-Null

# 用 schtasks（普通用户可用）创建每分钟看门狗
& schtasks.exe /create /tn "ChangWoWatchdog" /tr $tr /sc minute /mo 1 /f

Write-Output '--- verify ---'
& schtasks.exe /query /tn "ChangWoWatchdog" /v /fo list
