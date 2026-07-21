import { Fragment, useState } from 'react'
import { ShieldCheck, Users, Mail, Trash2 } from 'lucide-react'
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
  usePermissionsList,
  useRolePermissionsMatrix,
  useAssignRoleAcces,
  useToggleRolePermission,
  useIsAdmin,
  useProfilsAutorises,
  useAddProfilAutorise,
  useRemoveProfilAutorise,
} from '@/lib/data/roles'

type Tab = 'utilisateurs' | 'permissions' | 'acces'

function UtilisateursTab() {
  const { data: profils, isLoading } = useProfilsAdmin()
  const { data: roles } = useRolesAcces()
  const assignRole = useAssignRoleAcces()

  if (isLoading) return <p className="text-sm text-navy-400">Chargement…</p>
  if (!profils || profils.length === 0) return <p className="text-sm text-navy-400">Aucun utilisateur.</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-navy-100 text-left text-xs uppercase tracking-wide text-navy-400">
            <th className="py-2 pr-4">Nom</th>
            <th className="py-2 pr-4">Email</th>
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

function PermissionsTab() {
  const { data: roles } = useRolesAcces()
  const { data: permissions } = usePermissionsList()
  const { data: matrix } = useRolePermissionsMatrix()
  const toggle = useToggleRolePermission()

  if (!roles || !permissions) return <p className="text-sm text-navy-400">Chargement…</p>

  const parModule = new Map<string, typeof permissions>()
  for (const perm of permissions) {
    const list = parModule.get(perm.module) ?? []
    list.push(perm)
    parModule.set(perm.module, list)
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-navy-100 text-left text-xs uppercase tracking-wide text-navy-400">
            <th className="py-2 pr-4">Permission</th>
            {roles.map((r) => (
              <th key={r.id} className="px-2 py-2 text-center font-medium normal-case text-navy-600">{r.libelle}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...parModule.entries()].map(([module, perms]) => (
            <Fragment key={module}>
              <tr className="bg-navy-50/60">
                <td colSpan={roles.length + 1} className="px-1 py-1.5 text-xs font-semibold uppercase tracking-wide text-navy-500">
                  {module}
                </td>
              </tr>
              {perms.map((perm) => (
                <tr key={perm.id} className="border-b border-navy-50">
                  <td className="py-1.5 pr-4 text-navy-700">{perm.libelle}</td>
                  {roles.map((r) => {
                    const checked = matrix?.has(`${r.id}:${perm.id}`) ?? false
                    return (
                      <td key={r.id} className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => toggle.mutate({ roleAccesId: r.id, permissionId: perm.id, enabled: e.target.checked })}
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
    </div>
  )
}

function AccesAutorisesTab() {
  const { data: emails, isLoading } = useProfilsAutorises()
  const addEmail = useAddProfilAutorise()
  const removeEmail = useRemoveProfilAutorise()
  const [email, setEmail] = useState('')
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    try {
      await addEmail.mutateAsync({ email, prenom, nom })
      setEmail('')
      setPrenom('')
      setNom('')
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-navy-500">
        Seules les adresses email listées ici peuvent créer un compte KiWee OS (recevoir un lien de connexion qui fonctionne). Le prénom et le nom renseignés ici sont automatiquement repris sur la fiche profil lors de la première connexion.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
        <Input placeholder="Prénom" value={prenom} onChange={(e) => setPrenom(e.target.value)} className="w-32" />
        <Input placeholder="Nom" value={nom} onChange={(e) => setNom(e.target.value)} className="w-32" />
        <Input type="email" required placeholder="prenom@kiwee-energie.fr" value={email} onChange={(e) => setEmail(e.target.value)} className="min-w-[220px] flex-1" />
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
            <li key={a.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                {(a.prenom || a.nom) && (
                  <p className="font-medium text-navy-800">{a.prenom} {a.nom}</p>
                )}
                <EmailLink value={a.email} className="text-navy-700" />
              </div>
              <button
                type="button"
                onClick={() => removeEmail.mutate(a.id)}
                className="text-navy-400 hover:text-red-600"
                aria-label={`Retirer ${a.email}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
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
          <PageHeader title="Administration" description="Gestion des utilisateurs, rôles et permissions de KiWee OS." />
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
              {tab === 'utilisateurs' ? 'Utilisateurs' : tab === 'permissions' ? 'Matrice des permissions par rôle' : 'Emails autorisés à créer un compte'}
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
