'use client';

import { useState } from 'react';
import { deleteCaseAction, regenerateCaseAction } from '@/app/actions/content';
import styles from './CaseMaintenanceActions.module.css';

export default function CaseMaintenanceActions({ id, title, status }) {
  const [working, setWorking] = useState('');

  function confirmRegenerate(event) {
    const ok = window.confirm(
      `Regerar "${title}" com IA?\n\nO caso será reconstruído no contrato jogável atual. Se estiver publicado, voltará para DRAFT em uma nova versão e você precisará revisar e publicar novamente.`,
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

  return (
    <div className={styles.box}>
      <div>
        <h3>Manutenção do caso</h3>
        <p>Use a IA para reconstruir um caso incompatível ou exclua-o definitivamente do catálogo.</p>
      </div>
      <div className={styles.actions}>
        <form action={regenerateCaseAction} onSubmit={confirmRegenerate}>
          <input type="hidden" name="id" value={id} />
          <button className={styles.regenerate} disabled={Boolean(working)}>
            {working === 'regenerate' ? 'Regenerando com IA…' : 'Regerar com IA'}
          </button>
        </form>
        <form action={deleteCaseAction} onSubmit={confirmDelete}>
          <input type="hidden" name="id" value={id} />
          <button className={styles.delete} disabled={Boolean(working)}>
            {working === 'delete' ? 'Excluindo…' : 'Excluir caso'}
          </button>
        </form>
      </div>
      {working === 'regenerate' && (
        <div className={styles.progress} role="status" aria-live="polite">
          <span className={styles.spinner} />
          <div><strong>IA reparando o caso…</strong><span>Reconstruindo locais, diálogos, pistas, estratégias e referências internas. Isso pode levar alguns minutos.</span></div>
        </div>
      )}
      <small>Status atual: {status}</small>
    </div>
  );
}
