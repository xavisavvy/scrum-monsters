@echo off
REM Windows wrapper for scripts/runner/local-runner.sh.
REM
REM Works from any Windows shell (Git Bash, PowerShell, CMD) without
REM tripping MSYS pathconv. Resolves its own location via %~dp0 and
REM converts it to a WSL path via `wslpath`, so the script can be
REM checked out anywhere on disk.
REM
REM Usage: local-runner.cmd <setup|start|stop|status|logs|unregister>

setlocal
for /f "usebackq delims=" %%i in (`wsl -d Ubuntu -- wslpath -u "%~dp0local-runner.sh"`) do set "wslscript=%%i"
wsl -d Ubuntu -- bash "%wslscript%" %*
endlocal
