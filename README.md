# Apostas entre Amigos

PWA para um grupo fixo de amigos registar apostas entre si. Alguém cria uma aposta, os outros entram, o criador marca o resultado e a app calcula quem deve quanto a quem.

> **A app só regista.** Não processa pagamentos: pagam fora (ex.: MB WAY) e depois marcam a dívida como paga.

## Estado

| Fase | Conteúdo | Estado |
|---|---|---|
| 0 | Projeto, PWA, login Google, lista de membros, admin | ✅ |
| 1 | Aposta 1 contra 1 (criar, aceitar, fechar, resolver, desfazer, cancelar), saldos, "quem deve a quem", marcar como pago, histórico | ✅ |
| 2 | Modos aberta a vários, com odds e escolha múltipla; cotas e boletim | ✅ |
| 3 | Notificações push + aviso "a fechar em breve" | ⏳ |

## Stack

- **Frontend:** React + TypeScript + Vite, Tailwind CSS, `vite-plugin-pwa` (instalável em Android e iPhone).
- **Backend:** [Supabase](https://supabase.com) (Postgres, Auth com Google, Realtime, pg_cron).
- **Alojamento:** Vercel (ou outro alojamento estático: Cloudflare Pages, Netlify…).
- **Testes:** Vitest (cálculos) + testes SQL das regras de segurança.

### Porquê Supabase

- Dados relacionais (apostas, opções, entradas, pagamentos), com regras de segurança em SQL (Row Level Security).
- Todas as ações (entrar, fechar, resolver, cancelar, pagar) são funções no Postgres que validam autor, estado e prazos numa só transação. O cliente **não pode escrever diretamente** nas tabelas.
- Tudo o que precisamos está no plano gratuito, incluindo tarefas agendadas (pg_cron). No Firebase, enviar push ou fechar apostas automaticamente exigiria Cloud Functions, que obrigam ao plano Blaze com cartão de crédito.

### Limitações do plano gratuito

- **O projeto é pausado após 7 dias sem atividade.** A GitHub Action `keepalive.yml` faz um pedido de 3 em 3 dias para o evitar (ver passo 7). Se mesmo assim for pausado, reativa-se no painel do Supabase sem perder dados.
- 500 MB de base de dados e 50 000 utilizadores ativos por mês, muito acima do que um grupo de amigos usa.
- Notificações push (Fase 3) via Web Push/VAPID, **sem custos**. No iPhone exigem iOS 16.4+ e a app adicionada ao ecrã principal. É uma limitação da Apple.

## Regras do jogo

- Valores em euros, guardados em cêntimos. **Não há valor mínimo** (a partir de 0,01 €).
- O criador participa sempre na aposta que cria.
- **1 contra 1:** uma única pessoa aceita o lado contrário com o mesmo valor. O vencedor ganha o valor do outro.
- **Aberta a vários / escolha múltipla:** cada pessoa entra numa opção com o valor que quiser. Os vencedores dividem o pote total proporcionalmente ao que apostaram, arredondado ao cêntimo pelo método do maior resto, para que a soma dê sempre certo.
- **Odds X:Y:** o criador põe X por cada Y de quem aceita. Uma só pessoa aceita, com o valor arredondado ao cêntimo (ex.: 1 € a 3:1 → 0,33 €). Quem ganhar fica com o pote todo.
- Uma entrada por pessoa por aposta, e não se pode sair depois de entrar.
- **Casos-limite:**
  - Fecha sem ninguém do outro lado → **anulada** automaticamente.
  - Ninguém acertou → **anulada**, todos recuperam o que apostaram.
  - Empate → o criador marca "Empate / sem vencedor" → **anulada**.
  - Data de resolução ultrapassada → só aviso visual.
- O criador pode **fechar as entradas antes do prazo**, **desfazer o resultado** e **cancelar** a aposta a qualquer momento. Um admin também pode desfazer e cancelar.
- **Marcar como pago:** qualquer uma das duas partes (quem paga ou quem recebe) pode registar e apagar o pagamento. Pode ser parcial.
- **"Quem deve a quem"** é calculado a partir dos saldos líquidos, minimizando transferências: no máximo n−1.
- Remover alguém da lista de membros tira-lhe o acesso, mas mantém o histórico e as dívidas.

## Estrutura

```
src/
  lib/settlement.ts      cálculos (ganhos, saldos, simplificação de dívidas)
  lib/settlement.test.ts testes unitários de todos os modos
  lib/api.ts             leitura de dados e chamadas às funções do Supabase
  pages/                 ecrãs (Início, Boletins, Criar, Detalhe, Saldos, Perfil, Admin)
  sw.ts                  service worker (cache offline; push na Fase 3)
supabase/
  migrations/            esquema, regras de segurança, funções, cron
  tests/                 testes SQL (correm num Postgres normal)
```

---

## Configuração e deploy (passo a passo)

### 1. Criar o projeto Supabase

1. Cria uma conta em <https://supabase.com> e um projeto novo (região sugerida: *West EU (Ireland)* ou *Central EU (Frankfurt)*).
2. Em **Project Settings → API**, guarda:
   - **Project URL** (ex.: `https://abcd1234.supabase.co`)
   - **anon / publishable key**

### 2. Criar as tabelas e regras

**Opção A, painel:** abre o **SQL Editor** e corre o conteúdo de cada ficheiro de `supabase/migrations/`, **por ordem**:

1. `20261107000000_init.sql`
2. `20261107000100_cron.sql`
3. `20261107000200_realtime.sql`
4. `20261107000300_ping.sql`

**Opção B, Supabase CLI:**

```bash
npx supabase login
```

```bash
npx supabase link --project-ref <ref-do-projeto>
```

```bash
npx supabase db push
```

> Não corras os ficheiros de `supabase/tests/` no Supabase: são só para testes locais.

### 3. Tornar-te admin

No **SQL Editor**, com o teu email Google:

```sql
insert into public.allowed_emails (email, is_admin) values ('o-teu-email@gmail.com', true);
```

Os restantes amigos adicionas depois na própria app (**Perfil → Gerir membros**).

### 4. Login com Google

1. Vai à [Google Cloud Console](https://console.cloud.google.com/), cria um projeto (ex.: "Apostas").
2. **APIs e serviços → Ecrã de consentimento OAuth** (ou *Google Auth Platform*):
   - Tipo **Externo**, nome da app, o teu email de suporte.
   - Âmbitos: só os básicos (`email`, `profile`, `openid`). Assim não é preciso verificação da Google.
   - Em **Público-alvo**, carrega em **Publicar app**. Em alternativa, deixa em *Teste* e adiciona os emails dos amigos como utilizadores de teste.
3. **Credenciais → Criar credenciais → ID de cliente OAuth → Aplicação Web**:
   - **Origens JavaScript autorizadas:** o URL da app (ex.: `https://apostas.vercel.app`) e `http://localhost:5173`.
   - **URIs de redirecionamento autorizados:** `https://<ref-do-projeto>.supabase.co/auth/v1/callback`.
4. Copia o **Client ID** e o **Client secret**.
5. No Supabase: **Authentication → Sign In / Providers → Google**. Ativa, cola o Client ID e o secret e guarda.
6. No Supabase: **Authentication → URL Configuration**:
   - **Site URL:** o URL da app (ex.: `https://apostas.vercel.app`).
   - **Redirect URLs:** adiciona o mesmo URL e `http://localhost:5173`.

> Qualquer pessoa com conta Google consegue autenticar-se, mas quem não estiver em `allowed_emails` vê o ecrã "Sem acesso" e o servidor recusa-lhe todos os dados.

### 5. Deploy na Vercel

1. Em <https://vercel.com>, **Add New → Project** e importa este repositório do GitHub.
2. Framework: **Vite** (detetado automaticamente). Build: `npm run build`. Output: `dist`.
3. Em **Environment Variables**, adiciona:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon key
4. **Deploy.** Cada `git push` para `main` volta a publicar a app.
5. Confirma que o URL final está nos passos 4.3 e 4.6.

O `vercel.json` já encaminha todas as rotas para o `index.html` (necessário para a SPA).

### 6. Instalar no telemóvel

- **Android (Chrome):** menu ⋮ → **Instalar app**.
- **iPhone (Safari):** Partilhar → **Adicionar ao ecrã principal**.

### 7. (Recomendado) Evitar a pausa do Supabase

No GitHub: **Settings → Secrets and variables → Actions → New repository secret**:

- `SUPABASE_URL` = Project URL
- `SUPABASE_ANON_KEY` = anon key

A Action **Manter Supabase ativo** corre de 3 em 3 dias. Também a podes correr à mão no separador *Actions*.

---

## Desenvolvimento local

```bash
npm install
```

```bash
cp .env.example .env.local
```

Preenche o `.env.local` com o URL e a chave do Supabase e arranca:

```bash
npm run dev
```

A app abre em <http://localhost:5173>.

### Testes

Cálculos (todos os modos):

```bash
npm test
```

Regras de segurança e funções SQL (precisa de um Postgres 16 local; usa as variáveis `PGHOST`, `PGUSER`, `PGPASSWORD`):

```bash
npm run test:db
```

Os dois correm automaticamente no GitHub Actions (`.github/workflows/ci.yml`) a cada push.
