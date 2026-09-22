# ════════════════════════════════════════════════════════════════════════════════════════════════
# APPELER DEPUIS KIMATCH — ON COMPOSE DANS ALLO À LA PLACE DU COMMERCIAL
# ════════════════════════════════════════════════════════════════════════════════════════════════
#
# Naoëlle, 22/09/2026 : ' ils ne veulent pas répondre, faut qu'on le fasse nous-mêmes de n'importe
# quelle manière, on peut pas créer un truc custom je sais pas, simuler les clics quelque chose. '
#
# ══ POURQUOI UN PROGRAMME LOCAL, ET NON DU CODE DANS KIMATCH ══
#
# Un site web ne peut pas piloter le clavier ni la souris du poste : c'est une protection du
# navigateur, la même qui empêche n'importe quel site de taper à votre place. Kimatch ne peut donc
# pas faire ce geste, quel que soit le code qu'on y écrive. Ce script, lui, tourne SUR le poste.
#
# ══ ON NE SIMULE PAS DES CLICS : ON PARLE À L'INTERFACE ══
#
# Première version, abandonnée : déplacer la souris à des coordonnées calculées, cliquer, coller au
# clavier. Fragile par nature — un déplacement de fenêtre, une notification qui passe devant, et le
# numéro atterrit ailleurs. Impossible à vérifier, aussi : le script disait ' OK ' sans savoir.
#
# ALLO EST UNE APPLICATION ELECTRON, DONC UNE PAGE WEB, ET WINDOWS SAIT LA LIRE. Mesuré le
# 22/09/2026 : son arbre d'accessibilité expose 266 éléments, dont exactement les deux qu'il nous
# faut —
#
#   · le champ ' Entrez un nom ou un numéro... ', qui supporte `ValuePattern` (on y ÉCRIT) ;
#   · le bouton ' Appeler ', qui supporte `InvokePattern` (on l'ACTIONNE).
#
# C'est le même mécanisme qu'utilise un lecteur d'écran. On ne détourne rien : on se sert de
# l'interface d'accessibilité qu'Electron publie, et qui est faite pour être pilotée.
#
# ET ON PEUT VÉRIFIER, ce qui change tout : après écriture, on relit la valeur du champ. Le script
# ne dit plus ' OK ' par optimisme, il le dit parce qu'il a relu.
#
# ══ CE QU'ON A ESSAYÉ AVANT, ET QUI EST FERMÉ ══
#
#   · `DIAL_NUMBER` par postMessage : leur application l'écoute et n'y a branché personne.
#   · Leur API REST : 64 chemins, aucun ne compose.
#   · La file du Power Dialer : le numéro y est resté TREIZE JOURS sans qu'un appel parte.
#   · `allo://call?number=…` : leur propre code dit que c'est fait pour les CRM sur Windows, tout
#     est en place des deux côtés, et l'appel ne part pas. C'est un défaut chez eux.
#
# ══ CE QUE CE SCRIPT NE PEUT PAS FAIRE, ET IL FAUT LE DIRE ══
#
# Il ne marche que sur un poste Windows où Allo est installé et ouvert. Pas sur mobile, pas à
# distance. C'est le prix de l'automatisation locale — et c'est pour ça qu'on ne s'en sert qu'après
# avoir épuisé les chemins qui, eux, marchent partout.
#
# ══ USAGE ══
#
#   powershell -ExecutionPolicy Bypass -File appeler-depuis-kimatch.ps1 -Numero '+33612345678'
#   …            -SansValider     écrit le numéro sans lancer l'appel (pour éprouver le tir)
#
# Rend 0 si le numéro a été écrit ET relu, 1 sinon.
# ════════════════════════════════════════════════════════════════════════════════════════════════
param(
  [Parameter(Mandatory = $true)][string]$Numero,
  [switch]$SansValider
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes

# ── LA FENÊTRE D'ALLO ──────────────────────────────────────────────────────────────────────────
# Plusieurs processus portent le nom ' Allo ' — Electron en lance un par processus de rendu. On ne
# garde que celui qui porte une fenêtre, le seul dont l'arbre d'accessibilité contienne l'interface.
$allo = Get-Process -Name 'Allo*' -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -First 1

if (-not $allo) {
  Write-Output "ECHEC: Allo n'est pas ouvert."
  exit 1
}

$racine = [System.Windows.Automation.AutomationElement]::FromHandle($allo.MainWindowHandle)
$tous = $racine.FindAll(
  [System.Windows.Automation.TreeScope]::Descendants,
  [System.Windows.Automation.Condition]::TrueCondition)

# ── LE CHAMP ET LE BOUTON ──────────────────────────────────────────────────────────────────────
# On les retrouve par leur LIBELLÉ et non par leur position dans l'arbre : une position changerait
# au premier remaniement de leur interface, alors qu'un libellé visible se repère et se corrige.
#
# LE BOUTON PORTE PARFOIS UNE ESPACE EN TÊTE (' Appeler ' / ' ␣Appeler ') selon qu'il est rendu avec
# son icône : on compare donc sur la valeur ajustée, sinon la recherche échoue une fois sur deux.
#
# ══ LE LIBELLÉ DU CHAMP DISPARAÎT DÈS QU'ON Y ÉCRIT — CORRIGÉ LE 22/09/2026 ══
#
# Première version : on cherchait le champ par son nom, ' Entrez un nom ou un numéro... '. Ça a
# marché une fois, puis échoué : ce texte est l'INVITE, pas une étiquette. Une fois un numéro
# saisi, le champ s'appelle autrement et la recherche ne le trouvait plus — le script refusait
# d'appeler parce qu'il avait réussi au coup précédent.
#
# ON LE RECONNAÎT DONC À SA NATURE : un champ de saisie (`Edit`) qui n'est pas la zone de note. La
# note interne, elle, garde son libellé — c'est le seul autre champ de leur écran, et il est stable.
$champ = $null
$bouton = $null
foreach ($e in $tous) {
  $nom = $e.Current.Name
  if (-not $bouton -and $nom.Trim() -eq 'Appeler') { $bouton = $e }
  if ($champ) { continue }
  if ($e.Current.ControlType.ProgrammaticName -notmatch 'Edit') { continue }
  # La zone de note interne est le seul autre champ de l'écran : on l'écarte explicitement.
  if ($nom -match '(?i)note interne') { continue }
  $champ = $e
}

if (-not $champ) {
  Write-Output "ECHEC: champ de composition introuvable. Ouvre l'onglet Dialer dans Allo."
  exit 1
}

# ── ÉCRIRE LE NUMÉRO ───────────────────────────────────────────────────────────────────────────
# `SetValue` remplace le contenu d'un coup : pas de concaténation possible avec un numéro déjà
# présent, qui appellerait un correspondant qui n'existe pas. C'est le risque qu'avait la version
# ' coller au clavier ', et il disparaît ici.
$valeur = $champ.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
if ($valeur.Current.IsReadOnly) {
  Write-Output "ECHEC: le champ de composition refuse l'ecriture."
  exit 1
}
$valeur.SetValue($Numero)
Start-Sleep -Milliseconds 600

# ── RELIRE, AVANT DE RIEN AFFIRMER ─────────────────────────────────────────────────────────────
# Tout l'intérêt de cette méthode par rapport à la frappe simulée : on SAIT si c'est écrit. Un
# script qui annonce ' composé ' sans relire est exactement ce qui nous a fait tourner en rond
# pendant deux jours.
$relu = $champ.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value
if ($relu -notmatch [regex]::Escape($Numero.TrimStart('+'))) {
  Write-Output "ECHEC: le numero n'est pas dans le champ (lu: '$relu')."
  exit 1
}

if ($SansValider) {
  Write-Output "OK: $Numero ecrit dans Allo (non valide, -SansValider)."
  exit 0
}

# ── LANCER L'APPEL ─────────────────────────────────────────────────────────────────────────────
# `InvokePattern` actionne le bouton comme le ferait un lecteur d'écran — sans déplacer la souris,
# donc sans voler le pointeur à qui travaille. On relit le bouton juste avant : Allo ne l'active
# qu'une fois le numéro reconnu comme valide, et un bouton désactivé ne dit rien quand on l'invoque.
if (-not $bouton) {
  Write-Output "OK (partiel): $Numero ecrit, mais le bouton Appeler est introuvable. Appuie dessus."
  exit 0
}

# On le retrouve à neuf : l'écriture a pu le faire apparaître ou l'activer.
$tous2 = $racine.FindAll(
  [System.Windows.Automation.TreeScope]::Descendants,
  [System.Windows.Automation.Condition]::TrueCondition)
foreach ($e in $tous2) { if ($e.Current.Name.Trim() -eq 'Appeler') { $bouton = $e; break } }

if (-not $bouton.Current.IsEnabled) {
  Write-Output "OK (partiel): $Numero ecrit, mais Allo n'active pas encore Appeler. Appuie dessus."
  exit 0
}

$bouton.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()

# ══ ON VERIFIE QU'ALLO A OBEI, PAS SEULEMENT QU'ON A CLIQUE ══
#
# Naoelle, 22/09/2026 : ' ca n'appelle plus ? pourquoi ? ' Le journal disait ' OK ' a chaque fois, et
# pourtant aucun appel ne partait.
#
# LA CAUSE : une autre ligne etait deja en communication — le compte Allo est partage, et un
# collegue telephonait. Allo refuse alors de composer, sans rien dire. Notre script, lui, annoncait
# ' OK ' parce qu'il avait clique : il confondait ' j'ai appuye ' avec ' ca appelle '.
#
# C'est la meme faute que les listes qui se disaient vides quand elles n'avaient pas pu lire. Un
# composant qui ne verifie pas son effet ne peut pas etre repare — on cherche ailleurs pendant des
# heures.
#
# COMMENT ON LE SAIT : quand l'appel part, Allo VIDE son champ de composition. S'il contient encore
# le numero deux secondes apres, c'est qu'il ne s'est rien passe.
#
# LA RELECTURE PEUT ELLE-MEME ECHOUER, ET C'EST BON SIGNE.
#
# Premiere version de ce controle, le 22/09/2026 : elle relisait le champ sans precaution et le
# script mourait sur 'Modele non pris en charge'. La cause est justement ce qu'on cherchait a
# constater : QUAND L'APPEL PART, ALLO CHANGE D'ECRAN, et l'element qu'on tenait n'existe plus.
#
# Une exception ici signifie donc que le clavier a disparu, c'est-a-dire que l'appel est lance. On
# la traite comme un succes plutot que comme une panne — et le script ne meurt plus au moment
# precis ou il reussit.
#
# ══ ON CHERCHE LA PREUVE QU'UN APPEL EST EN COURS, PAS L'ABSENCE D'INDICE ══
#
# Deuxieme version de ce controle, et la premiere etait trop indulgente : elle concluait au succes
# des que la relecture du champ levait une exception, en supposant qu'Allo avait change d'ecran.
#
# MESURE LE 22/09/2026 A 12:41 ET 12:43 : le journal disait 'OK' deux fois, et AUCUN appel n'est
# arrive en base. Le champ avait bien disparu — Allo se redessine pour d'autres raisons — et le
# script prenait cette disparition pour une reussite. Il confondait encore 'je n'ai pas vu
# d'echec' avec 'ca a marche'.
#
# ON EXIGE DONC UN SIGNE POSITIF : quand un appel part, l'interface d'Allo affiche son etat
# (sonnerie, en communication) et son bouton raccrocher. Si rien de tout cela n'apparait dans les
# six secondes, l'appel n'est pas parti — et on le dit.
$lance = $false
for ($i = 0; $i -lt 12 -and -not $lance; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $maintenant = $racine.FindAll(
      [System.Windows.Automation.TreeScope]::Descendants,
      [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($e in $maintenant) {
      $n = $e.Current.Name
      if ($n -match '(?i)raccrocher|hang ?up|end call|sonnerie|ringing|en communication|in call') {
        $lance = $true
        break
      }
    }
  } catch {
    # L'arbre peut etre en cours de redessin : on retente au tour suivant plutot que de conclure.
  }
}

if (-not $lance) {
  Write-Output "ECHEC: Allo n'a pas compose $Numero - ligne occupee, ou le bouton n'a pas repondu."
  exit 1
}

Write-Output "OK: appel lance vers $Numero."
exit 0
