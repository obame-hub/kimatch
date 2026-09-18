import { useState } from 'react'
import { useOuvrirEmail } from '@/lib/voletEmail'
import { useNavigate, useParams } from 'react-router-dom'
import { TitreOnglet } from '@/components/layout/TitreOnglet'
import { Button } from '@/components/ui/button'
import { OngletFichiers } from '@/components/compte/OngletFichiers'
import { DialogConversionPiste } from '@/components/prospection/DialogConversionPiste'
import { ActivityFeed } from '@/components/site/ActivityFeed'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { useGoBack } from '@/lib/useGoBack'
import { useCanManage, useProfilsAdmin } from '@/lib/data/roles'
import { InlineIdentite } from '@/components/ui/inline-identite'
import { useActionsParPiste } from '@/lib/data/actions'
import { useInteractionsParPiste } from '@/lib/data/interactions'
import { useDocumentsParEntites, useTeleverserDocuments } from '@/lib/data/documents'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useStatutsOpportunites } from '@/lib/data/opportunites'
import {
  usePiste, useMajPiste, useConvertirPisteEnOpportunite, useStatutsPistes, useSupprimerPiste,
} from '@/lib/data/prospection'
import { BandeauPiste } from '@/components/prospection/BandeauPiste'
import { ZonesPiste } from '@/components/prospection/ZonesPiste'
import { MentionProprietaire } from '@/components/ui/mention-proprietaire'
import { CartoucheChoix } from '@/components/ui/cartouche-choix'
import { CheminPiste } from '@/components/prospection/CheminPiste'
import { nomComplet } from '@/lib/civilite'
import { useHistorique } from '@/lib/data/historique'
import { OngletHistorique } from '@/components/compte/OngletHistorique'
import { Dialog } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/form'
import { cn } from '@/lib/utils'
import { useNoterConsultation } from '@/lib/data/consultationsRecentes'

/**
 * FICHE PISTE.
 *
 * Michel, 01/09/2026 : « que ce soit affiché comme les opportunités, que ce ne soit pas un volet à
 * droite qui s'affiche quand on clique dessus mais une page dédiée à la piste ».
 *
 * ══ CE QUE CETTE PAGE REMPLACE, ET POURQUOI LE PANNEAU NE SUFFISAIT PLUS ══
 *
 * Le panneau latéral avait été choisi en toute conscience : une piste vit quelques jours et son
 * travail consiste à cocher cinq cases avant de disparaître en opportunité. Le panneau gardait le
 * tableau visible derrière lui — on cochait, on fermait, on voyait la carte changer de colonne.
 *
 * Trois choses ont changé depuis, et elles rendent la page nécessaire :
 *
 *   · UNE PISTE PORTE MAINTENANT DES TÂCHES (`actions.piste_id`, 31/08/2026). Un objet qui porte du
 *     travail daté a besoin d'une adresse : on doit pouvoir y revenir depuis la page Tâches.
 *   · UN PANNEAU N'A PAS D'ADRESSE. Pas de lien à envoyer, pas de favori, pas de retour arrière du
 *     navigateur. On ne partage pas « la troisième carte de la deuxième colonne ».
 *   · LA COHÉRENCE. Signal, opportunité, recommandation, contrat, suivi : tous ont leur fiche. La
 *     piste était le seul objet du cycle à ne pas en avoir, et c'est ce que Michel remarque.
 *
 * ══ LA MISE EN PAGE SUIT LA RÈGLE DU 31/08 ══
 *
 * Plus de volet gauche : les objets liés — compte, contact, opportunité — vivent dans un onglet.
 * Le bandeau porte l'état et le geste qui suit, au-dessus de tout onglet.
 */

type CleOnglet = 'piste' | 'fichiers'

export default function PisteDetail() {
  const { id } = useParams<{ id: string }>()
  const ouvrirEmail = useOuvrirEmail()
  const navigate = useNavigate()
  const goBack = useGoBack('/prospection')
  const canManage = useCanManage()

  const { data: piste, isLoading } = usePiste(id)

  /* La fiche signale son ouverture : c'est ce qui alimente les « Récents » de la palette.
     L'écriture part en arrière-plan et attend que le nom soit chargé — voir consultationsRecentes.ts. */
  useNoterConsultation({
    type: 'piste',
    id: piste?.id,
    libelle: piste ? piste.societe : null,
    sousLibelle: piste ? [piste.contact_nom, piste.ville].filter(Boolean).join(' · ') : null,
    chemin: `/pistes/${id}`,
  })
  const { data: actions } = useActionsParPiste(id)
  // 8 942 interactions sont rattachées à des pistes depuis l'import des leads du 01/09/2026,
  // et aucun écran ne les montrait : le flux recevait `interactions={[]}` en dur.
  const { data: interactions } = useInteractionsParPiste(id)
  const { data: documents } = useDocumentsParEntites(id ? [id] : undefined)
  const { data: typesDocumentsRef } = useReferenceTable('types_documents')
  const { data: statuts } = useStatutsOpportunites()
  const { data: statutsPistes } = useStatutsPistes()
  const { data: profils } = useProfilsAdmin()
  const { data: origines } = useReferenceTable('origines_pistes')
  const maj = useMajPiste()
  const televerser = useTeleverserDocuments()
  const convertir = useConvertirPisteEnOpportunite()

  const [onglet, setOnglet] = useState<CleOnglet>('piste')
  const [conversionOuverte, setConversionOuverte] = useState(false)
  const [suppressionOuverte, setSuppressionOuverte] = useState(false)
  /* L'historique ne se lit qu'à l'ouverture de la fenêtre : même règle que la fiche compte, une
     piste peut porter des centaines de lignes de modification et personne ne les regarde en
     arrivant. */
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false)
  const supprimerPiste = useSupprimerPiste()
  const { data: historique } = useHistorique('pistes', id, historiqueOuvert)
  /* Le motif attend d'être saisi : `null` quand la boîte est fermée, une chaîne (même vide) quand
     elle est ouverte. Distinguer les deux évite de rouvrir la boîte à chaque rendu. */
  const [disqualification, setDisqualification] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  function signaler(m: string) {
    setToast(m)
    setTimeout(() => setToast(null), 2600)
  }

  if (isLoading) return <div className="p-6 text-km-body text-km-faint">Chargement…</div>
  if (!piste) return <div className="p-6 text-km-body text-km-faint">Piste introuvable.</div>

  const convertie = Boolean(piste.opportunite_id)
  const documentsDeLaPiste = (documents ?? []).filter((d) => d.entite_type === 'piste')

  const ONGLETS: { cle: CleOnglet; libelle: string; badge?: string }[] = [
    { cle: 'piste', libelle: 'Piste' },
    { cle: 'fichiers', libelle: 'Fichiers', badge: documentsDeLaPiste.length ? String(documentsDeLaPiste.length) : undefined },
  ]

  return (
    /* `data-pleine-hauteur` : cette page ne défile pas dans `main`, elle prend toute la hauteur et
       fait défiler ses volets. L'attribut annule la marge basse de `AppLayout` — voir son
       commentaire — qui, ici, raccourcissait la page de 80 px au lieu de protéger quoi que ce soit. */
    <div data-pleine-hauteur className="flex h-full flex-col overflow-hidden">
      <TitreOnglet crumb="Pistes" title={piste.societe || piste.contact_nom || 'Piste'} />

      {/* ══ LE BANDEAU, REPRIS DE LA FICHE COMPTE ══
          William, 16/09/2026 : « reprends le graphique du header de la fiche compte et adapte-le à
          la fiche piste ». Voir BandeauPiste.tsx pour ce qui est repris à l'identique et ce qui
          change — le titre est la PERSONNE, la société passe en seconde ligne, et « Convertir »
          remplace le hub de création. */}
      <BandeauPiste
        canManage={canManage}
        convertie={convertie}
        onRetour={goBack}
        /* « MODIFIER » MÈNE À L'ONGLET OÙ L'ON MODIFIE. Une piste n'a pas de fenêtre d'édition :
           ses champs se corrigent en place dans l'onglet Piste, un par un. Le bouton y conduit
           plutôt que d'ouvrir un formulaire qui dirait deux fois la même chose. */
        onModifier={() => setOnglet('piste')}
        onSupprimer={() => setSuppressionOuverte(true)}
        onConvertir={() => setConversionOuverte(true)}
        onDisqualifier={
          piste.statut_clos ? undefined : () => setDisqualification(piste.motif_disqualification ?? '')
        }
        onHistorique={() => setHistoriqueOuvert(true)}
        lienOpportunite={piste.opportunite_id ? `/opportunites/${piste.opportunite_id}` : undefined}
        titre={
          /* LE NOM COMPLET DU CONTACT, civilité comprise, ET MODIFIABLE EN PLACE — le compte fait
             pareil avec `InlineField`. Ici c'est `InlineIdentite`, parce qu'un nom de personne
             s'ouvre sur trois champs : corriger « Monsieur Jean DUPONT » d'un seul tenant recollerait
             ce que la base sépare, et perdrait la civilité (Naoëlle, 14/09/2026).

             MÊME HABILLAGE QUE LE TITRE DU COMPTE, à la classe près : 19 px, gras, `-.02em`.

             `contact_nom` existe sur les 4 946 pistes et dit la même chose que prénom + nom à la
             casse près sur 4 938 d'entre elles — mais il ne porte pas la civilité, et il est resté
             en majuscules sur une partie de la reprise Salesforce. On ne retombe donc sur lui que
             s'il ne reste rien à recomposer. */
          canManage ? (
            <InlineIdentite
              label=""
              valeur={{ civilite: piste.civilite, prenom: piste.prenom, nom: piste.nom }}
              onCommit={(v) => maj.mutateAsync({
                id: piste.id,
                patch: {
                  civilite: v.civilite,
                  prenom: v.prenom,
                  nom: v.nom,
                  contact_nom: [v.prenom, v.nom].filter(Boolean).join(' ') || null,
                },
              })}
              onSaved={() => signaler('✓ enregistré')}
              onError={(err) => signaler(`Erreur : ${err.message}`)}
              className="text-[19px] font-bold leading-tight tracking-[-.02em] text-km-text"
            />
          ) : (
            nomComplet({ civilite: piste.civilite, prenom: piste.prenom, nom: piste.nom })
            || piste.contact_nom
            || 'Contact inconnu'
          )
        }
        societe={piste.societe || 'Société inconnue'}
        pastilles={
          <>
            {/* LE SEGMENT EST DÉJÀ LÀ, et il porte exactement les deux valeurs demandées :
                4 007 « Syndic professionnel », 893 « Entreprise », 46 vides. Aucun champ à créer. */}
            {piste.segment && (
              <span className="rounded-km bg-km-blue-soft px-2 py-0.5 text-km-label font-semibold text-km-blue">
                {piste.segment}
              </span>
            )}
            {/* ══ L'ORIGINE, EN SECONDE CARTOUCHE ET MODIFIABLE AU CLIC ══
                William, 16/09/2026. Elle est en gris et non dans la couleur de l'objet : le segment
                dit ce que la piste EST, l'origine dit d'où elle vient. Deux cartouches de même
                teinte se liraient comme un seul couple, et on chercherait ce qui les relie.

                La liste vient de `origines_pistes` (migration 20260916160000) : dix libellés figés,
                parce que dix personnes qui retapent « Google Ads sans facture (Inbound) »
                produisent dix variantes, et la question « d'où viennent nos affaires » perd sa
                réponse. */}
            <CartoucheChoix
              titre="Origine de la piste"
              vide="origine inconnue"
              valeur={piste.source}
              options={(origines ?? []).map((o) => o.libelle)}
              peutModifier={canManage}
              onChoisir={(v) => {
                maj
                  .mutateAsync({ id: piste.id, patch: { source: v } })
                  .then(() => signaler(v ? `✓ Origine : ${v}` : '✓ Origine retirée'))
                  .catch((e) => signaler(e instanceof Error ? e.message : 'Enregistrement impossible'))
              }}
            />
          </>
        }
        proprietaire={
          /* LA MÊME MENTION QUE SUR LE COMPTE — William, 16/09/2026 : « le système de propriétaire
             doit également être le même, c'est-à-dire que c'est un champ modifiable en liste ». Elle
             était en texte mort ici. Le dessin vit dans `MentionProprietaire`, partagé avec la fiche
             compte pour qu'il n'y ait qu'un endroit à retoucher. */
          <MentionProprietaire
            nom={piste.proprietaire_nom ?? null}
            dates={[
              piste.date_creation ? `Créé le ${new Date(piste.date_creation).toLocaleDateString('fr-FR')}` : null,
            ].filter(Boolean).join(' · ')}
            canManage={canManage}
            onChoisir={(profilId) => {
              const profil = profils?.find((pr) => pr.id === profilId)
              maj
                .mutateAsync({ id: piste.id, patch: { proprietaire_id: profilId } })
                .then(() => signaler(`✓ Propriétaire : ${profil ? `${profil.prenom} ${profil.nom}` : 'Aucun'}`))
                .catch((e) => signaler(e instanceof Error ? e.message : 'Enregistrement impossible'))
            }}
          />
        }
      />

      {/* ══ LES ONGLETS ══ */}
      <div className="grid flex-none grid-cols-1 border-b border-km-line bg-km-surface lg:grid-cols-fiche-activite">
        <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto px-4 pt-2.5 sm:px-6">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            type="button"
            onClick={() => setOnglet(o.cle)}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-km-body font-semibold transition-colors',
              onglet === o.cle
                ? 'border-km-green text-km-text'
                : 'border-transparent text-km-muted hover:text-km-text',
            )}
          >
            {o.libelle}
            {o.badge && (
              <span className="rounded-km-sm bg-km-soft px-1.5 py-px text-km-tiny font-bold tabular-nums text-km-muted">
                {o.badge}
              </span>
            )}
          </button>
        ))}
        </div>
        <div className="hidden items-center border-b-2 border-km-piste px-3 lg:flex">
          <span className="truncate text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
            Activité · piste
          </span>
        </div>
      </div>

      {/* DEUX COLONNES, LE GABARIT DE L'OPPORTUNITE.
          Naoelle, 01/09/2026 : « affiche-la dans le style de l'objet opportunite avec le flux
          d'actualite a droite ». Le flux mele l'historique des modifications et les taches dans
          l'ordre du temps : sur une piste, il raconte qui a verifie quoi et quand. */}
      {/* ══ LA RANGÉE DOIT ÊTRE CONTRAINTE, PAS SEULEMENT LES COLONNES ══
          William, 16/09/2026 : « l'écran est coupé en bas… ça ne devrait pas ». C'est exactement le
          défaut qu'il avait signalé sur la fiche compte le 15/09, corrigé là-bas et laissé ici :
          les deux volets avaient bien leur chaîne de `min-h-0` et leur `overflow-y-auto` au bon
          endroit, mais cette grille n'a qu'une rangée IMPLICITE, donc dimensionnée en `auto` —
          c'est-à-dire à la hauteur de son contenu le plus haut. Quand le volet dépasse la fenêtre,
          la rangée grandit avec lui, les colonnes s'étirent à cette hauteur-là, et plus personne
          n'a besoin de défiler : chaque boîte contient exactement son contenu. C'est
          l'`overflow-hidden` de la grille qui coupe, tout en bas, sans barre de défilement.

          `grid-rows-[minmax(0,1fr)]` FORCE LA RANGÉE À LA HAUTEUR DISPONIBLE et l'autorise à
          descendre sous la taille de son contenu — les deux comptent. Sans le `minmax(0, …)`, un
          `1fr` garde un minimum automatique égal au contenu, et le défaut reste entier.

          IL ÉTAIT LATENT : il ne se voyait que lorsque le volet dépassait la hauteur de l'écran.
          Les quatre zones du 16/09 l'ont rendu systématique — avant, l'onglet Piste tenait presque
          toujours dans la fenêtre. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden lg:grid-cols-fiche-activite">
        {/* LA PLACE DES PASTILLES EST RÉSERVÉE ICI, dans le volet qui défile, et non au-dessus de
            lui. C'est ce qui permet d'amener la dernière carte au-dessus du téléphone et de la
            cloche en défilant, au lieu de l'arrêter derrière eux. Le calcul est celui d'`AppLayout` :
            44 px de pastille plus son décalage, arrondi au cran supérieur. */}
        <div className="min-h-0 overflow-y-auto bg-km-bg p-4 pb-32 sm:p-5 sm:pb-32 md:pb-20">
        {onglet === 'piste' && (
          <div className="flex flex-col gap-3.5">
            {/* ══ LE CHEMIN, EN TÊTE DE VOLET COMME SUR LE MANDAT ══
                William, 16/09/2026 : « le chemin doit être dans le volet de gauche, pas dans le
                header ». Il est la première chose du volet, avant les coordonnées — c'est l'ordre du
                mandat, et l'ordre des questions qu'on se pose en ouvrant la fiche : où on en est,
                puis qui c'est. Voir CheminPiste.tsx. */}
            <CheminPiste
              piste={piste}
              peutModifier={canManage}
              enCours={maj.isPending}
              onChoisir={(code) => {
                const cible = statutsPistes?.find((st) => st.code === code)
                if (!cible) return
                maj
                  .mutateAsync({ id: piste.id, patch: { statut_id: cible.id, motif_disqualification: null } })
                  .then(() => signaler(`✓ ${cible.libelle}`))
                  .catch((e) => signaler(e instanceof Error ? e.message : 'Enregistrement impossible'))
              }}
            />

            {/* ══ LES CINQ VÉRIFICATIONS SONT PARTIES, ET LE VERROU AVEC ══

                William, 15/09/2026 : « supprime le bloc "Avant de lancer l'opportunité" ». Puis, mis
                devant la conséquence — c'était le SEUL endroit où cocher les cinq contrôles, et le
                bouton « Créer l'opportunité » restait grisé tant qu'ils n'étaient pas faits :
                « supprimer le verrou aussi ».

                CE QUI SURVIT : les cinq colonnes restent en base, et la liste Prospection continue
                de les lire pour dire ce qui manque sur une piste. Ce n'est plus une barrière, c'est
                une information. */}

            {/* ══ LES QUATRE ZONES ══
                William, 16/09/2026 : « les champs doivent être groupés dans 4 zones différentes ».
                Elles remplacent la carte « Coordonnées », le pavé Salesforce en lecture seule et le
                commentaire de bas de page. Voir ZonesPiste.tsx pour l'ordre, les deux teintes et le
                traitement des champs vides. */}
            <ZonesPiste
              piste={piste}
              canManage={canManage}
              signaler={signaler}
              ouvrirEmail={ouvrirEmail}
              maj={(patch) => maj.mutateAsync({ id: piste.id, patch })}
            />

            {/* ══ DEUX BLOCS SONT PARTIS LE 16/09/2026 ══
                William : « supprime les blocs "Tout ce que Salesforce sait" et "Tâches" ».

                LE PAVÉ SALESFORCE. Il portait région, pays, statut d'origine, cote, dates de
                reprise — trente lignes qu'on ne lit jamais en travaillant, sous quatre zones qui
                portent désormais tout ce qui sert. Les colonnes restent en base, et l'onglet
                Historique continue de dire qui a changé quoi.

                LES TÂCHES. Le volet de droite les montre déjà, dans le fil d'activité, mêlées aux
                échanges et dans l'ordre du temps — c'est là qu'on les lit. Les afficher aussi ici
                donnait deux listes de la même chose à deux mètres l'une de l'autre.

                LA CRÉATION N'EST PAS PERDUE POUR AUTANT, et elle n'a eu besoin de rien : le volet
                de droite porte déjà sa barre « Nouvelle tâche / Nouvelle note ». Je l'avais rajoutée
                dans le menu « ⋯ » du bandeau par prudence ; William, 16/09/2026 : « nouvelle tâche
                existe déjà dans le volet de droite, donc inutile de le remettre ». Le geste avait
                donc DEUX entrées, ce qui est précisément le défaut qu'on venait de corriger sur les
                tâches elles-mêmes. */}

            {/* L'HISTORIQUE DES MODIFICATIONS REPREND SA PLACE ICI. Il vivait dans le flux
                d'actualité du volet, remplacé le 07/09/2026 par le fil d'activité — lequel montre
                les échanges, pas les changements de champs. Les fiches Compte, Site, Contact,
                Opportunité et Requête le proposent déjà sous cette forme discrète ; la piste était
                la seule à ne l'avoir nulle part ailleurs. */}
            <HistoriqueDiscret tableNom="pistes" ligneId={piste.id} />
          </div>
        )}

        {/* ══ L'ONGLET « RATTACHEMENTS » A ÉTÉ SUPPRIMÉ LE 16/09/2026 ══
            William : « supprime l'onglet Rattachements (inutile) ». Il avait raison sur le fond :
            il portait trois lignes, et sur l'immense majorité des pistes les trois disaient
            « pas encore » — une piste naît sans compte, sans contact et sans opportunité.

            LE SEUL LIEN QUI COMPTAIT A REJOINT LE BANDEAU. Sur une piste convertie, « ouvrir
            l'opportunité » est le geste qu'on vient faire ; il prend maintenant la place exacte du
            bouton « Convertir », qui n'a plus lieu d'être à ce moment-là. Le compte et le contact,
            eux, se retrouvent depuis l'opportunité. */}

        {onglet === 'fichiers' && (
          <div className="max-w-[900px]">
            <OngletFichiers
              documents={documentsDeLaPiste}
              typesDocuments={typesDocumentsRef ?? []}
              onOuvrir={(d) => navigate(`/documents/${d.id}`)}
              onDeposer={async (fichiers, typeId) => {
                await televerser.mutateAsync({
                  fichiers,
                  entite_type: 'piste',
                  entite_id: piste.id,
                  type_document_id: typeId,
                  type_document_libelle:
                    (typesDocumentsRef ?? []).find((t) => t.id === typeId)?.libelle ?? '',
                })
                signaler('✓ Fichier déposé')
              }}
              nomEntite={piste.societe || piste.contact_nom || 'cette piste'}
            />
          </div>
        )}
        </div>

        {/* ══ LE VOLET D'ACTIVITÉ, AU MODÈLE DE LA FICHE RECOMMANDATION ══
            William, 07/09/2026 : « les fiches Opportunité, Piste, Requête et Suivi de contrat
            doivent avoir exactement les mêmes fonctionnalités et la même logique ».

            `FluxActualite` montrait l'historique des modifications de la piste ; `ActivityFeed`
            montre ses ÉCHANGES, ses tâches et ses documents — et les 8 942 interactions rattachées
            aux pistes, qui n'apparaissaient nulle part. L'historique des modifications n'est pas
            perdu : il reprend sa place sous l'onglet Piste, par le contrôle discret. */}
        <div className="hidden min-h-0 flex-col border-l border-km-line bg-km-bg lg:flex">
          <div className="min-h-0 flex-1 overflow-hidden px-3 pb-3 pt-4 sm:pt-5">
            <ActivityFeed
              compteId={piste.compte_id ?? ''}
              compteNom={piste.societe ?? ''}
              interactions={interactions ?? []}
              actions={actions ?? []}
              documents={documentsDeLaPiste}
              pisteId={piste.id}
              rattachementTache={
                canManage
                  ? {
                      piste_id: piste.id,
                      contact_nom: piste.contact_nom ?? '',
                      compte_id: piste.compte_id ?? null,
                      objet_nom: (piste.societe || piste.contact_nom || '').trim(),
                    }
                  : undefined
              }
            />
          </div>
        </div>
      </div>


      {/* ══ LE MOTIF DE DISQUALIFICATION ══
          Une seule zone de texte et deux boutons : le motif est obligatoire pour valider, parce que
          « disqualifiée » sans raison ne se relit pas. La colonne existe depuis l'import des leads
          (`motif_disqualification`, 01/09) et portait déjà les motifs venus de Salesforce. */}
      {disqualification !== null && (
        <Dialog
          open
          onClose={() => setDisqualification(null)}
          title="Disqualifier cette piste"
          description="Pourquoi l’écarter ? C’est ce qu’on relira si son nom revient dans une prochaine liste."
        >
          <Textarea
            value={disqualification}
            onChange={(e) => setDisqualification(e.target.value)}
            rows={3}
            placeholder="Ne gère pas l’énergie · déjà chez un courtier · injoignable après cinq appels…"
            autoFocus
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDisqualification(null)}>Annuler</Button>
            <Button
              disabled={!disqualification.trim()}
              onClick={() => {
                const cible = statutsPistes?.find((st) => st.code === 'DISQUALIFIEE')
                if (!cible) return
                maj
                  .mutateAsync({
                    id: piste.id,
                    patch: { statut_id: cible.id, motif_disqualification: disqualification.trim() },
                  })
                  .then(() => { setDisqualification(null); signaler('✓ Piste disqualifiée') })
                  .catch((e) => signaler(e instanceof Error ? e.message : 'Enregistrement impossible'))
              }}
            >
              Disqualifier
            </Button>
          </div>
        </Dialog>
      )}

      {/* ══ L'HISTORIQUE, EN FENÊTRE ══ Même choix que la fiche compte : on ne vient pas « voir
          l'historique », on s'y rend quand on se demande qui a changé une valeur. La réponse doit
          arriver par-dessus, sans quitter l'onglet où l'on travaille. */}
      <Dialog
        open={historiqueOuvert}
        onClose={() => setHistoriqueOuvert(false)}
        title="Historique des modifications"
        description={piste.societe ?? undefined}
        className="max-w-4xl"
      >
        <div className="max-h-[70vh] overflow-y-auto">
          <OngletHistorique entrees={historique} />
        </div>
      </Dialog>

      {/* ══ LA SUPPRESSION ══ Une confirmation sobre plutôt que l'inventaire des fiches compte : une
          piste n'emporte rien avec elle — ni compteurs, ni contrats, ni historique d'échanges. Ce
          qu'il faut dire, c'est que le geste est sans retour. */}
      <Dialog
        open={suppressionOuverte}
        onClose={() => setSuppressionOuverte(false)}
        title="Supprimer cette piste ?"
        description={nomComplet({ civilite: piste.civilite, prenom: piste.prenom, nom: piste.nom }) || piste.contact_nom || undefined}
      >
        <div className="space-y-3">
          <p className="text-km-body leading-snug text-km-text">
            La piste et ses informations de contact seront effacées. Les tâches et les échanges qui
            la citent restent, mais ne mèneront plus nulle part.
          </p>
          <p className="text-km-label text-km-muted">Cette action est sans retour.</p>
          <div className="flex justify-end gap-2 border-t border-km-line pt-3">
            <Button variant="ghost" onClick={() => setSuppressionOuverte(false)} disabled={supprimerPiste.isPending}>
              Annuler
            </Button>
            <Button
              disabled={supprimerPiste.isPending}
              onClick={() => {
                supprimerPiste
                  .mutateAsync({ id: piste.id, opportuniteId: piste.opportunite_id ?? null })
                  .then(() => navigate('/prospection'))
                  .catch((e) => {
                    setSuppressionOuverte(false)
                    signaler(e instanceof Error ? e.message : 'Suppression impossible')
                  })
              }}
            >
              {supprimerPiste.isPending ? 'Suppression…' : 'Supprimer'}
            </Button>
          </div>
        </div>
      </Dialog>

      {conversionOuverte && (
        <DialogConversionPiste
          piste={piste}
          onFermer={() => setConversionOuverte(false)}
          onValide={async (signal, contactId, compteId) => {
            try {
              const nouvelleId = await convertir.mutateAsync({
                piste,
                statutNouvelleId: statuts?.find((s) => s.code === 'NOUVELLE')?.id ?? null,
                signal,
                contactId,
                compteId,
              })
              setConversionOuverte(false)
              navigate(`/opportunites/${nouvelleId}`)
            } catch (e) {
              signaler(e instanceof Error ? e.message : 'Conversion impossible')
            }
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-km bg-ink-800 px-3.5 py-2 text-km-body text-white shadow-km-pop">
          {toast}
        </div>
      )}
    </div>
  )
}

/** Une ligne de l'onglet Rattachements, avec navigation directe vers l'objet. */
