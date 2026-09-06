import Link from 'next/link';
import StatusBadge from '@/components/StatusBadge/StatusBadge';
import {
  BUSINESS_TYPES,
  listCities,
  listEstablishments,
} from '@/services/establishmentService';
import {
  createCityAction,
  createManualEstablishmentAction,
  generateEstablishmentAction,
} from '@/app/actions/establishments';
import styles from '@/app/section.module.css';

const labels = {
  IMOBILIARIA: 'Imobiliária', HOTEL: 'Hotel', POUSADA: 'Pousada', LOCADORA: 'Locadora',
  CONCESSIONARIA: 'Concessionária', LOJA_VEICULOS: 'Loja de veículos', ESCRITORIO: 'Escritório',
  RESTAURANTE: 'Restaurante', FARMACIA: 'Farmácia', MERCADO: 'Mercado', POSTO: 'Posto',
  ACADEMIA: 'Academia', CLINICA: 'Clínica', BANCO: 'Banco', SHOPPING: 'Shopping', OUTRO: 'Outro',
};

export default async function EstablishmentsPage({ searchParams }) {
  const params = await searchParams;
  const [cities, establishments] = await Promise.all([listCities(), listEstablishments()]);

  return <div className={styles.page}>
    <div className={styles.header}>
      <div>
        <h2>Estabelecimentos</h2>
        <p>Construa o mundo comercial persistente de cada cidade. Hoje os locais podem ser fictícios e gerados por IA; no futuro, a mesma estrutura aceita empresas reais, patrocínios e inventário de publicidade in-game.</p>
      </div>
    </div>

    {params?.cityCreated && <div className={styles.notice}>Cidade cadastrada.</div>}
    {params?.archived && <div className={styles.notice}>Estabelecimento arquivado.</div>}
    {params?.error && <div className={styles.error}>{params.error}</div>}

    {cities.length === 0 && <div className={styles.warningList}>
      Nenhuma cidade encontrada. Se esta é a primeira configuração, aplique <strong>docs/establishments-world.sql</strong> no Supabase e cadastre a primeira cidade abaixo.
    </div>}

    <section className={styles.panel}>
      <h3>Cadastrar cidade</h3>
      <p>A cidade é a âncora do mundo persistente. Um mesmo estabelecimento nunca deve existir “solto” sem município.</p>
      <form className={styles.form} action={createCityAction}>
        <div className={styles.formGrid}>
          <input name="name" placeholder="Cidade — ex.: Barra do Piraí" required />
          <input name="stateCode" placeholder="UF — ex.: RJ" maxLength={2} required />
          <input name="stateName" placeholder="Estado — ex.: Rio de Janeiro" />
          <input name="region" placeholder="Região — ex.: Médio Paraíba" />
        </div>
        <button className={styles.primary}>Adicionar cidade</button>
      </form>
    </section>

    <section className={styles.panel}>
      <h3>Gerar estabelecimento com IA</h3>
      <p>A IA cria marca fictícia, identidade visual, endereço narrativo, serviços, preços iniciais e pontos de mídia. Depois você revisa tudo antes de publicar no game.</p>
      <form className={styles.form} action={generateEstablishmentAction}>
        <select name="cityId" required defaultValue="">
          <option value="" disabled>Escolha a cidade</option>
          {cities.map(city => <option key={city.id} value={city.id}>{city.name} / {city.state_code}</option>)}
        </select>
        <textarea name="prompt" required placeholder="Ex.: Crie uma imobiliária fictícia em Barra do Piraí/RJ, de porte médio, focada em locação de salas comerciais, escritórios e imóveis residenciais. Deve parecer uma empresa local confiável e ter espaço para banners dentro do jogo." />
        <button className={styles.primary} disabled={cities.length === 0}>Gerar estabelecimento em draft</button>
      </form>
    </section>

    <details className={styles.advancedDetails}>
      <summary>Criar manualmente / futura empresa patrocinadora</summary>
      <p>Use esta opção quando já souber a marca que deseja cadastrar. Ela começa como fictícia e pode ser convertida para patrocinada na tela de edição.</p>
      <form className={styles.form} action={createManualEstablishmentAction}>
        <div className={styles.formGrid}>
          <select name="cityId" required defaultValue="">
            <option value="" disabled>Escolha a cidade</option>
            {cities.map(city => <option key={city.id} value={city.id}>{city.name} / {city.state_code}</option>)}
          </select>
          <select name="businessType" required defaultValue="IMOBILIARIA">
            {BUSINESS_TYPES.map(type => <option key={type} value={type}>{labels[type] || type}</option>)}
          </select>
          <input name="name" placeholder="Nome do estabelecimento" required />
          <input name="slug" placeholder="Slug opcional" />
          <input name="district" placeholder="Bairro" />
        </div>
        <textarea name="description" placeholder="Descrição institucional e função no jogo" />
        <button className={styles.primary} disabled={cities.length === 0}>Criar draft manual</button>
      </form>
    </details>

    <section className={styles.panel}>
      <h3>Mundo comercial</h3>
      {establishments.length === 0 ? <div className={styles.empty}>Nenhum estabelecimento cadastrado.</div> : <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Estabelecimento</th><th>Cidade</th><th>Tipo</th><th>Modelo</th><th>Status</th><th>Versão</th></tr></thead>
          <tbody>{establishments.map(item => <tr key={item.id}>
            <td><Link href={`/establishments/${item.id}`}><strong>{item.name}</strong></Link><br/>{item.slug}</td>
            <td>{item.city?.name || '—'} / {item.city?.state_code || '—'}</td>
            <td>{labels[item.business_type] || item.business_type}<br/>{item.subcategory || ''}</td>
            <td>{item.is_sponsored ? 'Patrocinado' : item.is_fictional ? 'Fictício' : 'Real não patrocinado'}<br/>{item.game_use_type}</td>
            <td><StatusBadge status={item.status}/></td>
            <td>v{item.version || 1}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </div>;
}
