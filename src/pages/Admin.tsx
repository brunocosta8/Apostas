import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useMe } from '../auth'
import { useAddAllowedEmail, useAllowedEmails, useProfiles, useRemoveAllowedEmail, useSetAdmin } from '../lib/api'
import { Avatar, Badge, Button, Card, ErrorBox, Hero, inputClass, Loading } from '../components/ui'

export function Admin() {
  const { me, isAdmin } = useMe()
  const list = useAllowedEmails()
  const { data: profiles } = useProfiles()
  const add = useAddAllowedEmail()
  const setAdmin = useSetAdmin()
  const remove = useRemoveAllowedEmail()
  const [email, setEmail] = useState('')

  if (!isAdmin) return <Navigate to="/" replace />
  if (list.isPending) return <><Hero back="/perfil" title="Membros" /><Loading /></>

  const profileByEmail = new Map((profiles ?? []).map((p) => [p.email.toLowerCase(), p]))

  function submit(ev: FormEvent) {
    ev.preventDefault()
    const e = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return
    add.mutate({ email: e, isAdmin: false }, { onSuccess: () => setEmail('') })
  }

  return (
    <>
      <Hero back="/perfil" title="Membros">
        <p className="mt-2 text-sm text-white/75">Só estas contas Google podem entrar. Remover alguém tira-lhe o acesso, mas mantém o histórico e as dívidas.</p>
      </Hero>

      <form onSubmit={submit} className="mb-4 flex gap-2">
        <input className={inputClass} type="email" placeholder="email@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" loading={add.isPending}>Adicionar</Button>
      </form>
      <ErrorBox error={add.error ?? setAdmin.error ?? remove.error ?? list.error} />

      <div className="mt-4 space-y-2">
        {list.data?.map((row) => {
          const p = profileByEmail.get(row.email)
          const isMe = row.email === me.email.toLowerCase()
          return (
            <Card key={row.email} className="flex items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar profile={p} size={30} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{p?.display_name ?? row.email}</div>
                  <div className="truncate text-xs text-ink/50">{p ? row.email : 'ainda não entrou'}</div>
                </div>
                {row.is_admin && <Badge tone="volt">admin</Badge>}
              </div>
              {!isMe && (
                <div className="flex shrink-0 gap-1">
                  <button className="rounded-lg px-2 py-1 text-xs font-semibold text-pitch-700 hover:bg-pitch-50"
                    onClick={() => setAdmin.mutate({ email: row.email, isAdmin: !row.is_admin })}>
                    {row.is_admin ? 'Tirar admin' : 'Tornar admin'}
                  </button>
                  <button className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                    onClick={() => { if (confirm(`Remover ${row.email}?`)) remove.mutate(row.email) }}>
                    Remover
                  </button>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </>
  )
}
