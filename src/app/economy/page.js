import { listCurrencies } from '@/services/adminRepository';
import styles from '@/app/section.module.css';

export default async function EconomyPage() {
  const currencies = await listCurrencies();
  return <div className={styles.page}><div className={styles.header}><div><h2>Economia</h2><p>Moedas, saldos, transações e recompensas devem ser server-authoritative. O cliente pede; a Edge Function valida e grava.</p></div></div><section className={styles.cards}><article className={styles.card}><h4>Moedas</h4><p>{currencies.length ? currencies.map(c => `${c.name} (${c.symbol})`).join(' • ') : 'Aguardando migration / cadastro.'}</p></article><article className={styles.card}><h4>Carteiras</h4><p>Saldo por carreira e moeda. O navegador nunca define seu próprio saldo.</p></article><article className={styles.card}><h4>Ledger</h4><p>Toda entrada e saída gera transação rastreável para auditoria e reversão.</p></article></section></div>;
}
