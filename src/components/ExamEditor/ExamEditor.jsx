import { continueExamGenerationAction, publishExamAction, updateExamJsonAction } from '@/app/actions/exams';
import styles from './ExamEditor.module.css';

export default function ExamEditor({ exam }) {
  const isDraft = exam.status === 'draft';
  const isOfficial = exam.sourceKind === 'official_reference';
  const missing = Math.max(0, exam.questionCount - exam.questions.length);
  const isOab = exam.examType === 'oab_first_phase';

  return <div className={styles.grid}>
    <form className={styles.editor} action={updateExamJsonAction}>
      <input type="hidden" name="id" value={exam.id}/>
      <div className={styles.summary}><strong>{exam.questions.length}/{exam.questionCount} questões</strong><span>{exam.sourceKind}</span></div>
      <textarea name="json" defaultValue={JSON.stringify(exam, null, 2)} spellCheck="false" disabled={!isDraft || isOfficial}/>
      {isDraft && !isOfficial && <button>Salvar rascunho</button>}
    </form>
    <aside className={styles.side}>
      <h3>Validação da prova</h3>
      <p>A publicação exige exatamente {exam.questionCount} questões numeradas de 1 a {exam.questionCount}, quatro alternativas A-D e uma única resposta correta.</p>
      {isOab && <p>A OAB também preserva a distribuição de matérias do escopo de referência do 46º Exame de 2026.</p>}
      {exam.targetLevel && <div className={styles.info}>Progressão acadêmica: nível-alvo {exam.targetLevel}/5. O jogador precisa avançar sequencialmente.</div>}
      {(exam.examType === 'concurso_juiz' || exam.examType === 'concurso_desembargador') && <div className={styles.info}>Elegibilidade do jogo: Doutorado nível 4 ou 5.</div>}
      {isOfficial && <div className={styles.info}>Referência oficial importada. Este registro é somente leitura no Admin.</div>}
      {isDraft && !isOfficial && missing > 0 && <form action={continueExamGenerationAction}>
        <input type="hidden" name="id" value={exam.id}/>
        <button className={styles.generate}>Gerar {missing} questões restantes com IA</button>
      </form>}
      {isDraft && !isOfficial && missing === 0 && <form action={publishExamAction}>
        <input type="hidden" name="id" value={exam.id}/>
        <button className={styles.publish}>Publicar no jogo</button>
      </form>}
      {exam.status === 'published' && <div className={styles.ready}>Publicada e disponível para o jogo.</div>}
    </aside>
  </div>;
}
