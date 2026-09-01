'use client';

import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import styles from './GenerateDraftForm.module.css';

function formatElapsed(seconds) {
  const minutes = Math.floor(seconds / 60); const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${String(rest).padStart(2, '0')}s` : `${rest}s`;
}
function getProgressCopy(elapsed, entityLabel, longRunning) {
  if (elapsed < 3) return `Enviando o briefing de ${entityLabel} para o provedor...`;
  if (elapsed < 30) return 'A IA recebeu a solicitação. Aguardando a geração estruturada...';
  if (longRunning && elapsed >= 30) return 'A prova está sendo montada em lotes. O Admin continua chamando a IA e validando cada bloco antes de salvar.';
  if (elapsed < 120) return 'A IA continua trabalhando no conteúdo e no JSON Schema oficial do Rota...';
  return 'A geração ainda está em andamento. Conteúdos completos podem levar alguns minutos.';
}

export default function GenerateDraftForm({ action, placeholder, buttonLabel = 'Gerar rascunho', entityLabel = 'rascunho', longRunning = false }) {
  const [submitting, setSubmitting] = useState(false); const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!submitting) { setElapsed(0); return undefined; }
    const started = Date.now(); const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [submitting]);
  function handleSubmit() { flushSync(() => setSubmitting(true)); }
  return <>
    <form className={styles.form} action={action} onSubmit={handleSubmit}>
      <textarea name="prompt" placeholder={placeholder} required disabled={submitting}/>
      <button className={styles.primary} disabled={submitting} aria-busy={submitting}>{submitting ? <><span className={styles.spinner} aria-hidden="true"/>Gerando {entityLabel}…</> : buttonLabel}</button>
    </form>
    {submitting && <div className={styles.overlay} role="status" aria-live="assertive" aria-busy="true"><div className={styles.overlayCard}>
      <div className={styles.heroSpinner} aria-hidden="true"/><span className={styles.eyebrow}>ROTA ADMIN • IA EM EXECUÇÃO</span><h3>Gerando {entityLabel}…</h3>
      <p className={styles.copy}>{getProgressCopy(elapsed, entityLabel, longRunning)}</p><div className={styles.progressBar}><span/></div>
      <div className={styles.meta}><span><span className={styles.pulse}/> Processo ativo</span><strong>{formatElapsed(elapsed)}</strong></div>
      <small>{longRunning ? 'Não feche nem atualize esta página. Provas completas são geradas e validadas em vários lotes e podem levar vários minutos.' : 'Não feche nem atualize esta página. Ao concluir, o Admin abrirá o draft automaticamente. O limite de cada chamada ao provedor é de até 5 minutos.'}</small>
    </div></div>}
  </>;
}
