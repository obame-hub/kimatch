/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES RÔLES — CE QU'ILS OUVRENT, ET COMMENT LE CHANGER
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 24/09/2026 : « la page de rôles et permissions est bien dans l'ensemble mais je la
 * trouve trop simple, fais en sorte qu'on puisse gérer aussi, pas seulement voir en mode lecture ».
 *
 * ══ POURQUOI QUATRE INTERRUPTEURS ET NON VINGT-QUATRE CASES ══
 *
 * Il y avait ici une matrice de 24 permissions × 9 rôles. Retirée le 23/09 parce qu'elle
 * n'agissait sur rien — 121 attributions en base, zéro lecture dans l'application. Recompté le
 * 24/09 avant d'écrire cet écran : toujours aucun écran, aucune fonction, aucune policy ne consulte
 * `permissions`.
 *
 * Remettre ces cases aurait été pire que de les laisser absentes : on croit avoir fermé un accès
 * qui reste ouvert. Les quatre interrupteurs ci-dessous sont, eux, LUS PAR LES SIX CONTRÔLES de
 * l'application — chacun agit dès l'enregistrement.
 *
 * ══ CE QUI PROTÈGE DES FAUSSES MANŒUVRES ══
 *
 * Les droits sont ce qu'on règle le plus rarement et ce qu'on casse le plus cher. Trois gardes :
 *
 *   · le droit d'ouvrir l'administration demande une CONFIRMATION — c'est celui qui permet
 *     d'attribuer tous les autres ;
 *   · le dernier rôle administrateur ne peut pas se retirer la porte, et c'est la BASE qui le
 *     refuse (déclencheur `protege_dernier_administrateur`), pas cet écran : un contrôle d'écran se
 *     contourne par un second onglet ou un appel direct ;
 *   · on ne supprime jamais un rôle, on le désactive — l'effacer laisserait sans aucun droit ceux
 *     qui le portent.
 *
 * ══ QUI PEUT RÉGLER ══
 *
 * Ceux dont le rôle ouvre l'administration, soit aujourd'hui SUPER_ADMIN et ADMIN — le choix de
 * Naoëlle. Les autres gardent la lecture : voir qui peut quoi n'est pas un privilège.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useState } from 'react'
import {
  ShieldCheck, Eye, Users, Trash2, LifeBuoy, Plus, Pencil, Check, X, Info, AlertTriangle,
} from 'lucide-react'
import { useRolesAcces, useProfilsAdmin, useIsAdmin, type RoleAcces } from '@/lib/data/roles'
import {
  useModifierCapacitesRole, useRenommerRole, useCreerRole, useActiverRole, useChangerRoleDe,
  type CapacitesRole,
} from '@/lib/data/gestionRoles'
import { cn } from '@/lib/utils'

/**
 * Les quatre droits, dans l'ordre où on se les demande.
 *
 * `consequence` dit ce qui arrive VRAIMENT, en une phrase — pas une reformulation du libellé. Un
 * écran de droits dont on ne comprend pas la portée se règle au hasard.
 */
const DROITS: {
  cle: keyof CapacitesRole
  libelle: string
  consequence: string
  Icone: typeof Eye
  sensible?: boolean
}[] = [
  {
    cle: 'voit_tous_les_comptes',
    libelle: 'Voit tout le portefeuille',
    consequence: 'Sinon, seulement les comptes dont la personne est propriétaire.',
    Icone: Eye,
  },
  {
    cle: 'ouvre_administration',
    libelle: 'Ouvre l’administration',
    consequence: 'Utilisateurs, rôles, objets, corbeille — et donc le pouvoir d’attribuer tous les autres droits.',
    Icone: ShieldCheck,
    sensible: true,
  },
  {
    cle: 'supprime_tout',
    libelle: 'Supprime ce que les autres ont écrit',
    consequence: 'Interactions et tâches de n’importe qui, pas seulement les siennes.',
    Icone: Trash2,
  },
  {
    cle: 'recoit_le_support',
    libelle: 'Reçoit les demandes de support',
    consequence: 'Les demandes de l’équipe arrivent à ce rôle.',
    Icone: LifeBuoy,
  },
]

function Interrupteur({ actif, surClic, desactive, danger }: {
  actif: boolean; surClic: () => void; desactive?: boolean; danger?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={actif}
      disabled={desactive}
      onClick={surClic}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40',
        actif ? (danger ? 'bg-km-amber' : 'bg-km-green') : 'bg-km-line',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all',
          actif ? 'left-[1.125rem]' : 'left-0.5',
        )}
      />
    </button>
  )
}

export function GestionRoles() {
  const { data: roles } = useRolesAcces()
  const { data: profils } = useProfilsAdmin()
  const peutRegler = useIsAdmin()

  const modifier = useModifierCapacitesRole()
  const renommer = useRenommerRole()
  const creer = useCreerRole()
  const activer = useActiverRole()
  const changerRole = useChangerRoleDe()

  const [enEdition, setEnEdition] = useState<string | null>(null)
  const [brouillon, setBrouillon] = useState({ libelle: '', description: '' })
  const [creation, setCreation] = useState(false)
  const [nouveau, setNouveau] = useState({ libelle: '', description: '' })
  /* LA CONFIRMATION PORTE SUR UN RÔLE PRÉCIS, pas sur un booléen : deux cartes ouvertes en même
     temps demanderaient sinon confirmation l'une pour l'autre. */
  const [aConfirmer, setAConfirmer] = useState<RoleAcces | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  if (!roles) return <p className="text-sm text-km-faint">Chargement…</p>

  const parRole = new Map<string, { id: string; nom: string }[]>()
  for (const p of (profils ?? []).filter((x) => x.actif)) {
    const code = p.role_acces?.code
    if (!code) continue
    const nom = `${p.prenom ?? ''} ${p.nom ?? ''}`.trim() || p.email
    parRole.set(code, [...(parRole.get(code) ?? []), { id: p.id, nom }])
  }

  const sansRole = (profils ?? []).filter((p) => p.actif && !p.role_acces)

  const appliquer = (role: RoleAcces, capacites: CapacitesRole) => {
    setErreur(null)
    modifier.mutate({ id: role.id, capacites }, { onError: (e) => setErreur(e.message) })
  }

  const basculer = (role: RoleAcces, cle: keyof CapacitesRole, sensible?: boolean) => {
    const valeur = !role[cle as keyof RoleAcces]
    // ON NE CONFIRME QUE L'OCTROI du droit le plus lourd. Le retirer est déjà protégé en base, et
    // demander confirmation pour refermer une porte découragerait de la refermer.
    if (sensible && valeur) { setAConfirmer(role); return }
    appliquer(role, { [cle]: valeur })
  }

  return (
    <div className="space-y-5">
      {/* CE QUE CETTE PAGE RÈGLE, ET CE QU'ELLE NE RÈGLE PAS. Sans cette note, on cherchera les
          24 permissions d'hier et l'on conclura à une régression. */}
      <div className="flex items-start gap-2.5 rounded-km border border-km-line bg-km-soft px-3.5 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-km-muted" />
        <div className="text-km-xs leading-relaxed text-km-muted">
          <p className="font-semibold text-km-text">Ces quatre droits agissent réellement.</p>
          <p className="mt-1">
            Ce sont ceux que Kimatch consulte pour ouvrir un écran ou filtrer une liste : un
            changement prend effet dès l’enregistrement. La liste de 24 permissions qui figurait ici
            n’était lue par rien — elle a été retirée plutôt que de laisser croire qu’on réglait
            quelque chose.
          </p>
          {!peutRegler && (
            <p className="mt-1 font-semibold text-km-text">
              Vous pouvez consulter cette page, mais pas la modifier.
            </p>
          )}
        </div>
      </div>

      {erreur && (
        <div className="flex items-start gap-2.5 rounded-km border border-km-red/30 bg-km-red-soft px-3.5 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-km-red" />
          <p className="text-km-xs text-km-red">{erreur}</p>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {roles.map((r) => {
          const gens = parRole.get(r.code) ?? []
          const edite = enEdition === r.id
          return (
            <div
              key={r.id}
              className={cn(
                'rounded-km border bg-white p-4',
                r.actif ? 'border-km-line' : 'border-dashed border-km-line opacity-60',
              )}
            >
              <div className="flex items-start gap-2">
                <ShieldCheck className={cn('mt-0.5 h-4 w-4 shrink-0', r.ouvre_administration ? 'text-km-amber' : 'text-km-green')} />
                {edite ? (
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <input
                      autoFocus
                      value={brouillon.libelle}
                      onChange={(e) => setBrouillon((b) => ({ ...b, libelle: e.target.value }))}
                      className="w-full rounded-km border border-km-line px-2 py-1 text-km-sm font-semibold text-km-text"
                    />
                    <input
                      value={brouillon.description}
                      placeholder="À quoi sert ce rôle ?"
                      onChange={(e) => setBrouillon((b) => ({ ...b, description: e.target.value }))}
                      className="w-full rounded-km border border-km-line px-2 py-1 text-km-xs text-km-muted"
                    />
                  </div>
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-km-text">{r.libelle}</p>
                    <p className="truncate text-km-tiny text-km-faint">
                      {r.code}
                      {r.description ? ` · ${r.description}` : ''}
                    </p>
                  </div>
                )}

                <span className="rounded-md bg-km-green-soft px-1.5 py-0.5 text-km-tiny font-bold text-km-green">
                  {gens.length}
                </span>

                {peutRegler && (
                  edite ? (
                    <div className="flex shrink-0 gap-0.5">
                      <button
                        type="button"
                        aria-label="Enregistrer"
                        onClick={() => {
                          setErreur(null)
                          renommer.mutate(
                            { id: r.id, libelle: brouillon.libelle, description: brouillon.description },
                            { onSuccess: () => setEnEdition(null), onError: (e) => setErreur(e.message) },
                          )
                        }}
                        className="rounded p-1 text-km-green hover:bg-km-green-soft"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Annuler"
                        onClick={() => setEnEdition(null)}
                        className="rounded p-1 text-km-faint hover:text-km-text"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Renommer ${r.libelle}`}
                      onClick={() => {
                        setEnEdition(r.id)
                        setBrouillon({ libelle: r.libelle, description: r.description ?? '' })
                      }}
                      className="shrink-0 rounded p-1 text-km-faint hover:text-km-text"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )
                )}
              </div>

              <div className="mt-3 space-y-2 border-t border-km-line pt-3">
                {DROITS.map(({ cle, libelle, consequence, Icone, sensible }) => {
                  const actif = Boolean(r[cle as keyof RoleAcces])
                  return (
                    <div key={cle} className="flex items-start gap-2.5">
                      <Icone className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', actif ? 'text-km-green' : 'text-km-faint')} />
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-km-xs font-medium', actif ? 'text-km-text' : 'text-km-muted')}>
                          {libelle}
                        </p>
                        {/* LA CONSÉQUENCE EST TOUJOURS VISIBLE, pas cachée dans une infobulle : on
                            règle ceci trois fois par an, sans se souvenir de ce que chaque ligne
                            ouvre. */}
                        <p className="text-km-tiny leading-snug text-km-faint">{consequence}</p>
                      </div>
                      <Interrupteur
                        actif={actif}
                        danger={sensible}
                        desactive={!peutRegler || modifier.isPending}
                        surClic={() => basculer(r, cle, sensible)}
                      />
                    </div>
                  )
                })}
              </div>

              <div className="mt-3 flex items-start gap-1.5 border-t border-km-line pt-2.5">
                <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-km-faint" />
                <p className="min-w-0 flex-1 text-km-xs text-km-muted">
                  {gens.length ? gens.map((g) => g.nom).join(', ') : (
                    <span className="text-km-faint">Personne ne porte ce rôle.</span>
                  )}
                </p>
                {peutRegler && gens.length === 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setErreur(null)
                      activer.mutate({ id: r.id, actif: !r.actif }, { onError: (e) => setErreur(e.message) })
                    }}
                    className="shrink-0 text-km-tiny font-semibold text-km-muted hover:text-km-text hover:underline"
                  >
                    {r.actif ? 'Désactiver' : 'Réactiver'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ══ CRÉER UN RÔLE ══ */}
      {peutRegler && (
        creation ? (
          <div className="rounded-km border border-km-line bg-white p-4">
            <p className="text-km-sm font-semibold text-km-text">Nouveau rôle</p>
            <p className="mt-0.5 text-km-xs text-km-muted">
              Il naît sans aucun droit : vous les accorderez ensuite, un par un.
            </p>
            <div className="mt-3 space-y-2">
              <input
                autoFocus
                value={nouveau.libelle}
                placeholder="Nom du rôle — par exemple « Directeur régional »"
                onChange={(e) => setNouveau((n) => ({ ...n, libelle: e.target.value }))}
                className="w-full rounded-km border border-km-line px-2.5 py-1.5 text-km-sm text-km-text"
              />
              <input
                value={nouveau.description}
                placeholder="À quoi sert-il ? (facultatif)"
                onChange={(e) => setNouveau((n) => ({ ...n, description: e.target.value }))}
                className="w-full rounded-km border border-km-line px-2.5 py-1.5 text-km-xs text-km-muted"
              />
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={creer.isPending || !nouveau.libelle.trim()}
                onClick={() => {
                  setErreur(null)
                  /* LE NOUVEAU RÔLE SE RANGE EN BAS DE LA HIÉRARCHIE : le placer plus haut lui
                     donnerait une préséance que personne n'a demandée. On le remonte ensuite si
                     besoin. */
                  const plusBas = Math.max(0, ...roles.map((r) => r.niveau_hierarchique)) + 10
                  creer.mutate(
                    { libelle: nouveau.libelle, description: nouveau.description, niveauHierarchique: plusBas },
                    {
                      onSuccess: () => { setCreation(false); setNouveau({ libelle: '', description: '' }) },
                      onError: (e) => setErreur(e.message),
                    },
                  )
                }}
                className="rounded-km bg-km-green px-3 py-1.5 text-km-xs font-semibold text-white disabled:opacity-50"
              >
                Créer
              </button>
              <button
                type="button"
                onClick={() => { setCreation(false); setNouveau({ libelle: '', description: '' }) }}
                className="rounded-km border border-km-line px-3 py-1.5 text-km-xs font-semibold text-km-muted hover:bg-km-soft"
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreation(true)}
            className="flex items-center gap-1.5 rounded-km border border-dashed border-km-line px-3 py-2 text-km-xs font-semibold text-km-muted hover:bg-km-soft"
          >
            <Plus className="h-3.5 w-3.5" />
            Créer un rôle
          </button>
        )
      )}

      {/* ══════════════════════════════════════════════════════════════════════════════════════
        * QUI A QUEL RÔLE — 24/09/2026
        * ══════════════════════════════════════════════════════════════════════════════════════
        *
        * Naoëlle : « je ne vois pas dans la page où est-ce que je peux attribuer tel rôle à tel
        * utilisateur, alors que je suis admin ».
        *
        * L'ATTRIBUTION EXISTAIT, mais dans l'onglet Utilisateurs — au milieu d'un tableau qui parle
        * aussi de postes, d'activation et de suppression. Et cette page-ci n'en montrait que les
        * personnes SANS rôle, c'est-à-dire aucune : les dix profils en ont tous un.
        *
        * Chercher « quel rôle a untel » dans la page Rôles est le réflexe juste. C'est donc à la
        * page de s'y plier, pas à Naoëlle de retenir où nous l'avons rangé. La liste vit ici ET
        * dans Utilisateurs — deux chemins vers le même geste, et c'est très bien : on n'a pas à
        * deviner lequel des deux écrans l'autre avait en tête.
        * ══════════════════════════════════════════════════════════════════════════════════════ */}
      <div className="rounded-km border border-km-line bg-white p-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-km-green" />
          <h3 className="flex-1 text-km-sm font-semibold text-km-text">Qui a quel rôle</h3>
          <span className="rounded-md bg-km-green-soft px-1.5 py-0.5 text-km-tiny font-bold text-km-green">
            {(profils ?? []).filter((p) => p.actif).length}
          </span>
        </div>
        <p className="mt-1 text-km-xs text-km-muted">
          {peutRegler
            ? 'Changer le rôle de quelqu’un prend effet immédiatement, y compris sur ce qu’il voit.'
            : 'Vous pouvez consulter cette liste, mais pas la modifier.'}
        </p>

        <ul className="mt-3 divide-y divide-km-line">
          {(profils ?? []).filter((p) => p.actif).map((p) => {
            const role = roles.find((r) => r.id === p.role_acces?.id)
            return (
              <li key={p.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-km-xs font-medium text-km-text">
                    {`${p.prenom ?? ''} ${p.nom ?? ''}`.trim() || p.email}
                  </span>
                  {/* CE QUE LE RÔLE OUVRE, EN UN COUP D'ŒIL : sans cela, il faut remonter aux cartes
                      du haut pour savoir si « Conseiller » voit tout ou non. */}
                  <span className="block truncate text-km-tiny text-km-faint">
                    {role?.ouvre_administration ? 'Administration · ' : ''}
                    {role?.voit_tous_les_comptes ? 'voit tout le portefeuille' : 'voit ses comptes'}
                  </span>
                </span>
                {peutRegler ? (
                  <select
                    value={p.role_acces?.id ?? ''}
                    disabled={changerRole.isPending}
                    onChange={(e) => {
                      if (!e.target.value) return
                      setErreur(null)
                      changerRole.mutate(
                        { profilId: p.id, roleId: e.target.value },
                        { onError: (err) => setErreur(err.message) },
                      )
                    }}
                    className="shrink-0 rounded-km border border-km-line bg-white px-2 py-1 text-km-xs disabled:opacity-50"
                  >
                    {/* PAS D'OPTION VIDE : retirer son rôle à quelqu'un le priverait de tout accès
                        sans rien lui dire. On change de rôle, on n'en enlève pas. */}
                    {!p.role_acces && <option value="">Aucun rôle</option>}
                    {roles.filter((r) => r.actif || r.id === p.role_acces?.id).map((r) => (
                      <option key={r.id} value={r.id}>{r.libelle}</option>
                    ))}
                  </select>
                ) : (
                  <span className="shrink-0 text-km-xs text-km-muted">
                    {p.role_acces?.libelle ?? 'Aucun rôle'}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      {/* ══ CEUX QUI N'ONT AUCUN RÔLE ══
          Ils figurent déjà dans la liste ci-dessus, mais sans droits et sans que rien ne le dise.
          Ce bloc les sort du lot, parce qu'un compte actif sans rôle est une anomalie à traiter. */}
      {sansRole.length > 0 && (
        <div className="rounded-km border border-km-amber/30 bg-km-amber-soft p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-km-amber" />
            <p className="text-km-sm font-semibold text-km-text">
              {sansRole.length === 1 ? 'Une personne active sans rôle' : `${sansRole.length} personnes actives sans rôle`}
            </p>
          </div>
          <p className="mt-1 text-km-xs text-km-muted">
            Sans rôle, aucun droit : elles ne voient rien et rien ne le leur dit.
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {sansRole.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-km-xs text-km-text">
                  {`${p.prenom ?? ''} ${p.nom ?? ''}`.trim() || p.email}
                </span>
                {peutRegler && (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (!e.target.value) return
                      setErreur(null)
                      changerRole.mutate(
                        { profilId: p.id, roleId: e.target.value },
                        { onError: (err) => setErreur(err.message) },
                      )
                    }}
                    className="rounded-km border border-km-line bg-white px-2 py-1 text-km-xs"
                  >
                    <option value="">Attribuer un rôle…</option>
                    {roles.filter((r) => r.actif).map((r) => (
                      <option key={r.id} value={r.id}>{r.libelle}</option>
                    ))}
                  </select>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ══ LA CONFIRMATION DU DROIT LE PLUS LOURD ══ */}
      {aConfirmer && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-km-text/25 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-km-md border border-km-line bg-white p-4 shadow-km-pop">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-km-amber" />
              <div>
                <p className="text-km-sm font-semibold text-km-text">
                  Ouvrir l’administration à « {aConfirmer.libelle} » ?
                </p>
                <p className="mt-1.5 text-km-xs leading-relaxed text-km-muted">
                  Ce rôle pourra alors régler les droits de tout le monde, y compris les siens, et
                  voir l’ensemble des écrans d’administration.
                  {(parRole.get(aConfirmer.code)?.length ?? 0) > 0 && (
                    <>
                      {' '}
                      <strong className="text-km-text">
                        {parRole.get(aConfirmer.code)?.map((g) => g.nom).join(', ')}
                      </strong>{' '}
                      l’obtiendra{(parRole.get(aConfirmer.code)?.length ?? 0) > 1 ? 'ont' : ''} immédiatement.
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const r = aConfirmer
                  setAConfirmer(null)
                  appliquer(r, { ouvre_administration: true })
                }}
                className="flex-1 rounded-km bg-km-amber px-3 py-2 text-km-xs font-semibold text-white"
              >
                Oui, ouvrir l’administration
              </button>
              <button
                type="button"
                onClick={() => setAConfirmer(null)}
                className="flex-1 rounded-km border border-km-line px-3 py-2 text-km-xs font-semibold text-km-muted hover:bg-km-soft"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
