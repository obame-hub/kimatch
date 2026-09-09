import { Link } from 'react-router-dom'
import type { Compteur, Contrat } from '@/types/domain'
import { PictoCompteur, PictoElectricite, PictoGaz } from './pictos'

/**
 * ══ CE QUE LE MANDAT COUVRE — UNE LIGNE PAR POINT DE LIVRAISON ══
 *
 * Maquette de William, 08/09/2026, révisée le 09/09 : « Naoëlle travaille actuellement sur la
 * suppression de l'objet Site sur Kimatch, donc inutile de le designer. Plus besoin d'avoir la ligne
 * site avec en dessous le compteur, une seule ligne sera nécessaire, celle du compteur. »
 *
 * Le regroupement par site a donc disparu, bandeau vert compris. Chaque ligne porte ce qui identifie
 * un PDL sans passer par un autre objet : son libellé, son numéro, son adresse.
 *
 * ── SEULEMENT LES PDL RÉELLEMENT COUVERTS ──
 *
 * Un mandat peut ne couvrir qu'une partie des compteurs de son compte. Les autres ne sont pas
 * « manquants », ils sont hors périmètre : ils vivent dans l'onglet Périmètre. Les mêler ici ferait
 * croire à une couverture qu'aucun document ne porte — sur un mandat, c'est le genre de confusion
 * qui coûte cher.
 *
 * ── L'ADRESSE EST DÉJÀ SUR LE COMPTEUR, ET C'EST `adresse_site` ──
 *
 * Le compteur porte DEUX colonnes d'adresse, et tout est là :
 *
 *   `adresse`       la dérogation propre au PDL, quand elle diffère du site. UNE ligne sur 7 919.
 *   `adresse_site`  l'adresse dénormalisée depuis le site. 7 919 lignes sur 7 919.
 *
 * La seconde est celle qui survivra à la suppression de l'objet Site — elle est déjà recopiée. Le
 * premier jet de ce composant repliait sur `sites`, faute d'avoir vu cette colonne : c'était un
 * détour pour aller chercher une donnée que le compteur avait sous la main.
 *
 * L'ORDRE EST DONC : la dérogation d'abord si elle existe, l'adresse dénormalisée ensuite. Aucun
 * accès à `sites`.
 *
 * ── LE FOURNISSEUR VIENT DU CONTRAT, PAS DU COMPTEUR ──
 *
 * `compteurs` ne connaît ni fournisseur ni type de prix : ce sont des faits du CONTRAT qui couvre le
 * point de livraison. Un PDL sans contrat actif n'affiche rien à droite, ce qui est exact — et c'est
 * souvent précisément pourquoi le mandat existe.
 *
 * ── DIX LIGNES, PUIS ON DÉFILE ──
 *
 * Proposition retenue par William le 09/09/2026. Sur un mandat à deux PDL la liste tient à l'écran ;
 * sur un mandat à quarante elle fait deux écrans et repousse tout ce qui suit hors de portée.
 */

function fournisseurDuCompteur(compteurId: string, contrats: Contrat[] | undefined): string | null {
  const contrat = (contrats ?? []).find((c) => c.compteurs?.some((cc) => cc.id === compteurId))
  if (!contrat) return null
  return [contrat.fournisseur_nom, contrat.type_prix].filter(Boolean).join(' · ') || null
}

/**
 * L'adresse d'un point de livraison — voir l'en-tête pour le choix entre les deux colonnes.
 *
 * `adresse_site` COMMENCE PAR LE NOM DU SITE sur 7 551 lignes sur 7 919 : « SDC 63/65 RUE DU CHERCHE
 * MIDI, 75006 PARIS ». Or ce nom est déjà le libellé affiché juste avant sur la même ligne. On le
 * retire donc quand il fait doublon — sans quoi la ligne dirait deux fois la même chose avant
 * d'arriver au code postal, qui est justement ce qu'on venait y chercher.
 */
function adresseDuCompteur(compteur: Compteur): string | null {
  const derogation = [compteur.adresse, [compteur.code_postal, compteur.ville].filter(Boolean).join(' ')]
    .filter((p) => p && String(p).trim())
    .join(', ')
  if (derogation) return derogation

  const complete = compteur.adresse_site?.trim()
  if (!complete) return null

  const libelle = compteur.utilisation?.trim()
  if (libelle && complete.toLowerCase().startsWith(libelle.toLowerCase())) {
    const reste = complete.slice(libelle.length).replace(/^[\s,]+/, '')
    return reste || complete
  }
  return complete
}

export function PerimetreCouvert({
  compteurs,
  contrats,
}: {
  compteurs: Compteur[]
  contrats: Contrat[] | undefined
}) {
  return (
    <>
      {/* ── La démarcation ── */}
      <div
        className="flex items-center gap-[11px]"
        style={{ paddingTop: 8, marginTop: 2, borderTop: '1px solid #e7e6e2' }}
      >
        <span
          className="inline-flex flex-none items-center justify-center"
          style={{ width: 22, height: 22, borderRadius: 7, background: '#eef0fa', color: '#4f5aa8' }}
        >
          <PictoCompteur taille={12} />
        </span>
        <span className="text-[12.5px] font-extrabold tracking-[-.01em] text-km-text">Périmètre couvert</span>
        {/* Le décompte ne parle plus de sites : ils quittent Kimatch. */}
        <span
          className="flex-none whitespace-nowrap text-[9.5px] font-extrabold"
          style={{ color: '#4f5aa8', background: '#eef0fa', border: '1px solid #dfe3f4', borderRadius: 5, padding: '2px 8px' }}
        >
          {compteurs.length} PDL
        </span>
      </div>

      {/* ══ UN PÉRIMÈTRE VIDE N'EST PAS UNE PANNE, MAIS IL DOIT DIRE QUOI FAIRE ══
          Un mandat en brouillon affichait « Aucun point de livraison » et s'arrêtait là : l'écran
          avait l'air cassé alors qu'il était simplement au début. */}
      {compteurs.length === 0 ? (
        <div
          className="flex flex-col items-start gap-1"
          style={{ background: '#fbfbfa', border: '1px dashed #e0dfdb', borderRadius: 13, padding: '18px 20px' }}
        >
          <p className="text-[12.5px] font-bold text-km-text">Aucun point de livraison couvert</p>
          {/* LE PÉRIMÈTRE SE FIXE À LA CRÉATION, ET NULLE PART AILLEURS : rien dans Kimatch
              n'ajoute un compteur à un mandat existant — vérifié le 09/09/2026, `mandats_compteurs`
              n'est écrit que par le wizard. C'est cohérent avec la règle métier : on ne fait pas
              d'avenant, un périmètre différent donne un nouveau mandat. La phrase dit donc le vrai
              geste, pas un onglet qui n'existe plus. */}
          <p className="text-[11.5px] leading-snug" style={{ color: '#83868f' }}>
            Un mandat sans PDL n’autorise aucune analyse. Le périmètre se fixe à la création : pour
            le corriger, créez un nouveau mandat.
          </p>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e7e6e2', borderRadius: 13, overflow: 'hidden' }}>
          <div className={compteurs.length > 10 ? 'max-h-[27rem] overflow-y-auto' : undefined}>
            {compteurs.map((compteur, i) => {
              const gaz = compteur.type_energie === 'gaz'
              const offre = fournisseurDuCompteur(compteur.id, contrats)
              const adresse = adresseDuCompteur(compteur)

              return (
                <Link
                  key={compteur.id}
                  to={`/compteurs/${compteur.id}`}
                  className="flex items-center gap-[10px] transition-colors hover:bg-[#fbfbfa]"
                  style={{
                    padding: '10px 16px',
                    borderBottom: i < compteurs.length - 1 ? '1px solid #f5f4f1' : undefined,
                  }}
                >
                  <span
                    className="inline-flex flex-none items-center justify-center"
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: gaz ? '#e9f1f7' : '#fdf1c8',
                      color: gaz ? '#4a7fa5' : '#c8940a',
                    }}
                  >
                    {gaz ? <PictoGaz taille={13} /> : <PictoElectricite taille={13} />}
                  </span>

                  {/* LE LIBELLÉ EXISTE SUR LES 7 919 COMPTEURS depuis la reprise du 09/09/2026, qui
                      y a recopié le nom du site en prévision de sa suppression (migration
                      20260909100000). Le repli sur le numéro reste pour un compteur créé sans nom. */}
                  {compteur.utilisation && (
                    <span className="flex-none whitespace-nowrap text-[12.5px] font-bold text-km-text">
                      {compteur.utilisation}
                    </span>
                  )}
                  <span
                    className={`flex-none whitespace-nowrap font-mono ${compteur.utilisation ? 'text-[10.5px]' : 'text-[12.5px] font-bold'}`}
                    style={{ color: compteur.utilisation ? '#a3a5a0' : '#16181d' }}
                  >
                    {compteur.numero_pdl}
                  </span>

                  {adresse ? (
                    <span className="min-w-0 flex-1 truncate text-[11.5px]" style={{ color: '#5c5f66' }}>
                      {adresse}
                    </span>
                  ) : (
                    <span
                      className="min-w-0 flex-1 truncate text-[11.5px] italic"
                      style={{ color: '#c0c2bd' }}
                      title="Aucune adresse n’est renseignée sur ce point de livraison."
                    >
                      adresse non renseignée
                    </span>
                  )}

                  {offre && (
                    <span className="flex-none truncate text-[11px]" style={{ color: '#5c5f66' }}>
                      {offre}
                    </span>
                  )}
                  <span className="flex-none" style={{ color: '#c9cbc6' }}>›</span>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
