import { Fragment, useState } from 'react'
import { ShieldCheck, Users, Mail, Trash2, Plus } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/form'
import { Badge } from '@/components/ui/badge'
import { EmailLink } from '@/components/ui/contact-link'
import { cn } from '@/lib/utils'
import {
  useProfilsAdmin,
  useRolesAcces,
  usePostes,
  useCreatePoste,
  usePermissionsList,
  useRolePermissionsMatrix,
  usePostePermissionsMatrix,
  useAssignRoleAcces,
  useAssignPoste,
  useToggleRolePermission,
  useTogglePostePermission,
  useIsAdmin,
  useProfilsAutorises,
  useAddProfilAutorise,
  useRemoveProfilAutorise,
  useUpdateProfilAutorisePosteRole,
} from '@/lib/data/roles'

type Tab = 'utilisateurs' | 'permissions' | 'acces'

function UtilisateursTab() {
  const { data: profils, isLoading } = useProfilsAdmin()
  const { data: roles } = useRolesAcces()
  const { data: postes } = usePostes()
  const assignRole = useAssignRoleAcces()
  const assignPoste = useAssignPoste()

  if (isLoading) return <p className="text-sm text-navy-400">Chargement…</p>
  if (!profils || profils.length === 0) return <p className="text-sm text-navy-400">Aucun utilisateur.</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-navy-100 text-left text-xs uppercase tracking-wide text-navy-400">
            <th className="py-2 pr-4">Nom</th>
            <th className="py-2 pr-4">Email</th>
            <th className="py-2 pr-4">Poste</th>
            <th className="py-2 pr-4">Rôle d'accès</th>
            <th className="py-2 pr-4">Statut</th>
          </tr>
        </thead>
        <tbody>
          {profils.map((p) => (
            <tr key={p.id} className="border-b border-navy-50">
              <td className="py-2 pr-4 font-medium text-navy-800">{p.prenom} {p.nom}</td>
              <td className="py-2 pr-4 text-navy-500"><EmailLink value={p.email} /></td>
              <td className="py-2 pr-4">
                <Select
                  value={p.poste?.id ?? ''}
                  onChange={(e) => {
                    if (!e.target.value) return
                    assignPoste.mutate({ profilId: p.id, posteId: e.target.value })
                  }}
                  className="max-w-[200px]"
                >
                  <option value="">Aucun poste</option>
                  {(postes ?? []).map((po) => (
                    <option key={po.id} value={po.id}>{po.libelle}</option>
                  ))}
                </Select>
              </td>
              <td className="py-2 pr-4">
                <Select
                  value={p.role_acces?.id ?? ''}
                  onChange={(e) => {
                    if (!e.target.value) return
                    assignRole.mutate({ profilId: p.id, roleAccesId: e.target.value })
                  }}
                  className="max-w-[220px]"
                >
                  <option value="">Aucun rôle</option>
                  {(roles ?? []).map((r) => (
                    <option key={r.id} value={r.id}>{r.libelle}</option>
                  ))}
                </Select>
              </td>
              <td className="py-2 pr-4">
                <Badge tone={p.actif ? 'kiwi' : 'neutral'}>{p.actif ? 'Actif' : 'Inactif'}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PermissionMatrix({
  columns,
  permissions,
  matrix,
  onToggle,
}: {
  columns: { id: string; libelle: string }[]
  permissions: { id: string; libelle: string; module: string }[]
  matrix: Set<string> | undefined
  onToggle: (columnId: string, permissionId: string, enabled: boolean) => void
}) {
  const parModule = new Map<string, typeof permissions>()
  for (const perm of permissions) {
    const list = parModule.get(perm.module) ?? []
    list.push(perm)
    parModule.set(perm.module, list)
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-navy-100 text-left text-xs uppercase tracking-wide text-navy-400">
          <th className="py-2 pr-4">Permission</th>
          {columns.map((c) => (
            <th key={c.id} className="px-2 py-2 text-center font-medium normal-case text-navy-600">{c.libelle}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {[...parModule.entries()].map(([module, perms]) => (
          <Fragment key={module}>
            <tr className="bg-navy-50/60">
              <td colSpan={columns.length + 1} className="px-1 py-1.5 text-xs font-semibold uppercase tracking-wide text-navy-500">
                {module}
              </td>
            </tr>
            {perms.map((perm) => (
              <tr key={perm.id} className="border-b border-navy-50">
                <td className="py-1.5 pr-4 text-navy-700">{perm.libelle}</td>
                {columns.map((c) => {
                  const checked = matrix?.has(`${c.id}:${perm.id}`) ?? false
                  return (
                    <td key={c.id} className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => onToggle(c.id, perm.id, e.target.checked)}
                        className="h-4 w-4 rounded border-navy-300 text-kiwi-600 focus:ring-kiwi-500"
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  )
}

function NouveauPosteForm() {
  const createPoste = useCreatePoste()
  const [libelle, setLibelle] = useState('')
  const [niveau, setNiveau] = useState('50')
  const [feedback, setFeedback] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    try {
      await createPoste.mutateAsync({ code: libelle, libelle, niveauHierarchique: Number(niveau) || 50 })
      setLibelle('')
      setNiveau('50')
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 flex flex-wrap items-end gap-2">
      <Input placeholder="Nom du poste (ex. Commercial)" value={libelle} onChange={(e) => setLibelle(e.target.value)} className="min-w-[200px] flex-1" />
      <Input type="number" placeholder="Niveau" value={niveau} onChange={(e) => setNiveau(e.target.value)} className="w-24" />
      <Button type="submit" disabled={createPoste.isPending || !libelle.trim()}>
        <Plus className="h-4 w-4" />
        Créer le poste
      </Button>
      {feedback && <p className="w-full text-xs text-red-600">{feedback}</p>}
    </form>
  )
}

function PermissionsTab() {
  const { data: roles } = useRolesAcces()
  const { data: postes } = usePostes()
  const { data: permissions } = usePermissionsList()
  const { data: roleMatrix } = useRolePermissionsMatrix()
  const { data: posteMatrix } = usePostePermissionsMatrix()
  const toggleRole = useToggleRolePermission()
  const togglePoste = useTogglePostePermission()

  if (!roles || !postes || !permissions) return <p className="text-sm text-navy-400">Chargement…</p>

  return (
    <div className="space-y-8">
      <div>
        <h3 className="mb-1 text-sm font-semibold text-navy-800">Postes — permissions de base</h3>
        <p className="mb-3 text-xs text-navy-500">Le poste définit les permissions de base d'une personne selon sa fonction (Commercial, Cotation, Direction…).</p>
        <NouveauPosteForm />
        <div className="overflow-x-auto">
          <PermissionMatrix
            columns={postes}
            permissions={permissions}
            matrix={posteMatrix}
            onToggle={(posteId, permissionId, enabled) => togglePoste.mutate({ posteId, permissionId, enabled })}
          />
        </div>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold text-navy-800">Rôles d'accès — ajouts/retraits spécifiques</h3>
        <p className="mb-3 text-xs text-navy-500">Le rôle d'accès ajoute ou retire des permissions par-dessus celles du poste (ex. Super administrateur voit tout, Service client est plus restreint).</p>
        <div className="overflow-x-auto">
          <PermissionMatrix
            columns={roles}
            permissions={permissions}
            matrix={roleMatrix}
            onToggle={(roleAccesId, permissionId, enabled) => toggleRole.mutate({ roleAccesId, permissionId, enabled })}
          />
        </div>
      </div>
    </div>
  )
}

function AccesAutorisesTab() {
  const { data: emails, isLoading } = useProfilsAutorises()
  const { data: postes } = usePostes()
  const { data: roles } = useRolesAcces()
  const addEmail = useAddProfilAutorise()
  const removeEmail = useRemoveProfilAutorise()
  const updatePosteRole = useUpdateProfilAutorisePosteRole()
  const [email, setEmail] = useState('')
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [posteId, setPosteId] = useState('')
  const [roleAccesId, setRoleAccesId] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    try {
      await addEmail.mutateAsync({ email, prenom, nom, posteId: posteId || null, roleAccesId: roleAccesId || null })
      setEmail('')
      setPrenom('')
      setNom('')
      setPosteId('')
      setRoleAccesId('')
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-navy-500">
        Seules les adresses email listées ici peuvent créer un compte Kimatch (recevoir un lien de connexion qui fonctionne). Le prénom, le nom, le poste et le rôle renseignés ici sont automatiquement appliqués à la fiche profil lors de la première connexion.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
        <Input placeholder="Prénom" value={prenom} onChange={(e) => setPrenom(e.target.value)} className="w-28" />
        <Input placeholder="Nom" value={nom} onChange={(e) => setNom(e.target.value)} className="w-28" />
        <Input type="email" required placeholder="prenom@kiwee-energie.fr" value={email} onChange={(e) => setEmail(e.target.value)} className="min-w-[200px] flex-1" />
        <Select value={posteId} onChange={(e) => setPosteId(e.target.value)} className="w-40">
          <option value="">Poste</option>
          {(postes ?? []).map((po) => (
            <option key={po.id} value={po.id}>{po.libelle}</option>
          ))}
        </Select>
        <Select value={roleAccesId} onChange={(e) => setRoleAccesId(e.target.value)} className="w-40">
          <option value="">Rôle d'accès</option>
          {(roles ?? []).map((r) => (
            <option key={r.id} value={r.id}>{r.libelle}</option>
          ))}
        </Select>
        <Button type="submit" disabled={addEmail.isPending}>
          <Mail className="h-4 w-4" />
          Autoriser
        </Button>
      </form>
      {feedback && <p className="text-xs text-red-600">{feedback}</p>}

      {isLoading ? (
        <p className="text-sm text-navy-400">Chargement…</p>
      ) : !emails || emails.length === 0 ? (
        <p className="text-sm text-navy-400">Aucune adresse autorisée pour l'instant.</p>
      ) : (
        <ul className="divide-y divide-navy-50">
          {emails.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div>
                {(a.prenom || a.nom) && (
                  <p className="font-medium text-navy-800">{a.prenom} {a.nom}</p>
                )}
                <EmailLink value={a.email} className="text-navy-700" />
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={a.poste_id ?? ''}
                  onChange={(e) => updatePosteRole.mutate({ id: a.id, posteId: e.target.value || null, roleAccesId: a.role_acces_id })}
                  className="w-36"
                >
                  <option value="">Poste</option>
                  {(postes ?? []).map((po) => (
                    <option key={po.id} value={po.id}>{po.libelle}</option>
                  ))}
                </Select>
                <Select
                  value={a.role_acces_id ?? ''}
                  onChange={(e) => updatePosteRole.mutate({ id: a.id, posteId: a.poste_id, roleAccesId: e.target.value || null })}
                  className="w-36"
                >
                  <option value="">Rôle</option>
                  {(roles ?? []).map((r) => (
                    <option key={r.id} value={r.id}>{r.libelle}</option>
                  ))}
                </Select>
                <button
                  type="button"
                  onClick={() => removeEmail.mutate(a.id)}
                  className="text-navy-400 hover:text-red-600"
                  aria-label={`Retirer ${a.email}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function Administration() {
  const [tab, setTab] = useState<Tab>('utilisateurs')
  const isAdmin = useIsAdmin()

  if (!isAdmin) {
    return (
      <div>
        <Topbar title="Administration" />
        <div className="p-4 sm:p-6">
          <PageHeader title="Administration" description="Gestion des utilisateurs, rôles et permissions de Kimatch." />
          <p className="text-sm text-navy-500">Accès réservé aux administrateurs.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Topbar title="Administration" />
      <div className="p-4 sm:p-6">
        <PageHeader title="Administration" description="Gestion des utilisateurs, rôles et permissions de KiWee OS." />

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setTab('utilisateurs')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium',
              tab === 'utilisateurs' ? 'bg-kiwi-500/15 text-kiwi-700' : 'text-navy-500 hover:bg-navy-50',
            )}
          >
            <Users className="h-4 w-4" />
            Utilisateurs
          </button>
          <button
            type="button"
            onClick={() => setTab('permissions')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium',
              tab === 'permissions' ? 'bg-kiwi-500/15 text-kiwi-700' : 'text-navy-500 hover:bg-navy-50',
            )}
          >
            <ShieldCheck className="h-4 w-4" />
            Rôles & permissions
          </button>
          <button
            type="button"
            onClick={() => setTab('acces')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium',
              tab === 'acces' ? 'bg-kiwi-500/15 text-kiwi-700' : 'text-navy-500 hover:bg-navy-50',
            )}
          >
            <Mail className="h-4 w-4" />
            Accès autorisés
          </button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {tab === 'utilisateurs' ? 'Utilisateurs' : tab === 'permissions' ? 'Postes, rôles & permissions' : 'Emails autorisés à créer un compte'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tab === 'utilisateurs' ? <UtilisateursTab /> : tab === 'permissions' ? <PermissionsTab /> : <AccesAutorisesTab />}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
