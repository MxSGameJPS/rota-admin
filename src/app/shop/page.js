import Link from 'next/link';
import { listCatalogItems } from '@/services/adminRepository';
import { generateDraftAction } from '@/app/actions/content';
import StatusBadge from '@/components/StatusBadge/StatusBadge';
import GenerateDraftForm from '@/components/GenerateDraftForm/GenerateDraftForm';
import styles from '@/app/section.module.css';

export default async function ShopPage({ searchParams }) {
  const params = await searchParams; const items = await listCatalogItems();
  return <div className={styles.page}>
    <div className={styles.header}><div><h2>Loja, Skins & Itens</h2><p>Catálogo administrável para cosméticos, escritório, utilidades e boosts moderados. Compra e consumo são validados no Supabase.</p></div></div>
    {params?.published && <div className={styles.notice}>Item publicado.</div>}{params?.error && <div className={styles.error}>{params.error}</div>}
    <section className={styles.panel}><h3>Criar item com IA</h3><GenerateDraftForm action={generateDraftAction.bind(null, 'item')} entityLabel="item" buttonLabel="Gerar item" placeholder="Ex.: Crie um terno executivo azul-marinho raro, cosmético, sem vantagem competitiva."/></section>
    <section className={styles.panel}><h3>Catálogo</h3>{items.length === 0 ? <div className={styles.empty}>Nenhum item cadastrado.</div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>SKU</th><th>Item</th><th>Tipo</th><th>Raridade</th><th>Preço</th><th>Status</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.sku}</td><td><Link href={`/shop/${item.id}`}><strong>{item.name}</strong></Link></td><td>{item.type}</td><td>{item.rarity}</td><td>{item.price_amount} {item.price_currency}</td><td><StatusBadge status={item.status}/></td></tr>)}</tbody></table></div>}</section>
  </div>;
}
