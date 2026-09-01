import Sidebar from '@/components/Sidebar/Sidebar';
import styles from './AdminShell.module.css';

export default function AdminShell({ children }) {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <span className={styles.kicker}>AMBIENTE LOCAL • GAME MASTER</span>
            <h1>Rota da Justiça Admin</h1>
          </div>
          <div className={styles.localBadge}>127.0.0.1:3001</div>
        </header>
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}
