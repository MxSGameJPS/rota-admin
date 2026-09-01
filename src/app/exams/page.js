import Link from 'next/link';
import { listExams } from '@/services/examService';
import { generateExamDraftAction } from '@/app/actions/exams';
import ExamGenerateForm from '@/components/ExamGenerateForm/ExamGenerateForm';
import StatusBadge from '@/components/StatusBadge/StatusBadge';
import styles from '@/app/section.module.css';

const labels = {
  oab_first_phase: 'OAB - 1ª Fase',
  mestrado: 'Mestrado',
  doutorado: 'Doutorado',
  concurso_juiz: 'Concurso Juiz',
  concurso_desembargador: 'Concurso Desembargador',
};

export default async function ExamsPage({ searchParams }) {
  const params = await searchParams;
  let exams = []; let loadError = null;
  try { exams = await listExams(); } catch (error) { loadError = error.message; }

  return <div className={styles.page}>
    <div className={styles.header}><div><h2>Exames & Concursos</h2><p>Administre OAB, Mestrado, Doutorado e concursos da carreira jurídica. Todo conteúdo de IA nasce como draft e só entra no jogo após revisão e publicação.</p></div></div>
    {(params?.error || loadError) && <div className={styles.error}>{params?.error || loadError}</div>}
    {params?.published && <div className={styles.notice}>Prova publicada no jogo.</div>}

    <section className={styles.panel}>
      <h3>Criar avaliação com IA</h3>
      <p>Presets do universo: OAB 80 questões; Mestrado 40; Doutorado 40; Juiz 20; Desembargador 20. Para Mestrado e Doutorado escolha o nível-alvo de 1 a 5. Nota de corte e duração dos novos módulos continuam sob controle do administrador.</p>
      <ExamGenerateForm action={generateExamDraftAction}/>
    </section>

    <section className={styles.panel}>
      <h3>Regras já registradas na progressão</h3>
      <p>Mestrado e Doutorado possuem 5 níveis sequenciais. Concurso para Juiz e Desembargador só pode ser prestado em Doutorado nível 4 ou 5. Convites especiais usam os requisitos acadêmicos e de reputação definidos no Supabase.</p>
    </section>

    <section className={styles.panel}><h3>Acervo de provas</h3>{exams.length === 0 ? <div className={styles.empty}>Nenhuma prova encontrada. Aplique primeiro as migrations do módulo de exames no Supabase.</div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Prova</th><th>Tipo</th><th>Nível</th><th>Ano</th><th>Questões</th><th>Corte</th><th>Status</th></tr></thead><tbody>{exams.map(exam => <tr key={exam.id}><td><Link href={`/exams/${exam.id}`}><strong>{exam.title}</strong></Link><br/><small>{exam.slug}</small></td><td>{labels[exam.exam_type] || exam.exam_type}</td><td>{exam.target_level ? `${exam.target_level}/5` : '—'}</td><td>{exam.year}</td><td>{exam.question_count}</td><td>{exam.passing_score}</td><td><StatusBadge status={exam.status}/></td></tr>)}</tbody></table></div>}</section>
  </div>;
}
