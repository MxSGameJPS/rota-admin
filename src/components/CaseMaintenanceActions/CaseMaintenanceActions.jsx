'use client';

import { useState } from 'react';
import { deleteCaseAction, regenerateCaseAction } from '@/app/actions/content';
import { retryCasePortraitsAction } from '@/app/actions/casePortraits';
import styles from './CaseMaintenanceActions.module.css';

export default function CaseMaintenanceActions({ id, title, status, version }) {
  const [working, setWorking] = useState('');

  function confirmRegenerate(event) {
    const ok = window.confirm(
      `Reconstruir INTEIRAMENTE "${title}" com IA?\n\nUse esta opção apenas quando o caso estiver incompatível ou precisar ser refeito. Estar em v1 não significa que o caso usa uma versão antiga do motor; v1 é apenas a primeira revisão deste conteúdo.\n\nSe estiver publicado, o caso voltará para DRAFT em uma nova versão e você precisará revisar e publicar novamente.`,
    );
    if (!ok) { event.preventDefault(); return; }
    setWorking('regenerate');
  }

  function confirmDelete(event) {
    const ok = window.confirm(
      `EXCLUIR DEFINITIVAMENTE o caso "${title}"?\n\nEssa ação remove o caso do catálogo e suas versões administrativas. Não pode ser desfeita.`,
    );
    if (!ok) { event.preventDefault(); return; }
    setWorking('delete');
  }

  function retryPortraits() {
    setWorking('portraits');
  }

  return (
    <div className={styles.box}>
      <div>
        <h3>Manutenção do caso</h3>
        <p>Reconstrua o caso inteiro somente se ele estiver incompatível com o contrato jogável atual. Para adicionar intercorrências e audiência, use o painel de mundo reativo acima.</p>
      </div>
      <div className={styles.actions}>
        {status === 'draft' && <form action={retryCasePortraitsAction} onSubmit={retryPortraits}>
          <input type="hidden" name="id" value={id} />
          <button className={styles.regenerate} disabled={Boolean(working)}>
            {working === 'portraits' ? 'Reprocessando retratos…' : 'Reprocessar retratos pendentes'}
          </button>
        </form>}
        <form action={regenerateCaseAction} onSubmit={confirmRegenerate}>
          <input type="hidden" name="id" value={id} />
          <button className={styles.regenerate} disabled={Boolean(working)}>
            {working === 'regenerate' ? 'Reconstruindo com IA…' : 'Reconstruir caso inteiro com IA'}
          </button>
        </form>
        <form action={deleteCaseAction} onSubmit={confirmDelete}>
          <input type="hidden" name="id" value={id} />
          <button className={styles.delete} disabled={Boolean(working)}>
            {working === 'delete' ? 'Excluindo…' : 'Excluir caso'}
          </button>
        </form>
      </div>
      {working === 'portraits' && (
        <div className={styles.progress} role="status" aria-live="polite">
          <span className={styles.spinner} />
          <div><strong>Reprocessando retratos pendentes…</strong><span>Somente personagens sem retrato serão enviados novamente para a IA. O conteúdo jurídico do caso não será alterado.</span></div>
        </div>
      )}
      {working === 'regenerate' && (
        <div className={styles.progress} role="status" aria-live="polite">
          <span className={styles.spinner} />
          <div><strong>IA reconstruindo o caso…</strong><span>Reconstruindo locais, diálogos, pistas, estratégias e referências internas. Isso pode levar alguns minutos.</span></div>
        </div>
      )}
      <small>Versão do conteúdo: v{Number(version || 1)} • status: {status}. A numeração v1/v2/v3 registra revisões administrativas e não a versão do motor do jogo.</small>
    </div>
  );
}
