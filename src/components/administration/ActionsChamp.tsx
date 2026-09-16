import { useEffect, useState } from 'react'
import { AlertTriangle, FileText, Pencil, Plus, Trash2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  TYPES_CHAMP, useAjouterChamp, useDocumenterChamp, useRenommerChamp, useSupprimerChamp,
  usageDansLeCode, type UsageCode,
} from '@/lib/data/schemaActions'
import type { ChampCatalogue, TableCatalogue } from '@/lib/data/catalogue'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES QUATRE GESTES DU GESTIONNAIRE D'OBJETS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 16/09/2026 : « un gestionnaire avec de la sécurité […] des garde-fous, des
 * avertissements ». Les refus vivent dans la base — elle seule peut les rendre incontournables. Ce
 * fichier porte ce que la base ne peut pas faire : PRÉVENIR AVANT.
 *
 * ── LE GRADIENT DE FROTTEMENT ──
 *
 * Les quatre gestes n'ont pas le même poids, et l'écran le montre plutôt que de le dire :
 *
 *   DOCUMENTER   un bouton, un champ de texte. Un commentaire ne s'exécute pas.
 *   AJOUTER      un formulaire. Additif : rien d'existant n'est touché.
 *   RENOMMER     un avertissement d'usage dans le code, puis une confirmation.
 *   SUPPRIMER    le nom de la colonne à retaper à la main, et le compte des valeurs qui partent.
 *
 * Retaper un nom n'est pas une vexation : c'est le seul moyen connu d'empêcher le clic machinal sur
 * « confirmer ». Un dialogue qu'on valide sans lire ne protège de rien.
 */

/** L'avertissement que la base ne peut pas donner : ce nom est-il écrit dans le code de Kimatch ? */
function AvertissementCode({ mot }: { mot: string }) {
  const [usage, setUsage] = useState<UsageCode | null | undefined>(undefined)

  useEffect(() => {
    let vivant = true
    void usageDansLeCode(mot).then((u) => { if (vivant) setUsage(u) })
    return () => { vivant = false }
  }, [mot])

  if (usage === undefined) return null
  if (usage === null) {
    return (
      <p className="rounded-km border border-km-line bg-km-soft px-2 py-1.5 text-km-label leading-snug text-km-muted">
        Ce nom n’apparaît nulle part dans le code de Kimatch. Le renommer ne devrait casser aucun
        écran — mais le relevé ne voit pas les requêtes écrites à la main ni les scripts.
      </p>
    )
  }
  return (
    <p className="flex items-start gap-1.5 rounded-km border border-km-amber-line bg-km-amber-soft px-2 py-1.5 text-km-label leading-snug text-km-text">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-km-amber" />
      <span>
        <strong>Ce nom apparaît {usage.n} fois dans le code</strong>
        {usage.f.length > 0 && <> — {usage.f.join(', ')}{usage.f.length >= 5 ? '…' : ''}</>}. Le
        renommer cassera les écrans qui s’en servent, et la base acceptera sans rien dire.
      </span>
    </p>
  )
}

function Erreur({ e }: { e: unknown }) {
  if (!e) return null
  return (
    <p className="mt-2 rounded-km border border-km-red-line bg-km-red-soft px-2 py-1.5 text-km-label leading-snug text-km-red">
      {e instanceof Error ? e.message : 'Opération refusée.'}
    </p>
  )
}

const champStyle =
  'w-full rounded-km border border-km-line bg-white px-2 py-1.5 text-km-body text-km-text placeholder:text-km-faint focus:border-km-green focus:outline-none'

// ── AJOUTER ────────────────────────────────────────────────────────────────────────────────────

export function DialogAjouterChamp({ table, onClose }: { table: TableCatalogue; onClose: () => void }) {
  const [nom, setNom] = useState('')
  const [type, setType] = useState<string>('text')
  const [defaut, setDefaut] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const ajouter = useAjouterChamp()

  const nomValide = /^[a-z][a-z0-9_]{0,58}$/.test(nom)

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Ajouter un champ à ${table.nom}`}
      description="Le champ est créé facultatif. Il apparaîtra immédiatement dans le catalogue."
    >
      <div className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-km-label font-semibold text-km-text">Nom technique</label>
          <input
            autoFocus
            value={nom}
            onChange={(e) => setNom(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
            placeholder="ex. : niveau_de_priorite"
            className={`${champStyle} font-mono`}
          />
          {/* LA RÈGLE EST DITE AVANT LE REFUS, pas après : corriger un nom rejeté coûte un
              aller-retour que cette ligne évite. */}
          <p className="mt-1 text-km-tiny text-km-faint">
            Minuscules, chiffres et tirets bas, en commençant par une lettre. Ce nom sera visible
            dans la base et dans le code : il ne se change pas à la légère ensuite.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-km-label font-semibold text-km-text">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className={champStyle}>
            {TYPES_CHAMP.map((t) => (
              <option key={t.valeur} value={t.valeur}>{t.libelle} — {t.exemple}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-km-label font-semibold text-km-text">
            Valeur par défaut <span className="font-normal text-km-faint">(facultatif)</span>
          </label>
          <input value={defaut} onChange={(e) => setDefaut(e.target.value)} className={`${champStyle} font-mono`} />
        </div>

        <div>
          <label className="mb-1 block text-km-label font-semibold text-km-text">
            À quoi sert ce champ ? <span className="font-normal text-km-faint">(fortement conseillé)</span>
          </label>
          <textarea
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            rows={2}
            placeholder="Dans six mois, personne ne se souviendra de pourquoi ce champ existe."
            className={champStyle}
          />
        </div>

        <p className="rounded-km border border-km-line bg-km-soft px-2 py-1.5 text-km-label leading-snug text-km-muted">
          Le champ est créé <strong>facultatif</strong>, toujours. Le rendre obligatoire sur une
          table qui contient déjà {table.lignes_estimees.toLocaleString('fr-FR')} lignes forcerait
          une valeur inventée dans chacune — ça se décide plus tard, avec les données sous les yeux.
        </p>

        <Erreur e={ajouter.error} />

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button
            variant="primary"
            disabled={!nomValide || ajouter.isPending}
            onClick={() =>
              ajouter.mutate(
                {
                  p_table: table.nom, p_colonne: nom, p_type: type,
                  p_defaut: defaut.trim() || null, p_commentaire: commentaire.trim() || null,
                },
                { onSuccess: onClose },
              )
            }
          >
            {ajouter.isPending ? 'Création…' : 'Créer le champ'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

// ── DOCUMENTER / RENOMMER / SUPPRIMER ──────────────────────────────────────────────────────────

export function ActionsChamp({ table, champ }: { table: TableCatalogue; champ: ChampCatalogue }) {
  const [geste, setGeste] = useState<'documenter' | 'renommer' | 'supprimer' | null>(null)
  const [texte, setTexte] = useState('')
  const [confirmation, setConfirmation] = useState('')

  const documenter = useDocumenterChamp()
  const renommer = useRenommerChamp()
  const supprimer = useSupprimerChamp()

  const fermer = () => { setGeste(null); setTexte(''); setConfirmation('') }

  /* CE QUE LA BASE REFUSERA DE TOUTE FAÇON, on le grise ici — mais on l'explique, sinon un bouton
     inerte se lit comme une panne. */
  const verrou = champ.cle_primaire
    ? 'clé primaire'
    : champ.unique
      ? 'contrainte d’unicité'
      : champ.reference
        ? 'lien vers une autre table'
        : null

  return (
    <div className="mt-3 border-t border-km-line pt-3">
      <p className="mb-1.5 text-km-tiny font-bold uppercase tracking-[0.06em] text-km-faint">Gérer ce champ</p>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => { setTexte(champ.commentaire ?? ''); setGeste('documenter') }}
          className="inline-flex items-center gap-1 rounded-km border border-km-line px-2 py-1 text-km-label font-semibold text-km-text transition-colors hover:border-km-green hover:bg-km-green-soft"
        >
          <FileText className="h-3 w-3" />Documenter
        </button>
        <button
          type="button"
          disabled={Boolean(verrou)}
          title={verrou ? `Verrouillé : ${verrou}` : undefined}
          onClick={() => { setTexte(champ.nom); setGeste('renommer') }}
          className="inline-flex items-center gap-1 rounded-km border border-km-line px-2 py-1 text-km-label font-semibold text-km-text transition-colors hover:border-km-green hover:bg-km-green-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Pencil className="h-3 w-3" />Renommer
        </button>
        <button
          type="button"
          disabled={Boolean(verrou)}
          title={verrou ? `Verrouillé : ${verrou}` : undefined}
          onClick={() => setGeste('supprimer')}
          className="inline-flex items-center gap-1 rounded-km border border-km-line px-2 py-1 text-km-label font-semibold text-km-red transition-colors hover:border-km-red-line hover:bg-km-red-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="h-3 w-3" />Supprimer
        </button>
      </div>

      {verrou && (
        <p className="mt-1.5 text-km-tiny leading-snug text-km-faint">
          Renommage et suppression verrouillés : ce champ porte une {verrou}. D’autres lignes — et
          peut-être d’autres tables — s’appuient dessus.
        </p>
      )}

      {geste === 'documenter' && (
        <Dialog open onClose={fermer} title={`Documenter ${table.nom}.${champ.nom}`}
          description="Le commentaire est stocké dans la base elle-même. Il n’exécute rien et ne casse rien.">
          <textarea autoFocus value={texte} onChange={(e) => setTexte(e.target.value)} rows={4} className={champStyle} />
          <Erreur e={documenter.error} />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={fermer}>Annuler</Button>
            <Button
              disabled={documenter.isPending}
              onClick={() => documenter.mutate(
                { p_table: table.nom, p_colonne: champ.nom, p_commentaire: texte },
                { onSuccess: fermer },
              )}
            >
              Enregistrer
            </Button>
          </div>
        </Dialog>
      )}

      {geste === 'renommer' && (
        <Dialog open onClose={fermer} title={`Renommer ${table.nom}.${champ.nom}`}
          description="La base acceptera ce renommage sans broncher. C’est l’application qui peut casser.">
          <div className="flex flex-col gap-3">
            <AvertissementCode mot={champ.nom} />
            <div>
              <label className="mb-1 block text-km-label font-semibold text-km-text">Nouveau nom</label>
              <input
                autoFocus
                value={texte}
                onChange={(e) => setTexte(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                className={`${champStyle} font-mono`}
              />
            </div>
            <Erreur e={renommer.error} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={fermer}>Annuler</Button>
              <Button
                disabled={renommer.isPending || texte === champ.nom || !/^[a-z][a-z0-9_]{0,58}$/.test(texte)}
                onClick={() => renommer.mutate(
                  { p_table: table.nom, p_colonne: champ.nom, p_nouveau: texte },
                  { onSuccess: fermer },
                )}
              >
                Renommer
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {geste === 'supprimer' && (
        <Dialog open onClose={fermer} title={`Supprimer ${table.nom}.${champ.nom}`}
          description="Les valeurs sont copiées avant la suppression : l’opération reste réparable.">
          <div className="flex flex-col gap-3">
            <AvertissementCode mot={champ.nom} />
            <p className="flex items-start gap-1.5 rounded-km border border-km-red-line bg-km-red-soft px-2 py-1.5 text-km-label leading-snug text-km-text">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-km-red" />
              <span>
                La colonne disparaît de <strong>{table.nom}</strong>, qui compte environ{' '}
                {table.lignes_estimees.toLocaleString('fr-FR')} lignes. Ses valeurs sont d’abord
                copiées dans les archives — c’est ce qui rend l’opération réparable, mais la
                restauration demande une intervention technique.
              </span>
            </p>
            <div>
              {/* RETAPER LE NOM EST LE SEUL GARDE-FOU CONNU contre le clic machinal. Un dialogue
                  qu'on valide sans lire ne protège de rien. */}
              <label className="mb-1 block text-km-label font-semibold text-km-text">
                Retapez <span className="font-mono">{champ.nom}</span> pour confirmer
              </label>
              <input
                autoFocus
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                className={`${champStyle} font-mono`}
              />
            </div>
            <Erreur e={supprimer.error} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={fermer}>Annuler</Button>
              <Button
                variant="danger"
                disabled={confirmation !== champ.nom || supprimer.isPending}
                onClick={() => supprimer.mutate(
                  { p_table: table.nom, p_colonne: champ.nom },
                  { onSuccess: fermer },
                )}
              >
                {supprimer.isPending ? 'Suppression…' : 'Supprimer définitivement'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}

/** Le bouton d'ajout, posé dans l'en-tête d'une table. */
export function BoutonAjouterChamp({ table }: { table: TableCatalogue }) {
  const [ouvert, setOuvert] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="inline-flex items-center gap-1 rounded-km border border-km-line px-2 py-1 text-km-label font-semibold text-km-text transition-colors hover:border-km-green hover:bg-km-green-soft"
      >
        <Plus className="h-3 w-3" />Ajouter un champ
      </button>
      {ouvert && <DialogAjouterChamp table={table} onClose={() => setOuvert(false)} />}
    </>
  )
}
