import Link from 'next/link';
import { listCases } from '@/services/adminRepository';
import { listPublishedNpcGenerationContext } from '@/services/contentService';
import { generateDraftAction } from '@/app/actions/content';
import StatusBadge from '@/components/StatusBadge/StatusBadge';
import GenerateDraftForm from '@/components/GenerateDraftForm/GenerateDraftForm';
import styles from '@/app/section.module.css';

export default async function CasesPage({ searchParams }) {
  const params = await searchParams;
  const cases = await listCases();
  let npcCatalog = [];
  try {
    npcCatalog = await listPublishedNpcGenerationContext();
  } catch {
    npcCatalog = [];
  }
  const unusedNpcs = npcCatalog.filter((npc) => Number(npc.usageCount || 0) === 0);

  return <div className={styles.page}>
    <div className={styles.header}><div><h2>Casos Jurídicos</h2><p>Crie, revise e publique casos. O jogo lê somente registros `published` e ativos.</p></div></div>
    {params?.published && <div className={styles.notice}>Caso publicado no catálogo do jogo.</div>}
    {params?.deleted && <div className={styles.notice}>Caso excluído do catálogo.</div>}
    {params?.error && <div className={styles.error}>{params.error}</div>}
    <section className={styles.panel}>
      <h3>Criar rascunho com IA</h3>
      <p>O provider recebe o contrato jogável oficial do Rota. O Admin gera primeiro a estrutura do caso e depois completa cada local em etapas menores. A IA nunca publica sozinha.</p>
      <p><strong>NPCs:</strong> antes de montar o caso, o gerador consulta automaticamente {npcCatalog.length} NPC{npcCatalog.length === 1 ? '' : 's'} publicado{npcCatalog.length === 1 ? '' : 's'} e ativo{npcCatalog.length === 1 ? '' : 's'}. Quando houver encaixe natural, reutiliza personagens persistentes existentes; entre opções equivalentes, prioriza os menos usados. {unusedNpcs.length > 0 ? `${unusedNpcs.length} ainda não ${unusedNpcs.length === 1 ? 'foi usado' : 'foram usados'} em nenhum caso.` : ''}</p>
      <GenerateDraftForm action={generateDraftAction.bind(null, 'case')} entityLabel="caso" buttonLabel="Gerar rascunho" longRunning placeholder="Ex.: Crie um caso intermediário de Direito Empresarial envolvendo fraude societária, com agravo de instrumento e possibilidade de blindagem de extratos bancários."/>
    </section>
    <section className={styles.panel}><h3>Acervo</h3>{cases.length === 0 ? <div className={styles.empty}>Nenhum caso encontrado ou Supabase ainda não configurado.</div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Código</th><th>Caso</th><th>Dificuldade</th><th>Carreira</th><th>Status</th><th>Versão</th></tr></thead><tbody>{cases.map(item => <tr key={item.id}><td>{item.code}</td><td><Link href={`/cases/${item.id}`}><strong>{item.title}</strong></Link><br/>{item.area}</td><td>{item.difficulty}</td><td>{item.min_career_tier}</td><td><StatusBadge status={item.status}/></td><td>v{item.version}</td></tr>)}</tbody></table></div>}</section>
  </div>;
}