import styles from './MetricCard.module.css';

export default function MetricCard({ label, value, detail }) {
  return <article className={styles.card}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}
