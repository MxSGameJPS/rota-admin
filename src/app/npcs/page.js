import { listNpcs } from '@/services/adminRepository';
import { generateDraftAction, publishAction } from '@/app/actions/content';
import StatusBadge from '@/components/StatusBadge/StatusBadge';
import styles from '@/app/section.module.css';

export default async function NpcsPage({ searchParams }) {
  const params = await searchParams;
  const npcs = await listNpcs();
  return <div className={styles.page}>
    <div className={styles.header}><div><h2>NPCs</h2><p>NPCs existem no universo, não dentro de um único caso. Personalidade, memória-base, diálogos e regras de decisão são persistentes.</p></div></div>
    {params?.created && <div className={styles.notice}>NPC salvo como rascunho.</div>}{params?.published && <div className={styles.notice}>NPC publicado.</div>}{params?.error && <div className={styles.error}>{params.error}</div>}
    <section className={styles.panel}><h3>Criar NPC completo com IA</h3><p>A IA deve preencher identidade profissional, personalidade, memórias-base, diálogos, conhecimento, relacionamentos e regras de decisão.</p><form className={styles.form} action={generateDraftAction.bind(null, 'npc')}><textarea name="prompt" placeholder="Ex.: Crie um desembargador especialista em Direito Empresarial, rigoroso quanto à prova documental, formalista, pouco tolerante a erro processual e aberto a jurisprudência bem fundamentada." required/><button className={styles.primary}>Gerar NPC em draft</button></form></section>
    <section className={styles.panel}><h3>Universo de NPCs</h3>{npcs.length === 0 ? <div className={styles.empty}>Nenhum NPC encontrado. Aplique a migration administrativa no Supabase para habilitar este módulo.</div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Nome</th><th>Função</th><th>Especialidade</th><th>Status</th><th>Versão</th><th>Ação</th></tr></thead><tbody>{npcs.map(npc => <tr key={npc.id}><td><strong>{npc.name}</strong><br/>{npc.slug}</td><td>{npc.role_type}<br/>{npc.profession}</td><td>{npc.specialization}</td><td><StatusBadge status={npc.status}/></td><td>v{npc.version}</td><td>{npc.status === 'draft' ? <form action={publishAction.bind(null,'npc')}><input type="hidden" name="id" value={npc.id}/><button className={styles.secondary}>Publicar</button></form> : '—'}</td></tr>)}</tbody></table></div>}</section>
  </div>;
}
