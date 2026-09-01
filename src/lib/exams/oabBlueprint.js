export const OAB_46_SCOPE = [
  ...Array.from({ length: 8 }, (_, i) => ({ number: i + 1, area: 'Ética Profissional e Estatuto da OAB' })),
  { number: 9, area: 'Filosofia do Direito' }, { number: 10, area: 'Filosofia do Direito' },
  ...Array.from({ length: 6 }, (_, i) => ({ number: i + 11, area: 'Direito Constitucional' })),
  { number: 17, area: 'Direitos Humanos' }, { number: 18, area: 'Direitos Humanos' },
  { number: 19, area: 'Direito Eleitoral' }, { number: 20, area: 'Direito Eleitoral' },
  { number: 21, area: 'Direito Internacional' }, { number: 22, area: 'Direito Internacional' },
  { number: 23, area: 'Direito Financeiro' }, { number: 24, area: 'Direito Financeiro' },
  ...Array.from({ length: 5 }, (_, i) => ({ number: i + 25, area: 'Direito Tributário' })),
  ...Array.from({ length: 5 }, (_, i) => ({ number: i + 30, area: 'Direito Administrativo' })),
  { number: 35, area: 'Direito Ambiental' }, { number: 36, area: 'Direito Ambiental' },
  ...Array.from({ length: 6 }, (_, i) => ({ number: i + 37, area: 'Direito Civil' })),
  { number: 43, area: 'Direito da Criança e do Adolescente' }, { number: 44, area: 'Direito da Criança e do Adolescente' },
  { number: 45, area: 'Direito do Consumidor' }, { number: 46, area: 'Direito do Consumidor' },
  ...Array.from({ length: 4 }, (_, i) => ({ number: i + 47, area: 'Direito Empresarial' })),
  ...Array.from({ length: 6 }, (_, i) => ({ number: i + 51, area: 'Direito Processual Civil' })),
  ...Array.from({ length: 5 }, (_, i) => ({ number: i + 57, area: 'Direito Penal' })),
  ...Array.from({ length: 7 }, (_, i) => ({ number: i + 62, area: 'Direito Processual Penal' })),
  { number: 69, area: 'Direito Previdenciário' }, { number: 70, area: 'Direito Previdenciário' },
  ...Array.from({ length: 6 }, (_, i) => ({ number: i + 71, area: 'Direito do Trabalho' })),
  ...Array.from({ length: 4 }, (_, i) => ({ number: i + 77, area: 'Direito Processual do Trabalho' })),
];

export const OAB_46_SCOPE_SUMMARY = Object.entries(
  OAB_46_SCOPE.reduce((acc, item) => ({ ...acc, [item.area]: (acc[item.area] || 0) + 1 }), {})
).map(([area, count]) => ({ area, count }));

export function getOabScopeBatch(start, size = 10) {
  return OAB_46_SCOPE.filter((item) => item.number >= start && item.number < start + size);
}
