'use client';

import { useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import styles from './GenerateDraftForm.module.css';

function formatElapsed(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${String(rest).padStart(2, '0')}s` : `${rest}s`;
}

function PendingState({ entityLabel, buttonLabel }) {
  const { pending } = useFormStatus();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!pending) {
      setElapsed(0);
      return undefined;
    }
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [pending]);

  return <>
    <button className={styles.primary} disabled={pending} aria-busy={pending}>
      {pending ? <><span className={styles.spinner} aria-hidden="true"/>Gerando {entityLabel}…</> : buttonLabel}
    </button>
    {pending && <div className={styles.progress} role="status" aria-live="polite">
      <div className={styles.progressHeader}>
        <span className={styles.pulse}/>
        <strong>IA trabalhando</strong>
        <span className={styles.elapsed}>{formatElapsed(elapsed)}</span>
      </div>
      <div className={styles.progressBar}><span/></div>
      <p>Enviando briefing, aplicando o schema oficial do Rota e aguardando o provedor. Conteúdos completos podem levar alguns minutos.</p>
      <small>Não feche esta página nem envie novamente enquanto a geração estiver em andamento.</small>
    </div>}
  </>;
}

export default function GenerateDraftForm({ action, placeholder, buttonLabel = 'Gerar rascunho', entityLabel = 'rascunho' }) {
  return <form className={styles.form} action={action}>
    <textarea name="prompt" placeholder={placeholder} required/>
    <PendingState entityLabel={entityLabel} buttonLabel={buttonLabel}/>
  </form>;
}
