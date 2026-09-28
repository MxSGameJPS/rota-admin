import { getCareerOperationsOverview } from '@/services/careerOperationsService';
import styles from '@/app/section.module.css';

const labels = {
  ESTAGIARIO: 'Estagiário',
  ESTAGIARIO_SENIOR: 'Estagiário sênior',
  ADVOGADO_CONTRATADO: 'Advogado contratado',
  ADVOGADO_SENIOR: 'Advogado sênior',
  SOCIO_ESCRITORIO: 'Sócio',
  DONO_ESCRITORIO: 'Dono de escritório',
  MAGISTRADO_SUBSTITUTO: 'Juiz substituto',
  JUIZ_TITULAR: 'Juiz titular',
  DESEMBARGADOR: 'Desembargador',
  PROMOTOR_SUBSTITUTO: 'Promotor substituto',
  PROMOTOR_JUSTICA: 'Promotor de Justiça',
  PROCURADOR_JUSTICA: 'Procurador de Justiça',
  MINISTRO_STF: 'Ministro do STF',
};

function jsonSummary(value) {
  if (!value || typeof value !== 'object') return '—';
  return JSON.stringify(value);
}

export default async function CareersPage() {
  let overview = null;
  let loadError = null;
  try { overview = await getCareerOperationsOverview(); } catch (error) { loadError = error.message; }

  return <div className={styles.page}>
    <div className={styles.header}><div><h2>Carreiras & Ato 3</h2><p>Diagnóstico operacional das carreiras dos jogadores e dos módulos persistentes de ascensão profissional. Esta tela é de observação: alterações de save devem usar operações server-authoritative dedicadas, nunca edição livre do navegador.</p></div></div>
    {loadError && <div className={styles.error}>{loadError}</div>}

    {overview && <>
      <section className={styles.panel}>
        <h3>Distribuição de carreiras</h3>
        <div className={styles.cards}>
          {Object.entries(overview.stages).map(([stage, count]) => <article className={styles.card} key={stage}><h4>{labels[stage] || stage}</h4><p>{count} carreira(s) entre as 100 atualizadas mais recentemente.</p></article>)}
        </div>
      </section>

      <section className={styles.panel}>
        <h3>Saúde dos módulos do Ato 3</h3>
        <p>Se uma tabela aparecer como indisponível, o banco conectado ao Admin ainda não recebeu a migration correspondente do jogo.</p>
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Módulo</th><th>Registros</th><th>Estado</th></tr></thead><tbody>
          {Object.entries(overview.modules).map(([name, info]) => <tr key={name}><td><strong>{name}</strong></td><td>{info.error ? '—' : info.count}</td><td>{info.error ? info.error : 'Disponível'}</td></tr>)}
        </tbody></table></div>
      </section>

      <section className={styles.panel}>
        <h3>Carreiras recentes</h3>
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Carreira</th><th>Tier</th><th>Reputação</th><th>Prestígio</th><th>Carreira pública</th><th>Acadêmico</th></tr></thead><tbody>
          {overview.careers.map(career => <tr key={career.id}>
            <td><code>{career.id}</code></td>
            <td>{labels[career.career_stage] || career.career_stage || '—'}</td>
            <td>{career.reputation ?? '—'}</td>
            <td><code>{jsonSummary(career.legal_prestige)}</code></td>
            <td><code>{jsonSummary(career.public_service_career)}</code></td>
            <td><code>{jsonSummary(career.academic_career)}</code></td>
          </tr>)}
        </tbody></table></div>
      </section>
    </>}
  </div>;
}
