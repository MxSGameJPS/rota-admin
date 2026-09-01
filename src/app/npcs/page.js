import Link from 'next/link';
import { listNpcs } from '@/services/adminRepository';
import { generateDraftAction } from '@/app/actions/content';
import StatusBadge from '@/components/StatusBadge/StatusBadge';
import GenerateDraftForm from '@/components/GenerateDraftForm/GenerateDraftForm';
import styles from '@/app/section.module.css';

export default async function NpcsPage({ searchParams }) {
  const params = await searchParams; const npcs = await listNpcs();
  return <div className={styles.page}>
    <div className={styles.header}><div><h2>NPCs</h2><p>NPCs existem no universo, não dentro de um único caso. Personalidade, memória-base, diálogos e regras de decisão são persistentes.</p></div></div>
    {params?.published && <div className={styles.notice}>NPC publicado.</div>}{params?.error && <div className={styles.error}>{params.error}</div>}
    <section className={styles.panel}><h3>Criar NPC completo com IA</h3><p>A IA deve preencher identidade profissional, personalidade, memórias-base, diálogos, conhecimento, relacionamentos e regras de decisão.</p><GenerateDraftForm action={generateDraftAction.bind(null, 'npc')} entityLabel="NPC" buttonLabel="Gerar NPC em draft" placeholder="Ex.: Crie um desembargador especialista em Direito Empresarial, rigoroso quanto à prova documental, formalista, pouco tolerante a erro processual e aberto a jurisprudência bem fundamentada."/></section>
    <section className={styles.panel}><h3>Universo de NPCs</h3>{npcs.length === 0 ? <div className={styles.empty}>Nenhum NPC encontrado. Aplique a migration administrativa no Supabase.</div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Nome</th><th>Função</th><th>Especialidade</th><th>Status</th><th>Versão</th></tr></thead><tbody>{npcs.map(npc => <tr key={npc.id}><td><Link href={`/npcs/${npc.id}`}><strong>{npc.name}</strong></Link><br/>{npc.slug}</td><td>{npc.role_type}<br/>{npc.profession}</td><td>{npc.specialization}</td><td><StatusBadge status={npc.status}/></td><td>v{npc.version}</td></tr>)}</tbody></table></div>}</section>
  </div>;
}
