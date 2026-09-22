@echo off
setlocal

REM ==============================================================================================
REM  KIMATCH - CLIC POUR APPELER - installation sur un poste
REM ==============================================================================================
REM  Double-clic pour installer. Ensuite, cliquer sur un numero dans Kimatch compose dans Allo.
REM
REM  UN .BAT PLUTOT QU'UNE LIGNE POWERSHELL : le tuto tient en "double-clic", et on n'envoie pas
REM  dix personnes taper une commande.
REM
REM  AUCUN DROIT ADMINISTRATEUR - tout est ecrit dans le profil de l'utilisateur.
REM  REVERSIBLE - voir installer-clic-pour-appeler.ps1 avec l'option -Desinstaller.
REM
REM  PAS DE CARACTERE ACCENTUE NI DE DEUX-POINTS DANS CES COMMENTAIRES NI DANS LES ECHO : cmd.exe
REM  les interprete et affiche des erreurs rouges qui font croire que l'installation a echoue.
REM  Constate au premier essai du 22/09/2026.
REM ==============================================================================================

title Kimatch - Clic pour appeler

echo.
echo   ========================================================
echo     KIMATCH - CLIC POUR APPELER
echo   ========================================================
echo.
echo   Installation en cours, quelques secondes...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer-clic-pour-appeler.ps1"

if errorlevel 1 (
  echo.
  echo   L'INSTALLATION A ECHOUE. Envoyez cette fenetre a Naoelle.
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
