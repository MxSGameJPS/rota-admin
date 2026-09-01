import Link from 'next/link';
import JsonEditor from '@/components/JsonEditor/JsonEditor';
import { getEntityForEditor } from '@/services/contentService';
import styles from '@/app/section.module.css';

export default async function NpcEditorPage({ params, searchParams }) {
  const { id } = await params; const query = await searchParams; const model = await getEntityForEditor('npc', id);
  return <div className={styles.page}><div className={styles.header}><div><Link href="/npcs">← NPCs</Link><h2>{model.name}</h2><p>{model.roleType} • {model.specialization} • {model.status}</p></div></div>{query?.created && <div className={styles.notice}>NPC gerado em draft. Revise memórias, diálogos e regras.</div>}{query?.updated && <div className={styles.notice}>NPC salvo e validado.</div>}{query?.error && <div className={styles.error}>{query.error}</div>}<JsonEditor entityType="npc" id={id} value={model} status={model.status}/></div>;
}
