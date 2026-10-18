# CRM Intelligence da Branddi

Extração versionada de cards do Pipedrive, preservação dos originais e respostas com fontes para prospecção e preparação de reuniões.

## Fluxo

1. Login corporativo pelo Supabase; o backend valida a sessão e a lista de contas/domínios autorizados.
2. Cada usuário conecta seu token Pipedrive uma vez. O servidor valida a identidade no CRM e armazena a credencial com AES-256-GCM, vinculada ao usuário.
3. Uma nova extração cria um snapshot. Cada chamada processa uma página ou anexo, salva o original e avança a fila. Pausar, fechar a aba ou uma falha temporária não apagam os checkpoints.
4. Coleta encerrada, as métricas são calculadas por código. Falhas de permissão, recursos indisponíveis e arquivos ilegíveis ficam explícitos.
5. O usuário gera prospecção, briefing ou pergunta livre. O contexto selecionado e a quantidade de trechos omitidos ficam registrados. Cada afirmação precisa citar uma fonte selecionada e um trecho realmente presente nela.
6. As respostas são novas versões ligadas ao snapshot. Uma nova coleta nunca sobrescreve a anterior.

As citações são verificadas mecanicamente quanto à fonte e à presença do trecho. Isso não prova, sozinho, que a interpretação do modelo está correta. A interface separa fatos, inferências e recomendações para revisão.

## Dados coletados

- Objeto completo do negócio, campos personalizados e definições de campos de negócios, pessoas e organizações.
- Histórico paginado com `all_changes=1`, alterações de campos, alterações de participantes, seguidores e produtos vinculados.
- Atividades, notas e seus comentários, participantes e detalhes das pessoas vinculadas, organização, usuários e tipos de atividade.
- Índice de e-mails e consulta de cada mensagem com `include_body=1`.
- Arquivos vinculados e descobertos no histórico/e-mails. Originais de até 20 MiB são preservados em bucket privado com SHA-256. Texto, HTML, CSV, JSON, PDF com camada textual e DOCX têm extração textual.

A cobertura é limitada ao que a conta conectada consegue ler pelas APIs consultadas. Imagens, PDFs digitalizados sem texto, áudio, arquivos remotos não baixáveis, planilhas binárias e apresentações ficam identificados para leitura manual ou extrator adicional; não são considerados interpretados. Arquivos maiores que 20 MiB são uma lacuna explícita, não um download completo. Links externos presentes nas notas não são abertos automaticamente. A coleta não é uma transação no Pipedrive: alterações concorrentes podem ocorrer e uma mudança em `update_time` do negócio durante a coleta gera aviso.

## Desenvolvimento

Requer Node.js 22.16 ou superior e npm. O frontend usa React/Vite; o backend é compatível com funções Node da Vercel. Execute:

```sh
npm ci
cp .env.example .env
# Preencha as variáveis localmente, sem versionar credenciais.
npm run dev
```

Vite encaminha `/api` exclusivamente para `127.0.0.1:3001`. O desenvolvimento não chama o backend de produção. `npm run dev:api` inicia apenas a API.

### Variáveis

| Variável                                       | Uso                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Configuração pública do login no frontend                                       |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`   | Servidor, acesso ao banco e validação da sessão                                 |
| `CREDENTIAL_ENCRYPTION_KEY`                    | Chave base64 de exatamente 32 bytes; exclusiva do servidor                      |
| `AUTH_ALLOWED_DOMAINS`                         | Domínios de e-mail permitidos, separados por vírgula                            |
| `AUTH_ALLOWED_EMAILS`                          | Contas específicas permitidas, separadas por vírgula                            |
| `LLM_PROVIDER`                                 | `superproxy` em produção; `gemini` somente para reversão explícita              |
| `SUPERPROXY_API_KEY` / `SUPERPROXY_MODEL`      | Credencial privada do cliente crmintelligence e modelo disponível no Superproxy |
| `GEMINI_API_KEY` / `GEMINI_MODEL`              | Configuração legada, usada apenas com provedor Gemini selecionado               |
| `AI_REQUESTS_PER_USER_DAY`                     | Máximo de gerações por usuário/dia, padrão 30                                   |
| `AI_REQUESTS_GLOBAL_DAY`                       | Máximo de gerações da aplicação/dia, padrão 300                                 |

É necessário configurar pelo menos uma lista de domínios ou contas. A aplicação falha de forma fechada quando faltam autenticação, criptografia ou controles de uso. O Superproxy usa a API Messages em `https://branddi-super-proxy.fly.dev/v1/messages`. Confirme o modelo em `/v1/models` com a versão Anthropic `2023-06-01` antes de ativar. Não há fallback automático entre provedores. As respostas continuam sujeitas à validação local de estrutura e citações; respostas interrompidas não são salvas. No Superproxy, uma conclusão com citação inválida é removida por inteiro e a análise salva informa a quantidade removida; se nenhuma conclusão tiver evidência válida, a resposta é rejeitada. Não há seleção livre de modelo pelo navegador.

Para gerar a chave de criptografia, em um terminal privado:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Não use prefixo `VITE_` para segredos. Trocar a chave exige reconectar as contas ou executar uma migração de criptografia; não descarte a chave anterior antes dessa operação.

## Banco e implantação

A migração versionada está em `supabase/migrations/202610170001_crm_intelligence.sql`. Ela cria conexões, snapshots, páginas originais, respostas, limites atômicos de uso e o bucket privado `crm-originals`.

Os papéis `anon` e `authenticated` não têm acesso direto às tabelas de CRM ou aos arquivos. A API usa a service role somente depois de validar o usuário, a propriedade do snapshot, a conta Pipedrive e a visibilidade atual do deal. Os originais e as respostas não têm permissão de UPDATE nem para a service role. Acesso de leitura e download sempre passa pela API; URLs assinadas expiram em 60 segundos.

### Implantação coordenada

1. Crie um ambiente de homologação com Supabase próprio. Aplique a migração e configure OAuth Google, URL do site e redirecionamentos autorizados.
2. Configure as variáveis de servidor e frontend na Vercel. Use Node.js 22 e confirme suporte a funções de 120 segundos. O build é `npm run build`; a saída está em `dist`.
3. Teste login, conexão, coleta com conta restrita e com conta autorizada, anexos, retomada e uma geração real. Os testes automatizados usam provedores simulados e não substituem essa homologação.
4. Faça backup do banco de produção. Em janela coordenada, aplique a migração e publique o novo frontend/backend juntos.
5. Conecte novamente cada conta Pipedrive. Os tokens antigos no navegador são apagados, nunca migrados silenciosamente.

**A migração revoga o acesso do navegador à tabela antiga `deal_analyses`. O frontend antigo deixa de carregar seu cache após essa etapa.** Os registros legados permanecem no banco para revisão administrativa; não são atribuídos automaticamente a usuários porque não possuem autoria confiável. A versão nova exige uma nova coleta autorizada.

O endpoint antigo `/api/gemini` responde 410 e os proxies públicos do Pipedrive foram removidos. Não basta publicar somente o frontend ou aplicar somente a migração. Em rollback, mantenha os controles de acesso; não reabra a tabela antiga ao público.

## Operação e limites

- Cada passo de coleta tem lease de 120 segundos. Se uma função morrer, outra tentativa assume depois da expiração. O original já salvo é reutilizado, evitando nova leitura de uma página já preservada.
- Falhas 429/5xx mantêm o cursor para retentativa. Recursos que retornam falhas permanentes ficam registrados como lacunas.
- As respostas não têm cache automático. A data do snapshot e a da resposta aparecem na tela. Atualizar requer uma nova extração explícita.
- A seleção de contexto usa relevância lexical e recência, reservando espaço para diferentes tipos de fonte. Até 100 mil caracteres entram na análise. A quantidade de trechos excluídos é informada. A busca em Dados e fontes percorre todo o texto extraído.
- Até 12 mil tokens de saída por geração; limite de três gerações/minuto por usuário, além dos limites diários. As reservas contam mesmo se a geração falhar. Isso limita uso, não garante um preço em reais: preços devem ser conferidos no provedor. Tokens efetivos, modelo, prompt, duração e manifesto de contexto são registrados por resposta.
- PDF e DOCX são interpretados em worker isolado, com limite de memória e tempo. Arquivos não interpretados permanecem disponíveis quando o download foi possível.
- Logout limpa a sessão e a interface; Desconectar remove a credencial criptografada. Snapshots históricos permanecem privados e exigem conexão autorizada para leitura.
- Não há job autônomo em segundo plano: a fila fica persistida, mas precisa de uma aba aberta para avançar. Após fechar a aba, use Extrações salvas e Retomar coleta.
- Retenção de dados deve ser definida pela organização. A limpeza administrativa deve remover arquivos de `crm-originals` e snapshots correspondentes; a exclusão de snapshot propaga para páginas e respostas. Limites expirados podem ser removidos com `delete from crm_usage_limits where expires_at < now()`.

## Testes

```sh
npm run check
npx playwright install chromium
npm run test:e2e
npm audit
```

Os testes cobrem paginação além de 300 registros, cursores inválidos, preservação de campos v2 e mensagens, checkpoints após falha, erros de gravação, autorização e visibilidade, criptografia, validação de citações, métricas, anexos e migração SQL em PostgreSQL embarcado (PGlite). Os testes de navegador cobrem conexão, extração, perguntas, fontes, erros e logout com dados sintéticos. Nenhum teste usa credenciais ou grava em serviços de produção.

Antes de escolher um novo modelo, avalie uma amostra revisada de cards: vazios, longos, com negativas, alterações de decisor, reuniões pendentes/concluídas, anexos e conflitos entre registros. Compare cobertura, fidelidade das citações, qualidade das lacunas, custo e latência. Não aprove uma troca apenas pela aparência do resumo.

### Briefing 360

A tela principal organiza análises novas e históricas em seis quadros fixos: empresa e grupo, pessoas, histórico, diagnóstico, abordagem e reunião. O objetivo pode alternar entre pré-prospecção e pré-reunião sem iniciar uma coleta ou chamada ao modelo. Todas as conclusões e citações permanecem disponíveis no painel lateral e na análise completa; prévias longas são apenas recolhidas visualmente.

Relatórios e materiais mostram links presentes nos campos do negócio, sem afirmar que foram acessados, revisados ou enviados. O checklist de preparação e as decisões de revisão são marcações da sessão autenticada; não alteram o CRM e não persistem ao recarregar a página.

Ocorrências sinalizadas na análise podem ser revisadas individualmente e encaminhadas como relato editável para `https://revops.branddi.com/operacao/central-revops/helpdesk/novo`, usando os parâmetros oficiais `natureza` e `texto`. A triagem e a confirmação de criação pertencem ao Hub. O CRM Intelligence não afirma que um rascunho é um chamado criado; consulta e prevenção de duplicidade usam a tela Meus chamados do Hub. Não há criação automática nem envio em lote.
