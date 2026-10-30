# Execução aprovada por projeto

SERP Monitor e Report Engine abrem áreas próprias dentro do CRM Intelligence, com o deal selecionado. Análise, personalização e aprovação ficam separadas do briefing. A consulta continua disponível sem confirmar escopo; executar exige escopo confirmado, responsável ativo, motivo e aprovação individual dos parâmetros.

## Contrato

- `projectContext` consulta fontes e histórico. `prepareProjectAction` salva uma proposta válida por 15 minutos, sem disparar trabalho externo.
- `approveProjectAction` exige `approve: true`, sessão autorizada, propriedade do snapshot e acesso atual ao deal. Reconfere organização, etapa, escopo, responsável e versão das fontes antes de reservar a execução.
- A reserva atômica antecede o único POST ao projeto. Uma ação ativa por conta/deal/projeto, inclusive entre usuários. Cliques repetidos não reenviam o pedido.
- `projectExecution` reconcilia por GET. Falha ambígua permanece em confirmação; não há repetição automática de POST. A ação de outro usuário não é exposta.
- No SERP, cada aprovação cria uma campanha isolada. Até 8 termos, 10 cidades, 2 dispositivos e 2 rodadas; teto de 500 consultas durante toda a execução, incluindo tentativas. O prazo é de 1, 12 ou 24 horas. Etapa fora da política exige aprovação explícita da exceção.
- No Report Engine, geração/reprocessamento executável é **Brand Bidding**, com campanhas, termos e janela de 1–365 dias escolhidos. BBP e GD permanecem disponíveis para consulta. Reprocessar pode atualizar o link público; preserva revisão pendente e a versão anterior quando faltam evidências. Não envia mensagens nem altera o Pipedrive.
- Terminar uma coleta não autoriza gerar relatório. Cada ação e cada chamado de helpdesk têm sua própria aprovação.

O relatório propõe combinar as campanhas com captura concluída e cobertura comprovada nos últimos 30 dias. A pessoa pode selecionar as campanhas, os termos e o período manualmente. Termos precisam existir em ao menos uma das campanhas escolhidas; a origem valida cada vínculo. A aprovação congela a seleção exata. O Report Engine aplica `onlyIfBetter`: prioriza anunciantes distintos e desempata pelo volume de anúncios, mantendo seus gates de qualidade e as datas da versão preservada. Consultas SERP concluídas e anunciantes do relatório são métricas diferentes.

## Publicação e operação

Aplicar `20261030150000_project_executions.sql` no banco CRM e a migração de recibos no Report Engine antes de publicar os três projetos existentes por Git. As tabelas são privadas, sem acesso direto do navegador.

O CRM usa `SERP_MONITOR_EXECUTE_KEY` e `REPORT_ENGINE_EXECUTE_KEY`, cada uma correspondente ao `CRM_INTELLIGENCE_EXECUTE_KEY` do projeto de destino. São credenciais distintas das de leitura, restritas a `OPERATIONS_COMPANY_ID`/`CRM_INTELLIGENCE_COMPANY_ID`, somente no servidor. Nunca usar token admin, Hub ou Ceci para este fluxo.

Os destinos oferecem `POST .../executions?preview=1` para validar identidade e disponibilidade sem criar recibo, campanha, fila ou relatório. A conferência em produção usa essa validação e GETs limitados; executar uma coleta ou alterar um relatório real requer a aprovação individual no produto.

Reversão: remover as credenciais de execução e publicar o CRM anterior; manter os leitores e os recibos. Não apagar uma ação incerta nem reenviá-la: conferir o pedido original no sistema de destino. Uma função interrompida é marcada como incerta, sem presumir ausência de efeito.

Validação: testes de contrato, autorização, mudança de escopo, reserva concorrente, teto de consumo, duplicação e resultados ambíguos; E2E das duas áreas com aprovações separadas.
