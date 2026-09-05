# Mundo reativo específico por caso

O `rota-admin` pode gerar, com IA, intercorrências e uma audiência próprias para cada caso.

A configuração fica em `cases.metadata.reactiveWorld`, portanto não exige migration nova. O conteúdo principal do caso continua em `cases.content`.

## Fluxo

1. Abra um caso no Admin.
2. Use o painel **Mundo reativo específico do caso**.
3. Opcionalmente informe uma orientação narrativa.
4. Clique em **Gerar intercorrências e audiência com IA**.
5. O Admin valida IDs de pistas e estrutura antes de salvar.
6. Casos publicados recebem snapshot da versão anterior em `content_versions` antes da atualização.
7. O jogo lê `metadata.reactiveWorld` e prioriza esse conteúdo. Se não houver configuração válida, usa os modelos genéricos existentes.

## Estrutura

- `events`: 1 a 5 intercorrências específicas.
- cada evento tem gatilho por quantidade de ações e, opcionalmente, porcentagem do prazo consumido.
- cada escolha pode alterar preparação, prazo e risco profissional.
- `hearing`: audiência opcional com 2 a 6 etapas.
- cada etapa possui falas e decisões próprias do processo.
- `relatedClueId` só aceita IDs de pistas existentes no caso.

Não existe migration associada a esta funcionalidade porque o campo `metadata` já é JSONB e faz parte da tabela `cases` atual.
