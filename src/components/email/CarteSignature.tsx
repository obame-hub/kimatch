import { useEffect, useRef, useState } from 'react'
import { PenLine, Loader2, Check, Bold, Italic, Link2, Code2, Eye } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { cn } from '@/lib/utils'
import { useSignatureEmail, useEnregistrerSignatureEmail } from '@/lib/data/signatureEmail'

/**
 * ══ SA SIGNATURE EMAIL, AU CHOIX ══
 *
 * Naoëlle, 07/09/2026 : « les signatures sont un bloc HTML, faudrait qu'on puisse dans nos profils
 * les personnaliser dans un bloc HTML ou texte avec les options gras, italique, URL, lien, etc. Faut
 * les deux options, et que dans le volet on puisse choisir cette signature. »
 *
 * ══ LES DEUX MODES, ET POURQUOI AUCUN DES DEUX NE SUFFIT SEUL ══
 *
 * LE GABARIT KIWEE se remplit en trois champs — fonction, fixe, mobile — et la mise en page vient
 * d'un modèle unique. C'est ce qui garantit que dix signatures se ressemblent : laissées en édition
 * libre, au troisième mois l'une a perdu le filet vert et l'autre écrit « Kiwee » en minuscules.
 *
 * MA SIGNATURE À MOI est le bloc de la personne, écrit ici ou collé depuis Gmail. Parce qu'imposer un
 * gabarit à quelqu'un qui a déjà la sienne, sur mesure, serait la lui faire perdre.
 *
 * Le bloc libre est CONSERVÉ même quand le gabarit est actif : basculer et revenir n'efface rien.
 *
 * ══ ÉCRIRE, OU VOIR LE HTML ══
 *
 * En mode libre, deux vues du même contenu. La vue **mise en forme** donne gras, italique et liens
 * sans savoir ce qu'est une balise. La vue **HTML** sert à coller une signature existante — c'est le
 * geste le plus courant, et un éditeur visuel refuserait ou déformerait le collage.
 */
export function CarteSignature() {
  const { data: signature, isLoading } = useSignatureEmail()
  const enregistrer = useEnregistrerSignatureEmail()

  const [mode, setMode] = useState<'GABARIT' | 'LIBRE'>('GABARIT')
  const [fonction, setFonction] = useState('')
  const [fixe, setFixe] = useState('')
  const [mobile, setMobile] = useState('')
  const [libre, setLibre] = useState('')
  const [vue, setVue] = useState<'forme' | 'html'>('forme')
  const [enregistre, setEnregistre] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [charge, setCharge] = useState(false)

  const editeur = useRef<HTMLDivElement>(null)
  const injecte = useRef(false)

  useEffect(() => {
    if (charge || isLoading) return
    setCharge(true)
    setMode(signature?.mode ?? 'GABARIT')
    setFonction(signature?.fonction ?? '')
    setFixe(signature?.telephone_fixe ?? '')
    setMobile(signature?.telephone_mobile ?? '')
    setLibre(signature?.corps_html_libre ?? '')
  }, [charge, isLoading, signature])

  /* Le contenu n'est injecté qu'à l'ouverture de la vue mise en forme : le réécrire à chaque rendu
     replacerait le curseur au début à chaque lettre tapée. */
  useEffect(() => {
    if (mode !== 'LIBRE' || vue !== 'forme') { injecte.current = false; return }
    if (injecte.current) return
    injecte.current = true
    if (editeur.current) editeur.current.innerHTML = libre
  }, [mode, vue, libre])

  const modifiee = Boolean(signature) && (
    mode !== signature!.mode
    || fonction !== (signature!.fonction ?? '')
    || fixe !== (signature!.telephone_fixe ?? '')
    || mobile !== (signature!.telephone_mobile ?? '')
    || libre !== (signature!.corps_html_libre ?? '')
  )

  const commande = (nom: string, valeur?: string) => {
    editeur.current?.focus()
    document.execCommand(nom, false, valeur)
    if (editeur.current) setLibre(editeur.current.innerHTML)
  }

  async function sauver() {
    setErreur(null)
    try {
      await enregistrer.mutateAsync({
        mode,
        // Une chaîne vide vaut « pas renseigné » : la stocker ferait afficher une ligne vide dans la
        // signature.
        fonction: fonction.trim() || null,
        telephone_fixe: fixe.trim() || null,
        telephone_mobile: mobile.trim() || null,
        corps_html_libre: libre.trim() || null,
      })
      setEnregistre(true)
      window.setTimeout(() => setEnregistre(false), 4000)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PenLine className="h-4 w-4 text-km-green" />
          Ma signature email
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs leading-relaxed text-km-muted">
          Ajoutée au bas des mails envoyés depuis Kimatch. Vous choisissez dans le volet d’écriture
          si elle part ou non.
        </p>

        {isLoading ? (
          <p className="text-xs text-km-muted">Chargement…</p>
        ) : (
          <>
            {/* ── Le choix du mode ── */}
            <div className="flex gap-1.5 rounded-km border border-km-line bg-km-soft p-1">
              <Onglet actif={mode === 'GABARIT'} onClick={() => setMode('GABARIT')}>
                Gabarit KiWee
              </Onglet>
              <Onglet actif={mode === 'LIBRE'} onClick={() => setMode('LIBRE')}>
                Ma signature à moi
              </Onglet>
            </div>

            {mode === 'GABARIT' ? (
              <div className="grid grid-cols-1 gap-2.5">
                <p className="text-km-xs leading-relaxed text-km-faint">
                  Votre nom, votre adresse et votre photo viennent de votre profil. La mise en page
                  est la même pour toute l’équipe.
                </p>
                <label className="block">
                  <span className="mb-1 block text-km-xs font-bold uppercase tracking-wide text-km-faint">
                    Fonction
                  </span>
                  <Input value={fonction} onChange={(e) => setFonction(e.target.value)} placeholder="Responsable Pôle Syndics" />
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="block">
                    <span className="mb-1 block text-km-xs font-bold uppercase tracking-wide text-km-faint">
                      Téléphone fixe
                    </span>
                    <Input value={fixe} onChange={(e) => setFixe(e.target.value)} placeholder="01 76 38 15 23" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-km-xs font-bold uppercase tracking-wide text-km-faint">
                      Mobile
                    </span>
                    <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="06 44 60 18 54" />
                  </label>
                </div>
                <p className="text-km-xs leading-snug text-km-faint">
                  Laissez vide un téléphone que vous ne voulez pas communiquer.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-1 rounded-km border border-km-line bg-km-soft px-2 py-1.5">
                  {vue === 'forme' ? (
                    <>
                      <Outil onClick={() => commande('bold')} titre="Gras"><Bold className="h-3.5 w-3.5" /></Outil>
                      <Outil onClick={() => commande('italic')} titre="Italique"><Italic className="h-3.5 w-3.5" /></Outil>
                      <Outil
                        onClick={() => {
                          const url = window.prompt('Adresse du lien')
                          if (url) commande('createLink', /^https?:\/\/|^mailto:/i.test(url) ? url : `https://${url}`)
                        }}
                        titre="Insérer un lien"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                      </Outil>
                    </>
                  ) : (
                    <span className="px-1 text-km-xs text-km-faint">
                      Collez ici la signature que vous utilisez déjà dans Gmail.
                    </span>
                  )}
                  <span className="ml-auto flex gap-1">
                    <Outil onClick={() => setVue('forme')} titre="Vue mise en forme" actif={vue === 'forme'}>
                      <Eye className="h-3.5 w-3.5" />
                    </Outil>
                    <Outil onClick={() => setVue('html')} titre="Vue HTML" actif={vue === 'html'}>
                      <Code2 className="h-3.5 w-3.5" />
                    </Outil>
                  </span>
                </div>

                {vue === 'forme' ? (
                  <div
                    ref={editeur}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={(e) => setLibre(e.currentTarget.innerHTML)}
                    className="min-h-[130px] rounded-km border border-km-line bg-white px-3 py-2.5 text-xs leading-relaxed text-km-text focus:outline-none focus:ring-2 focus:ring-km-green/20 [&_a]:text-km-green [&_a]:underline"
                  />
                ) : (
                  <textarea
                    value={libre}
                    onChange={(e) => setLibre(e.target.value)}
                    spellCheck={false}
                    placeholder="<div>Prénom Nom<br/>Fonction<br/>KIWEE</div>"
                    className="min-h-[160px] w-full rounded-km border border-km-line bg-white px-3 py-2.5 font-mono text-[11px] leading-relaxed text-km-text focus:outline-none focus:ring-2 focus:ring-km-green/20"
                  />
                )}
              </div>
            )}

            {erreur && (
              <p className="rounded-km border border-km-red-line bg-km-red-soft px-2.5 py-2 text-xs text-km-red">
                {erreur}
              </p>
            )}

            <div className="flex items-center gap-2">
              <Button type="button" size="sm" disabled={!modifiee || enregistrer.isPending} onClick={() => void sauver()}>
                {enregistrer.isPending
                  ? <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> Enregistrement…</>
                  : 'Enregistrer'}
              </Button>
              {enregistre && (
                <span className="flex items-center gap-1 text-xs font-semibold text-km-green">
                  <Check className="h-3 w-3" /> Signature enregistrée
                </span>
              )}
              {modifiee && !enregistrer.isPending && !enregistre && (
                <span className="text-xs text-km-faint">Modifications non enregistrées</span>
              )}
            </div>

            {/* ── L'aperçu : le vrai HTML tel qu'il partira, relu en base ── */}
            <div>
              <p className="mb-1.5 text-km-xs font-bold uppercase tracking-wide text-km-faint">
                Aperçu{' '}
                {modifiee && (
                  <span className="font-medium normal-case text-km-amber">
                    — enregistrez pour le mettre à jour
                  </span>
                )}
              </p>
              <div className="overflow-x-auto rounded-km border border-km-line bg-white p-3">
                {signature?.corps_html
                  ? <div dangerouslySetInnerHTML={{ __html: signature.corps_html }} />
                  : <p className="text-xs text-km-muted">Aucune signature enregistrée.</p>}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Onglet({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded-km px-3 py-1.5 text-xs font-semibold transition-colors',
        actif ? 'bg-white text-km-text shadow-sm' : 'text-km-muted hover:text-km-text',
      )}
    >
      {children}
    </button>
  )
}

function Outil({
  onClick, titre, actif, children,
}: {
  onClick: () => void
  titre: string
  actif?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      // Sans `preventDefault`, le clic fait perdre la sélection avant que la commande s'applique.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={titre}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-km transition-colors',
        actif ? 'bg-white text-km-text shadow-sm' : 'text-km-muted hover:bg-white hover:text-km-text',
      )}
    >
      {children}
    </button>
  )
}
