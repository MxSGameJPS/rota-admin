import { getSupabaseAdmin } from '@/lib/supabase/server';
import { examDraftSchema, examQuestionBatchSchema, examSchema } from '@/schemas/contracts';
import { getExamPreset, getExpectedQuestionScope } from '@/lib/exams/examBlueprints';

function requireClient() {
  const client = getSupabaseAdmin();
  if (!client) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.');
  return client;
}

function examRow(data, originalPrompt = '') {
  const preset = getExamPreset(data.examType);
  return {
    slug: data.slug,
    title: data.title,
    exam_type: data.examType,
    blueprint_id: data.examType,
    target_level: data.targetLevel ?? null,
    edition_number: data.editionNumber,
    year: data.year,
    official_applied_date: null,
    source_kind: 'ai_generated',
    source_label: data.sourceLabel,
    question_count: data.questionCount,
    passing_score: data.passingScore,
    duration_minutes: data.durationMinutes,
    eligibility_rules: { ...preset.eligibility, ...(data.eligibilityRules || {}) },
    status: 'draft',
    is_active: true,
    is_featured: false,
    simulation_notice: data.simulationNotice,
    disclaimer: data.disclaimer,
    generation_brief: data.generationBrief,
    metadata: {
      ...(data.metadata || {}),
      generationPrompt: originalPrompt,
      blueprint: data.examType,
      generatedOriginal: true,
    },
  };
}

function questionRow(examId, examType, question) {
  return {
    exam_id: examId,
    question_number: question.number,
    area: question.area,
    prompt: question.prompt,
    options: question.options,
    correct_option: question.correctOption,
    explanation: question.explanation,
    difficulty: question.difficulty,
    sort_order: question.number,
    source_metadata: { source: 'ai_generated', examType, original: true },
  };
}

async function uniqueSlug(client, desired) {
  const base = String(desired || '').trim();
  if (!base) throw new Error('A prova precisa de slug.');
  let candidate = base;
  for (let i = 1; i < 500; i += 1) {
    const { data, error } = await client.from('exams').select('id').eq('slug', candidate).maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
    candidate = `${base}-${i + 1}`;
  }
  throw new Error('Não foi possível criar um slug único para a prova.');
}

export async function listExams() {
  const client = requireClient();
  const { data, error } = await client.from('exams')
    .select('id,slug,title,exam_type,blueprint_id,target_level,edition_number,year,source_kind,question_count,passing_score,duration_minutes,status,is_active,is_featured,updated_at')
    .order('year', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createExamDraft(planInput, originalPrompt) {
  const client = requireClient();
  const plan = examSchema.parse(planInput);
  const slug = await uniqueSlug(client, plan.slug);
  const { data, error } = await client.from('exams').insert(examRow({ ...plan, slug }, originalPrompt)).select('id').single();
  if (error) throw error;
  await client.from('admin_audit_logs').insert({ action: 'create_exam_draft', entity_type: 'exam', entity_id: data.id, payload: { source: 'ai', slug, examType: plan.examType, targetLevel: plan.targetLevel } });
  return data.id;
}

export async function getExamForEditor(id) {
  const client = requireClient();
  const { data: exam, error } = await client.from('exams').select('*').eq('id', id).single();
  if (error) throw error;
  const { data: questions, error: qError } = await client.from('exam_questions').select('*').eq('exam_id', id).order('question_number');
  if (qError) throw qError;
  return {
    id: exam.id,
    slug: exam.slug,
    title: exam.title,
    examType: exam.exam_type,
    blueprintId: exam.blueprint_id || exam.exam_type,
    targetLevel: exam.target_level ?? null,
    editionNumber: exam.edition_number,
    year: exam.year,
    sourceKind: exam.source_kind,
    sourceLabel: exam.source_label || '',
    questionCount: exam.question_count,
    passingScore: exam.passing_score,
    durationMinutes: exam.duration_minutes,
    simulationNotice: exam.simulation_notice || '',
    disclaimer: exam.disclaimer || '',
    generationBrief: exam.generation_brief || '',
    eligibilityRules: exam.eligibility_rules || {},
    metadata: exam.metadata || {},
    status: exam.status,
    questions: (questions || []).map(q => ({ number: q.question_number, area: q.area, prompt: q.prompt, options: q.options, correctOption: q.correct_option, explanation: q.explanation || '', difficulty: q.difficulty || 'média' })),
  };
}

export async function getMissingQuestionNumbers(id) {
  const exam = await getExamForEditor(id);
  const existing = new Set(exam.questions.map(q => q.number));
  return getExpectedQuestionScope(exam).map(i => i.number).filter(n => !existing.has(n));
}

export function validateGeneratedBatch(batchInput, expectedQuestions) {
  const batch = examQuestionBatchSchema.parse(batchInput);
  const expected = new Map(expectedQuestions.map(item => [item.number, item.area || null]));
  if (batch.questions.length !== expectedQuestions.length) throw new Error(`A IA retornou ${batch.questions.length} questões; eram esperadas ${expectedQuestions.length}.`);
  const seen = new Set();
  for (const q of batch.questions) {
    if (!expected.has(q.number)) throw new Error(`Questão inesperada no lote: ${q.number}.`);
    if (seen.has(q.number)) throw new Error(`Questão duplicada no lote: ${q.number}.`);
    const requiredArea = expected.get(q.number);
    if (requiredArea && q.area !== requiredArea) throw new Error(`A questão ${q.number} deveria ser de ${requiredArea}, mas veio como ${q.area}.`);
    const ids = q.options.map(o => o.id);
    if (new Set(ids).size !== 4 || !['A','B','C','D'].every(id => ids.includes(id))) throw new Error(`Questão ${q.number} precisa ter alternativas A, B, C e D.`);
    seen.add(q.number);
  }
  return batch.questions.sort((a,b) => a.number - b.number);
}

export async function saveQuestionBatch(id, questions) {
  const client = requireClient();
  const { data: exam, error: readError } = await client.from('exams').select('status,source_kind,exam_type').eq('id', id).single();
  if (readError) throw readError;
  if (exam.status !== 'draft') throw new Error('Somente provas em draft podem receber questões.');
  if (exam.source_kind === 'official_reference') throw new Error('A prova oficial de referência é somente leitura no Admin.');
  const rows = questions.map(q => questionRow(id, exam.exam_type, q));
  const { error } = await client.from('exam_questions').upsert(rows, { onConflict: 'exam_id,question_number' });
  if (error) throw error;
}

export async function updateExamDraft(id, rawInput) {
  const client = requireClient();
  const parsed = examDraftSchema.parse(rawInput);
  const { data: current, error: readError } = await client.from('exams').select('status,source_kind').eq('id', id).single();
  if (readError) throw readError;
  if (current.status !== 'draft') throw new Error('Somente provas em draft podem ser editadas.');
  if (current.source_kind === 'official_reference') throw new Error('A prova oficial de referência não pode ser alterada por este editor.');
  const { error } = await client.from('exams').update(examRow(parsed, parsed.metadata?.generationPrompt || '')).eq('id', id);
  if (error) throw error;
  const numbers = parsed.questions.map(q => q.number);
  if (new Set(numbers).size !== numbers.length) throw new Error('Existem números de questão duplicados.');
  await client.from('exam_questions').delete().eq('exam_id', id);
  if (parsed.questions.length) {
    const { error: qError } = await client.from('exam_questions').insert(parsed.questions.map(q => questionRow(id, parsed.examType, q)));
    if (qError) throw qError;
  }
  await client.from('admin_audit_logs').insert({ action: 'update_exam_draft', entity_type: 'exam', entity_id: id, payload: { questionCount: parsed.questions.length, examType: parsed.examType, targetLevel: parsed.targetLevel } });
}

export async function publishExam(id) {
  const client = requireClient();
  const exam = await getExamForEditor(id);
  if (exam.status !== 'draft') throw new Error('Somente provas em draft podem ser publicadas.');
  if (exam.questions.length !== exam.questionCount) throw new Error(`A prova possui ${exam.questions.length}/${exam.questionCount} questões. Complete a geração antes de publicar.`);

  const expectedScope = getExpectedQuestionScope(exam);
  const expectedNumbers = expectedScope.map(i => i.number);
  const numbers = exam.questions.map(q => q.number).sort((a,b) => a-b);
  if (numbers.some((n,i) => n !== expectedNumbers[i])) throw new Error(`A prova deve conter exatamente as questões numeradas de 1 a ${exam.questionCount}.`);

  if (exam.examType === 'oab_first_phase') {
    for (const q of exam.questions) {
      const expectedArea = expectedScope.find(i => i.number === q.number)?.area;
      if (q.area !== expectedArea) throw new Error(`Questão ${q.number}: área esperada ${expectedArea}.`);
    }
  }

  const snapshot = { ...exam, status: 'published' };
  await client.from('content_versions').insert({ entity_type: 'exam', entity_id: id, version: 1, snapshot });
  const { error } = await client.from('exams').update({ status: 'published', is_active: true, published_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  await client.from('admin_audit_logs').insert({ action: 'publish', entity_type: 'exam', entity_id: id, payload: { questions: exam.questionCount, examType: exam.examType, targetLevel: exam.targetLevel } });
}
