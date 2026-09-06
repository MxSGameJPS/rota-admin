import { updateLawFirmRecruitmentAction } from '@/app/actions/lawFirms';
import {
  LAW_FIRM_OFFER_TYPES_V1,
  LAW_FIRM_REQUIRED_SPECIALTIES_MATCH,
  normalizeLawFirmRecruitmentV1,
} from '@/schemas/lawFirmRecruitment';
import styles from './LawFirmRecruitmentEditor.module.css';

function Toggle({ name, checked, label }) {
  return <label className={styles.toggle}>
    <input type="checkbox" name={name} defaultChecked={checked}/>
    <span>{label}</span>
  </label>;
}

function NumberField({ name, label, value, min = 0, max, step = 1, suffix = '' }) {
  return <label className={styles.field}>
    <span>{label}</span>
    <div className={styles.numberWrap}>
      <input type="number" name={name} defaultValue={value} min={min} max={max} step={step}/>
      {suffix && <small>{suffix}</small>}
    </div>
  </label>;
}

function RoleSelect({ name, label, value, roles }) {
  return <label className={styles.field}>
    <span>{label}</span>
    <select name={name} defaultValue={value || ''}>
      <option value="">Nenhum cargo</option>
      {roles.map((role) => <option key={role.code} value={role.code}>{role.title} — {role.code}</option>)}
    </select>
  </label>;
}

function ThresholdGrid({ prefix, value }) {
  return <div className={styles.thresholdGrid}>
    <NumberField name={`${prefix}MinimumReputation`} label="Reputação mínima" value={value.minimumReputation} max={100}/>
    <NumberField name={`${prefix}MinimumXp`} label="XP mínimo" value={value.minimumXp}/>
    <NumberField name={`${prefix}MinimumCasesSolved`} label="Casos concluídos" value={value.minimumCasesSolved}/>
    <NumberField name={`${prefix}MinimumEthics`} label="Ética mínima" value={value.minimumEthics} max={100}/>
  </div>;
}

function RoleChecks({ name, roles, selected }) {
  const values = new Set(selected || []);
  return <div className={styles.choiceGrid}>
    {roles.map((role) => <label key={role.code} className={styles.choice}>
      <input type="checkbox" name={name} value={role.code} defaultChecked={values.has(role.code)}/>
      <span><strong>{role.title}</strong><small>{role.code}</small></span>
    </label>)}
  </div>;
}

function SpecialtyChecks({ name, specialties, selected }) {
  const values = new Set(selected || []);
  if (!specialties.length) return <p className={styles.muted}>Este escritório não possui especialidades cadastradas. Sem filtro por especialidade.</p>;
  return <div className={styles.choiceGrid}>
    {specialties.map((specialty) => <label key={specialty.slug} className={styles.choice}>
      <input type="checkbox" name={name} value={specialty.slug} defaultChecked={values.has(specialty.slug)}/>
      <span><strong>{specialty.name || specialty.slug}</strong><small>{specialty.slug}</small></span>
    </label>)}
  </div>;
}

function PolicyHeader({ title, description, toggleName, enabled }) {
  return <div className={styles.policyHeader}>
    <div><h4>{title}</h4><p>{description}</p></div>
    <Toggle name={toggleName} checked={enabled} label={enabled ? 'Ativo' : 'Habilitar'}/>
  </div>;
}

export default function LawFirmRecruitmentEditor({ firmId, recruitment, roles = [], specialties = [], status }) {
  const policy = normalizeLawFirmRecruitmentV1(recruitment);
  const legacy = recruitment?.recruitmentSchemaVersion !== 1;
  const disabled = status === 'archived';

  return <div className={styles.wrapper}>
    <div className={styles.contractBar}>
      <div><strong>Recruitment V1</strong><span>Schema {policy.recruitmentSchemaVersion}</span></div>
      <div><strong>Especialidades</strong><span>match {LAW_FIRM_REQUIRED_SPECIALTIES_MATCH}</span></div>
      <div><strong>Origem das propostas</strong><span>{LAW_FIRM_OFFER_TYPES_V1.join(' • ')}</span></div>
    </div>

    {legacy && <div className={styles.warning}>Este escritório usa uma política antiga. O formulário abaixo mostra a conversão para V1. Clique em <strong>Salvar política V1</strong> para congelar o novo contrato no banco.</div>}

    <form action={updateLawFirmRecruitmentAction.bind(null, firmId)} className={styles.form}>
      <fieldset disabled={disabled}>
        <section className={styles.policy}>
          <PolicyHeader title="Recrutamento de estágio" description="Pode convidar o jogador para entrar no escritório como estagiário." toggleName="internshipEnabled" enabled={policy.internshipRecruitment.enabled}/>
          <RoleSelect name="internshipRoleCode" label="Cargo oferecido" value={policy.internshipRecruitment.roleCode} roles={roles}/>
          <ThresholdGrid prefix="internship" value={policy.internshipRecruitment}/>
        </section>

        <section className={styles.policy}>
          <PolicyHeader title="Oferta pós-OAB" description="Primeiro emprego como advogado depois da aprovação no Exame da Ordem." toggleName="postOabEnabled" enabled={policy.postOabOffer.enabled}/>
          <RoleSelect name="postOabRoleCode" label="Cargo oferecido" value={policy.postOabOffer.roleCode} roles={roles}/>
          <ThresholdGrid prefix="postOab" value={policy.postOabOffer}/>
          <div className={styles.subsection}><strong>Especialidades aceitas</strong><small>V1 = ANY. Se nenhuma estiver marcada, não há requisito de especialidade.</small><SpecialtyChecks name="postOabRequiredSpecialties" specialties={specialties} selected={policy.postOabOffer.requiredSpecialties}/></div>
        </section>

        <section className={styles.policy}>
          <PolicyHeader title="Continuidade após estágio" description="Só considera o desempenho do jogador neste mesmo escritório." toggleName="continuityEnabled" enabled={policy.continuity.enabled}/>
          <div className={styles.thresholdGrid}>
            <NumberField name="continuityPerformanceWeight" label="Peso do desempenho" value={policy.continuity.internshipPerformanceWeight} max={100} suffix="%"/>
            <NumberField name="continuityMinimumPerformance" label="Mínimo para ter chance" value={policy.continuity.minimumPerformance} max={100}/>
            <NumberField name="continuityGuaranteedPerformance" label="Proposta garantida" value={policy.continuity.guaranteedPerformance} max={100}/>
          </div>
          <p className={styles.rule}>Abaixo do mínimo: 0%. No garantido ou acima: 100%. Entre os dois: interpolação linear. A continuidade sempre usa histórico vinculado ao mesmo <code>law_firm_id</code>.</p>
        </section>

        <section className={styles.policy}>
          <PolicyHeader title="Headhunting" description="O escritório procura profissionais que já estão no mercado." toggleName="headhuntingEnabled" enabled={policy.headhunting.enabled}/>
          <div className={styles.subsection}><strong>Cargos que podem ser oferecidos</strong><RoleChecks name="headhuntingRoleCodes" roles={roles} selected={policy.headhunting.eligibleRoleCodes}/></div>
          <ThresholdGrid prefix="headhunting" value={policy.headhunting}/>
          <div className={styles.thresholdGrid}>
            <NumberField name="headhuntingEvaluationChancePercent" label="Chance após elegibilidade" value={Math.round(policy.headhunting.evaluationChance * 10000) / 100} min={0} max={100} step={0.01} suffix="%"/>
            <NumberField name="headhuntingCooldownGameDays" label="Cooldown" value={policy.headhunting.cooldownGameDays} suffix="dias de jogo"/>
          </div>
          <div className={styles.subsection}><strong>Especialidades exigidas</strong><small>O jogador satisfaz o requisito se possuir qualquer uma das selecionadas.</small><SpecialtyChecks name="headhuntingRequiredSpecialties" specialties={specialties} selected={policy.headhunting.requiredSpecialties}/></div>
          <p className={styles.rule}>A chance só é sorteada depois que reputação, XP, casos, ética e especialidade forem aprovados.</p>
        </section>

        <section className={styles.policy}>
          <PolicyHeader title="Candidaturas" description="Permite que o jogador envie currículo voluntariamente." toggleName="applicationsEnabled" enabled={policy.applications.enabled}/>
          <div className={styles.subsection}><strong>Cargos abertos a candidatura</strong><RoleChecks name="applicationsRoleCodes" roles={roles} selected={policy.applications.eligibleRoleCodes}/></div>
          <ThresholdGrid prefix="applications" value={policy.applications}/>
          <NumberField name="applicationsCooldownGameDays" label="Cooldown após candidatura" value={policy.applications.cooldownGameDays} suffix="dias de jogo"/>
          <div className={styles.subsection}><strong>Especialidades exigidas</strong><SpecialtyChecks name="applicationsRequiredSpecialties" specialties={specialties} selected={policy.applications.requiredSpecialties}/></div>
        </section>

        <section className={styles.policy}>
          <PolicyHeader title="Pós-demissão" description="Permite oferta espontânea para jogador que acabou de perder um emprego." toggleName="postTerminationEnabled" enabled={policy.postTermination.enabled}/>
          <div className={styles.subsection}><strong>Cargos elegíveis</strong><RoleChecks name="postTerminationRoleCodes" roles={roles} selected={policy.postTermination.eligibleRoleCodes}/></div>
          <ThresholdGrid prefix="postTermination" value={policy.postTermination}/>
          <NumberField name="postTerminationCooldownGameDays" label="Cooldown após desligamento" value={policy.postTermination.cooldownGameDays} suffix="dias de jogo"/>
          <div className={styles.subsection}><strong>Especialidades exigidas</strong><SpecialtyChecks name="postTerminationRequiredSpecialties" specialties={specialties} selected={policy.postTermination.requiredSpecialties}/></div>
        </section>

        <div className={styles.footer}>
          <div><strong>Salário não é definido aqui.</strong><span>O Offer Engine deve copiar salário, carga horária, exclusividade, contrato e benefícios do cargo para <code>career_law_firm_offers.terms</code>.</span></div>
          <button type="submit" disabled={disabled}>{legacy ? 'Salvar e migrar para Recruitment V1' : 'Salvar política V1'}</button>
        </div>
      </fieldset>
    </form>
  </div>;
}
