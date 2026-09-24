import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Loader2, Mail, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ChoixParRecherche } from '@/components/ui/choix-recherche'
import { useComptes } from '@/lib/data/comptes'
import { useContacts } from '@/lib/data/contacts'
import { useCompteurs } from '@/lib/data/compteurs'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_TYPES_COURTIERS_MANDAT } from '@/lib/referenceFallbacks'
import { useEnvoiMandat } from '@/lib/data/envoiMandat'
import { connectDocusign } from '@/lib/data/docusign'
import { champBase } from '@/lib/champBase'
import { cn } from '@/lib/utils'
import type { Contact } from '@/types/domain'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE MANDAT EN UNE PAGE — la dernière étape du parcours de conversion
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 24/09/2026 : « au sein du process de conversion de piste, l'envoi de mandat doit être
 * largement facilité. Tout doit tenir sur une page. »
 *
 *   Zone 1 · le responsable, celui-là même qui a été posé sur les compteurs
 *   Zone 2 · les compteurs du périmètre qu'on vient de créer, et eux seuls, présélectionnés
 *   Zone 3 · la durée (36 mois par défaut, ou personnalisée) et le choix du mandat
 *
 * ══ POURQUOI CET ÉCRAN N'EST PAS `MandatWizard` ══
 *
 * L'assistant DEMANDE : quel contact parmi ceux du compte, quels compteurs parmi tous ceux du
 * patrimoine, en quatre étapes. Ici, rien de tout cela n'est à demander — le parcours vient de
 * créer le contact et les compteurs. Il ne reste qu'à CONFIRMER. Faire répondre quatre écrans à des
 * questions dont on connaît déjà les réponses, ce n'est pas de la prudence, c'est du remplissage.
 *
 * CE QUI NE SE DUPLIQUE PAS POUR AUTANT : la chaîne création → PDF → DocuSign vit dans
 * `useEnvoiMandat`, partagée avec l'assistant. L'écran diffère, la mécanique est la même — sans
 * quoi les deux chemins divergeraient sur le brouillon DocuSign ou sur l'ordre des écritures, et
 * c'est le mandat du client qui paierait l'écart.
 *
 * ══ LE RESPONSABLE RESTE CHANGEABLE ══
 *
 * Règle posée le 18/09/2026 : un rattachement affiché doit pouvoir être changé depuis l'écran où il
 * s'affiche. Il est repris des compteurs, pas imposé par eux — une copropriété peut faire signer
 * son président là où le gestionnaire suit le dossier.
 */

const DUREES = [12, 24, 36, 48] as const
const DUREE_DEFAUT = 36

export function MandatEnUnePage({ compteId, contactId, compteurIds, onCree }: {
  compteId: string
  /** Le responsable posé sur les compteurs créés — zone 1. */
  contactId: string | null
  /** Les compteurs de CE parcours, et eux seuls — zone 2. */
  compteurIds: string[]
  onCree?: (mandatId: string) => void
}) {
  const { data: comptes } = useComptes()
  const { data: contacts } = useContacts()
  const { data: compteurs } = useCompteurs()
  const { data: courtiersRef } = useReferenceTable('types_courtiers_mandat')
  const courtiers = courtiersRef && courtiersRef.length > 0 ? courtiersRef : FALLBACK_TYPES_COURTIERS_MANDAT

  const compte = comptes?.find((c) => c.id === compteId)
  const [signataireId, setSignataireId] = useState(contactId ?? '')
  const [changerSignataire, setChangerSignataire] = useState(false)
  const [retenus, setRetenus] = useState<string[]>(compteurIds)
  const [dureeMois, setDureeMois] = useState<number>(DUREE_DEFAUT)
  const [dureeLibre, setDureeLibre] = useState(false)
  const [avecEnergix, setAvecEnergix] = useState(true)

  const signataire = contacts?.find((c) => c.id === signataireId) ?? null
  /* LA LISTE NE MONTRE QUE LES COMPTEURS DE CE PARCOURS. « Uniquement ces compteurs
     présélectionnés » : le patrimoine du compte peut en contenir cent, ils ne regardent pas ce
     mandat-ci. */
  const duPerimetre = useMemo(
    () => (compteurs ?? []).filter((c) => compteurIds.includes(c.id)),
    [compteurs, compteurIds],
  )
  const contactsDuCompte = useMemo(
    () => contacts?.filter((c) => c.comptes.some((l) => l.id === compteId)) ?? [],
    [contacts, compteId],
  )

  const { envoyer, etat } = useEnvoiMandat(onCree)

  const pret = Boolean(compte && signataire && retenus.length > 0 && dureeMois > 0)

  return (
    <div className="flex flex-1 flex-col gap-[14px]">

      {/* ══ ZONE 1 · QUI SIGNE ══ */}
      <div
        {...champBase('mandats.contact_signataire_id')}
        className="flex flex-col gap-[9px] rounded-[12px] border border-km-line bg-km-bg/40 p-[13px]"
      >
        <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-km-faint">Signataire</span>
        {changerSignataire ? (
          <ChoixParRecherche<Contact>
            items={contactsDuCompte}
            valeur={signataireId}
            onChoisir={(c) => { setSignataireId(c?.id ?? ''); setChangerSignataire(false) }}
            placeholder="Chercher un contact du compte…"
            principal={(c) => `${c.prenom} ${c.nom}`}
            secondaire={(c) => c.fonction || c.email || null}
            filtre={(c, q) => [c.prenom, c.nom, c.email].some((v) => (v ?? '').toLowerCase().includes(q))}
            aucun="Aucun contact sur ce compte."
            totalLibelle={`${contactsDuCompte.length} contacts`}
          />
        ) : signataire ? (
          <div className="flex items-center gap-[11px]">
            <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-km-green text-[12px] font-bold text-white">
              {`${signataire.prenom?.[0] ?? ''}${signataire.nom?.[0] ?? ''}`.toUpperCase()}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
              <span className="truncate text-[13.5px] font-semibold text-km-text">
                {signataire.prenom} {signataire.nom}
              </span>
              <span className="flex items-center gap-1.5 truncate text-[11.5px] text-km-muted">
                {signataire.email
                  ? <><Mail className="h-[11px] w-[11px] shrink-0" />{signataire.email}</>
                  : <span className="font-semibold text-km-red">Sans courriel — la signature ne partira pas</span>}
              </span>
              <span className="text-[10.5px] text-km-faint">Repris des compteurs que vous venez de créer</span>
            </div>
            <button
              type="button"
              onClick={() => setChangerSignataire(true)}
              className="shrink-0 rounded-[8px] border border-km-line bg-white px-[11px] py-[6px] text-[11.5px] font-semibold text-km-green hover:bg-km-bg"
            >
              Changer
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setChangerSignataire(true)}
            className="self-start text-[12.5px] font-semibold text-km-green hover:underline"
          >
            Choisir le signataire
          </button>
        )}
      </div>

      {/* ══ ZONE 2 · LE PÉRIMÈTRE DE CE PARCOURS ══ */}
      <div className="flex min-h-0 flex-col gap-[9px] rounded-[12px] border border-km-line bg-km-bg/40 p-[13px]">
        <div className="flex items-baseline gap-2">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-km-faint">
            Périmètre couvert
          </span>
          <span className="text-[11px] text-km-muted">
            {retenus.length} sur {duPerimetre.length}
          </span>
        </div>
        {/* Au-delà de quatre compteurs, c'est CETTE liste qui défile — pas la page. */}
        <div className="flex max-h-[152px] flex-col gap-[5px] overflow-y-auto">
          {duPerimetre.map((c) => {
            const coche = retenus.includes(c.id)
            return (
              <label
                key={c.id}
                className={cn(
                  'flex cursor-pointer items-center gap-[10px] rounded-[9px] border px-[11px] py-[8px] transition-colors',
                  coche ? 'border-km-green-line bg-km-green-tint' : 'border-km-line bg-white',
                )}
              >
                <input
                  type="checkbox"
                  checked={coche}
                  onChange={() => setRetenus((p) => (coche ? p.filter((x) => x !== c.id) : [...p, c.id]))}
                  className="h-[15px] w-[15px] shrink-0 accent-km-green"
                />
                <Zap className="h-[13px] w-[13px] shrink-0 text-km-muted" />
                <span className="font-mono text-[12.5px] text-km-text">{c.numero_pdl}</span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-km-muted">{c.site_nom}</span>
              </label>
            )
          })}
          {duPerimetre.length === 0 && (
            <p className="py-3 text-center text-[12px] text-km-faint">Aucun compteur à couvrir.</p>
          )}
        </div>
      </div>

      {/* ══ ZONE 3 · DURÉE ET MANDATS ══ */}
      <div className="grid grid-cols-2 gap-[13px]">
        <div className="flex flex-col gap-[9px] rounded-[12px] border border-km-line bg-km-bg/40 p-[13px]">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-km-faint">Durée</span>
          <div className="flex gap-[2px] rounded-[9px] border border-km-line bg-km-soft p-[3px]">
            {DUREES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => { setDureeLibre(false); setDureeMois(d) }}
                className={cn(
                  'flex-1 rounded-[6px] py-[6px] text-[12px] tabular-nums transition-colors',
                  !dureeLibre && dureeMois === d
                    ? 'bg-km-green font-bold text-white'
                    : 'font-medium text-km-muted hover:bg-white hover:text-km-text',
                )}
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDureeLibre(true)}
              className={cn(
                'flex-1 rounded-[6px] py-[6px] text-[12px] transition-colors',
                dureeLibre
                  ? 'bg-km-green font-bold text-white'
                  : 'font-medium text-km-muted hover:bg-white hover:text-km-text',
              )}
            >
              Autre
            </button>
          </div>
          {dureeLibre ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                autoFocus
                value={dureeMois || ''}
                onChange={(e) => setDureeMois(Number(e.target.value))}
                className="w-[90px] rounded-[9px] border border-km-line bg-white px-[11px] py-[7px] font-mono text-[13px] text-km-text outline-none focus:border-km-green"
              />
              <span className="text-[11.5px] text-km-muted">mois</span>
            </div>
          ) : (
            <span className="text-[11px] text-km-faint">En mois. Trois ans par défaut.</span>
          )}
        </div>

        <div className="flex flex-col gap-[9px] rounded-[12px] border border-km-line bg-km-bg/40 p-[13px]">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-km-faint">Mandats</span>
          <div className="flex items-center gap-[10px] rounded-[9px] border border-km-line bg-white px-[11px] py-[7px]">
            <Check className="h-[13px] w-[13px] shrink-0 text-km-green" />
            <span className="flex-1 text-[12.5px] font-semibold text-km-text">KiWee Énergie</span>
            <span className="text-[10.5px] text-km-faint">toujours</span>
          </div>
          <label className={cn(
            'flex cursor-pointer items-center gap-[10px] rounded-[9px] border px-[11px] py-[7px]',
            avecEnergix ? 'border-km-green-line bg-km-green-tint' : 'border-km-line bg-white',
          )}>
            <input
              type="checkbox"
              checked={avecEnergix}
              onChange={(e) => setAvecEnergix(e.target.checked)}
              className="h-[15px] w-[15px] shrink-0 accent-km-green"
            />
            <span className="flex-1 text-[12.5px] font-semibold text-km-text">Energix</span>
            <span className="text-[10.5px] text-km-faint">en option</span>
          </label>
        </div>
      </div>

      {etat.erreur && (
        <div className="flex items-start gap-2 rounded-[10px] border border-km-red-line bg-km-red-soft px-[13px] py-[9px]">
          <AlertTriangle className="mt-0.5 h-[14px] w-[14px] shrink-0 text-km-red" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[12px] text-red-700">{etat.erreur}</span>
            {etat.besoinConnexionDocusign && (
              <button
                type="button"
                onClick={() => void connectDocusign()}
                className="self-start rounded-[8px] bg-km-green px-[11px] py-[5px] text-[11.5px] font-semibold text-white"
              >
                Autoriser DocuSign
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-auto flex items-center gap-3 border-t border-km-line-soft pt-3">
        <span className="text-[11.5px] leading-tight text-km-faint">
          DocuSign s’ouvre en brouillon.<br />C’est vous qui cliquez « Envoyer ».
        </span>
        <span className="flex-1" />
        <Button
          type="button"
          disabled={!pret || etat.enCours}
          onClick={() => {
            if (!compte || !signataire) return
            void envoyer({
              compte,
              signataire,
              compteurs: duPerimetre.filter((c) => retenus.includes(c.id)),
              dureeMois,
              avecEnergix,
              courtierTypeIds: courtiers
                .filter((c) => (avecEnergix ? ['KIWI', 'ENERGIX'] : ['KIWI']).includes(c.code))
                .map((c) => c.id),
            })
          }}
        >
          {etat.enCours
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {etat.etape ?? 'Préparation…'}</>
            : 'Préparer le mandat'}
        </Button>
      </div>
    </div>
  )
}
