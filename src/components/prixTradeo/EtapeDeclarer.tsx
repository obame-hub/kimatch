import { useEffect, useMemo, useState } from 'react'
import { Loader2, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label, Select } from '@/components/ui/form'
import { Tableau, TableauTete, TableauCorps } from '@/components/ui/tableau'
import { appelerBanc, chargerDossierKimatch, chargerMandatsActifs, useVersionsPourTradeo, type MandatDuCompteur, type ReponseBanc } from '@/lib/data/tradeo'
import {
  compteursPourTradeo,
  manquesDemande,
  responsablePourTradeo,
  type CompteurTradeo,
  type DossierKimatch,
  type ResponsableTradeo,
} from '@/lib/tradeo/dossier'
import { Aide, Manques, ReponseBrute, Verdict } from './commun'
import { lireFichier } from '@/lib/tradeo/outils'

/**
 * ÉTAPE 1 — DÉCLARER UN DOSSIER KIMATCH CHEZ TRADEO.
 *
 * Tradeo ne calcule que sur des compteurs qu'il connaît ET que son équipe a acceptés
 * (`status = 1`). On ne peut donc pas « simuler » un prix sur une version Kimatch sans l'y avoir
 * déclarée d'abord : c'est ce que fait cette étape, depuis une version réelle, sur la
 * PRÉ-PRODUCTION de Tradeo.
 */
export function EtapeDeclarer({ versionInitiale, onChoix, onCree }: {
  /** `?version=` dans l'adresse : un lien depuis une version ouvre le banc déjà rempli. */
  versionInitiale: string | null
  onChoix: (versionId: string) => void
  onCree: (demandeId: number, siret: string) => void
}) {
  const { data: versions, isLoading } = useVersionsPourTradeo(true)
  const [recherche, setRecherche] = useState('')
  const [dossier, setDossier] = useState<DossierKimatch | null>(null)
  const [chargement, setChargement] = useState(false)
  const [erreurChargement, setErreurChargement] = useState<string | null>(null)

  const [siret, setSiret] = useState('')
  const [responsable, setResponsable] = useState<ResponsableTradeo>({ sex: '', nom: '', prenom: '', email: '', tele: '', fonction: '' })
  const [compteurs, setCompteurs] = useState<CompteurTradeo[]>([])
  const [acd, setAcd] = useState<File | null>(null)
  /* LE MANDAT DE CHAQUE COMPTEUR (29/09/2026). Seuls les compteurs couverts entrent dans la
     demande ; les autres sont listés à part, avec la raison. `api/tradeo` refait le contrôle. */
  const [mandats, setMandats] = useState<Map<string, MandatDuCompteur>>(new Map())
  const [sansMandat, setSansMandat] = useState<string[]>([])

  const [confirmer, setConfirmer] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [reponse, setReponse] = useState<ReponseBanc | null>(null)
  const [validation, setValidation] = useState<ReponseBanc | null>(null)

  useEffect(() => {
    if (versionInitiale) void choisir(versionInitiale)
    // Une seule fois, à l'ouverture : la suite passe par la liste.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return (versions ?? []).filter((v) => !q || `${v.recommandation_nom} ${v.compte_nom ?? ''} ${v.version_nom ?? ''}`.toLowerCase().includes(q))
  }, [versions, recherche])

  async function choisir(versionId: string) {
    if (!versionId) return
    onChoix(versionId)
    setChargement(true)
    setErreurChargement(null)
    setReponse(null)
    setValidation(null)
    setConfirmer(false)
    try {
      const d = await chargerDossierKimatch(versionId)
      setDossier(d)
      setSiret((d.siret ?? '').replace(/\s/g, ''))
      setResponsable(responsablePourTradeo(d))
      const couverture = await chargerMandatsActifs(d.compteurs.map((c) => c.id))
      const tous = compteursPourTradeo(d)
      setMandats(couverture)
      setCompteurs(tous.filter((c) => couverture.has(c.num_compteur)))
      setSansMandat(tous.filter((c) => !couverture.has(c.num_compteur)).map((c) => c.num_compteur || '(sans numéro)'))
      setAcd(null)
    } catch (err) {
      setErreurChargement(err instanceof Error ? err.message : String(err))
    } finally {
      setChargement(false)
    }
  }

  const manques = dossier
    ? [
        ...manquesDemande(siret, responsable, compteurs),
        // Un numéro modifié à la main peut sortir du mandat : on le redit ici, le serveur le refuserait.
        ...compteurs.filter((c) => !mandats.has(c.num_compteur)).map((c) => `${c.num_compteur || '(vide)'} : aucun mandat actif ne couvre ce compteur.`),
      ]
    : []

  /* LE PDF DU MANDAT, JOINT D'OFFICE COMME ACD. Tradeo n'en prend qu'un par demande : celui qui
     couvre le plus de compteurs déclarés. Un fichier choisi à la main l'emporte. */
  const acdAuto = useMemo(() => {
    const parDocument = new Map<string, { m: MandatDuCompteur; n: number }>()
    for (const c of compteurs) {
      const m = mandats.get(c.num_compteur)
      if (!m?.document_id) continue
      const avant = parDocument.get(m.document_id)
      parDocument.set(m.document_id, { m, n: (avant?.n ?? 0) + 1 })
    }
    return [...parDocument.values()].sort((a, b) => b.n - a.n)
  }, [compteurs, mandats])

  async function envoyer() {
    setEnvoi(true)
    setConfirmer(false)
    const fichiers = acd ? { ACD: await lireFichier(acd) } : undefined
    const r = await appelerBanc('creer_demande', {
      ...(!acd && acdAuto[0] ? { acd_document_id: acdAuto[0].m.document_id } : {}),
      compteurs: compteurs.map((c) => ({ ...c, site: c.site || undefined })),
      dataSociete: { siret },
      dataResponsable: responsable,
      fichiers,
    })
    setReponse(r)
    setEnvoi(false)
    const id = (r.reponse as { demande_id?: number } | undefined)?.demande_id
    if (r.ok && id) onCree(id, siret)
  }

  const demandeId = (reponse?.reponse as { demande_id?: number } | undefined)?.demande_id

  async function demanderValidation() {
    if (!demandeId) return
    setValidation(await appelerBanc('demander_validation', { id_demande: demandeId }))
  }

  const majCompteur = (i: number, patch: Partial<CompteurTradeo>) =>
    setCompteurs((liste) => liste.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  return (
    <div>
      <Aide>
        Choisissez une version en cours : le banc en reprend le SIRET, le contact et les compteurs. Rien n’est inventé :
        un champ que Kimatch ne connaît pas reste vide, et la liste orange dit ce qui manque. La demande part sur la
        <strong> pré-production</strong> de Tradeo, où leur équipe l’accepte ou la refuse compteur par compteur.
      </Aide>

      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <div>
          <Label htmlFor="tradeo-recherche">Filtrer</Label>
          <Input id="tradeo-recherche" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Compte, recommandation…" />
        </div>
        <div>
          <Label htmlFor="tradeo-version">Version ({isLoading ? '…' : filtrees.length})</Label>
          <Select id="tradeo-version" value={dossier?.version_id ?? versionInitiale ?? ''} onChange={(e) => void choisir(e.target.value)}>
            <option value="" disabled>Choisir une version…</option>
            {filtrees.map((v) => (
              <option key={v.version_id} value={v.version_id}>
                {v.compte_nom ?? '—'} · {v.recommandation_nom}
                {v.numero_version ? ` · V${v.numero_version}` : ''}
                {v.type_energie ? ` · ${v.type_energie.toUpperCase() === 'GAZ' ? 'Gaz' : 'Élec'}` : ''}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {chargement && <p className="mt-3 flex items-center gap-2 text-km-muted"><Loader2 className="h-4 w-4 animate-spin" /> Lecture du dossier…</p>}
      {erreurChargement && <p className="mt-3 text-km-red">{erreurChargement}</p>}

      {dossier && !chargement && (
        <div className="mt-5 space-y-5">
          <section>
            <h4 className="mb-2 text-km-name font-semibold text-km-text">Société</h4>
            <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
              <div>
                <Label htmlFor="tradeo-siret">SIRET</Label>
                <Input id="tradeo-siret" value={siret} onChange={(e) => setSiret(e.target.value.replace(/\s/g, ''))} inputMode="numeric" />
              </div>
              <p className="self-end pb-2 text-km-body text-km-muted">{dossier.compte_nom ?? 'Compte sans nom'}</p>
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-km-name font-semibold text-km-text">Responsable</h4>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="tradeo-sex">Civilité</Label>
                <Select id="tradeo-sex" value={responsable.sex} onChange={(e) => setResponsable({ ...responsable, sex: e.target.value })}>
                  <option value="">—</option>
                  <option value="M.">M.</option>
                  <option value="Mme">Mme</option>
                </Select>
              </div>
              {([['prenom', 'Prénom'], ['nom', 'Nom'], ['email', 'Email'], ['tele', 'Téléphone'], ['fonction', 'Fonction']] as const).map(([champ, libelle]) => (
                <div key={champ}>
                  <Label htmlFor={`tradeo-${champ}`}>{libelle}</Label>
                  <Input id={`tradeo-${champ}`} value={responsable[champ]} onChange={(e) => setResponsable({ ...responsable, [champ]: e.target.value })} />
                </div>
              ))}
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-km-name font-semibold text-km-text">Compteurs sous mandat actif ({compteurs.length})</h4>
            {sansMandat.length > 0 && (
              <p className="mb-2 rounded-km bg-km-red-soft px-3 py-2 text-km-body text-km-red">
                Hors de la demande, faute de mandat actif : <span className="font-mono">{sansMandat.join(', ')}</span>. Sans
                mandat, on n’a pas le droit d’en demander les prix.
              </p>
            )}
            <Tableau minWidth={960}>
              <TableauTete>
                <tr><th>PDL / PCE</th><th>Site</th><th>Énergie</th><th>Mandat actif</th><th>Régie</th><th>Début</th><th>Fin</th><th /></tr>
              </TableauTete>
              <TableauCorps>
                {compteurs.map((c, i) => (
                  <tr key={i}>
                    <td className="min-w-[170px]"><Input className="font-mono" value={c.num_compteur} onChange={(e) => majCompteur(i, { num_compteur: e.target.value.replace(/\s/g, '') })} /></td>
                    <td className="min-w-[160px]"><Input value={c.site} onChange={(e) => majCompteur(i, { site: e.target.value })} /></td>
                    <td className="w-[90px]">{c.type === 'GAZ' ? 'Gaz' : 'Élec'}</td>
                    <td className="min-w-[150px] text-km-label">
                      {mandats.get(c.num_compteur)
                        ? <>
                            <span className="font-semibold text-km-green">{mandats.get(c.num_compteur)!.mandat_reference ?? 'Mandat'}</span>
                            <span className="block text-km-muted">{mandats.get(c.num_compteur)!.date_fin_validite ? `jusqu’au ${new Date(mandats.get(c.num_compteur)!.date_fin_validite! + 'T12:00:00').toLocaleDateString('fr-FR')}` : 'sans échéance'}</span>
                          </>
                        : <span className="font-semibold text-km-red">aucun</span>}
                    </td>
                    <td className="w-[90px]">
                      <Select value={c.regie} onChange={(e) => majCompteur(i, { regie: e.target.value as 'oui' | 'non' })}>
                        <option value="non">non</option>
                        <option value="oui">oui</option>
                      </Select>
                    </td>
                    <td className="w-[150px]"><Input type="date" value={c.dateDebut} onChange={(e) => majCompteur(i, { dateDebut: e.target.value })} /></td>
                    <td className="w-[150px]"><Input type="date" value={c.dateFin} onChange={(e) => majCompteur(i, { dateFin: e.target.value })} /></td>
                    <td className="w-[44px]">
                      <Button variant="ghost" size="icon" aria-label="Retirer ce compteur" onClick={() => setCompteurs((l) => l.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </TableauCorps>
            </Tableau>
            <p className="mt-2 text-km-label text-km-muted">
              Début proposé : lendemain de l’échéance si elle est à venir, sinon le 1er du mois prochain. Durée : la plus courte
              demandée sur la version, à défaut celle de la recommandation, à défaut 12 mois.
            </p>
          </section>

          <section>
            <Label htmlFor="tradeo-acd">ACD</Label>
            {acdAuto[0] && !acd ? (
              <p className="mb-1.5 text-km-body text-km-text">
                Le mandat <strong>{acdAuto[0].m.mandat_reference ?? ''}</strong> sera joint d’office
                <span className="text-km-muted"> ({acdAuto[0].m.document_nom})</span>.
                {acdAuto.length > 1 && <span className="text-km-amber"> Les compteurs relèvent de {acdAuto.length} mandats : Tradeo n’en prend qu’un par demande, les autres s’ajoutent ensuite depuis « Suivre les demandes ».</span>}
              </p>
            ) : !acd && (
              <p className="mb-1.5 text-km-body text-km-amber">Aucun PDF de mandat dans Kimatch pour ces compteurs : joignez l’ACD à la main.</p>
            )}
            <input id="tradeo-acd" type="file" accept="application/pdf" onChange={(e) => setAcd(e.target.files?.[0] ?? null)} className="text-km-body" />
            <p className="mt-1 text-km-label text-km-muted">Un fichier choisi ici remplace le mandat joint d’office.</p>
          </section>

          <Manques liste={manques} />

          <div className="flex flex-wrap items-center gap-2">
            {!confirmer ? (
              <Button variant="primary" disabled={envoi || manques.length > 0 || Boolean(demandeId)} onClick={() => setConfirmer(true)}>
                <Send className="h-4 w-4" /> Créer la demande chez Tradeo
              </Button>
            ) : (
              <>
                <span className="text-km-body text-km-text">Une vraie demande sera déposée sur la pré-production Tradeo. Confirmer ?</span>
                <Button variant="primary" onClick={() => void envoyer()}>Oui, créer</Button>
                <Button variant="ghost" onClick={() => setConfirmer(false)}>Annuler</Button>
              </>
            )}
            {envoi && <Loader2 className="h-4 w-4 animate-spin text-km-muted" />}
          </div>

          <Verdict reponse={reponse} succes={<>Demande n° <strong>{demandeId}</strong> créée chez Tradeo.</>} />
          <ReponseBrute reponse={reponse} />

          {demandeId && (
            <div className="rounded-km border border-km-line p-3">
              <p className="text-km-body text-km-text">
                Pour que l’équipe Tradeo examine les compteurs, il faut demander la validation de la demande. Tradeo envoie
                alors un mail à son équipe.
              </p>
              <Button className="mt-2" onClick={() => void demanderValidation()} disabled={Boolean(validation?.ok)}>
                Demander la validation
              </Button>
              <Verdict reponse={validation} succes="Validation demandée : l’équipe Tradeo a été prévenue." />
              <ReponseBrute reponse={validation} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
