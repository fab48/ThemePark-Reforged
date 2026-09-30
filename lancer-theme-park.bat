@echo off
rem Lance Theme Park dans le navigateur : le serveur local (moteur/node/serveur.mjs) dans une
rem fenetre reduite, puis la page du jeu. Fermer la fenetre « Theme Park - serveur » arrete le serveur.
rem Un serveur qui tourne deja sur ce port est d'abord arrete : lance avant une mise a jour du code,
rem il servirait l'ancien (des animations cherchees dans un dossier qui n'existe plus...).
cd /d "%~dp0"
set PORT=8123
where node >nul 2>nul || (echo Node.js est introuvable : installez-le depuis https://nodejs.org & pause & exit /b 1)
rem Le processus qui ecoute sur le port, s'il est un node (rien d'autre n'est arrete).
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":%PORT% .*LISTENING"') do (
  tasklist /fi "pid eq %%p" /fo csv /nh | find /i "node.exe" >nul && (
    echo Arret de l'ancien serveur ^(processus %%p^)
    taskkill /f /pid %%p >nul 2>nul
  )
)
timeout /t 1 /nobreak >nul
start "Theme Park - serveur" /min node moteur\node\serveur.mjs %PORT%
timeout /t 2 /nobreak >nul
start "" http://localhost:%PORT%/
