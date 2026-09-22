@echo off
setlocal

REM ==============================================================================================
REM  KIMATCH - CLIC POUR APPELER - installation sur un poste
REM ==============================================================================================
REM  Naoelle, 22/09/2026 : "tout le monde ne sait pas utiliser PowerShell et je suis a distance,
REM  je peux pas l'installer pour eux."
REM
REM  CE FICHIER EST AUTONOME. Il se telecharge depuis Kimatch (Administration > Clic pour appeler),
REM  s'ouvre d'un double-clic, et va chercher lui-meme les deux scripts dont il a besoin. Pas de
REM  depot a cloner, pas de commande a taper, pas de droits administrateur.
REM
REM  PAS DE CARACTERE ACCENTUE NI DE DEUX-POINTS dans les commentaires ni dans les echo : cmd.exe
REM  les interprete et affiche des erreurs rouges qui font croire a un echec. Constate le 22/09.
REM ==============================================================================================

title Kimatch - Clic pour appeler

echo.
echo   ========================================================
echo     KIMATCH - CLIC POUR APPELER
echo   ========================================================
echo.
echo   Installation en cours, quelques secondes...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "iwr 'https://kimatch.fr/clic-pour-appeler/installer.ps1' -UseBasicParsing | select -ExpandProperty Content | iex"

if errorlevel 1 (
  echo.
  echo   L'INSTALLATION A ECHOUE.
  echo   Faites une capture de cette fenetre et envoyez-la a Naoelle.
  echo.
  pause
  exit /b 1
)

echo.
echo   --------------------------------------------------------
echo.
echo   Termine. Pour verifier, dans l'ordre
echo.
echo     1. Ouvrez l'application Allo et laissez-la ouverte
echo     2. Dans Kimatch, cliquez sur le telephone a cote d'un numero
echo     3. Ca doit appeler directement
echo.
echo   Si rien ne se passe, envoyez a Naoelle le fichier
echo   %%LOCALAPPDATA%%\Kimatch\journal.txt
echo.
pause
