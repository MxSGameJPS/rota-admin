/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import LawFirmRecruitmentEditor from '@/components/LawFirmRecruitmentEditor/LawFirmRecruitmentEditor';
import StatusBadge from '@/components/StatusBadge/StatusBadge';
import {
  archiveLawFirmAction,
  publishLawFirmAction,
  regenerateLawFirmPortraitAction,
} from '@/app/actions/lawFirms';
import { getLawFirm } from '@/services/lawFirmService';
import styles from '@/app/section.module.css';

const marketLabels = { LOCAL: 'Local', REGIONAL: 'Regional', NATIONAL: 'Nacional', ELITE: 'Elite' };
const sizeLabels = { SMALL: 'Pequeno', MEDIUM: 'Médio', LARGE: 'Grande', MEGA: 'Mega escritório' };

function portraitOf(npc) {
  return npc?.metadata?.portrait?.url || npc?.metadata?.portraitSrc || '';
}

function transparentReady(npc) {
  const portrait = npc?.metadata?.portrait;
  return portrait?.status === 'READY' && portrait?.format === 'png' && portrait?.transparentBackground === true;
}

export default async function LawFirmDetailPage({ params, searchParams }) {
  const { id } = await params;
  const query = await searchParams;
  const firm = await getLawFirm(id);

  return <div className={styles.page}>
    <div className={styles.header}>
      <div>
        <Link href="/law-firms">← Escritórios</Link>
        <h2>{firm.name}</h2>
        <p>{marketLabels[firm.market_tier] || firm.market_tier} • {sizeLabels[firm.size_category] || firm.size_category} • Prestígio {firm.prestige}/100 • Reputação {firm.public_reputation}/100</p>
      </div>
      <StatusBadge status={firm.status}/>
    </div>

    {query?.created && <div className={styles.notice}>Escritório criado em draft. Cargos, membros, recrutamento V1 e NPCs novos foram montados; os retratos transparentes foram validados antes de serem salvos.</div>}
    {query?.recruitmentSaved && <div className={styles.notice}>Política de recrutamento V1 salva e validada contra os cargos e especialidades deste escritório.</div>}
    {query?.published && <div className={styles.notice}>Escritório, cargos e NPCs novos elegíveis foram publicados para o game.</div>}
    {query?.portrait && <div className={styles.notice}>Retrato regenerado e validado como PNG com fundo transparente.</div>}
    {query?.error && <div className={styles.error}>{query.error}</div>}

    <section className={styles.panel}>
      <h3>Identidade do escritório</h3>
      <div className={styles.cards}>
        <article className={styles.card}><h4>{firm.name}</h4><p>{firm.description}</p></article>
        <article className={styles.card}><h4>Mercado</h4><p>{marketLabels[firm.market_tier] || firm.market_tier} • {sizeLabels[firm.size_category] || firm.size_category}<br/>Estratégia territorial: {firm.location_strategy}</p></article>
        <article className={styles.card}><h4>Especialidades</h4><p>{(firm.specialties || []).map((item) => item.name || item.slug).join(' • ') || 'Não definidas'}</p></article>
      </div>
      <details className={styles.advancedDetails}>
        <summary>Ver cultura, distribuição de casos, disciplina e economia</summary>
        <pre className={styles.code}>{JSON.stringify({ culture: firm.culture, caseDistribution: firm.case_distribution, discipline: firm.discipline, economy: firm.economy }, null, 2)}</pre>
      </details>
    </section>

    <section className={styles.panel}>
      <h3>Cargos do escritório</h3>
      <p>Cargos são entidades do escritório. Recrutamento define quem pode receber cada cargo; salário, jornada, exclusividade e benefícios permanecem no próprio cargo.</p>
      <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th>Cargo</th><th>Tipo</th><th>Hierarquia</th><th>Contrato</th><th>Status</th></tr></thead>
        <tbody>{firm.roles.map((role) => <tr key={role.id}>
          <td><strong>{role.title}</strong><br/>{role.code}<br/>{role.maps_to_career_tier || 'Sem tier de carreira'}</td>
          <td>{role.role_type}<br/>{role.employment_type}</td>
          <td>Nível {role.hierarchy_level}<br/>{role.requires_oab ? 'Exige OAB' : 'Não exige OAB'}</td>
          <td>{role.salary_monthly_jr == null ? 'Salário variável' : `${Number(role.salary_monthly_jr).toLocaleString('pt-BR')} JR/mês`}<br/>{role.weekly_hours ? `${role.weekly_hours}h/semana` : 'Carga variável'}</td>
          <td><StatusBadge status={role.status}/></td>
        </tr>)}</tbody>
      </table></div>
    </section>

    <section className={styles.panel}>
      <h3>Mercado de trabalho e recrutamento</h3>
      <p>Este contrato é consumido pelo Offer Engine do jogo. O Admin define o perfil procurado; o jogo decide quando gerar uma proposta concreta e grava o snapshot em career_law_firm_offers.</p>
      <LawFirmRecruitmentEditor
        firmId={id}
        recruitment={firm.recruitment || {}}
        roles={firm.roles || []}
        specialties={firm.specialties || []}
        status={firm.status}
      />
    </section>

    <section className={styles.panel}>
      <h3>Equipe e NPCs persistentes</h3>
      <p>NPC e escritório são entidades independentes. O vínculo profissional está em law_firm_members, portanto o mesmo personagem poderá mudar de escritório no futuro sem ser recriado.</p>
      <div className={styles.assetList}>
        {firm.members.map((member) => {
          const npc = member.npc;
          const portrait = portraitOf(npc);
          const ready = transparentReady(npc);
          return <div className={styles.assetRow} key={member.id}>
            {portrait ? <img className={styles.assetThumb} src={portrait} alt={`Retrato de ${npc?.name || member.office_title}`} /> : <div className={styles.portraitPlaceholder}>Sem retrato</div>}
            <div>
              <strong>{npc?.name || 'NPC ausente'} — {member.office_title}</strong>
              <span>{npc?.slug || member.metadata?.npcSlug} • {member.role?.title || 'Cargo administrativo'} • {member.department_slug || 'sem departamento'}</span>
              <span>{npc?.status || 'indisponível'} • {ready ? 'PNG transparente validado' : 'retrato pendente/inválido'}</span>
              {npc?.id && <Link href={`/npcs/${npc.id}`}>Abrir NPC completo</Link>}
              {npc?.id && <form action={regenerateLawFirmPortraitAction.bind(null, id, npc.id)}><button className={styles.secondary}>Regenerar PNG transparente</button></form>}
            </div>
          </div>;
        })}
      </div>
    </section>

    <section className={styles.panel}>
      <h3>Validação e publicação</h3>
      <p>Para publicar, a política de recrutamento precisa estar no schema V1, todos os membros precisam estar ativos e possuir PNG transparente validado. NPCs novos criados por este escritório são publicados junto; NPC reutilizado que ainda estiver em draft precisa ser publicado separadamente.</p>
      <div className={styles.formGrid}>
        <form action={publishLawFirmAction.bind(null, id)}><button className={styles.primary} disabled={firm.status !== 'draft'}>{firm.status === 'draft' ? 'Publicar escritório no game' : 'Escritório já publicado'}</button></form>
        <form action={archiveLawFirmAction.bind(null, id)}><button className={styles.secondary}>Arquivar escritório</button></form>
      </div>
    </section>
  </div>;
}
