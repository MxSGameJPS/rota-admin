import Link from 'next/link';
import JsonEditor from '@/components/JsonEditor/JsonEditor';
import CaseMaintenanceActions from '@/components/CaseMaintenanceActions/CaseMaintenanceActions';
import { getEntityForEditor } from '@/services/contentService';
import styles from '@/app/section.module.css';

export default async function CaseEditorPage({ params, searchParams }) {
  const { id } = await params;
  const query = await searchParams;
  const model = await getEntityForEditor('case', id);

  return <div className={styles.page}>
    <div className={styles.header}>
      <div><Link href="/cases">← Casos</Link><h2>{model.title}</h2><p>{model.code} • {model.status}</p></div>
    </div>
    {query?.created && <div className={styles.notice}>Draft gerado. Complete o conteúdo antes de publicar.</div>}
    {query?.updated && <div className={styles.notice}>Rascunho salvo e validado.</div>}
    {query?.regenerated && <div className={styles.notice}>Caso regenerado com IA e devolvido para draft. Revise a nova versão antes de publicar.</div>}
    {query?.error && <div className={styles.error}>{query.error}</div>}
    <CaseMaintenanceActions id={id} title={model.title} status={model.status}/>
    <JsonEditor entityType="case" id={id} value={model} status={model.status}/>
  </div>;
}
