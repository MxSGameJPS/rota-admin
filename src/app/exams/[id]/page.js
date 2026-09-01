import Link from 'next/link';
import ExamEditor from '@/components/ExamEditor/ExamEditor';
import { getExamForEditor } from '@/services/examService';
import styles from '@/app/section.module.css';

export default async function ExamDetailPage({ params, searchParams }) {
  const { id } = await params; const query = await searchParams;
  let exam;
  try { exam = await getExamForEditor(id); } catch (error) { return <div className={styles.page}><div className={styles.error}>{error.message}</div><Link href="/exams">← Voltar</Link></div>; }
  return <div className={styles.page}>
    <div className={styles.header}><div><Link href="/exams">← Exames</Link><h2>{exam.title}</h2><p>{exam.questions.length}/80 questões • {exam.status} • {exam.sourceKind}</p></div></div>
    {query?.created && <div className={styles.notice}>Draft criado e questões geradas.</div>}
    {query?.generated && <div className={styles.notice}>Geração de questões concluída.</div>}
    {query?.updated && <div className={styles.notice}>Rascunho salvo.</div>}
    {query?.partial && <div className={styles.notice}>O draft foi preservado. Você pode continuar a geração abaixo.</div>}
    {query?.error && <div className={styles.error}>{query.error}</div>}
    <ExamEditor exam={exam}/>
  </div>;
}
