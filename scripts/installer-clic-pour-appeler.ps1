# ════════════════════════════════════════════════════════════════════════════════════════════════
# INSTALLER LE CLIC-POUR-APPELER SUR CE POSTE
# ════════════════════════════════════════════════════════════════════════════════════════════════
#
# Naoëlle, 22/09/2026 : « ils ne veulent pas répondre, faut qu'on le fasse nous-mêmes. »
#
# Ce script enregistre le protocole `kimatch://` sur le poste. Kimatch peut alors demander au poste
# de composer un numéro, exactement comme `allo://` aurait dû le faire — sauf que celui-ci, on le
# maîtrise.
#
# ══ CE QUI SE PASSE QUAND ON CLIQUE « APPELER » DANS KIMATCH ══
#
#   1. Le navigateur rencontre `kimatch://appeler?numero=+33612345678`
#   2. Windows lance `appeler-depuis-kimatch.ps1` avec ce numéro
#   3. Le script écrit le numéro dans le champ d'Allo, RELIT pour vérifier, puis actionne « Appeler »
#
# ══ POURQUOI C'EST SÛR ══
#
# Le protocole n'accepte QU'UN NUMÉRO DE TÉLÉPHONE, et le script le vérifie avant d'agir. Une page
# malveillante qui tenterait `kimatch://appeler?numero=...&autre-chose` ne peut rien déclencher
# d'autre qu'un appel — il n'y a aucun autre verbe, et rien n'est passé au shell.
#
# LA VALIDATION EST DANS LE LANCEUR, pas seulement dans le script appelé : c'est la première ligne
# de défense, et elle doit tenir même si quelqu'un appelle le script autrement.
#
# ══ CE QU'IL FAUT SAVOIR AVANT D'INSTALLER ══
#
# · Ça ne marche que sur CE poste, et seulement si Allo est ouvert. Pas sur mobile.
# · Aucun droit administrateur : tout est écrit dans HKCU, la ruche de l'utilisateur.
# · Réversible : `-Desinstaller` retire tout.
#
# ══ USAGE ══
#
#   powershell -ExecutionPolicy Bypass -File installer-clic-pour-appeler.ps1
#   powershell -ExecutionPolicy Bypass -File installer-clic-pour-appeler.ps1 -Desinstaller
# ════════════════════════════════════════════════════════════════════════════════════════════════
param([switch]$Desinstaller)

$ErrorActionPreference = 'Stop'
$cle = 'HKCU:\Software\Classes\kimatch'

if ($Desinstaller) {
  if (Test-Path $cle) {
    Remove-Item $cle -Recurse -Force
    Write-Output 'Protocole kimatch:// retire.'
  } else {
    Write-Output "Rien a retirer : le protocole n'est pas installe."
  }
  exit 0
}

# ── LE LANCEUR ─────────────────────────────────────────────────────────────────────────────────
# On l'écrit à côté du script d'appel, dans le dossier de l'utilisateur plutôt que dans le dépôt :
# le dépôt peut être déplacé, supprimé ou mis à jour, et le protocole pointerait dans le vide.
$dossier = Join-Path $env:LOCALAPPDATA 'Kimatch'
New-Item -ItemType Directory -Force -Path $dossier | Out-Null

$source = Join-Path $PSScriptRoot 'appeler-depuis-kimatch.ps1'
if (-not (Test-Path $source)) {
  Write-Output "ECHEC: appeler-depuis-kimatch.ps1 est introuvable a cote de ce script."
  exit 1
}
Copy-Item $source (Join-Path $dossier 'appeler-depuis-kimatch.ps1') -Force

# LE LANCEUR VALIDE AVANT DE TRANSMETTRE. Il n'accepte qu'un numéro au format international, et
# n'appelle le script que dans ce cas. Tout le reste est ignoré en silence — une URL inattendue ne
# doit produire aucun effet, pas un message d'erreur qui inviterait à chercher plus loin.
$lanceur = @'
# Lanceur du protocole kimatch:// — installe par installer-clic-pour-appeler.ps1
# Recoit kimatch://appeler?numero=%2B33612345678 — ou kimatch://appeler/?numero=... (voir plus bas)
param([string]$Url)

$ErrorActionPreference = 'SilentlyContinue'

# ON JOURNALISE TOUT, DES LA PREMIERE LIGNE.
#
# Le 22/09/2026, ce lanceur a echoue en SILENCE : `Start-Process` ne rendait rien, aucune erreur,
# aucun appel. Impossible de savoir si Windows l'avait lance, s'il avait rejete l'URL, ou si Allo
# n'avait pas repondu. Un composant qui sort sans rien dire est un composant qu'on ne peut pas
# reparer — c'est le meme defaut que les listes qui se disaient vides.
$journal = Join-Path $PSScriptRoot 'journal.txt'
function Noter($m) { "$(Get-Date -f 'yyyy-MM-dd HH:mm:ss')  $m" | Add-Content $journal }
Noter "recu: $Url"

# WINDOWS AJOUTE UNE BARRE OBLIQUE, et c'est ce qui bloquait tout.
#
# Un protocole sans hote — `kimatch://appeler?...` — est normalise par Windows en
# `kimatch://appeler/?...` avant d'etre passe au gestionnaire. Le motif d'origine exigeait `appeler`
# suivi immediatement de `?` : il ne correspondait jamais, et le lanceur sortait sans rien faire.
# On accepte donc les deux ecritures.
if ($Url -notmatch '^kimatch://appeler/?\?') { Noter 'rejet: ce n est pas une demande d appel'; exit 0 }

# On extrait le numero, et RIEN D'AUTRE : aucun autre parametre n'est lu, donc aucun ne peut agir.
if ($Url -notmatch 'numero=([^&]+)') { Noter 'rejet: pas de numero'; exit 0 }
$numero = [System.Uri]::UnescapeDataString($Matches[1]).Trim()

# LE FORMAT EST VERIFIE ICI AUSSI, et pas seulement dans le script appele : c'est la premiere ligne
# de defense. Un « + » suivi de 8 a 15 chiffres, la plage de la recommandation E.164. Rien d'autre
# ne passe, donc rien ne peut etre glisse vers le shell.
if ($numero -notmatch '^\+[0-9]{8,15}$') { Noter "rejet: format invalide ($numero)"; exit 0 }

$script = Join-Path $PSScriptRoot 'appeler-depuis-kimatch.ps1'
Noter "appel de $numero"

# LA SORTIE DU SOUS-PROCESSUS SE RECUPERE PAR UN FICHIER, PAS PAR LA VARIABLE.
#
# `$sortie = & powershell ... 2>&1` rendait une chaine VIDE : le journal affichait « resultat: »
# suivi de rien, et on ne savait pas si l'appel etait parti. Constate le 22/09/2026 sur trois
# tentatives d'affilee, pendant que le meme script lance a la main affichait bien son message.
#
# On redirige donc vers un fichier temporaire et on le relit. C'est plus lourd, mais le journal
# redevient fiable — et un journal auquel on ne peut pas se fier ne sert a rien.
$tmp = Join-Path $env:TEMP ('kimatch-appel-' + [guid]::NewGuid().ToString('N') + '.txt')
& powershell -NoProfile -ExecutionPolicy Bypass -File $script -Numero $numero *> $tmp
$code = $LASTEXITCODE
$sortie = (Get-Content $tmp -Raw -ErrorAction SilentlyContinue)
Remove-Item $tmp -Force -ErrorAction SilentlyContinue
if ($null -eq $sortie -or $sortie.Trim() -eq '') { $sortie = "(aucune sortie, code $code)" }
Noter ("resultat: " + $sortie.Trim())
'@

$cheminLanceur = Join-Path $dossier 'lanceur.ps1'
Set-Content -Path $cheminLanceur -Value $lanceur -Encoding UTF8

# ── LE PROTOCOLE ───────────────────────────────────────────────────────────────────────────────
# `URL Protocol` (valeur vide) est ce qui dit a Windows « ceci est un schema d'URL, pas un type de
# fichier ». Sans cette valeur, la cle est ignoree : c'est l'erreur classique, et c'est exactement
# ce qu'on a constate sur les cles `tel` et `allo` d'Allo, qui la portent bien.
New-Item -Path $cle -Force | Out-Null
Set-ItemProperty -Path $cle -Name '(default)' -Value 'URL:Kimatch'
Set-ItemProperty -Path $cle -Name 'URL Protocol' -Value ''

$cmd = Join-Path $cle 'shell\open\command'
New-Item -Path $cmd -Force | Out-Null
# `-WindowStyle Hidden` : aucune fenetre noire ne doit clignoter a chaque appel.
Set-ItemProperty -Path $cmd -Name '(default)' -Value (
  'powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' +
  $cheminLanceur + '" "%1"')

Write-Output 'Protocole kimatch:// installe.'
Write-Output ("Scripts dans : " + $dossier)
Write-Output ''
Write-Output 'Pour eprouver sans Kimatch :'
Write-Output '  Start-Process "kimatch://appeler?numero=%2B33612345678"'
Write-Output ''
Write-Output "Allo doit etre OUVERT pour que l'appel parte."
