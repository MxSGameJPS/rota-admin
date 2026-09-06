import Link from 'next/link';
import StatusBadge from '@/components/StatusBadge/StatusBadge';
import {
  BUSINESS_TYPES,
  GAME_USE_TYPES,
  OFFER_TYPES,
  PERIOD_TYPES,
  getEstablishment,
} from '@/services/establishmentService';
import { hasEstablishmentImageGenerationConfigured } from '@/services/establishmentMediaService';
import {
  archiveEstablishmentAction,
  createOfferAction,
  generateEstablishmentMediaAction,
  publishEstablishmentAction,
  updateEstablishmentAction,
} from '@/app/actions/establishments';
import styles from '@/app/section.module.css';

const businessLabels = {
  IMOBILIARIA: 'Imobiliária', HOTEL: 'Hotel', POUSADA: 'Pousada', LOCADORA: 'Locadora',
  CONCESSIONARIA: 'Concessionária', LOJA_VEICULOS: 'Loja de veículos', ESCRITORIO: 'Escritório',
  RESTAURANTE: 'Restaurante', FARMACIA: 'Farmácia', MERCADO: 'Mercado', POSTO: 'Posto',
  ACADEMIA: 'Academia', CLINICA: 'Clínica', BANCO: 'Banco', SHOPPING: 'Shopping', OUTRO: 'Outro',
};

const gameLabels = {
  MAP_ONLY: 'Somente presença no mapa', SERVICE_PROVIDER: 'Prestador de serviços',
  VISITABLE: 'Local visitável', MIXED: 'Visitável + serviços + mídia',
};

const offerLabels = {
  ALUGUEL: 'Aluguel', VENDA: 'Venda', HOSPEDAGEM: 'Hospedagem', LOCACAO_VEICULO: 'Locação de veículo', SERVICO: 'Serviço', OUTRO: 'Outro',
};

const periodLabels = { NONE: 'Sem período', HOUR: 'Por hora', DAY: 'Por dia', MONTH: 'Por mês', ONE_TIME: 'Pagamento único' };
const mediaLabels = { LOGO: 'Logo', BANNER_HORIZONTAL: 'Banner horizontal', BANNER_VERTICAL: 'Banner vertical', FACADE: 'Fachada', INTERIOR: 'Interior', GALLERY: 'Galeria', PROMO: 'Promocional' };

function money(value) {
  if (value == null) return 'Sob consulta';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default async function EstablishmentDetailPage({ params, searchParams }) {
  const { id } = await params;
  const query = await searchParams;
  const [item, imageConfigured] = await Promise.all([
    getEstablishment(id),
    hasEstablishmentImageGenerationConfigured(),
  ]);

  return <div className={styles.page}>
    <div className={styles.header}>
      <div>
        <Link href="/establishments">← Estabelecimentos</Link>
        <h2>{item.name}</h2>
        <p>{item.city?.name} / {item.city?.state_code} • {businessLabels[item.business_type] || item.business_type} • {item.is_sponsored ? 'PATROCINADO' : item.is_fictional ? 'FICTÍCIO' : 'REAL'}</p>
      </div>
      <StatusBadge status={item.status}/>
    </div>

    {query?.generated && <div className={styles.notice}>Estabelecimento gerado pela IA. Revise os dados e a mídia antes de publicar.</div>}
    {query?.created && <div className={styles.notice}>Draft criado manualmente.</div>}
    {query?.saved && <div className={styles.notice}>Alterações salvas.</div>}
    {query?.published && <div className={styles.notice}>Estabelecimento publicado para o game.</div>}
    {query?.offerCreated && <div className={styles.notice}>Oferta adicionada.</div>}
    {query?.mediaGenerated && <div className={styles.notice}>Mídia {query.mediaGenerated} gerada e vinculada.</div>}
    {query?.error && <div className={styles.error}>{query.error}</div>}

    <section className={styles.panel}>
      <h3>Identidade e presença no jogo</h3>
      <form className={styles.form} action={updateEstablishmentAction.bind(null, id)}>
        <div className={styles.formGrid}>
          <label>Nome<input name="name" defaultValue={item.name || ''} required /></label>
          <label>Slug<input name="slug" defaultValue={item.slug || ''} required /></label>
          <label>Tipo<select name="businessType" defaultValue={item.business_type}>{BUSINESS_TYPES.map(type => <option key={type} value={type}>{businessLabels[type] || type}</option>)}</select></label>
          <label>Subcategoria<input name="subcategory" defaultValue={item.subcategory || ''} /></label>
          <label>Uso no game<select name="gameUseType" defaultValue={item.game_use_type || 'MIXED'}>{GAME_USE_TYPES.map(type => <option key={type} value={type}>{gameLabels[type] || type}</option>)}</select></label>
          <label>Faixa de preço<input name="priceRange" defaultValue={item.price_range || ''} placeholder="Ex.: R$ a R$$$" /></label>
        </div>
        <label>Descrição<textarea name="description" defaultValue={item.description || ''} required /></label>
        <div className={styles.formGrid}>
          <label>Slogan<input name="slogan" defaultValue={item.slogan || ''} /></label>
          <label>Estilo visual<input name="visualStyle" defaultValue={item.visual_style || ''} /></label>
          <label>Bairro<input name="district" defaultValue={item.district || ''} /></label>
          <label>Rua/avenida narrativa<input name="streetName" defaultValue={item.street_name || ''} /></label>
          <label>Número/referência<input name="numberReference" defaultValue={item.number_reference || ''} /></label>
          <label>Telefone<input name="phone" defaultValue={item.phone || ''} /></label>
          <label>WhatsApp<input name="whatsapp" defaultValue={item.whatsapp || ''} /></label>
          <label>E-mail<input name="email" defaultValue={item.email || ''} /></label>
          <label>Site<input name="website" defaultValue={item.website || ''} /></label>
          <label>Instagram<input name="instagram" defaultValue={item.instagram || ''} /></label>
        </div>
        <label>Notas de localização<textarea name="locationNotes" defaultValue={item.location_notes || ''} /></label>

        <div className={styles.formGrid}>
          <label><input type="checkbox" name="isFictional" defaultChecked={item.is_fictional} /> Fictício</label>
          <label><input type="checkbox" name="isSponsored" defaultChecked={item.is_sponsored} /> Patrocinado</label>
          <label><input type="checkbox" name="isVisitable" defaultChecked={item.is_visitable} /> Visitável</label>
          <label><input type="checkbox" name="isActive" defaultChecked={item.is_active} /> Ativo</label>
          <label><input type="checkbox" name="allowBillboardAds" defaultChecked={item.allow_billboard_ads} /> Permite outdoor/banner</label>
          <label><input type="checkbox" name="allowInteriorAds" defaultChecked={item.allow_interior_ads} /> Permite mídia interna</label>
          <label><input type="checkbox" name="allowMapHighlight" defaultChecked={item.allow_map_highlight} /> Permite destaque no mapa</label>
          <label><input type="checkbox" name="allowSponsoredTag" defaultChecked={item.allow_sponsored_tag} /> Exibir selo patrocinado</label>
        </div>

        <div className={styles.formGrid}>
          <label>Patrocinador / razão comercial<input name="sponsorName" defaultValue={item.sponsor_name || ''} placeholder="Preencher apenas quando houver contrato real" /></label>
          <label>Referência do contrato<input name="sponsorContractRef" defaultValue={item.sponsor_contract_ref || ''} /></label>
        </div>
        <button className={styles.primary}>Salvar estabelecimento</button>
      </form>
    </section>

    <section className={styles.panel}>
      <h3>Mídia e identidade visual</h3>
      <p>As imagens geradas agora são fictícias. Quando houver patrocinador real, você poderá substituir os assets pelos arquivos oficiais da marca.</p>
      {!imageConfigured && <div className={styles.warningList}>Geração de imagens não configurada. Configure um provedor de imagem em Configurações de IA.</div>}
      <div className={styles.formGrid}>
        {['LOGO', 'BANNER_HORIZONTAL', 'FACADE', 'INTERIOR'].map(type => <form key={type} action={generateEstablishmentMediaAction.bind(null, id, type)}>
          <button className={styles.secondary} disabled={!imageConfigured}>Gerar {mediaLabels[type]}</button>
        </form>)}
      </div>
      {item.media.length === 0 ? <div className={styles.empty}>Nenhuma mídia vinculada.</div> : <div className={styles.assetList}>
        {item.media.map(media => <div className={styles.assetRow} key={media.id}>
          <img className={styles.assetThumb} src={media.url} alt={media.alt_text || media.media_type} />
          <div><strong>{mediaLabels[media.media_type] || media.media_type}</strong><span>{media.source_type} • {media.storage_path || 'URL externa'}</span><a href={media.url} target="_blank" rel="noreferrer">Abrir imagem</a></div>
        </div>)}
      </div>}
    </section>

    <section className={styles.panel}>
      <h3>Ofertas e serviços jogáveis</h3>
      <p>Esses itens viram ações econômicas no game: aluguel de sala, hospedagem, compra de veículo, locação de carro e outros serviços.</p>
      {item.offers.length > 0 && <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th>Oferta</th><th>Tipo</th><th>Preço</th><th>Período</th><th>Disponível</th></tr></thead>
        <tbody>{item.offers.map(offer => <tr key={offer.id}><td><strong>{offer.title}</strong><br/>{offer.description}</td><td>{offerLabels[offer.offer_type] || offer.offer_type}</td><td>{money(offer.price)}</td><td>{periodLabels[offer.period_type] || offer.period_type}</td><td>{offer.is_available ? 'Sim' : 'Não'}</td></tr>)}</tbody>
      </table></div>}
      <form className={styles.form} action={createOfferAction.bind(null, id)}>
        <div className={styles.formGrid}>
          <input name="title" placeholder="Ex.: Sala comercial executiva" required />
          <select name="offerType" defaultValue="ALUGUEL">{OFFER_TYPES.map(type => <option key={type} value={type}>{offerLabels[type]}</option>)}</select>
          <input name="price" type="number" min="0" step="0.01" placeholder="Preço em R$ (opcional)" />
          <select name="periodType" defaultValue="MONTH">{PERIOD_TYPES.map(type => <option key={type} value={type}>{periodLabels[type]}</option>)}</select>
        </div>
        <textarea name="description" placeholder="Descrição da oferta e uso no jogo" required />
        <button className={styles.secondary}>Adicionar oferta</button>
      </form>
    </section>

    <section className={styles.panel}>
      <h3>Inventário publicitário</h3>
      <p>Slots já ficam preparados para monetização futura sem transformar o conteúdo fictício atual em publicidade real.</p>
      {item.adSlots.length === 0 ? <div className={styles.empty}>Nenhum slot publicitário cadastrado.</div> : <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th>Slot</th><th>Posicionamento</th><th>Descrição</th><th>Ativo</th></tr></thead>
        <tbody>{item.adSlots.map(slot => <tr key={slot.id}><td>{slot.slot_type}</td><td>{slot.placement_key}</td><td>{slot.description}</td><td>{slot.is_active ? 'Sim' : 'Não'}</td></tr>)}</tbody>
      </table></div>}
    </section>

    <section className={styles.panel}>
      <h3>Publicação</h3>
      <p>Somente estabelecimentos publicados e ativos devem ser consumidos pelo game. O status patrocinado é independente da publicação.</p>
      <div className={styles.formGrid}>
        <form action={publishEstablishmentAction.bind(null, id)}><button className={styles.primary}>Publicar no game</button></form>
        <form action={archiveEstablishmentAction.bind(null, id)}><button className={styles.secondary}>Arquivar estabelecimento</button></form>
      </div>
    </section>
  </div>;
}
