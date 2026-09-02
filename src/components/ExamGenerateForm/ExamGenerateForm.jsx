'use client';

import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import styles from './ExamGenerateForm.module.css';

const PRESETS = {
  oab_first_phase: { label: 'Exame da Ordem - 1ª Fase', questions: 80, passing: 40, duration: 300, levels: false },
  mestrado: { label: 'Mestrado', questions: 40, passing: '', duration: '', levels: true },
  doutorado: { label: 'Doutorado', questions: 40, passing: '', duration: '', levels: true },
  concurso_juiz: { label: 'Concurso para Juiz', questions: 20, passing: '', duration: '', levels: false },
  concurso_desembargador: { label: 'Concurso para Desembargador', questions: 20, passing: '', duration: '', levels: false },
};

function formatElapsed(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${String(rest).padStart(2, '0')}s` : `${rest}s`;
}

export default function ExamGenerateForm({ action }) {
  const [examType, setExamType] = useState('oab_first_phase');
  const [passingScore, setPassingScore] = useState(40);
  const [durationMinutes, setDurationMinutes] = useState(300);
  const [targetLevel, setTargetLevel] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const preset = useMemo(() => PRESETS[examType], [examType]);

  useEffect(() => {
    if (examType === 'oab_first_phase') {
      setPassingScore(40);
      setDurationMinutes(300);
    } else {
      setPassingScore('');
      setDurationMinutes('');
    }
  }, [examType]);

  useEffect(() => {
    if (!submitting) { setElapsed(0); return undefined; }
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [submitting]);

  function handleSubmit() {
    flushSync(() => setSubmitting(true));
  }

  return <>
    <form className={styles.form} action={action} onSubmit={handleSubmit}>
      <div className={styles.grid}>
        <label>
          <span>Tipo de avaliação</span>
          <select
            name="examType"
            value={examType}
            onChange={(event) => { if (!submitting) setExamType(event.target.value); }}
            aria-disabled={submitting}
          >
            {Object.entries(PRESETS).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
          </select>
        </label>

        <label>
          <span>Quantidade</span>
          <input value={`${preset.questions} questões`} disabled readOnly/>
        </label>

        {preset.levels && <label>
          <span>Nível-alvo</span>
          <select
            name="targetLevel"
            value={targetLevel}
            onChange={(event) => { if (!submitting) setTargetLevel(Number(event.target.value)); }}
            aria-disabled={submitting}
          >
            {[1,2,3,4,5].map(level => <option key={level} value={level}>Nível {level}</option>)}
          </select>
        </label>}

        <label>
          <span>Nota de corte (acertos)</span>
          <input
            name="passingScore"
            type="number"
            min="1"
            max={preset.questions}
            value={passingScore}
            onChange={(event) => { if (!submitting && examType !== 'oab_first_phase') setPassingScore(event.target.value); }}
            required
            readOnly={submitting || examType === 'oab_first_phase'}
            aria-readonly={submitting || examType === 'oab_first_phase'}
          />
        </label>

        <label>
          <span>Duração (minutos)</span>
          <input
            name="durationMinutes"
            type="number"
            min="15"
            max="600"
            value={durationMinutes}
            onChange={(event) => { if (!submitting && examType !== 'oab_first_phase') setDurationMinutes(event.target.value); }}
            required
            readOnly={submitting || examType === 'oab_first_phase'}
            aria-readonly={submitting || examType === 'oab_first_phase'}
          />
        </label>
      </div>

      <label className={styles.promptLabel}>
        <span>Briefing para a IA</span>
        <textarea
          name="prompt"
          required
          readOnly={submitting}
          aria-readonly={submitting}
          placeholder="Ex.: Crie uma prova de Mestrado nível 2 focada em Direito Constitucional, teoria dos direitos fundamentais e pesquisa jurisprudencial, com questões originais e nível acadêmico elevado."
        />
      </label>

      <div className={styles.hint}>
        {examType === 'concurso_juiz' || examType === 'concurso_desembargador'
          ? 'Regra do jogo: o jogador só poderá prestar este concurso com Doutorado nível 4 ou 5.'
          : preset.levels
          ? 'Mestrado e Doutorado possuem 5 níveis. A aprovação avança somente para o nível seguinte.'
          : 'A OAB mantém o preset de 80 questões, 5 horas e 40 acertos.'}
      </div>

      <button className={styles.primary} disabled={submitting} aria-busy={submitting}>
        {submitting ? 'Gerando prova…' : 'Gerar prova completa em draft'}
      </button>
    </form>

    {submitting && <div className={styles.overlay} role="status" aria-live="assertive" aria-busy="true">
      <div className={styles.overlayCard}>
        <div className={styles.heroSpinner}/>
        <span className={styles.eyebrow}>ROTA ADMIN • IA EM EXECUÇÃO</span>
        <h3>Gerando {preset.label}…</h3>
        <p>A IA está criando o plano e as questões em lotes de até 10. O draft parcial será preservado se alguma chamada falhar.</p>
        <div className={styles.progressBar}><span/></div>
        <div className={styles.meta}><span>● Processo ativo</span><strong>{formatElapsed(elapsed)}</strong></div>
        <small>Não feche nem atualize esta página. Gerações completas podem levar alguns minutos.</small>
      </div>
    </div>}
  </>;
}
