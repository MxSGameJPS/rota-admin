'use client';

import { useState } from 'react';
import { deleteCaseAction, regenerateCaseAction } from '@/app/actions/content';
import styles from './CaseMaintenanceActions.module.css';

export default function CaseMaintenanceActions({ id, title, status, version }) {
  const [working, setWorking] = useState('');

  function confirmRegenerate(event) {
    const ok = window.confirm(
      `Reconstruir INTEIRAMENTE "${title}" com IA?\n\nAntes de usar esta opção, veja o painel Saúde e reparos granulares acima. Retratos, NPCs, referências, intercorrências e audiência podem ser reparados separadamente com custo muito menor.\n\nUse reconstrução total apenas quando a estrutura principal do caso estiver realmente incompatível. Estar em v1 não significa motor antigo.\n\nSe estiver publicado, o caso voltará para DRAFT em uma nova versão e precisará ser revisado e publicado novamente.`,
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
        <h3>Manutenção avançada do caso</h3>
        <p>Use esta área somente para reconstrução integral ou exclusão. Para falhas pontuais, utilize o diagnóstico e os reparos granulares acima para preservar conteúdo e economizar tokens.</p>
      </div>
      <div className={styles.actions}>
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
      {working === 'regenerate' && (
        <div className={styles.progress} role="status" aria-live="polite">
          <span className={styles.spinner} />
          <div><strong>IA reconstruindo o caso inteiro…</strong><span>Esta é a opção de último recurso: locais, diálogos, pistas, estratégias e referências serão reavaliados.</span></div>
        </div>
      )}
      <small>Versão do conteúdo: v{Number(version || 1)} • status: {status}. A numeração v1/v2/v3 registra revisões administrativas e não a versão do motor do jogo.</small>
    </div>
  );
}
