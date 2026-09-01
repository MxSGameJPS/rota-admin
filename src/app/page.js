import MetricCard from '@/components/MetricCard/MetricCard';
import { getDashboardStats } from '@/services/adminRepository';
import styles from './page.module.css';

export default async function DashboardPage() {
  const stats = await getDashboardStats();
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div><span>GAME MASTER</span><h2>Administre o jogo inteiro sem publicar uma nova build.</h2><p>Casos, NPCs, economia, loja, progressão e conteúdo vivo são publicados no Supabase e consumidos pelo Rota da Justiça.</p></div>
        <div className={stats.connected ? styles.online : styles.offline}>{stats.connected ? 'SUPABASE CONECTADO' : 'SUPABASE NÃO CONFIGURADO'}</div>
      </section>
      <section className={styles.metrics}>
        <MetricCard label="Casos" value={stats.cases} detail="rascunhos + publicados" />
        <MetricCard label="NPCs" value={stats.npcs} detail="universo persistente" />
        <MetricCard label="Itens" value={stats.items} detail="skins, boosts e cosméticos" />
        <MetricCard label="Recompensas" value={stats.rewards} detail="regras administráveis" />
      </section>
      <section className={styles.flow}><h3>Fluxo oficial de conteúdo</h3><div><b>Prompt / Editor</b><span>→</span><b>Schema oficial</b><span>→</span><b>Validação</b><span>→</span><b>Draft</b><span>→</span><b>Revisão</b><span>→</span><b>Publish</b><span>→</span><b>Supabase</b></div></section>
      {stats.warnings.length > 0 && <section className={styles.warning}><strong>Banco ainda incompleto</strong><p>Algumas tabelas administrativas ainda precisam da migration do Rota. Isso é esperado até você aplicá-la no SQL Editor.</p></section>}
    </div>
  );
}
