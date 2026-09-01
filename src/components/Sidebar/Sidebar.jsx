import Link from 'next/link';
import styles from './Sidebar.module.css';

const links = [
  ['/', 'Dashboard'],
  ['/cases', 'Casos'],
  ['/npcs', 'NPCs'],
  ['/economy', 'Economia'],
  ['/shop', 'Loja & Skins'],
  ['/progression', 'Progressão'],
  ['/social-juridico', 'Social Jurídico In-Game'],
  ['/studio', 'AI Content Studio'],
  ['/configuracoes/ia', 'Configurações de IA'],
];

export default function Sidebar() {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <div className={styles.mark}>RJ</div>
        <div><strong>ROTA ADMIN</strong><span>Controle do universo</span></div>
      </div>
      <nav>{links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</nav>
      <div className={styles.footer}>Local only<br/><span>Nunca publicar a service_role.</span></div>
    </aside>
  );
}
