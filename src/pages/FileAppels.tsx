import { useMemo, useState } from 'react'
import { ChevronRight, Link2, X, AlertTriangle, Check, Loader2, Building2 } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { cn } from '@/lib/utils'
import { dateRelative } from '@/lib/dateRelative'
import { numeroLisible } from '@/lib/telephonie'
import { useContacts } from '@/lib/data/contacts'
import { useComptes } from '@/lib/data/comptes'
import {
  useFileAppels,
  useAppelsDuNumero,
  useRattacherAppels,
  useEcarterAppels,
  type LigneFileAppels,
} from '@/lib/data/fileAppels'

/**
 * ══ LES APPELS QU'ON NE SAIT PAS ENCORE À QUI RATTACHER ══
 *
 * Naoëlle, 07/09/2026 : « importe tout, avec la file des non rattachés. Fais la table et l'écran. »
 *
 * ══ CE QUE CET ÉCRAN EST, ET CE QU'IL N'EST PAS ══
 *
 * Ce n'est PAS un historique d'appels : les 6 638 appels reconnus sont déjà sur les fiches de leurs
 * contacts. C'est une BOÎTE DE RÉCEPTION — les 3 895 appels dont le numéro n'existe encore nulle
 * part, à trier.
 *
 * Et ce n'est pas un rattrapage à vider une fois : à 1 500 appels par mois dont une bonne part de
 * prospection, il s'en présentera toujours. On le traite au fil de l'eau, et c'est très bien.
 *
 * ══ TRIÉ PAR NOMBRE D'APPELS, ET C'EST LA DÉCISION QUI COMPTE ══
 *
 * 3 895 appels sur 1 439 numéros. Mesuré : 986 numéros n'ont été appelés qu'UNE fois — 44 % des
 * numéros pour 15 % des appels. Trié par date, on tomberait d'abord sur ceux-là et on abandonnerait
 * avant d'atteindre celui qui en porte 86.
 *
 * ══ UN GESTE RATTACHE TOUT, ET POUR DE BON ══
 *
 * Rattacher un numéro crée les interactions de TOUS ses appels — résumés IA et transcriptions
 * comprises — et ajoute le numéro à la fiche, pour que les appels suivants tombent directement au
 * bon endroit. Sans ce second effet, on rattacherait le même prospect chaque semaine.
 */
export default function FileAppels() {
  const { data: file, isLoading } = useFileAppels()
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [recherche, setRecherche] = useState('')

  const lignes = useMemo(() => {
    const tout = file?.lignes ?? []
    const q = recherche.trim().toLowerCase()
    if (!q) return tout
    return tout.filter((l) =>
      l.numero?.toLowerCase().includes(q)
      || l.societe_proposee?.toLowerCase().includes(q)
      || l.personne_proposee?.toLowerCase().includes(q)
      || l.commerciaux?.toLowerCase().includes(q)
      || l.dernier_resume?.toLowerCase().includes(q))
  }, [file, recherche])

  const totalAppels = (file?.lignes ?? []).reduce((t, l) => t + Number(l.nb_appels), 0)

  function signaler(texte: string) {
    setMessage(texte)
    setErreur(null)
    window.setTimeout(() => setMessage(null), 7000)
  }

  return (
    <div className="min-h-screen bg-km-bg">
      <Topbar crumb="Interactions" title="Appels non rattachés" />
      <div className="mx-auto max-w-[1100px] px-4 py-5">
        <PageHeader
          title="Appels non rattachés"
          description="Les appels Allo dont le numéro n’est encore sur aucune fiche"
        />

        <div className="mb-3 rounded-km-md border border-km-line bg-km-soft px-3.5 py-3">
          <p className="max-w-[70ch] text-km-label leading-relaxed text-km-muted">
            Rattacher un numéro consigne <strong>tous ses appels d’un coup</strong> — résumés et
            transcriptions comprises — et ajoute le numéro à la fiche, pour que les appels suivants
            tombent directement au bon endroit.
          </p>
          <p className="mt-1 text-km-label leading-relaxed text-km-faint">
            La liste est triée par nombre d’appels : les numéros les plus travaillés d’abord.
          </p>
        </div>

        {file && !file.pretMigration && (
          <div className="mb-3 rounded-km-md border border-km-amber-line bg-km-amber-soft px-3.5 py-3">
            <p className="flex items-center gap-1.5 text-km-body font-bold text-km-amber">
              <AlertTriangle className="h-3.5 w-3.5" /> La file n’est pas encore active
            </p>
            <p className="mt-1 text-km-label leading-relaxed text-km-text">
              La migration qui la crée n’est pas appliquée. Une fois passée, relancez l’import : les
              appels non rattachés sont toujours chez Allo.
            </p>
            <pre className="mt-2 overflow-x-auto rounded-km bg-white/70 px-2.5 py-2 font-mono text-km-label text-km-text">
node scripts/appliquer-migration.cjs 20260907220000{'\n'}
node scripts/importer-appels-allo.cjs --ecrire
            </pre>
          </div>
        )}

        {message && (
          <p className="mb-3 rounded-km border border-km-green-line bg-km-green-soft px-3 py-2.5 text-km-body font-semibold text-km-green">
            {message}
          </p>
        )}
        {erreur && (
          <div className="mb-3 rounded-km border border-km-red-line bg-km-red-soft px-3 py-2.5">
            <p className="text-km-body font-bold text-km-red">Rattachement impossible</p>
            <p className="mt-1 text-km-label leading-snug text-km-text">{erreur}</p>
          </div>
        )}

        {isLoading ? (
          <p className="py-8 text-center text-km-body text-km-muted">Lecture de la file…</p>
        ) : (file?.lignes.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center gap-1.5 rounded-km-md border border-dashed border-km-line py-12">
            <Check className="h-6 w-6 text-km-green" />
            <p className="text-km-body font-semibold text-km-text">Aucun appel en attente</p>
            <p className="text-km-label text-km-faint">
              {file?.pretMigration
                ? 'Tous les appels importés ont trouvé leur fiche.'
                : 'Elle le restera tant que la migration n’est pas appliquée.'}
            </p>
          </div>
        ) : (
          <>
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-km-label text-km-muted">
                <strong className="text-km-text">{file!.lignes.length.toLocaleString('fr-FR')}</strong> numéros
                {' · '}
                <strong className="text-km-text">{totalAppels.toLocaleString('fr-FR')}</strong> appels en attente
              </p>
              <Input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Numéro, société, commercial, résumé…"
                className="w-[290px]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              {lignes.map((l) => (
                <LigneNumero
                  key={l.numero}
                  ligne={l}
                  depliee={ouvert === l.numero}
                  onDeplier={() => setOuvert(ouvert === l.numero ? null : l.numero)}
                  onFait={signaler}
                  onErreur={setErreur}
                />
              ))}
              {lignes.length === 0 && (
                <p className="py-8 text-center text-km-body text-km-muted">
                  Aucun numéro ne correspond à « {recherche} ».
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** Un numéro, ses appels, et de quoi le rattacher. */
function LigneNumero({
  ligne, depliee, onDeplier, onFait, onErreur,
}: {
  ligne: LigneFileAppels
  depliee: boolean
  onDeplier: () => void
  onFait: (m: string) => void
  onErreur: (m: string) => void
}) {
  const rattacher = useRattacherAppels()
  const ecarter = useEcarterAppels()
  const { data: appels } = useAppelsDuNumero(depliee ? ligne.numero : null)

  const minutes = Math.round(Number(ligne.duree_totale_secondes ?? 0) / 60)

  async function lancer(cible: { contactId?: string; compteId?: string; pisteId?: string }, quoi: string) {
    try {
      const r = await rattacher.mutateAsync({ numero: ligne.numero, ...cible })
      onFait(
        `✓ ${r.appels_rattaches} appel${r.appels_rattaches > 1 ? 's' : ''} rattaché${r.appels_rattaches > 1 ? 's' : ''} à ${quoi}`
        + (r.numero_ajoute_a_la_fiche
          ? `, et le numéro a été ajouté à la fiche — les prochains appels y arriveront directement.`
          : `. Le numéro y figurait déjà.`),
      )
    } catch (e) {
      onErreur(e instanceof Error ? e.message : 'Erreur inconnue')
    }
  }

  return (
    <div className="overflow-hidden rounded-km-md border border-km-line bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
        <button type="button" onClick={onDeplier} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-km-faint transition-transform', depliee && 'rotate-90')} />
          <span className="min-w-0">
            {/* LE NUMÉRO EN TEXTE, et c'est délibéré : l'extension Allo ne décore que ce qu'elle
                voit. Caché dans une infobulle, il ne recevrait jamais l'icône d'appel. */}
            <span className="block truncate font-mono text-km-body font-bold text-km-text">
              {ligne.numero === '+' ? 'Numéro masqué' : numeroLisible(ligne.numero)}
            </span>
            <span className="block truncate text-km-label text-km-muted">
              {ligne.commerciaux || 'commercial inconnu'}
              {' · '}
              dernier appel {dateRelative(ligne.dernier_appel)}
              {minutes > 0 && ` · ${minutes} min au total`}
            </span>
          </span>
        </button>

        {ligne.societe_proposee && (
          <span
            title={`Société entendue par l’IA d’Allo sur ${ligne.societe_proposee_occurrences} appel(s). C’est un indice, pas une certitude.`}
            className="flex shrink-0 items-center gap-1 rounded-km-sm bg-km-soft px-2 py-0.5 text-km-label text-km-muted"
          >
            <Building2 className="h-3 w-3 text-km-faint" />
            {ligne.societe_proposee}
          </span>
        )}

        <span className="shrink-0 rounded-km-sm bg-km-green-soft px-2 py-0.5 font-mono text-km-label font-bold tabular-nums text-km-green">
          {ligne.nb_appels} appel{ligne.nb_appels > 1 ? 's' : ''}
        </span>

        <span className="flex shrink-0 items-center gap-1.5">
          {/* LE COMPTE PROPOSÉ N'APPARAÎT QUE SUR UNE CORRESPONDANCE EXACTE de nom. Un rapprochement
              approximatif appariait « Dalkia » au compte « LK » ; ici une proposition fausse
              rattacherait 86 appels au mauvais client. */}
          {ligne.compte_propose_id && (
            <Button
              type="button"
              size="sm"
              disabled={rattacher.isPending}
              onClick={() => void lancer({ compteId: ligne.compte_propose_id! }, ligne.compte_propose_nom!)}
            >
              <Link2 className="mr-1 h-3 w-3" />
              Rattacher à {ligne.compte_propose_nom}
            </Button>
          )}
          <button
            type="button"
            title="Écarter — numéro masqué, faux numéro, démarcheur"
            onClick={async () => {
              if (!window.confirm(`Écarter ${ligne.nb_appels} appel(s) de ce numéro ? Ils ne seront pas consignés.`)) return
              try {
                const n = await ecarter.mutateAsync(ligne.numero)
                onFait(`${n} appel${n > 1 ? 's' : ''} écarté${n > 1 ? 's' : ''}.`)
              } catch (e) {
                onErreur(e instanceof Error ? e.message : 'Erreur inconnue')
              }
            }}
            className="flex h-7 w-7 items-center justify-center rounded-km border border-km-line text-km-faint transition-colors hover:border-km-red-line hover:bg-km-red-soft hover:text-km-red"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      </div>

      {depliee && (
        <div className="border-t border-km-line bg-km-soft px-3 py-3">
          <Rattachement
            ligne={ligne}
            enCours={rattacher.isPending}
            onChoisir={lancer}
          />

          <p className="mb-1.5 mt-3 text-km-micro font-bold uppercase tracking-[0.07em] text-km-faint">
            Les {ligne.nb_appels} appels de ce numéro
          </p>
          {!appels ? (
            <p className="text-km-label text-km-muted">Lecture…</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {appels.slice(0, 8).map((a) => (
                <div key={a.id} className="rounded-km border border-km-line bg-white px-2.5 py-2">
                  <p className="text-km-label text-km-faint">
                    {new Date(a.date_appel).toLocaleString('fr-FR')}
                    {' · '}{a.sens === 'ENTRANT' ? 'entrant' : 'sortant'}
                    {' · '}{a.resultat}
                    {a.decroche_par && ` · ${a.decroche_par}`}
                    {a.duree_secondes ? ` · ${Math.round(a.duree_secondes / 60)} min` : ''}
                  </p>
                  {a.resume_ia && (
                    <p className="mt-1 text-km-body leading-snug text-km-text">{a.resume_ia}</p>
                  )}
                </div>
              ))}
              {appels.length > 8 && (
                <p className="text-km-label text-km-faint">
                  … et {appels.length - 8} appel{appels.length - 8 > 1 ? 's' : ''} de plus.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Le choix de la fiche : un contact, ou un compte.
 *
 * DEUX RECHERCHES ET NON UN SÉLECTEUR GÉANT : 3 399 contacts et 2 769 comptes ne se parcourent pas
 * dans un déroulant. On tape ce qu'on cherche — souvent le nom entendu dans le résumé de l'appel.
 */
function Rattachement({
  ligne, enCours, onChoisir,
}: {
  ligne: LigneFileAppels
  enCours: boolean
  onChoisir: (cible: { contactId?: string; compteId?: string }, quoi: string) => void
}) {
  const [q, setQ] = useState(ligne.personne_proposee || ligne.societe_proposee || '')
  const { data: contacts } = useContacts()
  const { data: comptes } = useComptes()

  const requete = q.trim().toLowerCase()
  const resultats = useMemo(() => {
    if (requete.length < 2) return { contacts: [], comptes: [] }
    return {
      contacts: (contacts ?? [])
        .filter((c) => `${c.prenom ?? ''} ${c.nom ?? ''} ${c.compte_nom ?? ''}`.toLowerCase().includes(requete))
        .slice(0, 6),
      comptes: (comptes ?? [])
        .filter((k) => k.nom.toLowerCase().includes(requete))
        .slice(0, 6),
    }
  }, [requete, contacts, comptes])

  return (
    <div>
      <p className="mb-1.5 text-km-micro font-bold uppercase tracking-[0.07em] text-km-faint">
        Rattacher ce numéro à
      </p>
      {ligne.dernier_resume && (
        <p className="mb-2 max-w-[80ch] rounded-km border border-km-line bg-white px-2.5 py-2 text-km-label leading-snug text-km-muted">
          <span className="font-semibold text-km-text">Dernier appel : </span>
          {ligne.dernier_resume}
        </p>
      )}
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Nom d’un contact ou d’un compte…"
        className="w-full max-w-[420px]"
      />
      {requete.length >= 2 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {resultats.contacts.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={enCours}
              onClick={() => onChoisir({ contactId: c.id }, `${c.prenom ?? ''} ${c.nom ?? ''}`.trim())}
              className="rounded-km border border-km-line bg-white px-2.5 py-1.5 text-left text-km-label transition-colors hover:border-km-green-line hover:bg-km-green-soft"
            >
              <span className="block font-semibold text-km-text">
                {enCours && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
                {`${c.prenom ?? ''} ${c.nom ?? ''}`.trim()}
              </span>
              <span className="block text-km-faint">contact · {c.compte_nom}</span>
            </button>
          ))}
          {resultats.comptes.map((k) => (
            <button
              key={k.id}
              type="button"
              disabled={enCours}
              onClick={() => onChoisir({ compteId: k.id }, k.nom)}
              className="rounded-km border border-km-line bg-white px-2.5 py-1.5 text-left text-km-label transition-colors hover:border-km-green-line hover:bg-km-green-soft"
            >
              <span className="block font-semibold text-km-text">{k.nom}</span>
              <span className="block text-km-faint">compte</span>
            </button>
          ))}
          {resultats.contacts.length === 0 && resultats.comptes.length === 0 && (
            <p className="text-km-label text-km-faint">Rien ne correspond à « {q} ».</p>
          )}
        </div>
      )}
    </div>
  )
}
