import { useEffect, useRef } from 'react';
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  FileText,
  Layers3,
  LockKeyhole,
  PlugZap,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-word">
        branddi<span>.</span>
      </span>
      <span className="brand-product">CRM INTELLIGENCE</span>
    </div>
  );
}
export function WorkflowIntro() {
  return (
    <section className="workflow-intro">
      <div className="section-heading">
        <div>
          <span className="eyebrow">DO CARD À CONVERSA</span>
          <h2>Contexto para avançar.</h2>
        </div>
        <span className="muted">Um fluxo, todas as evidências.</span>
      </div>
      <div className="workflow-grid">
        {[
          [
            Layers3,
            '01',
            'Reúna o contexto',
            'Dados do negócio, notas, pessoas, e-mails e arquivos em uma versão consultável.',
          ],
          [
            Search,
            '02',
            'Entenda a oportunidade',
            'Análise automática do cenário, das objeções e dos próximos passos, com fontes.',
          ],
          [
            FileText,
            '03',
            'Prepare a conversa',
            'Transforme o histórico em uma abordagem e um briefing para a próxima reunião.',
          ],
        ].map(([Icon, number, title, description]) => (
          <article key={number}>
            <div className="workflow-top">
              <Icon size={22} />
              <span>{number}</span>
            </div>
            <h3>{title}</h3>
            <p>{description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
export function ConnectionPanel({ token, setToken, busy, configure }) {
  return (
    <div className="connection-layout">
      <section className="connection-story">
        <span className="eyebrow">SEU PONTO DE PARTIDA</span>
        <h2>O próximo passo começa com uma boa conexão.</h2>
        <p>
          Conecte sua conta do Pipedrive para transformar o histórico dos seus negócios em
          preparação comercial.
        </p>
        <ul>
          {[
            'Seus negócios e contatos, no mesmo contexto',
            'Texto original preservado para consulta',
            'Respostas apoiadas em evidências do CRM',
          ].map((text) => (
            <li key={text}>
              <Check size={17} />
              {text}
            </li>
          ))}
        </ul>
        <div className="security-note">
          <ShieldCheck size={20} />
          <span>O acesso respeita as permissões da sua conta no Pipedrive.</span>
        </div>
      </section>
      <section className="card connection-card">
        <div className="integration-mark">
          <PlugZap size={26} />
          <span>Pipedrive</span>
        </div>
        <h2>Conectar ao Pipedrive</h2>
        <p>Use o token da sua conta para começar.</p>
        <form onSubmit={configure}>
          <label htmlFor="pipedrive-token">Token Pipedrive</label>
          <input
            id="pipedrive-token"
            type="password"
            autoComplete="off"
            className="input"
            placeholder="Cole seu token de API"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            required
            minLength={20}
          />
          <button className="primary" disabled={!!busy}>
            {busy === 'connection' ? 'Conectando…' : 'Conectar'}
            <ArrowUpRight size={17} />
          </button>
        </form>
        <details className="token-help">
          <summary>Onde encontro meu token?</summary>
          <p>
            No Pipedrive, abra Preferências pessoais → API. A disponibilidade depende das permissões
            da sua conta.
          </p>
        </details>
        <div className="security-note">
          <LockKeyhole size={15} />
          <span>Seu token é criptografado e fica somente no servidor.</span>
        </div>
      </section>
    </div>
  );
}
export function CollectionGaps({ gaps }) {
  if (!gaps?.length) return null;
  const grouped = new Map();
  for (const gap of gaps) {
    const key = `${gap.resource}:${gap.code}:${gap.status}:${gap.message}`;
    const current = grouped.get(key) || { ...gap, count: 0 };
    current.count++;
    grouped.set(key, current);
  }
  return (
    <details className="collection-gaps">
      <summary>
        {gaps.length} {gaps.length === 1 ? 'item requer atenção' : 'itens requerem atenção'}
        <span>Ver limites da coleta</span>
      </summary>
      <p>
        Os dados disponíveis continuam preservados. Confira o que não pôde ser lido integralmente.
      </p>
      <ul>
        {[...grouped.values()].map((gap, i) => (
          <li key={i}>
            <strong>
              {gap.count} ×{' '}
              {{ attachment: 'Arquivo', mail: 'E-mail', deal: 'Negócio' }[gap.resource] ||
                gap.resource}
            </strong>
            <span>
              {gap.status === 404 && gap.resource === 'mail'
                ? 'Mensagem indisponível na consulta individual do Pipedrive. Confira o conteúdo disponível nas fontes.'
                : gap.message}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
export function SourceDialog({ source, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.showModal();
  }, []);
  return (
    <dialog
      className="source-dialog"
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">EVIDÊNCIA ORIGINAL</span>
          <h2>{source.title}</h2>
        </div>
        <button className="secondary" onClick={onClose} autoFocus>
          <X size={16} />
          Fechar
        </button>
      </div>
      <p className="source-id">{source.id}</p>
      <pre>{source.text}</pre>
    </dialog>
  );
}
export function ReadyNote() {
  return (
    <div className="ready-note">
      <CheckCircle2 size={16} />
      <span>Texto original preservado. Cada conclusão pode ser conferida na fonte.</span>
    </div>
  );
}
