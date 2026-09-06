import Link from 'next/link';
import GenerateDraftForm from '@/components/GenerateDraftForm/GenerateDraftForm';
import StatusBadge from '@/components/StatusBadge/StatusBadge';
import { generateLawFirmAction } from '@/app/actions/lawFirms';
import { listLawFirms } from '@/services/lawFirmService';
import styles from '@/app/section.module.css';

const marketLabels = { LOCAL: 'Local', REGIONAL: 'Regional', NATIONAL: 'Nacional', ELITE: 'Elite' };
const sizeLabels = { SMALL: 'Pequeno', MEDIUM: 'Médio', LARGE: 'Grande', MEGA: 'Mega escritório' };

export default async function LawFirmsPage({ searchParams }) {
  const query = await searchParams;
  let firms = [];
  let loadError = '';
  try { firms = await listLawFirms(); } catch (error) { loadError = error.message || 'Falha ao carregar escritórios.'; }

  return <div className={styles.page}>
    <div className={styles.header}>
      <div>
        <h2>Escritórios de advocacia</h2>
        <p>Crie empregadores persistentes do universo. A IA monta escritório, cargos e NPCs, gera retratos PNG com fundo transparente e deixa tudo em draft para revisão antes da publicação.</p>
      </div>
    </div>

    {query?.archived && <div className={styles.notice}>Escritório arquivado.</div>}
    {query?.error && <div className={styles.error}>{query.error}</div>}
    {loadError && <div className={styles.error}>{loadError}</div>}

    <section className={styles.panel}>
      <h3>Criar escritório completo com IA</h3>
      <p>Descreva em linguagem natural. Pessoas nomeadas no briefing viram NPCs persistentes; se o slug já existir, o Admin reutiliza o personagem em vez de duplicá-lo.</p>
      <GenerateDraftForm
        action={generateLawFirmAction}
        entityLabel="escritório"
        buttonLabel="Gerar escritório em draft"
        longRunning
        placeholder="Ex.: Crie o escritório Souza e Santos, com o sócio fundador Dr. Renato Souza e a secretária Roberta Salles. É um escritório regional, forte em Direito Civil e Empresarial, com cultura exigente mas formadora de jovens advogados."
      />
      <div className={styles.warningList}>
        Novos escritórios nunca são publicados automaticamente. NPCs novos recebem retrato PNG transparente validado pelo servidor antes de poderem ser publicados com o escritório.
      </div>
    </section>

    <section className={styles.panel}>
      <h3>Universo de escritórios</h3>
      {firms.length === 0 ? <div className={styles.empty}>Nenhum escritório encontrado. O módulo usa as tabelas law_firms, law_firm_roles e law_firm_members já aplicadas no Supabase.</div> : <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Escritório</th><th>Mercado</th><th>Prestígio</th><th>Equipe</th><th>Status</th></tr></thead>
          <tbody>{firms.map((firm) => <tr key={firm.id}>
            <td><Link href={`/law-firms/${firm.id}`}><strong>{firm.name}</strong></Link><br/>{firm.slug}</td>
            <td>{marketLabels[firm.market_tier] || firm.market_tier}<br/>{sizeLabels[firm.size_category] || firm.size_category}</td>
            <td>{firm.prestige}/100<br/>Reputação {firm.public_reputation}/100</td>
            <td>{firm.member_count} membros<br/>{firm.role_count} cargos</td>
            <td><StatusBadge status={firm.status}/></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </div>;
}
