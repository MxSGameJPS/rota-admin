# Rota Admin → Game: repercussão, recursos e instâncias

Este documento é o contrato de publicação da tabela `public.cases` para repercussão e continuidade processual.

## Repercussão

`repercussion_level` aceita:

- `COMUM`: XP 1,00× e reputação adicional +0;
- `RELEVANTE`: XP 1,25× e reputação adicional +2;
- `GRANDE_REPERCUSSAO`: XP 1,75× e reputação adicional +6;
- `NACIONAL`: XP 2,50× e reputação adicional +10.

`xp_reward` e `reputation_reward` são valores-base publicados pelo Admin. O game aplica os modificadores de repercussão. `honorarios_reward` continua integralmente sob controle do Admin.

## Instância e tribunal

`procedural_stage` aceita `PRIMEIRA_INSTANCIA`, `SEGUNDA_INSTANCIA`, `STJ` e `STF`. `court_name` é opcional e guarda o nome humano do órgão julgador.

O game aplica os pisos de carreira:

- segunda instância: `ADVOGADO_CONTRATADO`;
- STJ/STF: `ADVOGADO_SENIOR`.

O requisito efetivo é sempre o maior entre esse piso e `min_career_tier`.

## Continuidade do mesmo processo

Uma fase recursal é outro registro em `public.cases`, mas não outro processo. Todas as fases compartilham `process_key`.

Uma continuação deve publicar:

- `process_key`: o mesmo da fase anterior;
- `appeal_of_case_id`: ID da fase imediatamente anterior;
- `appeal_type`: tipo do recurso;
- `appeal_trigger`: condição de liberação;
- `appeal_deadline_days`: prazo recursal simulado.

O banco impede que uma continuação utilize `process_key` diferente do processo anterior.

## Gatilhos

- `PLAYER_LOSS`: o jogador sofreu decisão desfavorável e pode recorrer;
- `PLAYER_WIN_OPPONENT_APPEALS`: o jogador venceu e a parte contrária interpôs o recurso;
- `ANY_RESULT`: continuação administrativa/especial independente do resultado; uso excepcional.

## Tipos de recurso

`APELACAO`, `AGRAVO_INSTRUMENTO`, `AGRAVO_INTERNO`, `RECURSO_ESPECIAL`, `RECURSO_EXTRAORDINARIO`, `AGRAVO_RECURSO_ESPECIAL`, `AGRAVO_RECURSO_EXTRAORDINARIO` e `OUTRO`.

## Comportamento do gerador

O gerador consulta o acervo de fases já existentes antes de criar um caso. Quando o prompt referencia uma fase anterior, o Admin resolve o ID e o `process_key`, interpreta repercussão, instância, tipo de recurso e gatilho, e reconcilia esses dados antes da persistência.

Exemplo de caso originário:

```json
{
  "difficulty": "Intermediário",
  "minCareerTier": "ADVOGADO_CONTRATADO",
  "repercussionLevel": "GRANDE_REPERCUSSAO",
  "proceduralStage": "PRIMEIRA_INSTANCIA"
}
```

Exemplo de continuação:

```json
{
  "processKey": "PROC_CONSUMIDOR_BIGTECH",
  "proceduralStage": "SEGUNDA_INSTANCIA",
  "appealOfCaseId": "CONSUMIDOR_BIGTECH_01",
  "appealType": "APELACAO",
  "appealTrigger": "PLAYER_LOSS",
  "appealDeadlineDays": 15,
  "minCareerTier": "ADVOGADO_CONTRATADO"
}
```

A migração correspondente está em `docs/cases-process-contract.sql`.
