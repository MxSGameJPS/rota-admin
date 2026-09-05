import { generateCaseReactiveWorldAction } from '@/app/actions/reactiveWorld';
import styles from '@/app/section.module.css';

export default function CaseReactiveWorldPanel({ model }) {
  const config = model.metadata?.reactiveWorld || null;
  const events = Array.isArray(config?.events) ? config.events : [];
  const rounds = Array.isArray(config?.hearing?.rounds) ? config.hearing.rounds : [];
  const hasCustomConfig = events.length > 0 || rounds.length > 0;

  return <section className={styles.panel}>
    <h3>Mundo reativo específico do caso</h3>
    <p>
      {hasCustomConfig
        ? `Este caso possui ${events.length} intercorrência(s) específica(s) e ${rounds.length} etapa(s) de audiência configuradas. O jogo prioriza este conteúdo e usa os modelos genéricos apenas como fallback.`
        : 'Este caso ainda usa os modelos genéricos do jogo. Gere conteúdo específico para que intercorrências e audiência reflitam os fatos, provas e personagens deste processo.'}
    </p>

    {events.length > 0 && <div className={styles.assetList}>
      {events.map((event) => <div key={event.id} className={styles.assetRow}>
        <div>
          <strong>{event.title}</strong>
          <span>
            {event.sourceLabel} • após {event.trigger?.minActions ?? 2} ações
            {typeof event.trigger?.deadlineRatio === 'number' ? ` • ou ${Math.round(event.trigger.deadlineRatio * 100)}% do prazo` : ''}
            {event.relatedClueId ? ` • pista ${event.relatedClueId}` : ''}
          </span>
          <span>{event.choices?.length || 0} decisões possíveis</span>
        </div>
      </div>)}
    </div>}

    {config?.hearing && <div className={styles.warningList}>
      <strong>{config.hearing.title || 'Audiência de instrução'}</strong>
      <div>{config.hearing.intro}</div>
      <div>{rounds.length} etapa(s): {rounds.map((round) => round.title).join(' • ')}</div>
    </div>}

    <form className={styles.form} action={generateCaseReactiveWorldAction}>
      <input type="hidden" name="id" value={model.id}/>
      <label htmlFor={`reactive-prompt-${model.id}`}>Orientação opcional para a IA</label>
      <textarea
        id={`reactive-prompt-${model.id}`}
        name="prompt"
        placeholder="Ex.: dê mais peso à contradição do recibo, faça a testemunha Maria recuar perto do protocolo e crie audiência com impugnação desse documento."
      />
      <button className={styles.primary}>
        {hasCustomConfig ? 'Regenerar mundo reativo com IA' : 'Gerar intercorrências e audiência com IA'}
      </button>
      <p>
        Funciona tanto em draft quanto em caso já publicado. Em caso publicado, o Admin cria snapshot da versão anterior antes de atualizar somente esta configuração.
      </p>
    </form>
  </section>;
}
