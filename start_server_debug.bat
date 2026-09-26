@echo off
rem Lance le serveur avec une fenetre et les messages en direct, pour deboguer.
rem Ne pas le lancer en meme temps que le script OBS : la seconde instance s'arrete seule.
title Twitch Kit - serveur
cd /d "%~dp0"
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" "%~dp0src\server.js"
) else (
  node "%~dp0src\server.js"
)
echo.
echo Le serveur s'est arrete.
pause
