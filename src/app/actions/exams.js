'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { generateStructured } from '@/lib/ai/provider';
import { examSchema } from '@/schemas/contracts';
import { getExamPreset, getExpectedQuestionScope } from '@/lib/exams/examBlueprints';
import { createExamDraft, getExamForEditor, getMissingQuestionNumbers, publishExam, saveQuestionBatch, updateExamDraft, validateGeneratedBatch } from '@/services/examService';

async function generateMissingBatches(id, originalPrompt) {
  const exam = await getExamForEditor(id);
  const fullScope = getExpectedQuestionScope(exam);
  let missing = await getMissingQuestionNumbers(id);
  while (missing.length) {
    const start = missing[0];
    const expected = fullScope.filter(item => item.number >= start && item.number < start + 10 && missing.includes(item.number));
    const request = [
      `Crie o lote ${expected[0].number}-${expected[expected.length - 1].number} desta avaliação simulada.`,
      `Tipo: ${exam.examType}.`,
      exam.targetLevel ? `Nível acadêmico-alvo: ${exam.targetLevel}/5.` : '',
      `Briefing original do administrador: ${originalPrompt}`,
      'Produza questões inteiramente novas, coerentes com a finalidade e o nível desta avaliação.',
    ].filter(Boolean).join('\n');
    const generated = await generateStructured('examQuestionBatch', request, {
      expectedQuestions: expected,
      exam: {
        title: exam.title,
        examType: exam.examType,
        targetLevel: exam.targetLevel,
        year: exam.year,
        questionCount: exam.questionCount,
        passingScore: exam.passingScore,
        generationBrief: exam.generationBrief,
      },
    });
    const questions = validateGeneratedBatch(generated, expected);
    await saveQuestionBatch(id, questions);
    missing = await getMissingQuestionNumbers(id);
  }
}

export async function generateExamDraftAction(formData) {
  const prompt = String(formData.get('prompt') || '').trim();
  const examType = String(formData.get('examType') || 'oab_first_phase');
  const preset = getExamPreset(examType);
  const targetLevelRaw = String(formData.get('targetLevel') || '').trim();
  const targetLevel = preset.targetLevels ? Number(targetLevelRaw) : null;
  const passingScore = preset.fixedPassingScore ?? Number(formData.get('passingScore'));
  const durationMinutes = preset.fixedDurationMinutes ?? Number(formData.get('durationMinutes'));

  if (prompt.length < 10) redirect(`/exams?error=${encodeURIComponent('Descreva melhor a prova que deseja criar.')}`);
  if (!Number.isInteger(passingScore) || passingScore <= 0 || passingScore > preset.questionCount) redirect(`/exams?error=${encodeURIComponent('Informe uma nota de corte válida.')}`);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 600) redirect(`/exams?error=${encodeURIComponent('Informe uma duração válida entre 15 e 600 minutos.')}`);
  if (preset.targetLevels && (!Number.isInteger(targetLevel) || targetLevel < 1 || targetLevel > 5)) redirect(`/exams?error=${encodeURIComponent('Informe o nível-alvo de 1 a 5.')}`);

  let id = null;
  let destination = '/exams';
  try {
    const generated = await generateStructured('exam', prompt, {
      preset,
      examType,
      targetLevel,
      questionCount: preset.questionCount,
      passingScore,
      durationMinutes,
    });

    const plan = examSchema.parse({
      ...generated,
      examType,
      targetLevel,
      questionCount: preset.questionCount,
      passingScore,
      durationMinutes,
      eligibilityRules: preset.eligibility,
      sourceKind: 'ai_generated',
    });

    id = await createExamDraft(plan, prompt);
    await generateMissingBatches(id, prompt);
    revalidatePath('/exams');
    destination = `/exams/${id}?created=1`;
  } catch (error) {
    const message = error?.message || 'Falha ao gerar prova.';
    destination = id ? `/exams/${id}?partial=1&error=${encodeURIComponent(message)}` : `/exams?error=${encodeURIComponent(message)}`;
  }
  redirect(destination);
}

export async function continueExamGenerationAction(formData) {
  const id = String(formData.get('id') || '');
  let destination = `/exams/${id}`;
  try {
    const exam = await getExamForEditor(id);
    const prompt = String(exam.metadata?.generationPrompt || exam.generationBrief || '').trim();
    if (!prompt) throw new Error('Este draft não possui o briefing original da geração.');
    await generateMissingBatches(id, prompt);
    revalidatePath(`/exams/${id}`);
    destination = `/exams/${id}?generated=1`;
  } catch (error) {
    destination = `/exams/${id}?error=${encodeURIComponent(error?.message || 'Falha ao continuar a geração.')}`;
  }
  redirect(destination);
}

export async function updateExamJsonAction(formData) {
  const id = String(formData.get('id') || '');
  let destination = `/exams/${id}`;
  try {
    const raw = JSON.parse(String(formData.get('json') || '{}'));
    delete raw.id;
    await updateExamDraft(id, raw);
    revalidatePath(`/exams/${id}`);
    destination = `/exams/${id}?updated=1`;
  } catch (error) {
    destination = `/exams/${id}?error=${encodeURIComponent(error?.message || 'JSON inválido.')}`;
  }
  redirect(destination);
}

export async function publishExamAction(formData) {
  const id = String(formData.get('id') || '');
  let destination = '/exams?published=1';
  try {
    await publishExam(id);
    revalidatePath('/exams');
  } catch (error) {
    destination = `/exams/${id}?error=${encodeURIComponent(error?.message || 'Falha ao publicar prova.')}`;
  }
  redirect(destination);
}
