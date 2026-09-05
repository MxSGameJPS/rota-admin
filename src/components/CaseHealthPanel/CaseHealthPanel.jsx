/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  discardPendingCaseRepairAction,
  publishPendingCaseRepairAction,
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

function ActionButton({ action, id, label, working, setWorking, token, children, disabled = false, danger = false }) {
  return <form action={action} onSubmit={() => setWorking(token)}>
    <input type="hidden" name="id" value={id} />
    {children}
    <button className={danger ? styles.dangerButton : ''} disabled={disabled || Boolean(working)}>{working === token ? 'Processando…' : label}</button>
  </form>;
}

export default function CaseHealthPanel({ id, status, health }) {
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const [working, setWorking] = useState('');
  const [workingWarning, setWorkingWarning] = useState('');
  const draft = status === 'draft';
  const published = status === 'published';
  const portraitsMissing = Number(health?.portraits?.missing?.length || 0) + Number(health?.portraits?.generatedNpcPortraitsMissing?.length || 0);
  const hasReferenceIssues = Number(health?.base?.referenceIssues?.length || 0) > 0;
  const hasNpcPending = Number(health?.npcs?.pendingNeeds || 0) > 0 || Boolean(health?.npcs?.issue);
  const reactiveHealthy = Boolean(health?.reactive?.present && health?.reactive?.valid);
  const eventsReady = Number(health?.reactive?.eventsCount || 0) > 0;
  const hasPending = Boolean(health?.pending?.exists);

  // Server Actions deste painel redirecionam de volta para a mesma rota. O Next pode
  // preservar o estado do componente nessa navegação; sem este reset, `working`
  // permanece preenchido mesmo depois de a operação ter concluído com sucesso.
  useEffect(() => {
    setWorking('');
    setWorkingWarning('');
  }, [searchKey, health]);

  // Rede/IA nunca deve deixar o Admin visualmente bloqueado para sempre. Esse
  // watchdog libera a interface e orienta a conferir o estado salvo antes de repetir.
  useEffect(() => {
    if (!working) return undefined;

    setWorkingWarning('');
    const timer = window.setTimeout(() => {
      setWorking('');
      setWorkingWarning('A operação ultrapassou 3 minutos. O painel foi destravado. Atualize o status do caso antes de repetir a ação, pois o processamento pode ter concluído no servidor.');
    }, 180000);

    return () => window.clearTimeout(timer);
  }, [working]);

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

    {hasPending && <div className={styles.reviewBox}>
      <div className={styles.reviewHeader}>
        <div>
          <span className={styles.eyebrow}>CORREÇÃO PRONTA PARA REVISÃO</span>
          <strong>{health.pending.summary}</strong>
          <p>O caso publicado no jogo ainda não foi alterado. Revise a correção abaixo e publique somente quando estiver satisfeito.</p>
        </div>
        <Status ok={false} label="aguardando publicação" />
      </div>

      {health?.pending?.newPortraits?.length > 0 && <div className={styles.pendingPortraits}>
        {health.pending.newPortraits.map((portrait) => <div key={`${portrait.locationId}-${portrait.id}`} className={styles.pendingPortrait}>
          <img src={portrait.portraitSrc} alt={`Novo retrato de ${portrait.name}`} />
          <div><strong>{portrait.name}</strong><span>{portrait.role} • {portrait.locationName}</span></div>
        </div>)}
      </div>}

      <div className={styles.reviewActions}>
        <ActionButton action={publishPendingCaseRepairAction} id={id} label="Publicar correção no jogo" working={working} setWorking={setWorking} token="publish-repair" />
        <ActionButton action={discardPendingCaseRepairAction} id={id} label="Descartar correção" working={working} setWorking={setWorking} token="discard-repair" danger />
      </div>
      <small>Ao publicar, o Admin cria uma nova versão do caso e mantém o histórico anterior. Não é necessário reconstruir o caso.</small>
    </div>}

    <div className={styles.grid}>
      <div className={styles.card}>
        <div className={styles.cardTitle}><strong>Estrutura base</strong><Status ok={health?.base?.valid} label={health?.base?.valid ? 'válida' : 'atenção'} /></div>
        <p>{health?.base?.structuralIssues?.length ? `${health.base.structuralIssues.length} problema(s) estrutural(is).` : 'Schema principal, locais, pistas e estratégias estão coerentes.'}</p>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}><strong>Referências internas</strong><Status ok={!hasReferenceIssues} label={!hasReferenceIssues ? 'OK' : `${health.base.referenceIssues.length} problema(s)`} /></div>
        <p>Valida pistas, locais, diálogos, desbloqueios e referências de estratégias.</p>
        {hasReferenceIssues && <ActionButton action={repairCaseReferencesAction} id={id} label="Corrigir referências seguras" working={working} setWorking={setWorking} token="references" disabled={hasPending} />}
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}><strong>NPCs persistentes</strong><Status ok={!hasNpcPending} label={!hasNpcPending ? 'OK' : 'pendente'} /></div>
        <p>{health?.npcs?.pendingNeeds || 0} necessidade(s) pendente(s) • {health?.npcs?.generatedDrafts || 0} NPC(s) derivados.</p>
        {health?.npcs?.issue && <small>{health.npcs.issue}</small>}
        {hasNpcPending && <ActionButton action={repairCaseNpcsAction} id={id} label="Reprocessar somente NPCs" working={working} setWorking={setWorking} token="npcs" disabled={hasPending} />}
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}><strong>Retratos</strong><Status ok={portraitsMissing === 0} label={portraitsMissing === 0 ? 'completos' : `${portraitsMissing} faltando`} /></div>
        <p>{health?.portraits?.ready || 0}/{health?.portraits?.total || 0} personagens locais com imagem.</p>
        {portraitsMissing > 0 && <ActionButton
          action={repairCasePortraitsAction}
          id={id}
          label={published ? 'Gerar retratos faltantes para revisão' : 'Gerar somente retratos faltantes'}
          working={working}
          setWorking={setWorking}
          token="portraits"
          disabled={hasPending}
        />}
        {published && portraitsMissing > 0 && <small>A geração não altera o jogo imediatamente. O novo retrato ficará aguardando sua publicação.</small>}
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}><strong>Intercorrências</strong><Status ok={eventsReady} label={eventsReady ? `${health.reactive.eventsCount} gerada(s)` : 'faltando'} /></div>
        <p>Regera somente os eventos inesperados, preservando audiência e restante do caso quando válidos.</p>
        <ActionButton action={repairReactiveEventsAction} id={id} label={eventsReady ? 'Regenerar só intercorrências' : 'Gerar intercorrências'} working={working} setWorking={setWorking} token="events" disabled={hasPending} />
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}><strong>Audiência</strong><Status ok={health?.reactive?.hearingState !== 'missing' && health?.reactive?.hearingState !== 'invalid'} label={health?.reactive?.hearingState === 'ready' ? `${health.reactive.hearingRounds} etapa(s)` : health?.reactive?.hearingState === 'not_required' ? 'dispensada pela IA' : 'faltando'} /></div>
        <p>A audiência pode ser recriada isoladamente sem gastar tokens regenerando intercorrências.</p>
        <ActionButton action={repairReactiveHearingAction} id={id} label="Gerar/regenerar só audiência" working={working} setWorking={setWorking} token="hearing" disabled={!eventsReady || hasPending} />
      </div>
    </div>

    {health?.portraits?.missing?.length > 0 && <div className={styles.missingList}>
      <h4>Retratos individuais pendentes</h4>
      <p>Se apenas uma pessoa falhou, regenere somente ela. Isso evita gastar tokens e chamadas de imagem nos personagens que já estão corretos.</p>
      {health.portraits.missing.map((character) => <div className={styles.missingRow} key={`${character.locationId}-${character.id}`}>
        <div><strong>{character.name}</strong><span>{character.role} • {character.locationName}</span></div>
        <ActionButton
          action={repairSinglePortraitAction}
          id={id}
          label={published ? 'Gerar retrato para revisão' : 'Gerar este retrato'}
          working={working}
          setWorking={setWorking}
          token={`portrait-${character.id}`}
          disabled={hasPending}
        >
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
        {published && <small>Em caso publicado, o resultado fica em revisão e só entra no jogo quando você clicar em “Publicar correção no jogo”.</small>}
      </div>
      <ActionButton action={repairAllCasePendingAction} id={id} label="Corrigir pendências automaticamente" working={working} setWorking={setWorking} token="all" disabled={health?.healthy || hasPending} />
    </div>

    {draft && <small className={styles.draftHint}>Este caso está em draft. Reparos são salvos diretamente no rascunho; depois use o fluxo normal de publicação do caso.</small>}
    {working && <div className={styles.progress}><span className={styles.spinner} /><span>Executando somente o reparo selecionado. O restante do caso será preservado.</span></div>}
    {workingWarning && <div className={styles.problem}><strong>Operação demorada:</strong> {workingWarning} <button type="button" onClick={() => window.location.reload()}>Atualizar status</button></div>}
  </section>;
}
