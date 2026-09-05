/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import JsonEditor from '@/components/JsonEditor/JsonEditor';
import { getEntityForEditor } from '@/services/contentService';
import styles from '@/app/section.module.css';

export default async function NpcEditorPage({ params, searchParams }) {
  const { id } = await params;
  const query = await searchParams;
  const model = await getEntityForEditor('npc', id);
  const portraitSrc = typeof model.metadata?.portraitSrc === 'string' ? model.metadata.portraitSrc : '';
  const sourceCaseId = typeof model.metadata?.sourceCaseId === 'string' ? model.metadata.sourceCaseId : '';

  return <div className={styles.page}>
    <div className={styles.header}>
      <div><Link href="/npcs">← NPCs</Link><h2>{model.name}</h2><p>{model.roleType} • {model.specialization} • {model.status}</p></div>
    </div>
    {query?.created && <div className={styles.notice}>NPC gerado em draft. O Admin também tentou gerar e salvar o retrato automaticamente. Revise memórias, diálogos, regras e aparência.</div>}
    {query?.updated && <div className={styles.notice}>NPC salvo e validado.</div>}
    {query?.error && <div className={styles.error}>{query.error}</div>}

    {(portraitSrc || model.metadata?.portraitStatus || sourceCaseId) && <div className={styles.panel}>
      <div className={styles.portraitPanel}>
        {portraitSrc ? <img src={portraitSrc} alt={`Retrato de ${model.name}`} className={styles.portraitLarge} /> : <div className={styles.portraitPlaceholder}>Sem retrato</div>}
        <div>
          <h3>Retrato e origem</h3>
          <p>Status do retrato: <strong>{model.metadata?.portraitStatus || (portraitSrc ? 'generated' : 'pending')}</strong>.</p>
          {model.metadata?.portraitModel && <p>Modelo: {model.metadata.portraitModel}</p>}
          {model.metadata?.portraitGenerationError && <div className={styles.warningList}>⚠ {model.metadata.portraitGenerationError}</div>}
          {sourceCaseId && <p>NPC criado automaticamente para o caso <Link href={`/cases/${sourceCaseId}`}>{model.metadata?.sourceCaseTitle || sourceCaseId}</Link>.</p>}
        </div>
      </div>
    </div>}

    <JsonEditor entityType="npc" id={id} value={model} status={model.status}/>
  </div>;
}
