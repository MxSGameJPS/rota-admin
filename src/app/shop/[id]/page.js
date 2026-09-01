import Link from 'next/link';
import JsonEditor from '@/components/JsonEditor/JsonEditor';
import { getEntityForEditor } from '@/services/contentService';
import styles from '@/app/section.module.css';

export default async function ItemEditorPage({ params, searchParams }) {
  const { id } = await params; const query = await searchParams; const model = await getEntityForEditor('item', id);
  return <div className={styles.page}><div className={styles.header}><div><Link href="/shop">← Loja</Link><h2>{model.name}</h2><p>{model.type} • {model.rarity} • {model.status}</p></div></div>{query?.created && <div className={styles.notice}>Item gerado em draft.</div>}{query?.updated && <div className={styles.notice}>Item salvo e validado.</div>}{query?.error && <div className={styles.error}>{query.error}</div>}<JsonEditor entityType="item" id={id} value={model} status={model.status}/></div>;
}
