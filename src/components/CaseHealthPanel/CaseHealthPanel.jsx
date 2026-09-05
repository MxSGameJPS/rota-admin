'use client';

import { useState } from 'react';
import {
  repairAllCasePendingAction,
  repairCaseNpcsAction,
  repairCasePortraitsAction,
  repairCaseReferencesAction,
  repairReactiveEventsAction,
  repairReactiveHearingAction,
  repairSinglePortraitAction,
} from '@/app/actions/caseRepairs';
import styles from './CaseHealthPanel.module.css';

function Status({ ok, label }) {
  return <span className={ok ? styles.ok : styles.warn}>{ok ? '✓' : '!' } {label}</span>;
}

function ActionButton({ action, id, label, working, setWorking, token, children, disabled = false }) {
  return <form action={action} onSubmit={() => setWorking(token)}>
    <input type="hidden" name="id" value={id} />
    {children}
    <button disabled={disabled || Boolean(working)}>{working === token ? 'Processando…' : label}</button>
  </form>;
}

export default function CaseHealthPanel({ id, status, health }) {
  const [working, setWorking] = useState('');
  const draft = status === 'draft';
  const portraitsMissing = Number(health?.portraits?.missing?.length || 0) + Number(health?.portraits?.generatedNpcPortraitsMissing?.length || 0);
  const hasReferenceIssues = Number(health?.base?.referenceIssues?.length || 0) > 0;
  const hasNpcPending = Number(health?.npcs?.pendingNeeds || 0) > 0 || Boolean(health?.npcs?.issue);
  const reactiveHealthy = Boolean(health?.reactive?.present && health?.reactive?.valid);
  const eventsReady = Number(health?.reactive?.eventsCount || 0) > 0;

  return <section className={styles.panel}>
    <div className={styles.heading}>
      <div>
        <span className={styles.eyebrow}>DIAGNÓSTICO DO CASO</span>
        <h3>Saúde e reparos granulares</h3>
        <p>O Admin identifica pendências e corrige apenas a parte afetada. Reconstrução completa fica reservada para casos realmente incompatíveis.</p>
      </div>
      <div className={health?.healthy ? styles.healthOk : styles.healthWarn}>
        {health?.healthy ? 'CASO SAUDÁVEL' : 'PENDÊNCIAS ENCONTRADAS'}
      </div>
    </div>

    <div className={styles.grid}>
      <div className={styles.card}>
        <div className={styles.cardTitle}><strong>Estrutura base</strong><Status ok={health?.base?.valid} label={health?.base?.valid ? 'válida' : 'atenção'} /></div>
        <p>{health?.base?.structuralIssues?.length ? `${health.base.structuralIssues.length} problema(s) estrutural(is).` : 'Schema principal, locais, pistas e estratégias estão coerentes.'}</p>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}><strong>Referências internas</strong><Status ok={!hasReferenceIssues} label={!hasReferenceIssues ? 'OK' : `${health.base.referenceIssues.length} problema(s)`} /></div>
        <p>Valida pistas, locais, diálogos, desbloqueios e referências de estratégias.</p>
        {hasReferenceIssues && draft && <ActionButton action={repairCaseReferencesAction} id={id} label="Corrigir referências seguras" working={working} setWorking={setWorking} token="references" />}
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}><strong>NPCs persistentes</strong><Status ok={!hasNpcPending} label={!hasNpcPending ? 'OK' : 'pendente'} /></div>
        <p>{health?.npcs?.pendingNeeds || 0} necessidade(s) pendente(s) • {health?.npcs?.generatedDrafts || 0} NPC(s) derivados.</p>
        {health?.npcs?.issue && <small>{health.npcs.issue}</small>}
        {hasNpcPending && draft && <ActionButton action={repairCaseNpcsAction} id={id} label="Reprocessar somente NPCs" working={working} setWorking={setWorking} token="npcs" />}
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}><strong>Retratos</strong><Status ok={portraitsMissing === 0} label={portraitsMissing === 0 ? 'completos' : `${portraitsMissing} faltando`} /></div>
        <p>{health?.portraits?.ready || 0}/{health?.portraits?.total || 0} personagens locais com imagem.</p>
        {portraitsMissing > 0 && draft && <ActionButton action={repairCasePortraitsAction} id={id} label="Gerar somente retratos faltantes" working={working} setWorking={setWorking} token="portraits" />}
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}><strong>Intercorrências</strong><Status ok={eventsReady} label={eventsReady ? `${health.reactive.eventsCount} gerada(s)` : 'faltando'} /></div>
        <p>Regera somente os eventos inesperados, preservando audiência e restante do caso quando válidos.</p>
        <ActionButton action={repairReactiveEventsAction} id={id} label={eventsReady ? 'Regenerar só intercorrências' : 'Gerar intercorrências'} working={working} setWorking={setWorking} token="events" />
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}><strong>Audiência</strong><Status ok={health?.reactive?.hearingState !== 'missing' && health?.reactive?.hearingState !== 'invalid'} label={health?.reactive?.hearingState === 'ready' ? `${health.reactive.hearingRounds} etapa(s)` : health?.reactive?.hearingState === 'not_required' ? 'dispensada pela IA' : 'faltando'} /></div>
        <p>A audiência pode ser recriada isoladamente sem gastar tokens regenerando intercorrências.</p>
        <ActionButton action={repairReactiveHearingAction} id={id} label="Gerar/regenerar só audiência" working={working} setWorking={setWorking} token="hearing" disabled={!eventsReady} />
      </div>
    </div>

    {health?.portraits?.missing?.length > 0 && draft && <div className={styles.missingList}>
      <h4>Retratos individuais pendentes</h4>
      <p>Se apenas uma pessoa falhou, regenere somente ela.</p>
      {health.portraits.missing.map((character) => <div className={styles.missingRow} key={`${character.locationId}-${character.id}`}>
        <div><strong>{character.name}</strong><span>{character.role} • {character.locationName}</span></div>
        <ActionButton action={repairSinglePortraitAction} id={id} label="Gerar este retrato" working={working} setWorking={setWorking} token={`portrait-${character.id}`}>
          <input type="hidden" name="locationId" value={character.locationId} />
          <input type="hidden" name="characterId" value={character.id} />
        </ActionButton>
      </div>)}
    </div>}

    {!reactiveHealthy && health?.reactive?.issue && <div className={styles.problem}><strong>Mundo reativo inválido:</strong> {health.reactive.issue}</div>}
    {health?.base?.referenceIssues?.length > 0 && <details className={styles.details}><summary>Ver referências problemáticas</summary>{health.base.referenceIssues.map((issue, index) => <div key={`${index}-${issue}`}>{issue}</div>)}</details>}
    {health?.base?.structuralIssues?.length > 0 && <details className={styles.details}><summary>Ver problemas estruturais</summary>{health.base.structuralIssues.map((issue, index) => <div key={`${index}-${issue}`}>{issue}</div>)}</details>}

    <div className={styles.footer}>
      <div>
        <strong>Reparo inteligente</strong>
        <span>Analisa o estado atual e executa apenas correções necessárias: referências seguras, NPCs pendentes, imagens faltantes e mundo reativo ausente/inválido.</span>
      </div>
      {draft ? <ActionButton action={repairAllCasePendingAction} id={id} label="Corrigir pendências automaticamente" working={working} setWorking={setWorking} token="all" disabled={health?.healthy} /> : <small>Para reparos que alteram estrutura, NPCs ou imagens, devolva o caso para draft. Intercorrências e audiência podem ser atualizadas mesmo publicado.</small>}
    </div>

    {working && <div className={styles.progress}><span className={styles.spinner} /><span>Executando somente o reparo selecionado. O restante do caso será preservado.</span></div>}
  </section>;
}
