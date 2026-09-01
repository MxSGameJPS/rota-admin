import { updateJsonAction, publishAction } from '@/app/actions/content';
import styles from './JsonEditor.module.css';

export default function JsonEditor({ entityType, id, value, status }) {
  return <div className={styles.grid}>
    <form className={styles.editor} action={updateJsonAction.bind(null, entityType)}>
      <input type="hidden" name="id" value={id}/>
      <textarea name="json" defaultValue={JSON.stringify(value, null, 2)} spellCheck="false" disabled={status !== 'draft'}/>
      {status === 'draft' && <button>Salvar rascunho</button>}
    </form>
    <aside className={styles.side}>
      <h3>Validação obrigatória</h3>
      <p>Salvar executa o schema Zod oficial. JSON inválido ou fora do modelo é recusado.</p>
      <p>A publicação cria um snapshot em <code>content_versions</code> antes de liberar o conteúdo para o jogo.</p>
      {status === 'draft' && <form action={publishAction.bind(null, entityType)}><input type="hidden" name="id" value={id}/><button className={styles.publish}>Publicar no jogo</button></form>}
    </aside>
  </div>;
}
