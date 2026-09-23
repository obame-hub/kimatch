import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, CloudUpload, FileText, Loader2, X } from 'lucide-react'
import kiweePicto from '@/assets/kiwee-picto.png'
import { cn } from '@/lib/utils'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA BOÎTE DE DÉPÔT — LA SEULE PAGE DE KIMATCH QUI S'OUVRE SANS COMPTE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 23/09/2026 : « un lien unique qui, lorsque le client clique dessus, ouvre une boîte de
 * dépôt dans laquelle il peut glisser un ou plusieurs fichiers ».
 *
 * ══ ELLE NE S'ADRESSE PAS À UN UTILISATEUR DE KIMATCH ══
 *
 * Celui qui l'ouvre est un gestionnaire de copropriété qui a reçu un mail, souvent depuis son
 * téléphone, souvent entre deux rendez-vous. Il ne connaît ni le produit, ni le vocabulaire, et il
 * n'a aucune raison d'insister si quelque chose résiste. Trois conséquences tenues ici :
 *
 *   ON NE DEMANDE RIEN D'AUTRE QUE LES FICHIERS. Pas de nom, pas de mail, pas de case à cocher :
 *     on sait déjà qui il est, c'est nous qui lui avons écrit.
 *   LE GLISSER-DÉPOSER N'EST JAMAIS LE SEUL CHEMIN. Sur un téléphone il n'existe pas ; la zone est
 *     donc AUSSI un bouton, et c'est le même geste pour tout le monde.
 *   CHAQUE FICHIER PART SEUL, dès qu'il est choisi. Une connexion d'agence coupe au milieu d'un
 *     lot de six ; envoyés un par un, il en reste cinq et la page ne redemande que le dernier.
 *
 * ══ LES REFUS SE DISTINGUENT, PARCE QU'ILS N'APPELLENT PAS LA MÊME RÉACTION ══
 *
 * Un lien inconnu, un lien périmé et un dépôt déjà fait sont trois situations différentes. Les
 * confondre en « lien invalide » ferait renoncer quelqu'un à qui il suffisait de dire « vous nous
 * avez déjà envoyé vos factures ».
 */
type Refus = 'INCONNU' | 'EXPIRE' | 'DEJA_DEPOSE' | 'INDISPONIBLE'

interface EtatBoite {
  societe: string | null
  expire_le: string
  limites: { fichiers: number; octets: number; types: string[] }
}

interface Depose {
  cle: string
  nom: string
  etat: 'en-cours' | 'fait' | 'erreur'
  message?: string
}

export default function DepotFactures() {
  const { jeton = '' } = useParams()
  const [etat, setEtat] = useState<EtatBoite | null>(null)
  const [refus, setRefus] = useState<Refus | null>(null)
  const [fichiers, setFichiers] = useState<Depose[]>([])
  const [survol, setSurvol] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [termine, setTermine] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const champ = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/depot/etat?jeton=${encodeURIComponent(jeton)}`)
        const data = await res.json() as { ok: boolean; refus?: Refus } & EtatBoite
        if (!data.ok) { setRefus(data.refus ?? 'INCONNU'); return }
        setEtat({ societe: data.societe, expire_le: data.expire_le, limites: data.limites })
      } catch {
        setRefus('INDISPONIBLE')
      }
    })()
  }, [jeton])

  const deposer = useCallback(async (liste: FileList | File[]) => {
    const limites = etat?.limites
    if (!limites) return
    setErreur(null)

    for (const f of Array.from(liste)) {
      const cle = `${f.name}-${f.size}-${Date.now()}-${Math.random()}`
      setFichiers((d) => [...d, { cle, nom: f.name, etat: 'en-cours' }])

      /* LE FICHIER EST LU EN BASE64 dans le navigateur : le point d'entrée reçoit du JSON, comme
         tous les autres de Kimatch. Un envoi en multipart aurait demandé un analyseur de plus côté
         serveur pour le seul cas de cette page. */
      const contenuBase64 = await new Promise<string>((resolve, reject) => {
        const lecteur = new FileReader()
        lecteur.onload = () => {
          const r = lecteur.result as string
          resolve(r.slice(r.indexOf(',') + 1))
        }
        lecteur.onerror = () => reject(lecteur.error ?? new Error('Lecture impossible'))
        lecteur.readAsDataURL(f)
      }).catch(() => null)

      if (!contenuBase64) {
        setFichiers((d) => d.map((x) => x.cle === cle ? { ...x, etat: 'erreur', message: 'Fichier illisible' } : x))
        continue
      }

      try {
        const res = await fetch('/api/depot/televerser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jeton, nom: f.name, mediaType: f.type, contenuBase64 }),
        })
        const data = await res.json() as { ok: boolean; erreur?: string; refus?: Refus }
        if (data.refus) { setRefus(data.refus); return }
        setFichiers((d) => d.map((x) => x.cle === cle
          ? { ...x, etat: data.ok ? 'fait' : 'erreur', message: data.erreur }
          : x))
      } catch {
        setFichiers((d) => d.map((x) => x.cle === cle ? { ...x, etat: 'erreur', message: 'Envoi interrompu' } : x))
      }
    }
  }, [etat, jeton])

  async function valider() {
    setEnvoi(true)
    setErreur(null)
    try {
      const res = await fetch('/api/depot/valider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jeton }),
      })
      const data = await res.json() as { ok: boolean; erreur?: string; refus?: Refus }
      if (data.ok) { setTermine(true); return }
      if (data.refus) { setRefus(data.refus); return }
      setErreur(data.erreur ?? 'L’envoi n’a pas abouti.')
    } catch {
      setErreur('L’envoi n’a pas abouti. Vérifiez votre connexion et réessayez.')
    } finally {
      setEnvoi(false)
    }
  }

  const reussis = fichiers.filter((f) => f.etat === 'fait').length
  const enCours = fichiers.some((f) => f.etat === 'en-cours')

  return (
    <div className="flex min-h-screen flex-col items-center bg-km-bg px-4 py-10 sm:py-16">
      <img src={kiweePicto} alt="Kiwee Énergie" className="mb-6 h-10 w-10" />

      <div className="w-full max-w-[34rem] rounded-km-lg border border-km-line bg-km-surface p-6 shadow-sm sm:p-8">
        {refus ? <Refuse refus={refus} /> : null}

        {!refus && !etat ? (
          <p className="flex items-center gap-2 text-km-body text-km-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Ouverture de votre espace de dépôt…
          </p>
        ) : null}

        {etat && !refus && termine ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-km-green" aria-hidden="true" />
            <h1 className="mt-3 text-km-h1 font-bold tracking-tight text-km-text">C’est envoyé, merci</h1>
            <p className="mx-auto mt-2 max-w-[26rem] text-km-body leading-relaxed text-km-muted">
              Nous avons bien reçu {reussis} document{reussis > 1 ? 's' : ''}. Votre conseiller
              Kiwee en est informé et revient vers vous avec le comparatif.
            </p>
            <p className="mt-4 text-km-label text-km-faint">Vous pouvez fermer cette page.</p>
          </div>
        ) : null}

        {etat && !refus && !termine ? (
          <>
            <h1 className="text-km-h1 font-bold tracking-tight text-km-text">Vos factures d’énergie</h1>
            <p className="mt-2 text-km-body leading-relaxed text-km-muted">
              {etat.societe ? <>Espace de dépôt pour <b className="font-semibold text-km-text">{etat.societe}</b>. </> : null}
              Déposez ici une facture récente d’électricité ou de gaz pour chacun de vos sites —
              une simple copie suffit. Elles nous permettent d’établir un comparatif chiffré.
            </p>

            {/* ══ LA ZONE EST AUSSI UN BOUTON ══
                Le glisser-déposer n'existe pas sur un téléphone, et c'est de là qu'une bonne part
                des factures partira. Le même rectangle accepte donc les deux gestes. */}
            <button
              type="button"
              onClick={() => champ.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setSurvol(true) }}
              onDragLeave={() => setSurvol(false)}
              onDrop={(e) => { e.preventDefault(); setSurvol(false); void deposer(e.dataTransfer.files) }}
              className={cn(
                'mt-5 flex w-full flex-col items-center gap-2 rounded-km-lg border-2 border-dashed px-6 py-10 transition-colors',
                survol ? 'border-km-green bg-km-green-tint' : 'border-km-line hover:border-km-green/60 hover:bg-km-soft',
              )}
            >
              <CloudUpload className="h-7 w-7 text-km-faint" aria-hidden="true" />
              <span className="text-km-name font-semibold text-km-text">
                Glissez vos fichiers ici, ou cliquez pour les choisir
              </span>
              <span className="text-km-label text-km-faint">
                PDF, JPEG ou PNG · jusqu’à {Math.round(etat.limites.octets / 1024 / 1024)} Mo par fichier
                · {etat.limites.fichiers} fichiers au maximum
              </span>
            </button>
            <input
              ref={champ}
              type="file"
              multiple
              accept={etat.limites.types.join(',')}
              className="hidden"
              onChange={(e) => { if (e.target.files) void deposer(e.target.files); e.target.value = '' }}
            />

            {fichiers.length > 0 ? (
              <ul className="mt-4 grid gap-1.5">
                {fichiers.map((f) => (
                  <li key={f.cle} className="flex items-center gap-2 rounded-km border border-km-line px-3 py-2 text-km-body">
                    {f.etat === 'en-cours' ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-km-faint" aria-hidden="true" />
                      : f.etat === 'fait' ? <FileText className="h-3.5 w-3.5 shrink-0 text-km-green" aria-hidden="true" />
                      : <X className="h-3.5 w-3.5 shrink-0 text-km-red" aria-hidden="true" />}
                    <span className="min-w-0 flex-1 truncate text-km-text">{f.nom}</span>
                    {f.etat === 'erreur' ? <span className="shrink-0 text-km-label text-km-red">{f.message}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}

            {erreur ? <p className="mt-3 text-km-body font-semibold text-km-red">{erreur}</p> : null}

            <button
              type="button"
              onClick={valider}
              disabled={reussis === 0 || enCours || envoi}
              className={cn(
                'mt-5 flex h-11 w-full items-center justify-center rounded-km text-km-name font-bold transition-colors',
                reussis > 0 && !enCours && !envoi
                  ? 'bg-km-green text-white hover:brightness-95'
                  : 'cursor-not-allowed bg-km-soft text-km-faint',
              )}
            >
              {envoi ? 'Envoi…'
                : enCours ? 'Dépôt en cours…'
                : reussis === 0 ? 'Ajoutez au moins un fichier'
                : `Envoyer ${reussis} document${reussis > 1 ? 's' : ''}`}
            </button>
          </>
        ) : null}
      </div>

      <p className="mt-6 text-km-label text-km-faint">Kiwee Énergie — conseil en énergie</p>
    </div>
  )
}

function Refuse({ refus }: { refus: Refus }) {
  const texte = {
    DEJA_DEPOSE: {
      titre: 'Vos factures nous sont déjà parvenues',
      corps: 'Ce lien a déjà servi. Si vous souhaitez nous envoyer d’autres documents, répondez simplement au mail de votre conseiller.',
    },
    EXPIRE: {
      titre: 'Ce lien a expiré',
      corps: 'Les liens de dépôt restent valables trente jours. Répondez au mail de votre conseiller, il vous en renverra un.',
    },
    INCONNU: {
      titre: 'Ce lien n’est pas reconnu',
      corps: 'Il a peut-être été tronqué en le copiant. Ouvrez-le directement depuis le mail que vous avez reçu.',
    },
    INDISPONIBLE: {
      titre: 'Le dépôt est momentanément indisponible',
      corps: 'Réessayez dans quelques minutes, ou répondez au mail de votre conseiller en joignant vos factures.',
    },
  }[refus]

  return (
    <div>
      <h1 className="text-km-h1 font-bold tracking-tight text-km-text">{texte.titre}</h1>
      <p className="mt-2 text-km-body leading-relaxed text-km-muted">{texte.corps}</p>
    </div>
  )
}
