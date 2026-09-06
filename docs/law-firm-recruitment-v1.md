# Escritórios — Recruitment Contract V1

Contrato congelado entre Rota Admin e game para o mercado jurídico simulado.

## Responsabilidades

- **Rota Admin** cria/publica escritórios, cargos e a política `law_firms.recruitment`.
- **Game / Offer Engine** avalia cada carreira, cria propostas concretas e grava `career_law_firm_offers`.
- O Admin **não** cria propostas individuais para jogadores.
- O salário não pertence a `recruitment`: vem de `law_firm_roles` e é copiado como snapshot para `career_law_firm_offers.terms` quando a proposta nasce.

## Recruitment V1

```json
{
  "recruitmentSchemaVersion": 1,
  "internshipRecruitment": {
    "enabled": true,
    "roleCode": "ESTAGIARIO",
    "minimumReputation": 0,
    "minimumXp": 0,
    "minimumCasesSolved": 0,
    "minimumEthics": 0
  },
  "postOabOffer": {
    "enabled": true,
    "roleCode": "ADVOGADO_CONTRATADO",
    "minimumReputation": 20,
    "minimumXp": 0,
    "minimumCasesSolved": 0,
    "minimumEthics": 0,
    "requiredSpecialties": []
  },
  "continuity": {
    "enabled": true,
    "internshipPerformanceWeight": 70,
    "minimumPerformance": 50,
    "guaranteedPerformance": 80
  },
  "headhunting": {
    "enabled": true,
    "eligibleRoleCodes": ["ADVOGADO_CONTRATADO", "ADVOGADO_SENIOR"],
    "minimumReputation": 65,
    "minimumXp": 0,
    "minimumCasesSolved": 10,
    "minimumEthics": 0,
    "requiredSpecialties": [],
    "evaluationChance": 0.15,
    "cooldownGameDays": 90
  },
  "applications": {
    "enabled": true,
    "eligibleRoleCodes": ["ADVOGADO_CONTRATADO", "ADVOGADO_SENIOR"],
    "minimumReputation": 35,
    "minimumXp": 0,
    "minimumCasesSolved": 0,
    "minimumEthics": 0,
    "requiredSpecialties": [],
    "cooldownGameDays": 30
  },
  "postTermination": {
    "enabled": true,
    "eligibleRoleCodes": ["ADVOGADO_CONTRATADO"],
    "minimumReputation": 20,
    "minimumXp": 0,
    "minimumCasesSolved": 0,
    "minimumEthics": 0,
    "requiredSpecialties": [],
    "cooldownGameDays": 15
  }
}
```

## Semântica obrigatória

### Especialidades

`requiredSpecialties` contém **slugs canônicos existentes em `law_firms.specialties`**.

No V1 o match é sempre **ANY**:

- array vazio = sem requisito de especialidade;
- array com valores = o jogador precisa possuir pelo menos uma das especialidades.

### evaluationChance

A chance só é sorteada depois de todos os requisitos mínimos passarem.

```text
requisitos mínimos falharam -> chance 0
requisitos mínimos passaram -> aplicar evaluationChance
```

Uma rolagem aleatória nunca pode furar reputação, XP, casos, ética ou especialidade.

### Continuidade

`continuity` só pode usar histórico de estágio vinculado ao **mesmo `law_firm_id`**.

O Offer Engine recebe um `performance` final de 0 a 100 para o estágio naquele escritório. `internshipPerformanceWeight` pertence ao avaliador que compõe essa métrica de desempenho; a curva de oferta usa o `performance` final.

Regras:

```text
performance < minimumPerformance
=> 0% de chance

performance >= guaranteedPerformance
=> 100% / proposta garantida

minimumPerformance <= performance < guaranteedPerformance
=> interpolação linear
```

Fórmula da faixa intermediária:

```text
chance = (performance - minimumPerformance)
         / (guaranteedPerformance - minimumPerformance)
```

O resultado é limitado ao intervalo 0..1.

### Cooldown e idempotência

- `cooldownGameDays` deve ser medido em tempo do jogo, não em relógio real.
- O motor deve consultar propostas/histórico antes de gerar nova proposta.
- Rodar o mesmo evento duas vezes não pode criar duas propostas equivalentes.
- A migration V1 cria proteção adicional no PostgreSQL contra duas propostas `PENDING` para a mesma combinação `(career_id, law_firm_id, role_id, offer_type)`.

## offer_type oficiais V1

O game só deve criar estes valores:

- `POST_OAB` — oferta profissional após aprovação na OAB.
- `CONTINUITY` — permanência no mesmo escritório onde o jogador estagiou.
- `HEADHUNTING` — recrutamento espontâneo durante a carreira.
- `APPLICATION_APPROVED` — candidatura enviada pelo jogador e aprovada.
- `POST_TERMINATION` — oferta espontânea após desligamento de outro emprego.
- `COUNTEROFFER` — contraproposta do empregador atual.
- `RETURN` — convite de retorno de antigo escritório.

`INITIAL` e `RECRUITMENT` são legados e não fazem parte do contrato V1.

A constraint do Supabase atual precisa ser atualizada com `docs/law-firm-recruitment-v1.sql` antes do Offer Engine começar a gravar os novos tipos.

## Snapshot da proposta

Quando uma proposta concreta nasce, o game copia as condições atuais do `law_firm_roles` para `career_law_firm_offers.terms`.

Exemplo:

```json
{
  "salaryMonthlyJR": 6300,
  "weeklyHours": 40,
  "exclusiveDedication": false,
  "workRegime": "MIXED",
  "benefits": {
    "socialJuridico": {
      "included": true,
      "plan": "ENTERPRISE"
    }
  }
}
```

Alterações futuras no cargo não reescrevem propostas antigas.

## Regras do Rota Admin

- `recruitmentSchemaVersion` deve ser `1`.
- `roleCode` e `eligibleRoleCodes` são validados contra os cargos do mesmo escritório.
- `requiredSpecialties` é validado contra as especialidades do mesmo escritório.
- Escritório novo gerado pela IA já nasce no V1.
- Escritórios legados podem ser convertidos pelo editor visual e só são alterados quando o administrador salva.
- Draft novo não pode ser publicado enquanto a política armazenada não estiver no V1.
- Escritórios já publicados podem ter a política de recrutamento balanceada pelo Admin sem recriação do escritório.
