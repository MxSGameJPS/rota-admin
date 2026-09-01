import Link from 'next/link';
import { listCases } from '@/services/adminRepository';
import { generateDraftAction } from '@/app/actions/content';
import StatusBadge from '@/components/StatusBadge/StatusBadge';
import styles from '@/app/section.module.css';

export default async function CasesPage({ searchParams }) {
  const params = await searchParams; const cases = await listCases();
  return <div className={styles.page}>
    <div className={styles.header}><div><h2>Casos Jurídicos</h2><p>Crie, revise e publique casos. O jogo lê somente registros `published` e ativos.</p></div></div>
    {params?.published && <div className={styles.notice}>Caso publicado no catálogo do jogo.</div>}{params?.error && <div className={styles.error}>{params.error}</div>}
    <section className={styles.panel}><h3>Criar rascunho com IA</h3><p>O provider recebe o JSON Schema oficial do Rota. A IA nunca publica sozinha.</p><form className={styles.form} action={generateDraftAction.bind(null, 'case')}><textarea name="prompt" placeholder="Ex.: Crie um caso intermediário de Direito Empresarial envolvendo fraude societária, com agravo de instrumento e possibilidade de blindagem de extratos bancários." required/><button className={styles.primary}>Gerar rascunho</button></form></section>
    <section className={styles.panel}><h3>Acervo</h3>{cases.length === 0 ? <div className={styles.empty}>Nenhum caso encontrado ou Supabase ainda não configurado.</div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Código</th><th>Caso</th><th>Dificuldade</th><th>Carreira</th><th>Status</th><th>Versão</th></tr></thead><tbody>{cases.map(item => <tr key={item.id}><td>{item.code}</td><td><Link href={`/cases/${item.id}`}><strong>{item.title}</strong></Link><br/>{item.area}</td><td>{item.difficulty}</td><td>{item.min_career_tier}</td><td><StatusBadge status={item.status}/></td><td>v{item.version}</td></tr>)}</tbody></table></div>}</section>
  </div>;
}
