import { listCatalogItems } from '@/services/adminRepository';
import { generateDraftAction, publishAction } from '@/app/actions/content';
import StatusBadge from '@/components/StatusBadge/StatusBadge';
import styles from '@/app/section.module.css';

export default async function ShopPage({ searchParams }) {
  const params = await searchParams;
  const items = await listCatalogItems();
  return <div className={styles.page}>
    <div className={styles.header}><div><h2>Loja, Skins & Itens</h2><p>Catálogo administrável para cosméticos, escritório, utilidades e boosts moderados. Compra e consumo serão validados por Edge Functions.</p></div></div>
    {params?.created && <div className={styles.notice}>Item salvo como rascunho.</div>}{params?.published && <div className={styles.notice}>Item publicado.</div>}{params?.error && <div className={styles.error}>{params.error}</div>}
    <section className={styles.panel}><h3>Criar item com IA</h3><form className={styles.form} action={generateDraftAction.bind(null, 'item')}><textarea name="prompt" placeholder="Ex.: Crie um terno executivo azul-marinho raro, cosmético, sem vantagem competitiva." required/><button className={styles.primary}>Gerar item</button></form></section>
    <section className={styles.panel}><h3>Catálogo</h3>{items.length === 0 ? <div className={styles.empty}>Nenhum item cadastrado.</div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>SKU</th><th>Item</th><th>Tipo</th><th>Raridade</th><th>Preço</th><th>Status</th><th>Ação</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.sku}</td><td><strong>{item.name}</strong></td><td>{item.type}</td><td>{item.rarity}</td><td>{item.price_amount} {item.price_currency}</td><td><StatusBadge status={item.status}/></td><td>{item.status === 'draft' ? <form action={publishAction.bind(null,'item')}><input type="hidden" name="id" value={item.id}/><button className={styles.secondary}>Publicar</button></form> : '—'}</td></tr>)}</tbody></table></div>}</section>
  </div>;
}
