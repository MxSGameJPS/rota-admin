'use client';

import { useState } from 'react';
import * as A from '@/app/actions/ai';
import styles from './AISettings.module.css';

const EMPTY = {
  id: '',
  name: '',
  type: 'openai-compatible',
  enabled: true,
  isDefault: false,
  baseUrl: 'https://api.openai.com/v1',
  endpoint: '/chat/completions',
  model: '',
  apiKey: '',
  temperature: 0.35,
  maxTokens: 5000,
  timeout: 120000,
  method: 'POST',
  authType: 'bearer',
  authHeader: 'Authorization',
  queryKey: 'api_key',
  headersJson: '{}',
  bodyTemplate: '',
  responsePath: '',
};

const OMNIROUTE = {
  ...EMPTY,
  name: 'OmniRoute local',
  type: 'openai-compatible',
  enabled: true,
  isDefault: true,
  baseUrl: 'http://localhost:20128/v1',
  endpoint: '/chat/completions',
  temperature: 0.35,
  maxTokens: 7000,
  timeout: 120000,
};

function editShape(provider) {
  return {
    ...EMPTY,
    ...provider,
    apiKey: '',
    headersJson: provider.headersJson || '{}',
    bodyTemplate: provider.bodyTemplate || '',
  };
}

export default function AISettings({ initialProviders = [], initialError = '' }) {
  const [providers, setProviders] = useState(initialProviders);
  const [form, setForm] = useState({ ...EMPTY });
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(initialError);
  const [models, setModels] = useState([]);

  const selected = providers.find(item => item.id === selectedId) || null;
  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));

  async function reload(preferId = selectedId) {
    const next = await A.listProvidersAction();
    setProviders(next);
    if (preferId) {
      const item = next.find(provider => provider.id === preferId);
      if (item) {
        setSelectedId(item.id);
        setForm(editShape(item));
      }
    }
    return next;
  }

  function createNew() {
    setSelectedId('');
    setForm({ ...EMPTY });
    setModels([]);
    setMessage('');
  }

  function useOmniRoutePreset() {
    setSelectedId('');
    setForm({ ...OMNIROUTE });
    setModels([]);
    setMessage('Preset do OmniRoute aplicado. Informe a chave se necessária, salve e consulte os modelos.');
  }

  function selectProvider(provider) {
    setSelectedId(provider.id);
    setForm(editShape(provider));
    setModels([]);
    setMessage('');
  }

  function changeType(type) {
    const defaults = type === 'ollama'
      ? { baseUrl: 'http://localhost:11434', endpoint: '/api/chat', authType: 'none', model: '' }
      : type === 'custom-rest'
        ? { baseUrl: 'http://localhost:8000', endpoint: '', authType: 'bearer', model: '', responsePath: 'choices[0].message.content' }
        : { baseUrl: 'https://api.openai.com/v1', endpoint: '/chat/completions', authType: 'bearer', model: '' };
    setForm(current => ({ ...current, type, ...defaults }));
    setModels([]);
  }

  async function save({ consultModels = false } = {}) {
    setBusy(consultModels ? 'save-models' : 'save');
    setMessage('');
    try {
      const saved = await A.saveProviderAction(form);
      await reload(saved.id);
      if (consultModels && saved.type !== 'custom-rest') {
        const result = await A.listModelsAction(saved.id);
        setModels(result);
        setMessage(result.length
          ? `Provedor salvo. ${result.length} modelos encontrados. Escolha um modelo e salve novamente.`
          : 'Provedor salvo, mas a API não retornou modelos.');
      } else {
        setMessage(saved.model
          ? 'Provedor salvo localmente. A chave ficou criptografada no computador.'
          : 'Provedor salvo. Consulte os modelos, escolha um deles e salve novamente.');
      }
    } catch (error) {
      setMessage('Erro: ' + error.message);
    } finally {
      setBusy('');
    }
  }

  async function test() {
    if (!selectedId) return setMessage('Salve o provedor antes de testar.');
    if (!form.model && form.type !== 'custom-rest') return setMessage('Escolha e salve um modelo antes de testar.');
    setBusy('test');
    setMessage('');
    try {
      const result = await A.testProviderAction(selectedId);
      setMessage(`Conectado em ${result.elapsedMs} ms · HTTP ${result.status} · Modelo ${result.model || 'padrão'} · Resposta: ${result.text}`);
    } catch (error) {
      setMessage('Falha no teste: ' + error.message);
    } finally {
      setBusy('');
    }
  }

  async function loadModels() {
    if (!selectedId) return setMessage('Salve o provedor antes de consultar modelos.');
    setBusy('models');
    setMessage('');
    try {
      const result = await A.listModelsAction(selectedId);
      setModels(result);
      setMessage(result.length ? `${result.length} modelos encontrados.` : 'O provedor não retornou uma lista de modelos.');
    } catch (error) {
      setMessage('Falha ao consultar modelos: ' + error.message);
    } finally {
      setBusy('');
    }
  }

  async function remove() {
    if (!selectedId || !selected) return;
    if (!window.confirm(`Excluir o provedor “${selected.name}”?`)) return;
    setBusy('delete');
    try {
      await A.deleteProviderAction(selectedId);
      setProviders(await A.listProvidersAction());
      createNew();
      setMessage('Provedor removido.');
    } catch (error) {
      setMessage('Erro: ' + error.message);
    } finally {
      setBusy('');
    }
  }

  const isCustom = form.type === 'custom-rest';
  const isOllama = form.type === 'ollama';
  const isOmniRoute = form.baseUrl.replace(/\/+$/, '') === 'http://localhost:20128/v1';
  const errorMessage = message.startsWith('Erro') || message.startsWith('Falha');

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>CONFIGURAÇÕES</span>
          <h2>Inteligência Artificial</h2>
          <p>Configure OmniRoute, APIs compatíveis com OpenAI, Ollama ou endpoints REST personalizados. O Rota continua controlando o schema.</p>
        </div>
        <div className={styles.actions}>
          <button onClick={useOmniRoutePreset}>Preset OmniRoute</button>
          <button className={styles.primary} onClick={createNew}>Novo provedor</button>
        </div>
      </header>

      <div className={styles.layout}>
        <aside className={styles.providerList}>
          <div className={styles.sideTitle}>Provedores</div>
          {!providers.length && <div className={styles.empty}>Nenhum provedor configurado. O Content Studio continuará usando o template local.</div>}
          {providers.map(provider => (
            <button key={provider.id} className={`${styles.provider} ${selectedId === provider.id ? styles.providerActive : ''}`} onClick={() => selectProvider(provider)}>
              <strong>{provider.name}</strong>
              <span>{provider.type}{provider.isDefault ? ' · padrão' : ''}</span>
              <small className={provider.enabled ? styles.on : styles.off}>{provider.enabled ? 'Ativo' : 'Desativado'}</small>
            </button>
          ))}
        </aside>

        <main className={styles.panel}>
          {isOmniRoute && <div className={styles.notice}><strong>OmniRoute local detectado</strong><span>URL esperada: <code>http://localhost:20128/v1</code>. Salve, consulte os modelos e escolha qual o Admin deve usar.</span></div>}

          <div className={styles.grid2}>
            <label>Nome<input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex.: OmniRoute local" /></label>
            <label>Tipo<select value={form.type} onChange={e => changeType(e.target.value)}><option value="openai-compatible">API compatível com OpenAI</option><option value="ollama">Ollama local</option><option value="custom-rest">REST personalizado</option></select></label>
          </div>

          <label>URL base<input value={form.baseUrl} onChange={e => set('baseUrl', e.target.value)} placeholder="http://localhost:20128/v1" /></label>

          <div className={styles.grid2}>
            <label>Endpoint<input value={form.endpoint} onChange={e => set('endpoint', e.target.value)} placeholder={isOllama ? '/api/chat' : '/chat/completions'} /></label>
            <label>Modelo<input list="rota-ai-models" value={form.model} onChange={e => set('model', e.target.value)} placeholder="Escolha após consultar" /><datalist id="rota-ai-models">{models.map(model => <option key={model} value={model} />)}</datalist></label>
          </div>

          {!isOllama && <div className={styles.grid2}>
            <label>Chave da API<input type="password" autoComplete="off" value={form.apiKey} onChange={e => set('apiKey', e.target.value)} placeholder={selected?.hasApiKey ? `Mantida: ${selected.apiKeyMasked}` : 'Cole a chave, se houver'} /></label>
            <label>Autenticação<select value={form.authType} onChange={e => set('authType', e.target.value)}><option value="bearer">Bearer Token</option><option value="x-api-key">x-api-key</option><option value="custom-header">Header personalizado</option><option value="query">Query parameter</option><option value="none">Sem autenticação</option></select></label>
          </div>}

          {form.authType === 'custom-header' && <label>Nome do header<input value={form.authHeader} onChange={e => set('authHeader', e.target.value)} /></label>}
          {form.authType === 'query' && <label>Nome do parâmetro<input value={form.queryKey} onChange={e => set('queryKey', e.target.value)} /></label>}

          <div className={styles.grid3}>
            <label>Temperatura<input type="number" min="0" max="2" step="0.05" value={form.temperature} onChange={e => set('temperature', e.target.value)} /></label>
            <label>Máx. tokens<input type="number" min="1" value={form.maxTokens} onChange={e => set('maxTokens', e.target.value)} /></label>
            <label>Timeout (ms)<input type="number" min="1000" value={form.timeout} onChange={e => set('timeout', e.target.value)} /></label>
          </div>

          {isCustom && <>
            <div className={styles.grid2}>
              <label>Método<select value={form.method} onChange={e => set('method', e.target.value)}><option>POST</option><option>GET</option><option>PUT</option><option>PATCH</option></select></label>
              <label>Caminho do texto na resposta<input value={form.responsePath} onChange={e => set('responsePath', e.target.value)} placeholder="data.output.text" /></label>
            </div>
            <label>Template JSON da requisição<textarea rows="8" value={form.bodyTemplate} onChange={e => set('bodyTemplate', e.target.value)} placeholder={'{\n  "model": "{{model}}",\n  "prompt": "{{prompt}}",\n  "system_prompt": "{{systemPrompt}}"\n}'} /></label>
          </>}

          <label>Headers adicionais (JSON)<textarea rows="4" value={form.headersJson} onChange={e => set('headersJson', e.target.value)} /></label>

          <div className={styles.checks}>
            <label><input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} /> Ativo</label>
            <label><input type="checkbox" checked={form.isDefault} onChange={e => set('isDefault', e.target.checked)} /> Provedor padrão</label>
          </div>

          {message && <div className={errorMessage ? styles.error : styles.message}>{message}</div>}

          <div className={styles.actions}>
            <button className={styles.primary} onClick={() => save()} disabled={Boolean(busy)}>{busy === 'save' ? 'Salvando…' : 'Salvar'}</button>
            {!isCustom && <button onClick={() => save({ consultModels: true })} disabled={Boolean(busy)}>{busy === 'save-models' ? 'Consultando…' : 'Salvar e consultar modelos'}</button>}
            <button onClick={test} disabled={Boolean(busy) || !selectedId}>{busy === 'test' ? 'Testando…' : 'Testar conexão'}</button>
            {!isCustom && <button onClick={loadModels} disabled={Boolean(busy) || !selectedId}>{busy === 'models' ? 'Consultando…' : 'Consultar modelos'}</button>}
            {selectedId && <button className={styles.danger} onClick={remove} disabled={Boolean(busy)}>Excluir</button>}
          </div>

          <div className={styles.notice}><strong>Armazenamento local protegido</strong><span>As chaves são criptografadas com AES-256-GCM e nunca são devolvidas ao navegador. Os arquivos locais ficam em <code>data/ai-config/</code> e não entram no Git.</span></div>
        </main>
      </div>
    </div>
  );
}
