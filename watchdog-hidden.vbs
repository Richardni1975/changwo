' watchdog-hidden.vbs - run start-production.ps1 with a fully hidden window (no blue flash)
' wscript.exe is a windowless GUI program, so the scheduled task never shows a console.
Option Explicit
Dim fso, sh, dir, ps, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
ps = dir & "\start-production.ps1"
cmd = "C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & ps & """"
sh.Run cmd, 0, True
