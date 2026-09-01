import Link from 'next/link';
import { listExams } from '@/services/examService';
import { generateExamDraftAction } from '@/app/actions/exams';
import GenerateDraftForm from '@/components/GenerateDraftForm/GenerateDraftForm';
import StatusBadge from '@/components/StatusBadge/StatusBadge';
import styles from '@/app/section.module.css';

export default async function ExamsPage({ searchParams }) {
  const params = await searchParams;
  let exams = []; let loadError = null;
  try { exams = await listExams(); } catch (error) { loadError = error.message; }
  return <div className={styles.page}>
    <div className={styles.header}><div><h2>Exames & Concursos</h2><p>Gerencie provas profissionais. A referência atual é o escopo do 46º Exame de Ordem de 2026; novas provas de IA são sempre simuladas e originais.</p></div></div>
    {(params?.error || loadError) && <div className={styles.error}>{params?.error || loadError}</div>}
    {params?.published && <div className={styles.notice}>Prova publicada no jogo.</div>}
    <section className={styles.panel}>
      <h3>Criar nova prova da OAB com IA</h3>
      <p>A IA cria uma prova nova em draft seguindo a distribuição de matérias, 80 questões, 5 horas e corte de 40 acertos. As questões são geradas em lotes para reduzir truncamentos do provider.</p>
      <GenerateDraftForm action={generateExamDraftAction} entityLabel="prova da OAB" buttonLabel="Gerar prova completa em draft" longRunning placeholder="Ex.: Crie um novo simulado de 1ª fase da OAB para 2027, no mesmo escopo e nível da referência de 2026, com situações jurídicas atuais e questões inteiramente originais."/>
    </section>
    <section className={styles.panel}><h3>Acervo de provas</h3>{exams.length === 0 ? <div className={styles.empty}>Nenhuma prova encontrada. Aplique primeiro as migrations do módulo de exames no Supabase.</div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Prova</th><th>Ano</th><th>Origem</th><th>Questões</th><th>Corte</th><th>Status</th></tr></thead><tbody>{exams.map(exam => <tr key={exam.id}><td><Link href={`/exams/${exam.id}`}><strong>{exam.title}</strong></Link><br/><small>{exam.slug}</small></td><td>{exam.year}</td><td>{exam.source_kind}</td><td>{exam.question_count}</td><td>{exam.passing_score}</td><td><StatusBadge status={exam.status}/></td></tr>)}</tbody></table></div>}</section>
  </div>;
}
