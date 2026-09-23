# Produtos de vida cotidiana no Rota Admin

O catálogo de estabelecimentos alimenta diretamente a vida cotidiana do jogador.

## Tipos principais

- `MERCADO`: supermercado;
- `LOJA_MOVEIS`: móveis e itens da casa;
- `LOJA_VEICULOS` / `CONCESSIONARIA`: compra de veículos;
- `RESTAURANTE`: refeições;
- `HOTEL` / `POUSADA`: hospedagem.

## Como cadastrar um produto

Abra o estabelecimento e use **Produtos, ofertas e serviços jogáveis**.

Preencha título, descrição, preço e tipo de gameplay.

Depois de criar o item, importe sua imagem em PNG, JPG ou WebP. A imagem é armazenada no bucket `establishment-media` e aparece na vitrine do mapa.

### FOOD

Use em supermercados.

- `foodUnits`: quantas refeições/unidades de despensa a compra adiciona.

Exemplo: cesta básica, JR$ 120, foodUnits 8.

### BED

Use em lojas de móveis.

- furnitureKind: `BED`;
- energyBonus: energia extra após dormir;
- comfortBonus: conforto adicional.

### FURNITURE

Móvel geral. Informe furnitureKind e bônus quando fizer sentido.

### STUDY_FURNITURE

Mesa, cadeira ou conjunto de estudos.

- furnitureKind: normalmente `DESK` ou `CHAIR`;
- studyBonus: melhora a recuperação da rotina de estudos.

### VEHICLE

Use em loja de veículos ou concessionária. O item comprado entra no patrimônio do personagem.

### MEAL

Use em restaurante/lanchonete.

- hungerRestore: recuperação da saciedade após a refeição.

## Imagens

O produto aceita upload manual mesmo que o estabelecimento seja real, fictício ou patrocinado. Para empresas reais, use somente material autorizado.

## Migration necessária

Se o banco já possuía o módulo de estabelecimentos antes da loja de móveis, aplique:

`docs/establishments-life-products.sql`
