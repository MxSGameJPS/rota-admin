# Rota Admin

Game Master / CMS local do **Rota da Justiça**.

Este projeto **não deve ser publicado na Vercel**. Ele foi desenhado para rodar somente na máquina do administrador em `127.0.0.1:3001` e conversar diretamente com o Supabase do Rota da Justiça.

## O que administra

- Casos jurídicos
- NPCs persistentes
- Memórias-base, diálogos e regras de decisão dos NPCs
- Economia e moedas
- Recompensas
- Loja, skins e itens
- Progressão/configurações
- Features do Social Jurídico In-Game
- Conteúdo gerado por IA com validação por schema
- Draft → revisão → publicação
- Versionamento e auditoria

## Segurança

A `SUPABASE_SERVICE_ROLE_KEY` existe somente no servidor local do Next.js. Nunca use prefixo `NEXT_PUBLIC_` e nunca coloque a chave no navegador, no jogo ou em commits.

O servidor de desenvolvimento está preso a `127.0.0.1`, não a `0.0.0.0`.

> Recomenda-se manter este repositório privado.

## Instalação

```bash
npm install
cp .env.example .env.local
```

Preencha:

```env
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxxxx
```

Depois:

```bash
npm run dev
```

Abra:

```text
http://127.0.0.1:3001
```

## IA / OmniRoute / outros providers

A configuração de IA não fica mais no `.env.local`. Abra no painel:

```text
Configurações de IA
```

O Admin suporta:

- API compatível com OpenAI
- OmniRoute local
- Ollama local
- Endpoint REST personalizado

Para OmniRoute existe um preset com:

```text
http://localhost:20128/v1
/chat/completions
```

O painel permite salvar o provedor, consultar `/models`, escolher o modelo e testar a conexão.

As chaves são armazenadas localmente em `data/ai-config/` usando AES-256-GCM. O arquivo criptografado e a chave local são ignorados pelo Git e nunca são devolvidos ao navegador.

O Admin continua sendo **schema-driven**:

```text
Prompt
  ↓
Provider padrão
  ↓
JSON Schema oficial do Rota
  ↓
Resposta JSON
  ↓
Validação Zod
  ↓
Draft
  ↓
Revisão manual
  ↓
Publicação
```

Se nenhum provider estiver configurado, o painel usa o gerador de template local como fallback. A IA nunca publica conteúdo diretamente.

## Banco do Rota

As migrations ficam no repositório `MxSGameJPS/rodadajusti-a`.

Para esta fase, aplicar depois das migrations anteriores:

```text
supabase/migrations/20260901040000_create_admin_universe.sql
supabase/migrations/20260901040100_add_reward_claims.sql
```

As Edge Functions server-authoritative também ficam no repositório do jogo:

```text
supabase/functions/resolve-npc-action
supabase/functions/purchase-item
supabase/functions/claim-reward
```

## Regra de arquitetura

```text
Rota Admin local
       ↓ service_role
Supabase Rota da Justiça
       ↓ published content / Edge Functions
Web • Android • Steam
```

Operações frequentes ou sensíveis não devem depender de rotas da Vercel.
