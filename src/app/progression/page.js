import { listSettings } from '@/services/adminRepository';
import { listExamBlueprints, listSpecialCareerDefinitions } from '@/services/progressionService';
import { saveSettingAction } from '@/app/actions/content';
import styles from '@/app/section.module.css';

export default async function ProgressionPage({ searchParams }) {
  const params = await searchParams;
  let settings = []; let blueprints = []; let specialCareers = []; let loadError = null;
  try {
    [settings, blueprints, specialCareers] = await Promise.all([
      listSettings(),
      listExamBlueprints(),
      listSpecialCareerDefinitions(),
    ]);
  } catch (error) { loadError = error.message; }

  return <div className={styles.page}>
    <div className={styles.header}><div><h2>Progressão & Configurações</h2><p>Fonte administrativa das regras de carreira, níveis acadêmicos, concursos e convites especiais.</p></div></div>
    {params?.saved && <div className={styles.notice}>Configuração publicada.</div>}
    {(params?.error || loadError) && <div className={styles.error}>{params?.error || loadError}</div>}

    <section className={styles.panel}>
      <h3>Estrutura atual</h3>
      <p><strong>Estágio:</strong> 2 níveis. <strong>Advocacia:</strong> carreira contratada, sênior, sociedade e escritório próprio. <strong>Academia:</strong> Mestrado e Doutorado com 5 níveis. <strong>Magistratura:</strong> Juiz Substituto → Juiz Titular → Desembargador. <strong>Ministério Público:</strong> Promotor Substituto → Promotor de Justiça → Procurador de Justiça.</p>
    </section>

    <section className={styles.panel}>
      <h3>Blueprints de exames</h3>
      {blueprints.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Tipo</th><th>Questões</th><th>Níveis</th><th>Elegibilidade</th></tr></thead><tbody>{blueprints.map(item => <tr key={item.id}><td><strong>{item.title}</strong><br/><small>{item.id}</small></td><td>{item.question_count}</td><td>{item.max_target_level ? `1–${item.max_target_level}` : '—'}</td><td><code>{JSON.stringify(item.eligibility_rules)}</code></td></tr>)}</tbody></table></div> : <div className={styles.empty}>Aplique a migration de progressão avançada para visualizar os blueprints.</div>}
    </section>

    <section className={styles.panel}>
      <h3>Definições especiais legadas</h3>
      <p>Estas linhas vêm de special_career_definitions e permanecem visíveis para auditoria. Não substituem o motor atual de concursos e progressão pública; regras antigas devem ser revisadas antes de serem usadas pelo jogo.</p>
      {specialCareers.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Cargo</th><th>Mestrado</th><th>Doutorado</th><th>Reputação</th><th>Mandato configurado</th><th>Após o cargo</th></tr></thead><tbody>{specialCareers.map(item => <tr key={item.id}><td><strong>{item.title}</strong><br/><small>{item.status}</small></td><td>{item.min_master_level}/5</td><td>{item.min_doctorate_level}/5</td><td>{item.min_reputation}%</td><td>{item.term_years ? `${item.term_years} anos` : '—'}</td><td>{item.metadata?.afterTerm || item.end_behavior}</td></tr>)}</tbody></table></div> : <div className={styles.empty}>Nenhuma definição encontrada.</div>}
    </section>

    <section className={styles.panel}><h3>Publicar setting adicional</h3><form className={styles.form} action={saveSettingAction}><div className={styles.formGrid}><input name="key" placeholder="career.progression.v1" required/><input name="description" placeholder="Descrição"/></div><textarea name="value" defaultValue={'{\n  "enabled": true\n}'} required/><button className={styles.primary}>Salvar setting público</button></form></section>
    <section className={styles.panel}><h3>Settings publicados</h3>{settings.length ? <pre className={styles.code}>{JSON.stringify(settings, null, 2)}</pre> : <div className={styles.empty}>Nenhum setting adicional.</div>}</section>
  </div>;
}
