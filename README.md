# CRM Intelligence da Branddi

Extração versionada de cards do Pipedrive, preservação dos originais e respostas com fontes para prospecção e preparação de reuniões.

## Fluxo

1. Login corporativo pelo Supabase; o backend valida a sessão e a lista de contas/domínios autorizados.
2. Cada usuário conecta seu token Pipedrive uma vez. O servidor valida a identidade no CRM e armazena a credencial com AES-256-GCM, vinculada ao usuário.
3. Uma nova extração cria um snapshot. Cada chamada processa uma página ou anexo, salva o original e avança a fila. Pausar, fechar a aba ou uma falha temporária não apagam os checkpoints.
4. Coleta encerrada, as métricas são calculadas por código. Falhas de permissão, recursos indisponíveis e arquivos ilegíveis ficam explícitos.
5. O usuário gera um briefing comercial único ou faz uma pergunta livre. O contexto selecionado e a quantidade de trechos omitidos ficam registrados. Cada afirmação precisa citar uma fonte selecionada e um trecho realmente presente nela.
6. As respostas são novas versões ligadas ao snapshot. Uma nova coleta nunca sobrescreve a anterior.

As citações são verificadas mecanicamente quanto à fonte e à presença do trecho. Isso não prova, sozinho, que a interpretação do modelo está correta. A interface separa fatos, inferências e recomendações para revisão.

## Dados coletados

- Objeto completo do negócio, campos personalizados e definições de campos de negócios, pessoas e organizações.
- Histórico paginado com `all_changes=1`, alterações de campos, alterações de participantes, seguidores e produtos vinculados.
- Atividades, notas e seus comentários, participantes e detalhes das pessoas vinculadas, organização, usuários e tipos de atividade.
- Índice de e-mails e consulta de cada mensagem com `include_body=1`.
- Arquivos vinculados e descobertos no histórico/e-mails. Originais de até 20 MiB são preservados em bucket privado com SHA-256. Texto, HTML, CSV, JSON, PDF com camada textual, DOCX e XLSX têm extração textual. XLSX preserva abas, células e resultados salvos de fórmulas, sem executar macros, fórmulas ou conexões externas.

A cobertura é limitada ao que a conta conectada consegue ler pelas APIs consultadas. Imagens, PDFs digitalizados sem texto, áudio, arquivos remotos não baixáveis, planilhas XLS antigas e apresentações ficam identificados para leitura manual ou extrator adicional; não são considerados interpretados. Arquivos maiores que 20 MiB são uma lacuna explícita, não um download completo. Links externos presentes nas notas não são abertos automaticamente. Relatórios, propostas e apresentações nos campos próprios do card são consultados nos endereços permitidos, quando acessíveis; as leituras são versionadas. Acesso restrito é uma lacuna, não conteúdo verificado. A coleta não é uma transação no Pipedrive: alterações concorrentes podem ocorrer e uma mudança em `update_time` do negócio durante a coleta gera aviso.

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
- A seleção protege notas de Raio-X, históricos de relacionamento e históricos agrupados, incluindo suas continuações, e reserva espaço para conversas primárias e anexos legíveis. A regra vale para qualquer deal, sem IDs ou marcas especiais. Até 180 mil caracteres entram no briefing e até 100 mil nas perguntas. O manifesto informa também a cobertura das notas prioritárias; elas não substituem as conversas originais. A quantidade de trechos excluídos é informada. A busca em Dados e fontes percorre todo o texto extraído.
- Até 12 mil tokens de saída por geração; limite de três gerações/minuto por usuário, além dos limites diários. As reservas contam mesmo se a geração falhar. Isso limita uso, não garante um preço em reais: preços devem ser conferidos no provedor. Tokens efetivos, modelo, prompt, duração e manifesto de contexto são registrados por resposta.
- PDF, DOCX e XLSX são interpretados em worker isolado, com limite de memória e tempo. Arquivos não interpretados permanecem disponíveis quando o download foi possível.
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

A tela principal organiza análises novas e históricas em seis quadros: conversas anteriores, motivos de não avanço, pessoas e engajamento, próxima conversa, diagnóstico e como avançar. O contexto cadastral da empresa fica nos detalhes; grupo com escopo pendente gera aviso com ação. O briefing reúne abordagem e preparação de reunião, com perguntas na mesma página. As fontes ficam na consulta técnica e na revisão de ocorrências; prévias longas são apenas recolhidas visualmente.

Empresa e grupo também projeta campos explícitos do texto preservado, independentemente de a IA ter incluído o assunto na resposta salva. A organização é identificada pelo `org_id` do card; cards de produtos diferentes vinculados ao mesmo ID usam o mesmo cadastro, respeitando a data da extração. Nome parecido ou participação em um grupo não funde organizações. Notas são atribuídas ao card de origem, com citação literal, e não sobrescrevem o cadastro compartilhado. Grupo ausente no cadastro e presente em nota é exibido com essa distinção. Esta leitura não atualiza nem mescla registros no Pipedrive.

A migração `202610290001_preparation_workflows.sql` acrescenta preparação persistente, por usuário, conta e negócio. Aplique-a antes do código (`supabase db push --linked --dry-run`, depois `supabase db push --linked`). A reversão do frontend/backend pode manter a tabela aditiva; não apague as decisões salvas. O banco bloqueia os papéis de navegador; todas as ações revalidam proprietário da extração, conta e visibilidade atual do card no Pipedrive.

O aviso de grupo separa vínculo cadastral de escopo comercial. O usuário confirma marcas, domínios, produto e prazo de atualização, sem alterar automaticamente o CRM. As pendências recebem o proprietário ativo do card como responsável inicial, ou ficam sem responsável quando ele não está disponível. O responsável pode ser alterado para outro usuário ativo do Pipedrive. Atribuição não concede acesso a fontes privadas nem envia notificações: a revisão continua na conta de quem a fez. Status, observação, prazo, aprovação e os últimos 100 eventos ficam salvos. Novas extrações mantêm decisões sobre evidência idêntica; mudanças relevantes reabrem a pendência e invalidam a aprovação. Extrações anteriores não podem sobrescrever preparação de uma versão mais recente. Gravações usam controle otimista de revisão e rejeitam alterações concorrentes.

Ao abrir Relatórios e materiais, os links ainda não verificados são lidos sequencialmente em segundo plano, sem novo LLM e sem bloquear o briefing. A leitura compara texto com marca, domínio, produto e data de referência. Antes da confirmação de escopo, usa a marca registrada apenas como referência e mantém a pendência de escopo. Depois da confirmação, as verificações anteriores ficam desatualizadas. Resultados expiram em 24 horas, preservando data, hash do conteúdo e trechos de evidência.

São permitidos relatórios em `report.branddi.com/report/...` e exportações de texto de Google Docs/Slides em `docs.google.com`; redirecionamentos de exportação só admitem o Google. A resolução DNS é verificada e fixada em endereço público a cada conexão; nenhuma credencial ou cookie é encaminhado. Limites: 5 MB, 18 segundos de rede por material, 30 verificações/hora por usuário. Conteúdo inacessível, login, formato não suportado, falta de data, cobertura incerta ou divergência permanecem pendentes. A comparação textual não certifica números, imagens, gráficos, decisão comercial ou envio. O usuário precisa registrar a revisão final; dados ausentes não são automaticamente classificados como erro.

Ocorrências sinalizadas na análise ou nos materiais podem ser revisadas individualmente. Responsável e justificativa são obrigatórios para aprovar um chamado; o link para o Hub só aparece após salvar essa aprovação, e editar o rascunho exige nova aprovação. Elas podem ser encaminhadas como relato editável para `https://revops.branddi.com/operacao/central-revops/helpdesk/novo`, usando os parâmetros oficiais `natureza` e `texto`. A triagem e a confirmação de criação pertencem ao Hub. O CRM Intelligence não afirma que um rascunho é um chamado criado; consulta e prevenção de duplicidade usam a tela Meus chamados do Hub. Não há criação automática nem envio em lote.

### Cobertura geral e integrações operacionais

Atualizar o briefing conclui a leitura retomável dos XLSX já preservados antes da chamada ao modelo. Novas coletas priorizam esses arquivos. Versões antigas permanecem históricas e precisam ser atualizadas; alterações posteriores no CRM exigem nova extração. Coleta completa não significa que todos os trechos caibam no contexto da IA, nem que imagens ou documentos restritos tenham sido interpretados.

O CRM Intelligence consulta automaticamente SERP Monitor e Report Engine ao gerar uma análise e ao abrir/atualizar a preparação. As leituras têm credenciais próprias, somente servidor, limitadas aos novos endpoints GET. Configure `OPERATIONS_COMPANY_ID`, `SERP_MONITOR_READ_KEY` e `REPORT_ENGINE_READ_KEY`. A conta deve coincidir com a conexão CRM; a visibilidade atual do deal é conferida antes da consulta. Mudança de organização exige nova extração. Os serviços validam também o par deal/organização; nome semelhante não une cards.

As duas fontes são lidas em paralelo, com prazo de 12 segundos por fonte, sem redirecionamentos ou retries automáticos. Sucessos são reutilizados por até dois minutos e falhas por 30 segundos na mesma extração/identidade. Observações ficam versionadas em `crm_raw_pages`, sem cabeçalhos ou credenciais. Somente a observação mais recente de cada serviço entra no contexto; uma falha nova não reutiliza silenciosamente um sucesso antigo. Fontes falham independentemente. O manifesto da resposta registra status e data das consultas, distintos da data da extração CRM.

- SERP Monitor: campanhas do deal, execuções, fila, termos/cidades/dispositivos e anexo da planilha. Contadores de tentativas e retentativas ficam separados de tarefas únicas planejadas/concluídas e falhas definitivas. Escopo configurado não comprova cobertura executada, e a planilha anexada não é um relatório comercial publicado.
- Report Engine: BB/BBP por vínculo explícito ou link canônico, GD pelo link canônico e regra real de publicação. Retorna estados por produto, sem converter fonte indisponível em ausência. Relatório pronto não comprova revisão ou envio, e data de geração não substitui data da captura. Produtos fora do escopo não geram uma lista de relatórios faltantes.

O briefing mantém seus quadros compactos. Pendências objetivas distinguem coleta em andamento, falhas definitivas, cobertura desconhecida, revisão de alcance e estado/vínculo do relatório. Resultado baixo não justifica ampliar tudo: primeiro conferir escopo e cobertura; só então recomendar termos de marca, cidades pertinentes ou outra janela com limite de consultas e prazo. Valores de custo não são inventados. Não há classificação ou régua de concorrentes duplicada do Report Engine.

Recomendações têm responsável e aprovação individual persistida. Mudanças nas evidências ou no escopo invalidam a aprovação; a atualização do relógio de consulta sozinha não a invalida. Aprovar registra a decisão, sem executar monitoria, geração ou mudança no CRM. A execução é solicitada separadamente no Hub. Ocorrências de erro mantêm o fluxo de aprovação individual de chamado. Nenhuma leitura ativa brokers, modifica campanhas, publica materiais ou envia chamados.
