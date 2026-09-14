/**
 * ══ TOUT CE QUE SALESFORCE SAIT DE LA PISTE, ENFIN VISIBLE ══
 *
 * William, 14/09/2026, par téléphone : « il y a plein de champs de l'objet Lead dans Salesforce qui
 * n'ont pas été importés — segment, SIREN, commentaire, échéance actuelle, et tous les autres. »
 *
 * LA MOITIÉ DE SA REMARQUE ÉTAIT UN DÉFAUT D'AFFICHAGE, pas de reprise. Segment (5 073 pistes sur
 * 5 139), SIREN (4 909), SIRET (4 921), commentaire (210), source (4 954), activité (854) sont en
 * base depuis le 01/09 avec exactement les valeurs de l'org. La fiche piste, elle, n'affichait que
 * quatre champs : société, contact, e-mail, téléphone. C'est le même défaut que le propriétaire,
 * corrigé le même jour pour la même raison — on ne voit pas ce qu'on a.
 *
 * L'autre moitié était vraie : 26 champs n'avaient aucune colonne. Ils en ont une depuis la
 * migration 20260914170000, et ils sont ici.
 *
 * ══ POURQUOI DES GROUPES, ET PAS UNE LISTE DE VINGT-SIX LIGNES ══
 *
 * « On fera le tri dans Kimatch », a-t-il dit. Le tri commence par ne pas mettre le SIRET, la date
 * du premier appel et le lien LinkedIn dans la même colonne : on lit une fiche pour répondre à une
 * question — qui est-ce, où, que gère-t-il, qu'a-t-on déjà fait — et chaque groupe répond à une.
 *
 * ══ CE QUI EST VIDE NE S'AFFICHE PAS ══
 *
 * Sur 5 139 pistes, la région est renseignée 11 fois, le secteur 3 fois, la cote 25 fois. Afficher
 * « Région : — » sur les 5 128 autres remplirait la fiche de tirets et noierait les six champs qui
 * portent quelque chose. Un groupe entièrement vide disparaît avec son titre.
 */
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import type { Piste } from '@/types/domain'

/** Une valeur affichable, ou rien du tout — c'est ce `null` qui fait disparaître la ligne. */
function texte(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined) return null
  const t = String(v).trim()
  return t === '' ? null : t
}

function date(v: string | null | undefined): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('fr-FR')
}

/** Un lien s'ouvre ; une adresse sans protocole n'ouvrirait rien, on le complète. */
function lien(v: string | null | undefined): ReactNode | null {
  const t = texte(v)
  if (!t) return null
  const href = /^https?:\/\//i.test(t) ? t : `https://${t}`
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-km-green underline-offset-2 hover:underline">
      {t.replace(/^https?:\/\//i, '')}
    </a>
  )
}

interface Ligne { libelle: string; valeur: ReactNode | null }
interface Groupe { titre: string; lignes: Ligne[] }

function groupesDe(piste: Piste): Groupe[] {
  return [
    {
      titre: 'Identité',
      lignes: [
        { libelle: 'Civilité', valeur: texte(piste.civilite) },
        { libelle: 'Prénom', valeur: texte(piste.prenom) },
        { libelle: 'Nom', valeur: texte(piste.nom) },
        { libelle: 'Fonction', valeur: texte(piste.fonction) },
        { libelle: 'Rôle', valeur: texte(piste.role_contact) },
      ],
    },
    {
      titre: 'Société',
      lignes: [
        { libelle: 'Segment', valeur: texte(piste.segment) },
        { libelle: 'Activité', valeur: texte(piste.activite) },
        { libelle: "Secteur d'activité", valeur: texte(piste.secteur_activite) },
        { libelle: 'SIREN', valeur: texte(piste.siren) },
        { libelle: 'SIRET', valeur: texte(piste.siret) },
        { libelle: 'Site internet', valeur: lien(piste.site_internet) },
        { libelle: 'Site web', valeur: lien(piste.site_web) },
        { libelle: 'LinkedIn', valeur: lien(piste.linkedin) },
      ],
    },
    {
      titre: 'Adresse',
      lignes: [
        { libelle: 'Rue', valeur: texte(piste.rue) },
        { libelle: 'Code postal', valeur: texte(piste.code_postal) },
        { libelle: 'Ville', valeur: texte(piste.ville) },
        { libelle: 'Région', valeur: texte(piste.region) },
        { libelle: 'Pays', valeur: texte(piste.pays) },
      ],
    },
    {
      titre: 'Ce qu’il gère',
      lignes: [
        { libelle: 'Nombre de lots', valeur: texte(piste.nombre_de_lots) },
        { libelle: 'Nombre de copropriétés', valeur: texte(piste.nombre_coproprietes) },
        { libelle: 'Liste des copropriétés', valeur: texte(piste.liste_coproprietes) },
        { libelle: 'Échéance actuelle', valeur: date(piste.echeance_actuelle) },
      ],
    },
    {
      titre: 'Historique Salesforce',
      lignes: [
        { libelle: 'Origine', valeur: texte(piste.source) },
        { libelle: 'Statut Salesforce', valeur: texte(piste.statut_salesforce) },
        { libelle: 'Cote', valeur: texte(piste.cote) },
        /* Le bloc « Informations système » de Salesforce, rendu tel quel : qui a créé, qui a
           modifié en dernier, et quand. « Modifiée par » vient d'une colonne à part —
           `modifie_par_id` répond à la même question pour Kimatch et l'audit la repose.

           LA LIGNE « CRÉÉE DANS SALESFORCE LE » A DISPARU, et c'est un progrès. Elle existait
           parce que `date_creation` portait le 01/09/2026 sur les 5 131 pistes reprises — la date
           de l'import — et qu'il fallait bien montrer la vraie quelque part. Depuis la bascule du
           14/09 (migration 20260914240000), `date_creation` EST la vraie : 454 pistes en 2025,
           4 685 en 2026. Afficher les deux montrerait deux fois le même jour en laissant croire
           qu'ils peuvent différer. `date_creation_salesforce` reste en base — elle dit d'où vient
           la valeur et permet de revenir en arrière — mais elle n'a plus rien à dire à l'écran. */
        { libelle: 'Créée par', valeur: texte(piste.createur_nom) },
        { libelle: 'Modifiée dans Salesforce le', valeur: date(piste.date_modification_salesforce) },
        { libelle: 'Modifiée par', valeur: texte(piste.modifie_par_salesforce_nom) },
        { libelle: 'Dernière activité', valeur: date(piste.date_derniere_activite) },
        { libelle: 'Premier appel', valeur: date(piste.date_premier_appel) },
        { libelle: 'Premier e-mail', valeur: date(piste.date_premier_email) },
        { libelle: 'Téléphone mobile', valeur: texte(piste.telephone_mobile) },
        /* Un mail rejeté explique pourquoi une relance reste sans réponse : c'est une information
           qui change la conduite à tenir, pas une curiosité technique. */
        { libelle: 'E-mail rejeté le', valeur: date(piste.email_rejete_le) },
        { libelle: 'Motif du rejet', valeur: texte(piste.email_rejete_motif) },
      ],
    },
  ]
}

export function DetailsPiste({ piste }: { piste: Piste }) {
  const groupes = groupesDe(piste)
    .map((g) => ({ ...g, lignes: g.lignes.filter((l) => l.valeur !== null) }))
    .filter((g) => g.lignes.length > 0)

  if (groupes.length === 0) return null

  return (
    <Card className="p-4">
      <p className="mb-3 text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
        Détails
      </p>
      <div className="flex flex-col gap-4">
        {groupes.map((g) => (
          <div key={g.titre}>
            <p className="mb-1.5 text-km-xs font-semibold uppercase tracking-[0.06em] text-km-muted">
              {g.titre}
            </p>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {g.lignes.map((l) => (
                <div key={l.libelle} className="flex items-baseline justify-between gap-3 border-b border-km-line/60 pb-1">
                  <dt className="shrink-0 text-km-xs text-km-faint">{l.libelle}</dt>
                  {/* `break-words` : la liste des copropriétés fait parfois plusieurs centaines de
                      caractères, et sans lui elle pousserait la colonne hors de la carte. */}
                  <dd className="min-w-0 break-words text-right text-km-label font-medium text-km-text">
                    {l.valeur}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </Card>
  )
}
