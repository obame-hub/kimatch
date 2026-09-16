import { useState, type ReactNode } from 'react'
import type { Piste } from '@/types/domain'
import type { ContexteEmail } from '@/lib/voletEmail'
import type { PatchPiste } from '@/lib/data/prospection'
import { InlineField } from '@/components/ui/inline-field'
import { InlineIdentite } from '@/components/ui/inline-identite'
import { CarteZone, PiedChampsVides } from './CarteZone'
import { CartoucheChoix } from '@/components/ui/cartouche-choix'
import {
  PictoBulle,
  PictoCompte,
  PictoContact,
  PictoEnveloppe,
  PictoImmeuble,
  PictoLinkedin,
  PictoMobile,
  PictoTelephone,
} from '@/components/mandat/pictos'
import { appelerNumero } from '@/lib/telephonie'
import { cn } from '@/lib/utils'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES QUATRE ZONES DE LA FICHE PISTE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 16/09/2026 : « les champs doivent être groupés dans 4 zones différentes — Contacts,
 * Société (avec une deuxième zone focus sur l'adresse), Syndic (s'affiche uniquement si le segment
 * est Syndic), et un bloc commentaire ». Puis, après maquette : « le commentaire en haut, mais
 * néanmoins en dessous du chemin », et « l'adresse sur une seule ligne afin de gagner de la place ».
 *
 * ══ CE QUE CETTE REFONTE REMPLACE ══
 *
 * Une carte « Coordonnées » de six champs mêlant la personne et l'entreprise, puis un pavé de
 * 30 champs en LECTURE SEULE hérité de la reprise Salesforce, puis le commentaire tout en bas. On
 * lisait la société avant le nom, on ne pouvait corriger ni le SIRET ni la ville, et la note —
 * la seule chose qu'un conseiller écrit lui-même — était la dernière servie.
 *
 * ══ POURQUOI LES CHAMPS VIDES DISPARAISSENT ══
 *
 * C'est la décision qui structure tout le reste, et elle vient d'une mesure. Sur les 4 946 pistes :
 * société 100 %, SIRET 96 %, adresse 90 %, téléphone 74 %, site 50 % — puis la chute : e-mail 12 %,
 * fonction 9 %, commentaire 3 %, mobile 0,6 %.
 *
 * Une grille qui réserve sa case à chaque champ affiche donc, sur la piste moyenne, une majorité de
 * tirets, et noie le peu qui est renseigné. Les champs sans valeur se comptent en pied de zone, en
 * pastilles pointillées qu'un clic ramène dans la grille. Rien n'est caché : ce qui manque est
 * nommé, et se répare d'un geste.
 *
 * ══ LE SEGMENT VAUT « SYNDIC PROFESSIONNEL », PAS « SYNDIC DE COPROPRIÉTÉ » ══
 *
 * William a écrit la seconde formule ; la base ne connaît que la première (4 007 pistes, contre
 * 893 « Entreprise » et 46 vides). Confirmé par lui le 16/09 : c'est bien celle-là.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

export const SEGMENT_SYNDIC = 'Syndic professionnel'

type Maj = (patch: PatchPiste) => Promise<unknown>

interface Contexte {
  piste: Piste
  canManage: boolean
  maj: Maj
  signaler: (message: string) => void
  ouvrirEmail: ((contexte: ContexteEmail) => void) | null
}

/**
 * Ce qui est visible, et ce qui est en pied de zone.
 *
 * Un champ se montre s'il porte une valeur — ou si on vient de le demander. L'état ne survit pas au
 * changement de piste, et c'est voulu : les champs rouverts sur la fiche précédente n'ont aucune
 * raison de l'être sur la suivante.
 */
function useChampsVides() {
  const [ouverts, setOuverts] = useState<string[]>([])
  return {
    ouvrir: (nom: string) => setOuverts((v) => (v.includes(nom) ? v : [...v, nom])),
    visible: (nom: string, valeur: unknown) =>
      valeur !== null && valeur !== undefined && valeur !== '' ? true : ouverts.includes(nom),
  }
}

/** Un champ de la grille : intitulé en capitales, valeur en dessous. */
function Champ({ children, large }: { children: ReactNode; large?: boolean }) {
  return <div className={cn('min-w-0', large && 'col-span-full')}>{children}</div>
}

function messageErreur(e: unknown) {
  return `Erreur : ${e instanceof Error ? e.message : 'inconnue'}`
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   1 · CONTACT — UNE FICHE DE JOIGNABILITÉ, PAS UNE GRILLE
   ════════════════════════════════════════════════════════════════════════════════════════════════

   Le nom en 17 px avec la fonction dessous, puis UNE LIGNE PAR MOYEN DE LE JOINDRE : icône, valeur,
   et le geste au bout de la ligne. Quatre coordonnées dans une grille d'étiquettes, c'était du
   formulaire là où on veut un carnet d'adresses — et le geste (appeler, écrire) se cherchait en bas
   de carte au lieu d'être à côté du numéro qu'on vient de lire.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
function ZoneContact({ piste, canManage, maj, signaler, ouvrirEmail }: Contexte) {
  const { ouvrir, visible } = useChampsVides()

  const lignes: {
    cle: string
    nom: string
    Icone: (p: { taille?: number }) => ReactNode
    valeur: string | null
    champ: keyof PatchPiste
    geste?: ReactNode
  }[] = [
    {
      cle: 'telephone', nom: 'Téléphone', Icone: PictoTelephone, valeur: piste.telephone, champ: 'telephone',
      geste: piste.telephone ? (
        <BoutonLigne
          fort
          libelle="Appeler"
          onClick={() => { void appelerNumero(piste.telephone, { nom: piste.contact_nom ?? undefined, societe: piste.societe ?? undefined }) }}
        />
      ) : undefined,
    },
    {
      cle: 'mobile', nom: 'Mobile', Icone: PictoMobile, valeur: piste.telephone_mobile, champ: 'telephone_mobile',
      geste: piste.telephone_mobile ? (
        <BoutonLigne
          libelle="Appeler"
          onClick={() => { void appelerNumero(piste.telephone_mobile, { nom: piste.contact_nom ?? undefined, societe: piste.societe ?? undefined }) }}
        />
      ) : undefined,
    },
    {
      cle: 'email', nom: 'Adresse e-mail', Icone: PictoEnveloppe, valeur: piste.email, champ: 'email',
      /* L'ÉCRITURE PASSE PAR LE VOLET DE KIMATCH, jamais par le client de messagerie du poste
         (William, 13/09/2026) : la piste part avec le mail, et le fil Gmail est enregistré au
         retour, si bien que l'envoi rejoint la conversation de la fiche. */
      geste: piste.email && ouvrirEmail ? (
        <BoutonLigne
          libelle="Écrire"
          onClick={() => ouvrirEmail?.({
            a: piste.email as string,
            nom: piste.contact_nom,
            pisteId: piste.id,
            compteId: piste.compte_id ?? undefined,
          })}
        />
      ) : undefined,
    },
    {
      cle: 'linkedin', nom: 'LinkedIn', Icone: PictoLinkedin, valeur: piste.linkedin, champ: 'linkedin',
      geste: piste.linkedin ? <LienLigne href={piste.linkedin} /> : undefined,
    },
  ]

  const caches = lignes.filter((l) => !visible(l.cle, l.valeur))

  return (
    <CarteZone titre="Contact" Jeton={PictoContact}>
      <div className="px-4 pt-3">
        {/* LE NOM SE LIT ENTIER ET SE MODIFIE EN TROIS (Naoëlle, 14/09/2026) : un champ unique
            redonnerait « Thierry Gazeau » à corriger d'un seul tenant, et la civilité s'y perdrait. */}
        <InlineIdentite
          label=""
          valeur={{ civilite: piste.civilite, prenom: piste.prenom, nom: piste.nom }}
          disabled={!canManage}
          onCommit={(v) => maj({
            civilite: v.civilite,
            prenom: v.prenom,
            nom: v.nom,
            contact_nom: [v.prenom, v.nom].filter(Boolean).join(' ') || null,
          }).then(() => undefined)}
          onSaved={() => signaler('✓ enregistré')}
          onError={(e) => signaler(messageErreur(e))}
          className="text-[17px] font-bold leading-tight tracking-[-.015em] text-km-text"
        />
        <div className="mt-0.5">
          <InlineField
            variant="text" label="" emptyLabel="fonction"
            value={piste.fonction ?? ''} disabled={!canManage}
            onCommit={(v: string) => maj({ fonction: v.trim() || null }).then(() => undefined)}
            onSaved={() => signaler('✓ enregistré')}
            onError={(e: Error) => signaler(messageErreur(e))}
            className="text-km-name text-km-muted"
          />
        </div>
      </div>

      <div className="flex flex-col px-4 pb-1 pt-2">
        {lignes.filter((l) => visible(l.cle, l.valeur)).map((l) => (
          <div key={l.cle} className="flex items-center gap-2.5 border-b border-km-line-soft py-1.5 last:border-b-0">
            <span className="shrink-0 text-km-faint"><l.Icone taille={14} /></span>
            <div className="min-w-0 flex-1">
              <div className="text-km-tiny font-bold uppercase tracking-[0.09em] text-km-faint">{l.nom}</div>
              <InlineField
                variant="text" label="" emptyLabel="ajouter"
                value={l.valeur ?? ''} disabled={!canManage}
                onCommit={(v: string) => maj({ [l.champ]: v.trim() || null } as PatchPiste).then(() => undefined)}
                onSaved={() => signaler('✓ enregistré')}
                onError={(e: Error) => signaler(messageErreur(e))}
                className="text-km-name"
              />
            </div>
            {l.geste}
          </div>
        ))}
      </div>

      <PiedChampsVides noms={caches.map((l) => l.nom)} onOuvrir={(nom) => {
        const cible = lignes.find((l) => l.nom === nom)
        if (cible) ouvrir(cible.cle)
      }} />
    </CarteZone>
  )
}

function BoutonLigne({ libelle, onClick, fort }: { libelle: string; onClick: () => void; fort?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-km border px-2 py-0.5 text-km-label font-semibold transition-colors',
        fort
          ? 'border-km-green-line bg-km-green-soft text-km-green hover:brightness-95'
          : 'border-km-line bg-km-surface text-km-muted hover:bg-km-soft',
      )}
    >
      {libelle}
    </button>
  )
}

function LienLigne({ href }: { href: string }) {
  const url = /^https?:\/\//i.test(href) ? href : `https://${href}`
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="shrink-0 rounded-km border border-km-line bg-km-surface px-2 py-0.5 text-km-label font-semibold text-km-muted transition-colors hover:bg-km-soft"
    >
      Ouvrir
    </a>
  )
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   2 · SOCIÉTÉ — L'IDENTITÉ, PUIS L'ADRESSE SUR UNE LIGNE
   ════════════════════════════════════════════════════════════════════════════════════════════════

   L'ADRESSE OCCUPAIT TROIS RANGÉES — un intitulé, la rue, puis code postal et ville côte à côte —
   soit près de 70 px pour trois valeurs qui se lisent d'un trait. William, 16/09/2026 : « mets
   l'adresse sur une seule ligne afin de gagner de la place ». Elle redevient ce qu'elle est sur une
   enveloppe, creusée dans le gris pour rester distincte des champs au-dessus.

   ELLE S'OUVRE SUR SES TROIS CHAMPS, avec la recherche d'adresse qui les remplit d'un coup — c'est
   elle qui normalise le format, et c'est ce qui évite les « 6 av. Charles » à côté des
   « 6 AVENUE CHARLES ». Un champ unique sur l'adresse entière recollerait ce que la base sépare, et
   le code postal sert aux filtres.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
function ZoneSociete({ piste, canManage, maj, signaler }: Contexte) {
  const { ouvrir, visible } = useChampsVides()

  const champs = [
    { cle: 'code_naf', nom: 'Code NAF', valeur: piste.code_naf, mono: true },
    { cle: 'activite', nom: 'Activité', valeur: piste.activite },
    { cle: 'siren', nom: 'SIREN', valeur: piste.siren, mono: true },
    { cle: 'siret', nom: 'SIRET', valeur: piste.siret, mono: true },
    { cle: 'site_internet', nom: 'Site internet', valeur: piste.site_internet, large: true, lien: true },
  ] as const

  const caches = champs.filter((c) => !visible(c.cle, c.valeur))

  return (
    <CarteZone
      titre="Société"
      Jeton={PictoCompte}
      aDroite={
        /* ══ LE SEGMENT SE CHOISIT ICI ══
           William l'a listé parmi les champs de la zone Société ; il était en cartouche figée, donc
           visible mais incorrigeable — et c'est LUI qui décide si la zone Syndic s'affiche. Deux
           valeurs, pas trois : la base ne connaît que « Syndic professionnel » (4 007) et
           « Entreprise » (893), plus 46 pistes sans segment. */
        <CartoucheChoix
          titre="Segment"
          vide="segment inconnu"
          teinte="bleu"
          valeur={piste.segment}
          options={[SEGMENT_SYNDIC, 'Entreprise']}
          peutModifier={canManage}
          onChoisir={(v) => {
            void maj({ segment: v })
              .then(() => signaler(v ? `✓ Segment : ${v}` : '✓ Segment retiré'))
              .catch((e) => signaler(messageErreur(e)))
          }}
        />
      }
    >
      <div className="px-4 pt-3">
        <InlineField
          variant="text" label="" emptyLabel="nom de la société"
          value={piste.societe ?? ''} disabled={!canManage}
          onCommit={(v: string) => maj({ societe: v.trim() || null }).then(() => undefined)}
          onSaved={() => signaler('✓ enregistré')}
          onError={(e: Error) => signaler(messageErreur(e))}
          className="text-[15.5px] font-bold leading-snug tracking-[-.012em] text-km-text"
        />
      </div>

      <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 px-4 pt-3 sm:grid-cols-2">
        {champs.filter((c) => visible(c.cle, c.valeur)).map((c) => (
          <Champ key={c.cle} large={'large' in c ? c.large : false}>
            <div className="text-km-tiny font-bold uppercase tracking-[0.09em] text-km-faint">{c.nom}</div>
            <InlineField
              variant="text" label="" emptyLabel="ajouter"
              value={c.valeur ?? ''} disabled={!canManage}
              onCommit={(v: string) => maj({ [c.cle]: v.trim() || null } as PatchPiste).then(() => undefined)}
              onSaved={() => signaler('✓ enregistré')}
              onError={(e: Error) => signaler(messageErreur(e))}
              className={cn('text-km-name', 'mono' in c && c.mono && 'font-mono tabular-nums')}
            />
          </Champ>
        ))}
      </div>

      {/* ══ L'ADRESSE, CREUSÉE ET SUR UNE LIGNE ══ */}
      <div className="mx-4 mb-3 mt-3 flex items-center gap-2.5 rounded-km-md bg-km-soft px-3 py-1.5">
        <span className="shrink-0 text-km-faint">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 21s-7-4.8-7-10.7a7 7 0 0 1 14 0C19 16.2 12 21 12 21z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
        </span>
        <span className="shrink-0 text-km-tiny font-bold uppercase tracking-[0.09em] text-km-faint">Adresse</span>
        <InlineField
          variant="address" label="" emptyLabel="ajouter une adresse"
          rue={piste.rue ?? ''} codePostal={piste.code_postal ?? ''} ville={piste.ville ?? ''}
          disabled={!canManage}
          onCommit={(a) => maj({
            rue: a.rue.trim() || null,
            code_postal: a.codePostal.trim() || null,
            ville: a.ville.trim() || null,
          }).then(() => undefined)}
          onSaved={() => signaler('✓ enregistré')}
          onError={(e: Error) => signaler(messageErreur(e))}
          className="flex-1 text-km-name"
        />
      </div>

      <PiedChampsVides noms={caches.map((c) => c.nom)} onOuvrir={(nom) => {
        const cible = champs.find((c) => c.nom === nom)
        if (cible) ouvrir(cible.cle)
      }} />
    </CarteZone>
  )
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   3 · SYNDIC — LE PARC À DÉMARCHER
   ════════════════════════════════════════════════════════════════════════════════════════════════

   Elle ne s'affiche que sur les 4 007 pistes « Syndic professionnel ». Sur une entreprise, elle
   n'aurait montré que trois tirets : `nombre_coproprietes` et `nombre_de_lots` ne sont renseignés
   que sur des syndics, par construction.

   LE TROISIÈME CHIFFRE EST CALCULÉ, PAS STOCKÉ. Le rapport lots / copropriétés est ce qui dit si
   le syndic vaut l'appel — 52 lots par copropriété, ce sont de vrais immeubles ; 8, ce sont des
   petites copropriétés sans chauffage collectif. Le stocker reviendrait à devoir le tenir d'accord
   avec ses deux sources à chaque correction.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
function ZoneSyndic({ piste, canManage, maj, signaler }: Contexte) {
  const copros = piste.nombre_coproprietes
  const lots = piste.nombre_de_lots
  const parCopro = copros && lots && copros > 0 ? Math.round(lots / copros) : null

  return (
    <CarteZone
      titre="Syndic"
      Jeton={PictoImmeuble}
      teinte="vert"
      aDroite={<span className="rounded-km bg-km-soft px-2 py-0.5 text-km-label font-semibold text-km-muted">le parc à démarcher</span>}
    >
      <div className="grid grid-cols-1 gap-2.5 px-4 pt-3 sm:grid-cols-3">
        <Tuile libelle="copropriétés">
          <InlineField
            variant="number" label="" emptyLabel="ajouter"
            value={copros} unit="" disabled={!canManage}
            onCommit={(v: number | null) => maj({ nombre_coproprietes: v }).then(() => undefined)}
            onSaved={() => signaler('✓ enregistré')}
            onError={(e: Error) => signaler(messageErreur(e))}
          />
        </Tuile>
        <Tuile libelle="lots">
          <InlineField
            variant="number" label="" emptyLabel="ajouter"
            value={lots} unit="" disabled={!canManage}
            onCommit={(v: number | null) => maj({ nombre_de_lots: v }).then(() => undefined)}
            onSaved={() => signaler('✓ enregistré')}
            onError={(e: Error) => signaler(messageErreur(e))}
          />
        </Tuile>
        <TuileRatio valeur={parCopro} />
      </div>

      <div className="px-4 pb-3.5 pt-3">
        <div className="mb-1 text-km-tiny font-bold uppercase tracking-[0.09em] text-km-faint">Liste des copropriétés</div>
        <InlineField
          variant="longtext" label="" emptyLabel="ajouter la liste"
          value={piste.liste_coproprietes ?? ''} disabled={!canManage}
          onCommit={(v: string) => maj({ liste_coproprietes: v.trim() || null }).then(() => undefined)}
          onSaved={() => signaler('✓ enregistré')}
          onError={(e: Error) => signaler(messageErreur(e))}
          className="max-h-[120px] overflow-y-auto whitespace-pre-line rounded-km bg-km-soft px-3 py-2 text-km-name leading-relaxed text-km-muted"
        />
      </div>
    </CarteZone>
  )
}

/**
 * Une tuile du parc : le chiffre EST le champ.
 *
 * ══ POURQUOI HABILLER LE BOUTON DEPUIS L'EXTÉRIEUR ══
 *
 * `InlineField variant="number"` dessine sa valeur dans un bouton dont la taille et la chasse sont
 * fixées à l'intérieur du composant — c'est ce qui donne à tous les champs de toutes les fiches la
 * même allure, et on n'y touche pas pour trois tuiles.
 *
 * Premier jet : le chiffre en 26 px au-dessus, et le champ modifiable en dessous. Il s'affichait
 * donc DEUX FOIS, et rien ne disait lequel des deux faisait foi. La tuile ne montre plus que le
 * champ, rhabillé ici en 26 px : un seul chiffre, et c'est celui qu'on clique pour le corriger.
 */
/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE RATIO, ET SON CODE COULEUR
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 16/09/2026 : « trouve un code couleur spécifique au ratio de lots par copropriété, afin
 * qu'il ressorte différemment ».
 *
 * ══ POURQUOI LE BLEU, ET PAS UNE QUATRIÈME NUANCE DE VERT ══
 *
 * Dans la charte, le bleu est la couleur de l'INFORMATION, quand le vert dit l'action et le repère
 * positif. Or c'est exactement ce qui sépare cette tuile des deux autres : les copropriétés et les
 * lots sont des faits SAISIS, qu'on corrige ; le ratio est DÉDUIT, et ne se saisit pas. La couleur
 * porte donc une vraie différence de nature, au lieu de décorer.
 *
 * ══ LES SEUILS SONT MESURÉS, PAS CHOISIS ══
 *
 * Sur les 3 484 pistes syndic qui portent les deux nombres, au 16/09/2026 : quart inférieur sous
 * 28 lots par copropriété, médiane à 45, quart supérieur au-delà de 70. Les deux bornes sont donc
 * les quartiles réels du portefeuille — un syndic « gros » l'est par rapport aux autres, pas par
 * rapport à un chiffre rond qu'on aurait inventé.
 *
 * ══ TROIS CRANS, ET AUCUN N'EST UN REPROCHE ══
 *
 * Un petit ratio n'est pas une alerte : c'est un syndic de petites copropriétés, souvent sans
 * chauffage collectif, donc moins de volume à la clé. L'ambre et le rouge, qui disent l'attention
 * et le risque, seraient un contresens. L'intensité du bleu suffit : elle monte avec l'intérêt.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
const RATIO_PETIT = 28
const RATIO_GROS = 70

function TuileRatio({ valeur }: { valeur: number | null }) {
  const cran =
    valeur == null ? 'inconnu'
      : valeur >= RATIO_GROS ? 'gros'
        : valeur >= RATIO_PETIT ? 'courant'
          : 'petit'

  const habit = {
    gros:     { fond: 'bg-km-blue-soft', encre: 'text-km-blue',  rail: 'rgb(var(--km-blue))',       mention: 'gros parc' },
    courant:  { fond: 'bg-km-soft',      encre: 'text-km-blue',  rail: 'rgb(var(--km-blue) / .35)', mention: 'parc courant' },
    petit:    { fond: 'bg-km-soft',      encre: 'text-km-muted', rail: 'rgb(var(--km-line))',       mention: 'petites copropriétés' },
    inconnu:  { fond: 'bg-km-soft',      encre: 'text-km-faint', rail: 'rgb(var(--km-line))',       mention: 'à renseigner' },
  }[cran]

  return (
    <div
      className={cn('rounded-km-md px-3 py-2', habit.fond)}
      style={{ boxShadow: `inset 3px 0 0 0 ${habit.rail}` }}
      title={`Mesuré sur les 3 484 syndics du portefeuille : moins de ${RATIO_PETIT} lots par copropriété = quart inférieur, plus de ${RATIO_GROS} = quart supérieur.`}
    >
      <div className={cn('px-1.5 text-[26px] font-bold leading-none tracking-[-.045em] tabular-nums', habit.encre)}>
        {valeur ?? '—'}
      </div>
      <div className="mt-1 px-1.5 text-km-label font-semibold text-km-muted">lots par copropriété</div>
      <div className="px-1.5 text-km-label text-km-faint">{habit.mention} · calculé</div>
    </div>
  )
}

function Tuile({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <div
      className="rounded-km-md bg-km-green-tint px-3 py-2"
      style={{ boxShadow: 'inset 3px 0 0 0 rgb(var(--km-green))' }}
    >
      <div className="[&_button]:!font-sans [&_button]:!text-[26px] [&_button]:!font-bold [&_button]:!leading-none [&_button]:!tracking-[-.045em] [&_button]:!text-km-green">
        {children}
      </div>
      <div className="mt-1 px-1.5 text-km-label font-semibold text-km-muted">{libelle}</div>
      {/* Une ligne vide pour que les trois tuiles se terminent à la même hauteur : sans elle, celle
          du ratio dépasse de treize pixels et la rangée part de travers. */}
      <div className="px-1.5 text-km-label text-km-faint">&nbsp;</div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   4 · COMMENTAIRE — EN TÊTE, AVEC L'ÉCHÉANCE EN PASTILLE
   ════════════════════════════════════════════════════════════════════════════════════════════════

   William, 16/09/2026 : « fais en sorte que la case commentaire soit positionnée en haut, mais
   néanmoins en dessous du chemin actuel ». C'est la seule chose qu'un conseiller écrit lui-même, et
   elle était servie en dernier, sous trente champs importés.

   L'ÉCHÉANCE ACTUELLE EST EN PASTILLE, PAS EN CARTE. Elle n'est renseignée que sur 12 pistes sur
   4 945 : une carte dédiée aurait creusé un trou sur 4 933 fiches. En pastille dans l'en-tête, elle
   coûte une ligne, reste modifiable, et se voit quand elle existe — ce qui est exactement son
   usage, puisqu'elle dit quand le prospect redevient attaquable.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
function ZoneCommentaire({ piste, canManage, maj, signaler }: Contexte) {
  return (
    <CarteZone
      titre="Commentaire"
      Jeton={PictoBulle}
      aDroite={
        <span
          className={cn(
            'flex items-center gap-1.5 rounded-km px-2 py-0.5 text-km-label font-semibold',
            piste.echeance_actuelle
              ? 'border border-km-amber-line bg-km-amber-soft text-km-amber'
              : 'border border-dashed border-km-line text-km-faint',
          )}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 7.5V12l3 2" />
            <path d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z" />
          </svg>
          <span className="text-km-faint">Échéance</span>
          <InlineField
            variant="date" label="" emptyLabel="inconnue"
            value={piste.echeance_actuelle} disabled={!canManage}
            onCommit={(v: string | null) => maj({ echeance_actuelle: v }).then(() => undefined)}
            onSaved={() => signaler('✓ enregistré')}
            onError={(e: Error) => signaler(messageErreur(e))}
            className="text-km-label font-semibold"
          />
        </span>
      }
    >
      <div className="px-4 pb-3.5 pt-2.5">
        <InlineField
          variant="longtext" label="" emptyLabel="écrire un commentaire"
          value={piste.commentaire ?? ''} disabled={!canManage}
          onCommit={(v: string) => maj({ commentaire: v.trim() || null }).then(() => undefined)}
          onSaved={() => signaler('✓ enregistré')}
          onError={(e: Error) => signaler(messageErreur(e))}
          className="whitespace-pre-line text-km-name leading-relaxed text-km-muted"
        />
      </div>
    </CarteZone>
  )
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   L'ASSEMBLAGE
   ════════════════════════════════════════════════════════════════════════════════════════════════

   L'ordre est celui des questions qu'on se pose en ouvrant la fiche : où en est-elle (le chemin,
   monté par la page), ce qu'on en sait déjà (la note), qui appeler, chez qui, et ce qu'il gère.

   LES DEUX COLONNES SONT INÉGALES — 390 px pour le contact, le reste pour la société. Elles ont
   d'abord été à 330 / reste : trop serré à gauche, William l'a vu tout de suite. Une ligne de
   contact porte une icône, un intitulé, une valeur ET son geste ; à 330 px, une adresse e-mail un
   peu longue passait sous « Écrire ». La société, elle, range ses champs sur deux colonnes et
   encaisse la perte sans se replier.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
export function ZonesPiste(ctx: Contexte) {
  return (
    <div className="flex flex-col gap-3.5">
      <ZoneCommentaire {...ctx} />

      <div className="grid grid-cols-1 items-start gap-3.5 xl:grid-cols-[minmax(0,390px)_minmax(0,1fr)]">
        <ZoneContact {...ctx} />
        <ZoneSociete {...ctx} />
      </div>

      {ctx.piste.segment === SEGMENT_SYNDIC && <ZoneSyndic {...ctx} />}
    </div>
  )
}
