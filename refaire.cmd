@echo off
rem Refaire les compagnons (images\images.js, sons\sons.js, donnees\donnees.js, animations\animations.js)
rem d'apres les dossiers, apres avoir modifie une image, un son... : la page ouverte d'un double-clic
rem les lit a la place des fichiers. Servie (Theme Park.cmd), elle lit les fichiers eux-memes.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "lanceur\refaire.ps1"
pause
