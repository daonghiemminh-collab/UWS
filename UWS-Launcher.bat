@echo off
title UWS - Unifiable Workspace System
cd /d "%~dp0"
echo Starting UWS Desktop Native App...
start "" npx electron desktop
exit
