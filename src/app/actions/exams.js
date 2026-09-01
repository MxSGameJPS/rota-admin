'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { generateStructured } from '@/lib/ai/provider';
import { examSchema } from '@/schemas/contracts';
import { OAB_46_SCOPE, OAB_46_SCOPE_SUMMARY } from '@/lib/exams/oabBlueprint';
import { createExamDraft, getExamForEditor, getMissingQuestionNumbers, publishExam, saveQuestionBatch, updateExamDraft, validateGeneratedBatch } from '@/services/examService';

async function generateMissingBatches(id, originalPrompt) {
  const exam = await getExamForEditor(id);
  let missing = await getMissingQuestionNumbers(id);
  while (missing.length) {
    const start = missing[0];
    const expected = OAB_46_SCOPE.filter(item => item.number >= start && item.number < start + 10 && missing.includes(item.number));
    const request = [
      `Crie o lote ${expected[0].number}-${expected[expected.length - 1].number} da nova prova simulada.`,
      `Briefing original do administrador: ${originalPrompt}`,
      'Mantenha o mesmo grau de exigência de uma primeira fase da OAB, mas produza situações, nomes e textos inteiramente novos.',
    ].join('\n');
    const generated = await generateStructured('examQuestionBatch', request, {
      expectedQuestions: expected,
      exam: { title: exam.title, year: exam.year, generationBrief: exam.generationBrief },
    });
    const questions = validateGeneratedBatch(generated, expected);
    await saveQuestionBatch(id, questions);
    missing = await getMissingQuestionNumbers(id);
  }
}

export async function generateExamDraftAction(formData) {
  const prompt = String(formData.get('prompt') || '').trim();
  if (prompt.length < 10) redirect(`/exams?error=${encodeURIComponent('Descreva melhor a prova que deseja criar.')}`);
  let id = null;
  let destination = '/exams';
  try {
    const generated = await generateStructured('exam', prompt, { scopeSummary: OAB_46_SCOPE_SUMMARY });
    const plan = examSchema.parse(generated);
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
