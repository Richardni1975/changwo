@echo off
rem changwo production startup (idempotent - safe to run repeatedly)
rem Starts the WebSocket relay + Cloudflare Tunnel. Skips anything already running.
set NODE_ENV=production

rem 1) WebSocket relay (server/relay.js, port 8080)
netstat -ano | findstr ":8080" | findstr LISTENING >nul 2>&1
if errorlevel 1 (
    start "changwo-relay" /min "C:\Program Files\nodejs\node.exe" "%~dp0server\relay.js"
) else (
    echo [skip] relay already running
)

rem 2) Cloudflare Tunnel
tasklist /FI "IMAGENAME eq cloudflared.exe" | findstr /I "cloudflared.exe" >nul 2>&1
if errorlevel 1 (
    start "changwo-tunnel" /min "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel run
) else (
    echo [skip] cloudflared already running
)
