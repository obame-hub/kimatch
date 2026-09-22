/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * INSTALLER LE CLIC-POUR-APPELER, DEPUIS KIMATCH ET SANS RIEN SAVOIR FAIRE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 22/09/2026 : « ça fonctionne chez moi, donc maintenant faut s'assurer que ça fonctionne
 * chez tout le monde. Mais tout le monde ne sait pas utiliser PowerShell, et je suis à distance, je
 * peux pas l'installer pour eux. »
 *
 * ══ POURQUOI ICI, ET NON DANS ADMINISTRATION ══
 *
 * Administration est réservée aux administrateurs. Or ce sont les COMMERCIAUX qui doivent installer
 * — ce sont eux qui téléphonent. « Mon profil » est la seule page que tout le monde ouvre, et c'est
 * déjà là qu'on règle son adresse Allo : les deux réglages du téléphone se retrouvent au même
 * endroit.
 *
 * C'est aussi la règle posée le 20/09 : tout doit se faire depuis Kimatch, sans dépôt à cloner ni
 * navigateur imposé.
 *
 * ══ CE QUE LE BOUTON DONNE, ET CE QU'IL NE PEUT PAS FAIRE ══
 *
 * Un fichier `Installer.bat` qui s'ouvre d'un double-clic, va chercher le reste sur Kimatch, et
 * s'installe sans droits administrateur. Aucune commande à taper.
 *
 * ON NE PEUT PAS INSTALLER À LEUR PLACE : un site web n'a pas le droit d'écrire sur le poste, et
 * c'est heureux. Le double-clic reste le geste minimum, et Windows demandera peut-être de confirmer
 * — c'est dit ici plutôt que découvert devant un écran rouge.
 *
 * ══ POURQUOI ON N'AFFICHE PAS « INSTALLÉ / PAS INSTALLÉ » ══
 *
 * Parce qu'on ne peut pas le savoir. Un site ne peut pas interroger les protocoles enregistrés sur
 * le poste : tenter `kimatch://` pour voir s'il répond ne rend RIEN dans les deux cas — c'est
 * exactement ce qui nous a fait tourner en rond pendant deux jours. Plutôt qu'un témoin qui
 * mentirait, on donne le seul test fiable : appeler quelqu'un et regarder.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { Download, Phone } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function InstallerClicPourAppeler() {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-km-green" />
          Appeler d’un clic depuis Kimatch
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-km-muted">
          Une fois installé, cliquer sur le téléphone à côté d’un numéro compose directement dans
          Allo. À faire <strong className="text-km-text">une seule fois</strong> par ordinateur.
        </p>

        <a
          href="/clic-pour-appeler/Installer.bat"
          download
          className="inline-flex items-center gap-2 rounded-km bg-kiwi-gradient px-4 py-2.5 text-km-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Download className="h-4 w-4" />
          Télécharger l’installateur
        </a>

        {/* LES ÉTAPES SONT NUMÉROTÉES ET COURTES. Le point 3 est celui qu'on oublie d'écrire et qui
            fait échouer une installation sur deux : Windows affiche un avertissement sur tout
            fichier téléchargé, et sans cette ligne on referme la fenêtre en croyant bien faire. */}
        <ol className="space-y-2 text-sm text-km-muted">
          <li>
            <strong className="text-km-text">1.</strong> Téléchargez le fichier ci-dessus, puis
            <strong className="text-km-text"> double-cliquez</strong> dessus.
          </li>
          <li>
            <strong className="text-km-text">2.</strong> Si Windows affiche «&nbsp;Windows a protégé
            votre ordinateur&nbsp;» : cliquez sur{' '}
            <strong className="text-km-text">Informations complémentaires</strong>, puis{' '}
            <strong className="text-km-text">Exécuter quand même</strong>.
          </li>
          <li>
            <strong className="text-km-text">3.</strong> Une fenêtre noire s’ouvre, affiche
            «&nbsp;Protocole kimatch:// installé&nbsp;», et attend une touche. C’est fini.
          </li>
        </ol>

        <div className="rounded-km bg-km-soft px-3.5 py-3 text-km-xs leading-relaxed text-km-muted">
          <p className="font-semibold text-km-text">Pour que ça marche</p>
          <p className="mt-1">
            L’application <strong className="text-km-text">Allo doit être ouverte</strong> : c’est
            elle qui passe l’appel, Kimatch lui dit seulement quel numéro composer.
          </p>
          {/* LA LIMITE EST DITE ICI, PAS DÉCOUVERTE. Quelqu'un qui essaie depuis son téléphone et
              ne comprend pas pourquoi ça ne marche pas écrira à Naoëlle — autant l'écrire. */}
          <p className="mt-1.5">
            Sur <strong className="text-km-text">mobile</strong>, rien à installer : le clic ouvre
            le téléphone comme d’habitude.
          </p>
        </div>

        <p className="text-km-xs text-km-faint">
          Si un appel ne part pas, envoyez ce fichier à Naoëlle — il dit exactement ce qui a
          bloqué&nbsp;:{' '}
          <code className="rounded bg-km-bg px-1 py-0.5 font-mono">
            %LOCALAPPDATA%\Kimatch\journal.txt
          </code>
        </p>
      </CardContent>
    </Card>
  )
}
