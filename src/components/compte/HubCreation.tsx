import { useEffect, useRef, useState } from 'react'

/**
 * Hub de création de la fiche compte — maquette « Fiche Compte » de William (12/08/2026).
 *
 * Il remplace les six boutons de création qui s'alignaient dans le bandeau : « un hub d'action a été
 * créé sur la fiche compte pour améliorer l'affichage du header » (réunion du 12/08/2026).
 *
 * Les valeurs sont reprises telles quelles de la maquette (hubDefs / hubVals), y compris les
 * dégradés, les ombres, les deux courbes d'accélération distinctes et les raccourcis clavier.
 * Elles sont en style inline pour la même raison que dans la maquette : Tailwind n'exprime ni
 * `cubic-bezier(.2,.9,.3,1.3)` ni un `inset` combiné à une ombre portée. Le survol des lignes, lui,
 * passe par une classe — il ne touche que `background`, donc il n'entre pas en concurrence avec
 * l'animation d'entrée qui anime `opacity` et `transform`.
 */

/** Les six créations, dans l'ordre et avec les tracés SVG de la maquette. */
const ACTIONS = [
  {
    cle: 'compte',
    label: 'Nouveau compte',
    indice: 'Cabinet, entreprise, bailleur',
    touche: 'A',
    couleur: '#3b5f8a',
    fond: '#e9eff6',
    d: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4M9 11h.01M15 11h.01',
  },
  {
    cle: 'site',
    label: 'Nouveau site',
    indice: 'Copropriété, siège, usine',
    touche: 'S',
    couleur: '#0d7a5f',
    fond: '#eaf4f0',
    d: 'M12 21s-7-4.8-7-10.7a7 7 0 0 1 14 0C19 16.2 12 21 12 21zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  },
  {
    cle: 'contact',
    label: 'Nouveau contact',
    indice: 'Gestionnaire, conseil syndical',
    touche: 'T',
    couleur: '#7c5bb0',
    fond: '#f1ecf8',
    d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  },
  {
    cle: 'compteur',
    label: 'Nouveau compteur',
    indice: 'PDL électricité ou gaz',
    touche: 'M',
    couleur: '#4f5aa8',
    fond: '#eef0fa',
    d: 'M4 4h16v13H4zM8 21h8M12 17v4M9 12l2.5-4v3h3L12 15v-3z',
  },
  /**
   * L'OPPORTUNITÉ MANQUAIT AU HUB, et c'est ce que Michel a relevé le 02/09/2026 : depuis une fiche
   * compte, « je mets créer, tu vois ici je peux pas ». Sur la recommandation il se trompait —
   * l'entrée existe, grisée faute de mandat actif, et c'est la règle. L'opportunité, elle, n'était
   * pas proposée du tout.
   *
   * ELLE VIENT AVANT LA RECOMMANDATION parce qu'elle la précède dans le cycle : on qualifie une
   * opportunité, puis on lance la recommandation quand le mandat couvre le périmètre. Le hub se lit
   * ainsi dans l'ordre du travail — et c'est aussi pourquoi elle n'a besoin, elle, d'aucun prérequis
   * (Michel, 23/08 : « il nous faut au minimum un signal et un contact »).
   */
  {
    cle: 'opportunite',
    label: 'Nouvelle opportunité',
    indice: 'Un signal positif et un contact',
    touche: 'O',
    couleur: '#a8317f',
    fond: '#fbeef6',
    d: 'M12 3l9 6-9 6-9-6zM3 15l9 6 9-6',
  },
  {
    cle: 'recommandation',
    label: 'Nouvelle recommandation',
    indice: 'Diagnostic et consultation',
    touche: 'R',
    couleur: '#8a4b2a',
    fond: '#f7ece3',
    d: 'M12 3l2.3 7.7L22 13l-7.7 2.3L12 23l-2.3-7.7L2 13l7.7-2.3z',
  },
  {
    cle: 'mandat',
    label: 'Nouveau mandat',
    indice: 'Périmètre à faire signer',
    touche: 'D',
    couleur: '#9a7a0d',
    fond: '#faf0cd',
    d: 'M12 3l7 2.5V11c0 4.6-3 8.6-7 10-4-1.4-7-5.4-7-10V5.5zM9 12l2 2 4-4',
  },
] as const

export type CleAction = (typeof ACTIONS)[number]['cle']

export function HubCreation({
  onAction,
  /** Actions momentanément impossibles, avec la raison affichée en infobulle. */
  indisponibles = {},
  /**
   * Signale l'ouverture au parent. Indispensable et non décoratif : la fiche compte écoute « R »
   * pour la relance en permanence, et le hub écoute « R » pour la recommandation. Sans cet état
   * partagé, une frappe hub ouvert déclencherait les deux actions à la fois. Deux écouteurs sur
   * `window` ne peuvent pas s'arbitrer par stopPropagation — l'ordre d'attachement décide.
   */
  onOuvertChange,
}: {
  onAction: (cle: CleAction) => void
  indisponibles?: Partial<Record<CleAction, string>>
  onOuvertChange?: (ouvert: boolean) => void
}) {
  const [ouvert, setOuvert] = useState(false)

  useEffect(() => {
    onOuvertChange?.(ouvert)
  }, [ouvert, onOuvertChange])
  const conteneur = useRef<HTMLDivElement>(null)

  // « C » ouvre le hub, puis la touche de chaque ligne la déclenche — exactement comme la maquette,
  // où le raccourci n'est actif que hub ouvert. On ignore la frappe quand l'utilisateur est dans un
  // champ, sinon écrire « Cabinet » dans un formulaire ouvrirait le menu.
  useEffect(() => {
    function surTouche(e: KeyboardEvent) {
      const cible = e.target as HTMLElement | null
      if (cible && (cible.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName))) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (!ouvert && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        setOuvert(true)
        return
      }
      if (!ouvert) return

      if (e.key === 'Escape') {
        setOuvert(false)
        return
      }
      const trouve = ACTIONS.find((a) => a.touche.toLowerCase() === e.key.toLowerCase())
      if (trouve && !indisponibles[trouve.cle]) {
        e.preventDefault()
        setOuvert(false)
        onAction(trouve.cle)
      }
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [ouvert, onAction, indisponibles])

  return (
    <div ref={conteneur} className="relative flex items-center gap-[7px]">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        title="Créer un enregistrement (C)"
        aria-expanded={ouvert}
        className="inline-flex cursor-pointer select-none items-center gap-[7px] rounded-[10px] px-4 py-[9px] text-xs font-bold tracking-[-.01em] text-white transition-all duration-[160ms]"
        style={{
          background: ouvert ? '#0a6650' : 'linear-gradient(180deg,#149070 0%,#0d7a5f 100%)',
          boxShadow: ouvert
            ? '0 0 0 3.5px rgba(13,122,95,.22)'
            : '0 2px 6px -1px rgba(13,122,95,.42),inset 0 1px 0 rgba(255,255,255,.16)',
        }}
      >
        <span
          className="inline-flex"
          style={{
            transition: 'transform .22s cubic-bezier(.2,.9,.3,1.3)',
            transform: ouvert ? 'rotate(135deg)' : 'none',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
        Créer
        <span className="font-mono text-km-tiny opacity-[.55]">C</span>
      </button>

      {ouvert && (
        <>
          {/* Capte le clic extérieur. En fixe plein écran plutôt qu'un écouteur sur document :
              le clic ne traverse pas, donc il ne déclenche rien d'autre en fermant le menu. */}
          <div onClick={() => setOuvert(false)} className="fixed inset-0 z-[60]" />

          <div
            className="animate-km-hub-pop absolute right-0 top-[calc(100%+9px)] z-[61] w-[264px] rounded-[14px] border border-[#e7e6e2] bg-white p-[7px]"
            style={{
              boxShadow: '0 18px 44px -12px rgba(22,24,29,.22),0 2px 8px rgba(22,24,29,.06)',
              transformOrigin: 'top right',
            }}
          >
            <div className="px-[10px] pb-[6px] pt-[7px] text-km-tiny font-extrabold uppercase tracking-[.09em] text-[#a3a5a0]">
              Créer un enregistrement
            </div>

            {ACTIONS.map((action, i) => {
              const raison = indisponibles[action.cle]
              return (
                <div
                  key={action.cle}
                  onClick={() => {
                    if (raison) return
                    setOuvert(false)
                    onAction(action.cle)
                  }}
                  title={raison}
                  className={`animate-km-hub-row flex items-center gap-[11px] rounded-[10px] px-[10px] py-2 ${
                    raison ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:bg-[#f6f6f4]'
                  }`}
                  style={{ animationDelay: `${0.025 * i}s` }}
                >
                  <span
                    className="inline-flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px]"
                    style={{ background: action.fond, color: action.couleur }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={action.d} />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-km-body font-[650] tracking-[-.01em]">{action.label}</span>
                    <span className="mt-px block text-km-xs text-[#a3a5a0]">{action.indice}</span>
                  </span>
                  <span className="flex-none rounded-[5px] border border-[#eceae6] bg-[#f6f6f4] px-1.5 py-0.5 font-mono text-km-tiny font-bold text-[#b6b8b3]">
                    {action.touche}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
