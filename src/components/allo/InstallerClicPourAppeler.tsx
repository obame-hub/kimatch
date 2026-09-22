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
    /* ══ TOUTE LA LARGEUR, ET TROIS COLONNES PLUTÔT QU'UNE PILE ══
     *
     * Naoëlle, 22/09/2026 : « peux-tu agrandir ce message d'installateur pour qu'il prenne la
     * largeur de l'écran et que ça réduise sa hauteur ».
     *
     * Le bloc était en `max-w-2xl` comme les autres cartes du profil, et tout s'empilait : titre,
     * bouton, trois étapes, encadré, note. Il dépassait l'écran alors qu'il ne dit presque rien.
     *
     * Sur un écran large, les étapes tiennent côte à côte — elles sont indépendantes, on ne les lit
     * pas l'une après l'autre mais on les suit. Sur mobile, la grille retombe en une colonne
     * d'elle-même : c'est le même contenu, jamais tronqué. */
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-km-green" />
          Appeler d’un clic depuis Kimatch
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* LA PHRASE ET LE BOUTON SUR UNE SEULE LIGNE quand la place le permet : ce sont les deux
            seules choses à faire, elles n'ont pas à occuper deux étages. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-km-muted">
            Cliquer sur le téléphone à côté d’un numéro compose directement dans Allo. À faire{' '}
            <strong className="text-km-text">une seule fois</strong> par ordinateur.
          </p>
          <a
            href="/clic-pour-appeler/Installer.bat"
            download
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-km bg-kiwi-gradient px-4 py-2.5 text-km-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Download className="h-4 w-4" />
            Télécharger l’installateur
          </a>
        </div>

        {/* LES TROIS ÉTAPES CÔTE À CÔTE. La deuxième est celle qu'on oublie d'écrire et qui fait
            échouer une installation sur deux : Windows avertit sur tout fichier téléchargé, et sans
            cette ligne on referme la fenêtre en croyant bien faire. */}
        <ol className="grid gap-2 sm:grid-cols-3">
          <li className="rounded-km border border-km-line px-3 py-2.5 text-km-xs leading-snug text-km-muted">
            <span className="font-bold text-km-green">1.</span> Téléchargez le fichier, puis{' '}
            <strong className="text-km-text">double-cliquez</strong> dessus.
          </li>
          <li className="rounded-km border border-km-line px-3 py-2.5 text-km-xs leading-snug text-km-muted">
            <span className="font-bold text-km-green">2.</span> Si Windows dit «&nbsp;a protégé votre
            ordinateur&nbsp;» :{' '}
            <strong className="text-km-text">Informations complémentaires</strong> →{' '}
            <strong className="text-km-text">Exécuter quand même</strong>.
          </li>
          <li className="rounded-km border border-km-line px-3 py-2.5 text-km-xs leading-snug text-km-muted">
            <span className="font-bold text-km-green">3.</span> Une fenêtre noire dit
            «&nbsp;Protocole installé&nbsp;» et attend une touche. C’est fini.
          </li>
        </ol>

        {/* LES TROIS AVERTISSEMENTS SUR UNE LIGNE : chacun tient en une phrase, et les empiler
            donnait trois étages pour trois informations qu'on lit d'un coup d'œil. */}
        <div className="grid gap-2 rounded-km bg-km-soft px-3.5 py-2.5 text-km-xs leading-snug text-km-muted sm:grid-cols-3">
          <p>
            <strong className="text-km-text">Allo doit être ouvert</strong> — c’est lui qui passe
            l’appel.
          </p>
          {/* LA LIMITE EST DITE ICI, PAS DÉCOUVERTE. Quelqu'un qui essaie depuis son téléphone et
              ne comprend pas pourquoi ça ne marche pas écrira à Naoëlle — autant l'écrire. */}
          <p>
            Sur <strong className="text-km-text">mobile</strong>, rien à installer : le clic ouvre le
            téléphone comme d’habitude.
          </p>
          <p>
            Si un appel ne part pas, envoyez ce fichier&nbsp;:{' '}
            <code className="rounded bg-km-bg px-1 py-0.5 font-mono text-[11px]">
              %LOCALAPPDATA%\Kimatch\journal.txt
            </code>
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
