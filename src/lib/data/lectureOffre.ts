import { useState } from 'react'
import { authHeaderJson } from '@/lib/data/authHeader'
import { urlOuvrableDocument } from '@/lib/data/documents'
import type { PropositionLue } from '@/lib/pricing/lectureOffre'

/**
 * L'APPEL À LA LECTURE D'UNE PROPOSITION FOURNISSEUR (`api/ocr/extraire-offre`).
 * Un fichier qu'on vient de lâcher sur le Pricer se lit tel quel ; un fichier déjà déposé se
 * télécharge d'abord (le stockage est privé : l'adresse se signe).
 */

export interface ResultatLecture {
  success: boolean
  error?: string
  fileName?: string
  proposition?: PropositionLue
}

/** Les formats que la lecture sait ouvrir. */
export const estLisible = (nom: string, type?: string | null) => /\.(pdf|png|jpe?g|webp)$/i.test(nom) || /^(application\/pdf|image\/)/.test(type ?? '')

function enBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => { const s = r.result as string; resolve(s.slice(s.indexOf(',') + 1)) }
    r.onerror = () => reject(r.error ?? new Error('Lecture du fichier impossible.'))
    r.readAsDataURL(blob)
  })
}

const typeDe = (nom: string, type?: string | null) =>
  type || (/\.png$/i.test(nom) ? 'image/png' : /\.jpe?g$/i.test(nom) ? 'image/jpeg' : /\.webp$/i.test(nom) ? 'image/webp' : 'application/pdf')

export async function lireProposition(fichier: Blob, nom: string): Promise<PropositionLue> {
  const res = await fetch('/api/ocr/extraire-offre', {
    method: 'POST',
    headers: await authHeaderJson(),
    body: JSON.stringify({ fileBase64: await enBase64(fichier), fileName: nom, mediaType: typeDe(nom, fichier.type) }),
  })
  let data: ResultatLecture
  try {
    data = (await res.json()) as ResultatLecture
  } catch {
    throw new Error(res.status === 404 ? 'La lecture des propositions n’est pas encore en ligne.' : `Réponse illisible du serveur (${res.status}).`)
  }
  if (!res.ok || !data.success || !data.proposition) throw new Error(data.error ?? `Erreur ${res.status}`)
  return data.proposition
}

/** Un fichier déjà rangé sur la version : téléchargé, puis lu. */
export async function lirePropositionDeposee(url: string, nom: string): Promise<PropositionLue> {
  const r = await fetch(await urlOuvrableDocument(url))
  if (!r.ok) throw new Error(`Téléchargement impossible (${r.status}).`)
  return lireProposition(await r.blob(), nom)
}

export interface Lecture {
  id: string
  nom: string
  etat: 'lecture' | 'prete' | 'erreur'
  proposition?: PropositionLue
  erreur?: string
}

/** Les lectures en cours sur la version : lancées au dépôt, ou depuis un fichier déjà rangé. */
export function useLectures() {
  const [lectures, setLectures] = useState<Lecture[]>([])
  const suivre = (nom: string, lire: () => Promise<PropositionLue>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setLectures((l) => [{ id, nom, etat: 'lecture' }, ...l.filter((x) => x.nom !== nom)])
    const maj = (patch: Partial<Lecture>) => setLectures((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)))
    lire()
      .then((proposition) => maj({ etat: 'prete', proposition }))
      .catch((e: Error) => maj({ etat: 'erreur', erreur: e.message }))
  }
  return {
    lectures,
    lireFichier: (f: File) => suivre(f.name, () => lireProposition(f, f.name)),
    lireDeposee: (url: string, nom: string) => suivre(nom, () => lirePropositionDeposee(url, nom)),
    fermer: (id: string) => setLectures((l) => l.filter((x) => x.id !== id)),
  }
}
export type Lectures = ReturnType<typeof useLectures>
