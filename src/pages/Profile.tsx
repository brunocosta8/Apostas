import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth, useMe } from '../auth'
import { useProfiles, useUpdateDisplayName } from '../lib/api'
import { Avatar, Button, Card, ErrorBox, Field, inputClass, PageTitle } from '../components/ui'

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
      <PageTitle>Perfil</PageTitle>
      <Card className="mb-4 flex items-center gap-3">
        <Avatar profile={current} size={52} />
        <div className="min-w-0">
          <div className="truncate font-semibold text-white">{current.display_name}</div>
          <div className="truncate text-sm text-slate-400">{me.email}</div>
        </div>
      </Card>

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

      {!standalone && (
        <Card className="mb-4 text-sm text-slate-300">
          <h2 className="mb-2 font-semibold text-white">Instalar no telemóvel</h2>
          {isIOS ? (
            <p>No Safari, toca em <b>Partilhar</b> (o quadrado com a seta) e depois em <b>Adicionar ao ecrã principal</b>.
              É necessário para receber notificações no iPhone.</p>
          ) : (
            <p>No Chrome, abre o menu <b>⋮</b> e escolhe <b>Instalar app</b> (ou <b>Adicionar ao ecrã principal</b>).</p>
          )}
        </Card>
      )}

      <div className="space-y-3">
        {isAdmin && <Link to="/admin" className="block"><Button variant="secondary" className="w-full">Gerir membros (admin)</Button></Link>}
        <Button variant="ghost" className="w-full" onClick={() => void signOut()}>Terminar sessão</Button>
      </div>
    </>
  )
}
