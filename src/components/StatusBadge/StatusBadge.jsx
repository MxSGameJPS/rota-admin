import styles from './StatusBadge.module.css';
export default function StatusBadge({ status = 'draft' }) { return <span className={`${styles.badge} ${styles[status] || ''}`}>{status}</span>; }
