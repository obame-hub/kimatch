@echo off
setlocal

REM ==========================================================================================
REM  KIMATCH - CLIC POUR APPELER - installation sur un poste
REM ==========================================================================================
REM  Naoelle, 22/09/2026 : tout le monde ne sait pas utiliser PowerShell, et je suis a distance.
REM
REM  CE FICHIER EST AUTONOME : telecharge depuis Kimatch (Mon profil), ouvert d un double-clic,
REM  il va chercher le reste tout seul. Pas de depot, pas de commande, pas de droits admin.
REM
REM  TROIS PIEGES RENCONTRES LE 22/09, ET EVITES ICI :
REM   1. ASCII SANS BOM obligatoire. En UTF-8 avec BOM, cmd lit les trois premiers octets comme
REM      du texte et setlocal devient tlocal.
REM   2. Pas d accent ni de deux-points dans les REM et les echo : cmd les interprete et affiche
REM      des erreurs rouges qui font croire a un echec.
REM   3. On telecharge le script DANS UN FICHIER avant de l executer. Un iwr | iex affichait des
REM      centaines de codes numeriques : le contenu arrivait en octets, parcourus un par un.
REM ==========================================================================================

title Kimatch - Clic pour appeler

echo.
echo   ========================================================
echo     KIMATCH - CLIC POUR APPELER
echo   ========================================================
echo.
echo   Installation en cours, quelques secondes...
echo.

set "PS=%TEMP%\kimatch-installer.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest 'https://kimatch.fr/clic-pour-appeler/installer.ps1' -OutFile $env:TEMP\kimatch-installer.ps1 -UseBasicParsing"

if not exist "%PS%" (
  echo.
  echo   ECHEC - impossible de telecharger l installateur.
  echo   Verifiez votre connexion internet, puis relancez ce fichier.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS%"
set CODE=%errorlevel%
del "%PS%" >nul 2>&1

if not "%CODE%"=="0" (
  echo.
  echo   L INSTALLATION A ECHOUE.
  echo   Faites une capture de cette fenetre et envoyez-la a Naoelle.
  echo.
  pause
  exit /b 1
)

echo.
echo   --------------------------------------------------------
echo.
echo   Termine. Pour verifier, dans l ordre
echo.
echo     1. Ouvrez l application Allo et laissez-la ouverte
echo     2. Dans Kimatch, cliquez sur le telephone a cote d un numero
echo     3. Ca doit appeler directement
echo.
echo   Si rien ne se passe, envoyez a Naoelle le fichier
echo   %%LOCALAPPDATA%%\Kimatch\journal.txt
echo.
pause
