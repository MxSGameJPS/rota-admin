# Rota Admin → Game: cidades, estabelecimentos e publicidade

Este documento define o contrato do mundo comercial persistente do Rota da Justiça.

## Princípio

Estabelecimento não pertence a um caso. Ele existe permanentemente em uma cidade e pode ser reutilizado por economia, viagens, compra/locação de imóveis e veículos, hospedagem, missões, ambientação e publicidade.

Casos podem referenciar um estabelecimento publicado no futuro, mas nunca devem duplicar a identidade comercial dentro de `cases.content`.

## Tabelas

- `cities`: cidades disponíveis no universo;
- `establishments`: identidade do estabelecimento;
- `establishment_offers`: serviços/produtos jogáveis;
- `establishment_media`: logo, banner, fachada, interior e galeria;
- `establishment_ad_slots`: inventário de mídia/publicidade.

## Tipos de estabelecimento

`IMOBILIARIA`, `HOTEL`, `POUSADA`, `LOCADORA`, `CONCESSIONARIA`, `LOJA_VEICULOS`, `ESCRITORIO`, `RESTAURANTE`, `FARMACIA`, `MERCADO`, `POSTO`, `ACADEMIA`, `CLINICA`, `BANCO`, `SHOPPING`, `OUTRO`.

## Uso no game

- `MAP_ONLY`: presença visual/geográfica;
- `SERVICE_PROVIDER`: oferece ações econômicas;
- `VISITABLE`: pode ser visitado como cenário;
- `MIXED`: combina visita, serviços e mídia.

## Fictício x real x patrocinado

`is_fictional=true` significa que nome, identidade e ativos são parte fictícia do universo do jogo.

`is_fictional=false` deve ser usado somente quando o administrador possuir autorização para representar um estabelecimento real.

`is_sponsored=true` significa que existe uma relação comercial/patrocínio real. O campo exige `sponsor_name` e deve ser independente de `status`: uma empresa pode estar cadastrada como patrocinadora, mas só aparece no game quando estiver `published` e ativa.

A IA nunca deve converter automaticamente um estabelecimento em real ou patrocinado.

## Ofertas

Tipos aceitos:

- `ALUGUEL`;
- `VENDA`;
- `HOSPEDAGEM`;
- `LOCACAO_VEICULO`;
- `SERVICO`;
- `OUTRO`.

Periodicidade: `NONE`, `HOUR`, `DAY`, `MONTH`, `ONE_TIME`.

Exemplos:

- imobiliária → sala comercial por mês;
- hotel → diária executiva;
- locadora → veículo por dia;
- loja de veículos → compra em pagamento único.

`gameplay_effects` fica reservado para o game definir consequências futuras sem obrigar mudança de schema.

## Mídia

Tipos: `LOGO`, `BANNER_HORIZONTAL`, `BANNER_VERTICAL`, `FACADE`, `INTERIOR`, `GALLERY`, `PROMO`.

Origem:

- `AI`: criada pelo gerador do Admin;
- `UPLOAD`: asset cadastrado manualmente;
- `SPONSOR`: material oficial de anunciante/patrocinador.

O Admin salva mídia gerada no bucket `establishment-media` por padrão.

## Inventário publicitário

Tipos de slot:

- `BILLBOARD`;
- `INTERIOR`;
- `MAP_HIGHLIGHT`;
- `LOADING_BANNER`;
- `LISTING_SPOTLIGHT`;
- `FACADE_SIGN`.

Nesta versão o slot é somente inventário editorial. Campanhas, cobrança, métricas de impressão e contratos serão uma camada posterior.

## Publicação

O game deve consumir somente:

```text
status = published
is_active = true
```

As políticas RLS da migration já limitam leitura pública a esse conteúdo.

## Geração por IA

Exemplo de prompt:

> Crie uma imobiliária fictícia em Barra do Piraí/RJ, de porte médio, focada em locação de salas comerciais e imóveis residenciais.

O Admin deve gerar o estabelecimento como `draft`, `is_fictional=true` e `is_sponsored=false`, além de criar ofertas e slots publicitários coerentes.

Depois da geração, o administrador pode gerar logo, banner horizontal, fachada e interior individualmente antes de publicar.

## Evolução futura

A estrutura já permite adicionar posteriormente:

- campanhas e anunciantes;
- datas de vigência de patrocínio;
- preços por slot/impressão/período;
- métricas de exposição;
- reservas e contratos de locação;
- veículos e imóveis como inventários detalhados;
- ligação de casos/missões a estabelecimentos persistentes;
- coordenadas reais quando apropriado e autorizado.

A migration correspondente é `docs/establishments-world.sql`.
