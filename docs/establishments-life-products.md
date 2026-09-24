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


## Efeitos avançados da Casa V1

O jogo agora interpreta os produtos de supermercado e itens domésticos de forma individual.

### FOOD — alimentos da despensa

Campos adicionais:

- `foodUnits`: quantidade adicionada ao estoque;
- `hungerRestore`: saciedade recuperada ao consumir uma unidade;
- `energyRestore`: energia adicional da refeição;
- `mealType`: `ANY`, `BREAKFAST`, `LUNCH_DINNER` ou `SNACK`;
- `requiresCooking`: se marcado, o item depende de gás ativo em casa.

Exemplos:

- pão + café: breakfast, 2 unidades, hungerRestore 30, energyRestore 8, requiresCooking false;
- arroz + feijão: lunch_dinner, 4 unidades, hungerRestore 55, energyRestore 5, requiresCooking true;
- lanche pronto: snack, 1 unidade, hungerRestore 28, energyRestore 3, requiresCooking false.

### APPLIANCE — eletrodomésticos

Use `APPLIANCE` para itens que alteram a rotina doméstica.

Campos:

- `hygieneBonus`: bônus ao tomar banho; exemplo: chuveiro melhor;
- `mealBonus`: bônus adicional de saciedade ao preparar refeições;
- `foodStorageBonus`: aumenta a capacidade máxima da despensa; exemplo: geladeira maior;
- `energyBonus`, `comfortBonus` e `studyBonus` continuam disponíveis quando fizer sentido.

Exemplos:

- geladeira simples: foodStorageBonus 8;
- geladeira premium: foodStorageBonus 20;
- chuveiro pressurizado: hygieneBonus 12;
- fogão melhor: mealBonus 8.

Esses efeitos ficam em `gameplay_effects`; nenhuma migration nova é necessária.
