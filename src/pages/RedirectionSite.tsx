import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'

/**
 * ══ `/sites/:id` NE MONTRE PLUS UN SITE, IL REDIRIGE ══
 *
 * Réunion du 10/09/2026. William : « les sites, ils existent toujours, parce que j'ai vu Guillaume,
 * il était sur un site ce matin. […] J'étais vraiment sur la page site à l'ancienne, avec la map et
 * tout. » Michel, en cliquant depuis la liste des compteurs : « ils apparaissent mais ils sont
 * introuvables. » Le cas cité est SDC RÉSIDENCE LA FUTAIE.
 *
 * ── POURQUOI LA FICHE ÉTAIT ENCORE LÀ, ET POURQUOI ELLE PART MAINTENANT ──
 *
 * Le 09/09 j'avais retiré le site du menu, de la recherche et de la création, mais gardé la FICHE
 * atteignable par lien : 26 liens « Site : … » y menaient depuis un compteur, un contrat, une
 * tâche, et les couper d'un coup aurait fait 26 liens morts. Le raisonnement tenait pour le code ;
 * il ne tenait pas pour l'équipe, qui tombe sur un écran qu'on lui a annoncé supprimé.
 *
 * La condition posée par Michel — « avant de tout supprimer les sites, s'assurer que toutes ces
 * informations sont déjà présentes sur le compteur » — est vérifiée. Relevé du 10/09/2026 sur les
 * 7 923 compteurs :
 *
 *   libellé du site      0 manquant, 0 différent de celui de son site
 *   adresse              0 manquante parmi les 377 dont le site en portait une
 *   ville, code postal   0 perdue
 *   géolocalisation      0 perdue
 *   propriétaire         0 manquant, 1 seul différent — un compteur déplacé, pas une perte
 *
 * ── OÙ L'ON ATTERRIT, ET POURQUOI ──
 *
 * Un identifiant de site est aussi un identifiant de GROUPE D'ADRESSE : `compteurs.groupe_site_id`
 * reprend l'ancien `sites.id` (migration 20260909100000). Cette page interroge donc les compteurs,
 * jamais la table `sites` — ce qui la rend indifférente au jour où celle-ci disparaîtra.
 *
 *   UN SEUL COMPTEUR à cette adresse   → sa fiche. C'est ce qu'on venait voir.
 *   PLUSIEURS                          → la fiche du compte, qui les liste tous.
 *   AUCUN                              → la liste des compteurs, avec un mot d'explication.
 *
 * `replace: true` : la redirection ne s'empile pas dans l'historique, sinon le bouton Retour
 * renverrait sur elle et rebondirait indéfiniment.
 */
export default function RedirectionSite() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['redirection-site', id],
    enabled: Boolean(id),
    queryFn: async () => {
      /* On lit au plus deux lignes : il suffit de savoir s'il y en a une ou plusieurs, et le
         compte est le même pour tout le groupe. Inutile de descendre les 40 compteurs d'une
         résidence pour choisir une destination. */
      const { data: rows, error } = await supabase
        .from('compteurs')
        .select('id, compte_id')
        .eq('groupe_site_id', id as string)
        .limit(2)
      if (error) throw new Error(error.message)
      return rows ?? []
    },
  })

  useEffect(() => {
    if (isLoading || !data) return
    if (data.length === 1) navigate(`/compteurs/${data[0].id}`, { replace: true })
    else if (data.length > 1 && data[0].compte_id) navigate(`/comptes/${data[0].compte_id}`, { replace: true })
    else navigate('/compteurs', { replace: true })
  }, [data, isLoading, navigate])

  /* CE QUI S'AFFICHE PENDANT LA SECONDE DE LECTURE. Une page blanche laisserait croire à un écran
     cassé — c'est précisément l'impression qu'on veut effacer. */
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <Loader2 className="h-5 w-5 animate-spin text-km-faint" />
      <p className="text-sm font-semibold text-km-text">Les sites ont été remplacés par les compteurs</p>
      <p className="max-w-md text-km-label leading-snug text-km-muted">
        Chaque compteur porte désormais son libellé de lieu et son adresse. On vous emmène au bon
        endroit.
      </p>
    </div>
  )
}
