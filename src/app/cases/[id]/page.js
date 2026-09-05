/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import JsonEditor from '@/components/JsonEditor/JsonEditor';
import CaseMaintenanceActions from '@/components/CaseMaintenanceActions/CaseMaintenanceActions';
import CaseReactiveWorldPanel from '@/components/CaseReactiveWorldPanel/CaseReactiveWorldPanel';
import { getEntityForEditor } from '@/services/contentService';
import styles from '@/app/section.module.css';

export default async function CaseEditorPage({ params, searchParams }) {
  const { id } = await params;
  const query = await searchParams;
  const model = await getEntityForEditor('case', id);
  const automation = model.metadata?.automation || {};
  const generatedNpcDrafts = Array.isArray(automation.generatedNpcDrafts) ? automation.generatedNpcDrafts : [];
  const warnings = Array.isArray(automation.warnings) ? automation.warnings : [];

  return <div className={styles.page}>
    <div className={styles.header}>
      <div><Link href="/cases">← Casos</Link><h2>{model.title}</h2><p>{model.code} • {model.status} • v{Number(model.version || 1)}</p></div>
    </div>
    {query?.created && <div className={styles.notice}>Draft gerado. O Admin já analisou NPCs e retratos automaticamente; revise o resultado antes de publicar.</div>}
    {query?.updated && <div className={styles.notice}>Rascunho salvo e validado.</div>}
    {query?.regenerated && <div className={styles.notice}>Caso reconstruído com IA e devolvido para draft. NPCs, retratos e mundo reativo também foram reavaliados.</div>}
    {query?.reactiveGenerated && <div className={styles.notice}>Mundo reativo gerado com IA. Intercorrências e audiência específicas deste caso já estão disponíveis para o jogo.</div>}
    {query?.error && <div className={styles.error}>{query.error}</div>}

    {(generatedNpcDrafts.length > 0 || Number(automation.localPortraitsGenerated || 0) > 0 || warnings.length > 0) && <div className={styles.panel}>
      <h3>Automação de personagens</h3>
      <p>
        {Number(automation.localPortraitsGenerated || 0)} retrato(s) de personagens específicos do caso gerado(s).
        {generatedNpcDrafts.length > 0 ? ` ${generatedNpcDrafts.length} NPC(s) persistente(s) novo(s) foram criados em draft.` : ''}
      </p>
      {generatedNpcDrafts.length > 0 && <div className={styles.assetList}>
        {generatedNpcDrafts.map(npc => <div key={npc.id} className={styles.assetRow}>
          {npc.portraitSrc && <img src={npc.portraitSrc} alt={`Retrato de ${npc.name}`} className={styles.assetThumb} />}
          <div><strong>{npc.name}</strong><span>{npc.roleInCase} • {npc.locationId}</span><Link href={`/npcs/${npc.id}`}>Revisar NPC antes de publicar o caso →</Link></div>
        </div>)}
      </div>}
      {warnings.length > 0 && <div className={styles.warningList}>{warnings.map((warning, index) => <div key={`${index}-${warning}`}>⚠ {warning}</div>)}</div>}
    </div>}

    <CaseReactiveWorldPanel model={model}/>
    <CaseMaintenanceActions id={id} title={model.title} status={model.status} version={model.version}/>
    <JsonEditor entityType="case" id={id} value={model} status={model.status}/>
  </div>;
}
