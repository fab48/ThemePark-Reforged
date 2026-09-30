@echo off
title Theme Park
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "lanceur\serveur.ps1"
