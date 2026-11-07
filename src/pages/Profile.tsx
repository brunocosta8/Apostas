import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth, useMe } from '../auth'
import { useProfiles, useUpdateDisplayName } from '../lib/api'
import { Avatar, Button, Card, ErrorBox, Field, SubHeader, inputClass } from '../components/ui'
import { NotificationSettings } from '../components/Notifications'

export function ProfilePage() {
  const { me, isAdmin } = useMe()
  const { signOut, refresh } = useAuth()
  const { byId } = useProfiles()
  const update = useUpdateDisplayName()
  const current = byId.get(me.id) ?? me
  const [name, setName] = useState(current.display_name)

  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
  const standalone = window.matchMedia('(display-mode: standalone)').matches

  return (
    <>
      <SubHeader title="Perfil" />
      <div className="pitch mb-4 rounded-xl p-4 text-white">
        <div className="flex items-center gap-4">
          <Avatar profile={current} size={64} ring />
          <div className="min-w-0">
            <h1 className="truncate font-display text-3xl font-extrabold uppercase italic leading-none">{current.display_name}</h1>
            <div className="mt-1 truncate text-sm text-white/70">{me.email}</div>
            {isAdmin && <span className="mt-1.5 inline-block rounded-md bg-volt px-2 py-0.5 font-display text-xs font-bold uppercase text-ink">Admin</span>}
          </div>
        </div>
      </div>

      <Card className="mb-4 space-y-3">
        <Field label="Nome a mostrar">
          <input className={inputClass} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </Field>
        <ErrorBox error={update.error} />
        <Button variant="secondary" className="w-full" loading={update.isPending}
          disabled={!name.trim() || name.trim() === current.display_name}
          onClick={() => update.mutate({ id: me.id, name: name.trim() }, { onSuccess: () => void refresh() })}>
          Guardar nome
        </Button>
      </Card>

      <NotificationSettings userId={me.id} />

      {!standalone && (
        <Card className="mb-4 border-l-[6px] border-volt text-sm text-ink/75">
          <h2 className="mb-1 text-base font-bold text-ink">📲 Instalar no telemóvel</h2>
          {isIOS ? (
            <p>No Safari, toca em <b>Partilhar</b> (o quadrado com a seta) e depois em <b>Adicionar ao ecrã principal</b>.
              É necessário para receber notificações no iPhone.</p>
          ) : (
            <p>No Chrome, abre o menu <b>⋮</b> e escolhe <b>Instalar app</b> (ou <b>Adicionar ao ecrã principal</b>).</p>
          )}
        </Card>
      )}

      <div className="space-y-3">
        {isAdmin && <Link to="/admin" className="block"><Button variant="secondary" className="w-full">Gerir membros</Button></Link>}
        <Button variant="ghost" className="w-full" onClick={() => void signOut()}>Terminar sessão</Button>
      </div>
    </>
  )
}
