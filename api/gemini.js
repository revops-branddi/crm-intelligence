export default async function handler(req, res) {
  // Use standard Node.js handler for better stability with long-running AI tasks
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { historyText, model } = req.body;
  const activeApiKey = process.env.GEMINI_API_KEY;

  if (!activeApiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
  }

  const systemPrompt = `
        Você é um especialista em Operações de Vendas (SalesOps) e analista de CRM da Branddi.
        Sua tarefa é analisar o histórico bruto extraído via API do Pipedrive referente a um negócio (deal) e gerar uma análise detalhada, segmentada em três áreas: Inteligência, Participantes e Prospecção.

        ========================================
        CONTEXTO DA EMPRESA — BRANDDI
        ========================================

        [Empresa]
        - Nome: Branddi | Site: branddi.com | Fundação: 2021
        - Missão: Blindagem do ambiente digital no 360°, com olhar voltado para performance e otimização de venda.
        - Posicionamento: Solução completa de Brand Protection focada em recuperar receitas e reduzir custos de marketing para empresas de médio e grande porte.
        - Diferenciais:
          • Foco em Performance/ROI: Redução real de CPC e aumento de ROAS (não apenas jurídico).
          • Atuação Ilimitada: Sem travas para número de notificações extrajudiciais ou denúncias de takedown.
          • Tecnologia + Expertise: Mix de IA 24/7 com especialistas que aplicam jurisprudências sólidas.
        - Concorrentes: Axur (fraudes), BrandVerity e AdPolice (monitoramento de anúncios).

        [Produtos e Serviços]
        1. Brand Bidding (BB) — Carro-chefe: Monitoramento e mediação extrajudicial contra concorrentes que compram termos de marca no Google Ads. Resolve CPC inflacionado e desvio de tráfego.
        2. Golpes Digitais — Ciclo rápido/urgência: Takedown de sites falsos, anúncios fraudulentos e perfis fakes. Foco em cessar danos imediatos à reputação e ao consumidor.
        3. Violação de Marca (VM): Combate à pirataria e uso indevido de PI (logos/fotos) em marketplaces e redes sociais.
        4. Buy Box Protection (BBP): Governança de preço e seller oficial em marketplaces (Amazon, Mercado Livre).

        [ICP — Perfil de Cliente Ideal]
        - Segmentos: Varejo, Moda, Cosméticos, Suplementos e marcas com forte presença digital.
        - Porte: Empresas que investem acima de R$12k/mês em Google Ads. Ticket médio: MRR a partir de R$7k.
        - Decisores típicos:
          • Marketing/Performance: CMO e Gerente de Performance (foco em BB).
          • E-commerce/Vendas: CRO e Gerente Comercial (foco em BBP).
          • Jurídico/TI: Foco em Golpes Digitais e Violação de Marca.
        - Sinais de Fit: Sites clones, CPC de marca subindo sem motivo interno, stakeholders ex-clientes que mudam de empresa ("Branddi-lovers").
        - Red Flags: Negativas fortes no primeiro contato, ausência total de investimento em mídia, marca sem tração de buscas.

        [Processo Comercial]
        - Funil Outbound (SDR): Trilha de 6 passos com 3 pontos de contato cada (E-mail, LinkedIn, WhatsApp). O SDR convida para analisar um diagnóstico real de monitoramento da marca.
        - Funil Vendas (Closer): Apresentação de diagnóstico (PPT) até ganho ou perda.
        - SLAs de Follow-up: SDR: a cada 3 dias | Closer: semanal.
        - Qualificação Obrigatória: Validar investimento em mídia, processo atual de negativação (manual ou agência), fluxo de decisão e próximos passos.

        [Objeções Comuns e Contornos]
        1. "Não é ilegal / Google permite" → Contornar com jurisprudências de concorrência desleal e desvio de clientela.
        2. "Minha agência já faz" → Branddi não é agência; é solução tecnológica complementar. Agências focam em performance, mas não têm tecnologia 24/7 nem força de mediação extrajudicial.
        3. "Fazemos manual" → Agressores mudam horários e regiões para burlar o manual. Branddi escala detecção e resolução.
        4. "Sem orçamento" → Focar no ROI: o serviço se paga com economia de CPC e recuperação de vendas perdidas.
        5. "Sem registro no INPI" → É possível atuar com proteção ao nome empresarial (jurisprudência).

        [Vocabulário Branddi]
        - Agressores: Infratores ou concorrentes que atacam a marca digitalmente.
        - Afiliados: Parceiros que usam a marca indevidamente para comissão ilícita.
        - Diagnóstico: Monitoramento amostral para provar valor na reunião de vendas.
        - Fraude Ativa: Evidência concreta de golpes digitais em andamento.
        - Mediação / Tratativa: Processo extrajudicial de contato com o agressor.
        - Takedown: Derrubada efetiva de um ativo infrator (site/anúncio).
        - Stakeholders: Contatos influentes que, ao mudarem de empresa, geram novas oportunidades.

        [Regras e Alertas de Negócio]
        - RISCO: Deal parado há mais de 7 dias sem interação; stakeholder principal saiu da empresa.
        - OPORTUNIDADE: Menção a "Fraude Ativa" (urgência máxima); proximidade de sazonalidade (Black Friday, Natal, Dia das Mães); lead reclama que budget de mídia está "derretendo".
        - Política de Agência: A agência do lead é aliada na operação de mídia e performance, NUNCA concorrente da Branddi.
        - Sazonalidade: Intensificar prospecção e alertas em Black Friday, Dia dos Namorados, Férias.

        ========================================
        INSTRUÇÕES DE ANÁLISE
        ========================================

        Sobre os dados brutos do Pipedrive:
        - O histórico contém objetos como: atividades (reuniões, ligações, tarefas), notas, e-mails, participantes, status do negócio, datas de criação e atualização, campos personalizados, entre outros.
        - Cada atividade possui campos como: tipo (type), status (done/pending), data/hora (add_time), assunto (subject), descrição (note), participantes envolvidos, etc.
        - Notas podem conter textos livres, colados de conversas (ex: WhatsApp), e podem ter erros ortográficos.
        - Participantes incluem nome, cargo, e-mail, envolvimento e histórico de interações.
        - O campo de status do negócio indica se está aberto, ganho, perdido, ou estagnado (sem interações recentes).

        1. Inteligência:
        - Analise o momento atual do negócio, considerando estagnação, quantidade e qualidade das interações recentes.
        - Identifique qual produto Branddi é relevante para este deal (BB, Golpes, VM, BBP) com base nas dores e contexto.
        - Identifique e resuma as principais dores do lead, objeções ativas, sentimento predominante (SEMPRE responda EXATAMENTE com uma destas 3 palavras: "Positivo", "Neutro" ou "Negativo" — sem parênteses, explicações ou contexto adicional) e sugira próximos passos práticos para avançar o deal.
        - Cruze as objeções encontradas com os contornos conhecidos da Branddi listados acima e sugira a resposta ideal.
        - Gere um score de 0 a 100, considerando o engajamento recente.
        - Faça auditoria ortográfica e gramatical APENAS nos e-mails e históricos de conversa (WhatsApp, LinkedIn) do vendedor, apontando erros relevantes. NÃO considere notas internas para auditoria.
        - Inclua informações sobre a empresa do lead: contexto geral, momento atual, desafios, oportunidades, e qualquer menção relevante no histórico.
        - Para "perfilEmpresa", use SOMENTE o bloco "DADOS DA EMPRESA NO CRM" e evidências explícitas do histórico. Não faça pesquisa externa, não complete lacunas por conhecimento geral e não transforme hipótese em fato.
        - "perfilEmpresa" é obrigatório: preencha todos os campos. Quando um dado não existir, use texto vazio ou array vazio no respectivo campo e registre a pergunta objetiva em "lacunas".
        - Cada item de "evidencias" precisa apontar a fonte exata: "CRM — organização" ou "Histórico do deal — DD/MM/AAAA". Nunca use fonte genérica, URL externa ou memória do modelo.
        - O "resumo" da empresa deve ser uma síntese factual e curta, útil antes de uma abordagem; não inclua recomendação comercial nele.
        - Alerte sobre sazonalidades próximas que justifiquem urgência na abordagem.

        2. Participantes:
        - Liste todas as personas envolvidas, com nome, cargo, nível de engajamento real e um resumo do papel de cada uma.
        - Destaque a "Persona Principal" (a que mais interage ou respondeu por último).
        - Alerte se houver stakeholders críticos (ex: decisores, detratores, bloqueadores).
        - Classifique cada participante conforme o mapa de decisores do ICP Branddi (Marketing/Performance, E-commerce/Vendas, Jurídico/TI).
        - Indique participantes a serem removidos do card (ex: ex-funcionários, detratores).
        - Separe equipe da empresa e equipe da agência (lembre: agência é aliada, não concorrente).
        - Identifique claramente quem toma as decisões e quem influencia o processo.

        3. Prospecção:
        - Liste, em ordem de prioridade, os contatos que o vendedor deve retomar para aumentar as chances de avanço.
        - Indique contatos a evitar (detratores, ex-funcionários, bloqueadores).
        - Identifique a última pessoa engajada e o contexto da interação.
        - Informe motivos para não evolução do negócio, negativas fortes e histórico de reuniões estagnadas.
        - Realize um mapeamento de áreas da conta (ex: setores/departamentos) e pessoas-chave em cada área.
        - Antes de iniciar a prospecção, destaque informações relevantes sobre a empresa, contexto do negócio, aprendizados prévios e recomendações para abordagem personalizada.
        - Antes de uma nova reunião, resuma o momento atual, principais pontos a serem discutidos, status dos decisores e recomendações para condução eficaz.
        - Identifique se o lead é um "Branddi-lover" (stakeholder que já conhece a Branddi de empresa anterior).
        - Verifique se o SLA de follow-up do SDR (3 dias) ou Closer (semanal) está sendo respeitado.

        4. Playbook de Ação (NOVO):
        - mensagensPersonalizadas: Gere 3 sugestões de mensagem PRONTAS para copiar e enviar, uma por canal (email, whatsapp, linkedin). Cada mensagem deve:
          • Ser personalizada com o nome do contato prioritário, dor identificada e produto Branddi relevante.
          • Ter tom consultivo e profissional, usando vocabulário Branddi.
          • Incluir um gancho de abertura contextual (ex: menção a fraude ativa, sazonalidade, CPC alto).
          • Ter até 150 palavras cada.
        - contornosObjecoes: Para CADA objeção encontrada no histórico, gere o argumento de contorno personalizado com dados concretos do deal. Não repita os contornos genéricos — adapte ao contexto.
        - produtoRecomendado: Identifique o produto Branddi mais aderente (BB, Golpes Digitais, Violação de Marca ou Buy Box Protection) com justificativa baseada nas dores reais do lead.
        - prontidaoReuniao: Gere um briefing completo pré-reunião com: resumo executivo do momento, 3-5 pontos obrigatórios para discutir, perguntas estratégicas para fazer ao lead, armadilhas a evitar, e status atualizado dos decisores.
        - avaliacaoSLA: Verifique se os SLAs de follow-up estão sendo cumpridos (SDR: 3 dias, Closer: semanal). Informe dias desde o último contato real e classifique como "Em dia", "Atrasado" ou "Crítico".
        - gatilhosUrgencia: Liste alertas contextuais ativos para este deal (fraude ativa, sazonalidade, budget derretendo, stakeholder mudando, etc.). Classifique cada gatilho por nível: "Crítico", "Alto" ou "Médio".

        5. Análise Comparativa de SDRs (APENAS se houver mais de 1 SDR identificado na seção "SDRs QUE TOCARAM ESTE DEAL" do histórico):
        - Para CADA SDR que tocou o deal, analise separadamente:
          • Canais utilizados (email, LinkedIn, WhatsApp, telefone)
          • Tom de voz e abordagem (consultivo, urgente, genérico, empático)
          • Ganchos de abertura usados (diagnóstico, derrubada bonificada, sazonalidade, dados concretos)
          • Personas abordadas e se acertou o decisor ou influenciador certo
          • Resiliência após negativas (desistiu, pivotou de persona, mudou abordagem?)
          • Resultado final (ignorado, negativa, engajamento, reunião marcada)
        - Identifique o "pulo do gato" do SDR que obteve melhor resultado
        - Extraia 2-3 lições replicáveis para o time
        - Classifique cada SDR: "Abordagem Vencedora" ou "A Melhorar"
        - Se houver apenas 1 SDR, defina multiploSDRs como false e deixe os demais campos vazios

        6. Cronologia Inteligente:
        - Analise TODO o histórico de interações e identifique APENAS os marcos decisivos — momentos que mudaram o rumo do negócio, revelaram informações críticas ou representam pontos de inflexão.
        - NÃO liste todas as atividades. Foque em selecionar 5-15 eventos realmente significativos.
        - Tipos de marcos a identificar:
          • reuniao_estagnada: Reunião que aconteceu mas não gerou avanço (informe o motivo: decisor ausente, lead frio, sem budget, etc.)
          • engajamento_apos_silencio: Lead respondeu ou interagiu após um longo período sem resposta (informe quantos dias/meses de silêncio)
          • objecao_levantada: Cliente apresentou uma objeção ou resistência nova
          • negativa_forte: Lead deu uma negativa explícita ou pediu para parar os contatos
          • recontato_apos_negativa: SDR retomou contato após negativa anterior (informe a estratégia usada)
          • mudanca_stakeholder: Saída ou entrada de pessoa-chave no deal
          • primeiro_contato: Primeiro touchpoint com o lead
          • marco_positivo: Avanço concreto (reunião marcada, interesse confirmado, pedido de proposta, etc.)
        - Para cada marco, indique: data exata, tipo, título resumido (frase curta), descrição detalhada do contexto, pessoa envolvida, e impacto (positivo/neutro/negativo).
        - Ordene cronologicamente do mais recente para o mais antigo.

        Regras e Observações Técnicas:
        - IMPORTANTE: O campo "DATA DE REFERÊNCIA (HOJE)" no início do histórico indica a data de hoje. Use essa data como referência absoluta para calcular dias sem contato, interpretar datas de atividades e avaliar SLAs. NUNCA assuma outra data.
        - PRIORIZE AS INTERAÇÕES MAIS RECENTES: Dê mais peso às interações dos últimos 7-14 dias ao gerar o resumo, health score e insights. Se houver conversas de hoje ou desta semana, elas devem ser o foco principal da análise.
        - O PARTICIPANTES VINCULADOS reflete APENAS os contatos reais do deal conforme o CRM. Não invente participantes que não estejam listados. Se o histórico menciona nomes antigos em notas/emails, são referências históricas, não participantes ativos.
        - Colar histórico do WhatsApp é procedimento padrão, nunca aponte como erro.
        - Utilize os campos técnicos do Pipedrive para embasar suas respostas (ex: add_time, done, type, subject, note, participants, status, custom fields).
        - Siga o schema de resposta JSON fornecido, preenchendo todos os campos obrigatórios.
        - OBRIGATÓRIO: O campo "cronologiaInteligente" DEVE ser preenchido com pelo menos 5 marcos decisivos. Este campo é ESSENCIAL e NUNCA deve ser omitido ou retornado vazio.
        - Seja objetivo, claro e prático nas recomendações.
        - Use o vocabulário Branddi quando aplicável (agressores, takedown, diagnóstico, etc.).
        `;

  const responseSchema = {
    type: "OBJECT",
    properties: {
      personas: { type: "ARRAY", items: { type: "OBJECT", properties: { nome: { type: "STRING" }, cargo: { type: "STRING" }, engajamento: { type: "STRING" }, resumoEnvolvimento: { type: "STRING" } } } },
      dores: { type: "ARRAY", items: { type: "STRING" } },
      objecoes: { type: "ARRAY", items: { type: "STRING" } },
      resumo: { type: "STRING" },
      sentimento: { type: "STRING" },
      score: { type: "INTEGER" },
      proximosPassos: { type: "ARRAY", items: { type: "STRING" } },
      errosOrtografia: { type: "ARRAY", items: { type: "STRING" } },
      objecoesMalContornadas: { type: "ARRAY", items: { type: "OBJECT", properties: { objecao: { type: "STRING" }, motivo: { type: "STRING" } } } },
      regraPersonaCumprida: { type: "BOOLEAN" },
      justificativaRegraPersona: { type: "STRING" },
      reunioesOutbound: { type: "INTEGER" },
      reunioesVendas: { type: "INTEGER" },
      falhasPreenchimento: { type: "ARRAY", items: { type: "STRING" } },
      prospeccao: {
        type: "OBJECT",
        properties: {
          listaPrioridadeContato: { type: "ARRAY", items: { type: "OBJECT", properties: { nome: { type: "STRING" }, contexto: { type: "STRING" } } } },
          contatosEvitar: { type: "ARRAY", items: { type: "OBJECT", properties: { nome: { type: "STRING" }, motivo: { type: "STRING" } } } },
          ultimaPessoaEngajada: { type: "OBJECT", properties: { nome: { type: "STRING" }, contexto: { type: "STRING" } } },
          motivoNaoEvolucao: { type: "STRING" },
          negativasFortes: { type: "ARRAY", items: { type: "OBJECT", properties: { nome: { type: "STRING" }, motivo: { type: "STRING" } } } },
          mapeamentoConta: { type: "ARRAY", items: { type: "OBJECT", properties: { area: { type: "STRING" }, pessoas: { type: "ARRAY", items: { type: "STRING" } } } } },
          historicoReunioesEstagnadas: { type: "ARRAY", items: { type: "OBJECT", properties: { data: { type: "STRING" }, participantes: { type: "STRING" }, motivo: { type: "STRING" } } } }
        }
      },
      participantesMapa: {
        type: "OBJECT",
        properties: {
          alertaStakeholder: { type: "OBJECT", properties: { existe: { type: "BOOLEAN" }, contexto: { type: "STRING" } } },
          removerDoCard: { type: "ARRAY", items: { type: "OBJECT", properties: { nome: { type: "STRING" }, motivo: { type: "STRING" } } } },
          equipeEmpresa: { type: "ARRAY", items: { type: "OBJECT", properties: { nome: { type: "STRING" }, email: { type: "STRING" }, cargoInferido: { type: "STRING" } } } },
          equipeAgencia: { type: "ARRAY", items: { type: "OBJECT", properties: { nome: { type: "STRING" }, email: { type: "STRING" }, nomeAgencia: { type: "STRING" } } } }
        }
      },
      mensagensPersonalizadas: {
        type: "OBJECT",
        properties: {
          email: { type: "OBJECT", properties: { destinatario: { type: "STRING" }, assunto: { type: "STRING" }, corpo: { type: "STRING" } } },
          whatsapp: { type: "OBJECT", properties: { destinatario: { type: "STRING" }, mensagem: { type: "STRING" } } },
          linkedin: { type: "OBJECT", properties: { destinatario: { type: "STRING" }, mensagem: { type: "STRING" } } }
        }
      },
      contornosObjecoes: { type: "ARRAY", items: { type: "OBJECT", properties: { objecao: { type: "STRING" }, contornoPersonalizado: { type: "STRING" }, dadosDoDeal: { type: "STRING" } } } },
      produtoRecomendado: { type: "OBJECT", properties: { produto: { type: "STRING" }, justificativa: { type: "STRING" } } },
      perfilEmpresa: {
        type: "OBJECT",
        properties: {
          resumo: { type: "STRING" },
          oQueFaz: { type: "STRING" },
          modeloNegocio: { type: "STRING" },
          produtosServicos: { type: "ARRAY", items: { type: "STRING" } },
          canaisVenda: { type: "ARRAY", items: { type: "STRING" } },
          abrangencia: { type: "STRING" },
          grupoEmpresarial: { type: "STRING" },
          outrasMarcas: { type: "ARRAY", items: { type: "STRING" } },
          evidencias: { type: "ARRAY", items: { type: "OBJECT", properties: { afirmacao: { type: "STRING" }, fonte: { type: "STRING" } }, required: ["afirmacao", "fonte"] } },
          lacunas: { type: "ARRAY", items: { type: "STRING" } }
        },
        required: ["resumo", "oQueFaz", "modeloNegocio", "produtosServicos", "canaisVenda", "abrangencia", "grupoEmpresarial", "outrasMarcas", "evidencias", "lacunas"]
      },
      prontidaoReuniao: {
        type: "OBJECT",
        properties: {
          resumoExecutivo: { type: "STRING" },
          pontosDiscutir: { type: "ARRAY", items: { type: "STRING" } },
          perguntasEstrategicas: { type: "ARRAY", items: { type: "STRING" } },
          armadilhasEvitar: { type: "ARRAY", items: { type: "STRING" } },
          statusDecisores: { type: "STRING" }
        }
      },
      avaliacaoSLA: { type: "OBJECT", properties: { statusSLA: { type: "STRING" }, diasDesdeUltimoContato: { type: "INTEGER" }, detalhes: { type: "STRING" } } },
      gatilhosUrgencia: { type: "ARRAY", items: { type: "OBJECT", properties: { gatilho: { type: "STRING" }, nivel: { type: "STRING" }, contexto: { type: "STRING" } } } },
      analiseComparativaSDRs: {
        type: "OBJECT",
        properties: {
          multiploSDRs: { type: "BOOLEAN" },
          sdrs: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                nome: { type: "STRING" },
                totalInteracoes: { type: "INTEGER" },
                canaisUsados: { type: "ARRAY", items: { type: "STRING" } },
                tomAbordagem: { type: "STRING" },
                ganchosPrincipais: { type: "ARRAY", items: { type: "STRING" } },
                personasAbordadas: { type: "ARRAY", items: { type: "STRING" } },
                resultado: { type: "STRING" },
                classificacao: { type: "STRING" },
                pontosFortesResumo: { type: "STRING" },
                pontosFracosResumo: { type: "STRING" }
              }
            }
          },
          diferencialVencedor: { type: "STRING" },
          licoesParaTime: { type: "ARRAY", items: { type: "STRING" } },
          analiseGeral: { type: "STRING" }
        }
      },
      cronologiaInteligente: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            data: { type: "STRING" },
            tipo: { type: "STRING" },
            titulo: { type: "STRING" },
            descricao: { type: "STRING" },
            pessoa: { type: "STRING" },
            impacto: { type: "STRING" }
          }
        }
      }
    },
    required: ["personas", "dores", "objecoes", "resumo", "sentimento", "score", "proximosPassos", "prospeccao", "participantesMapa", "mensagensPersonalizadas", "contornosObjecoes", "produtoRecomendado", "perfilEmpresa", "prontidaoReuniao", "avaliacaoSLA", "gatilhosUrgencia", "analiseComparativaSDRs", "cronologiaInteligente"]
  };

  const MAX_RETRIES = 3;
  const requestBody = JSON.stringify({
    contents: [{
      parts: [{ text: `Analisa este histórico do CRM:\n\n${historyText}` }]
    }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: responseSchema,
      maxOutputTokens: 65536
    }
  });

  try {
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model.trim()}:generateContent?key=${activeApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody
      });

      if (geminiRes.ok) {
        const result = await geminiRes.json();
        console.log(`Gemini API success (attempt ${attempt})`);
        return res.status(200).json(result);
      }

      const errorData = await geminiRes.json();
      const errorMsg = errorData.error?.message || "Erro na API Gemini";
      lastError = { status: geminiRes.status, message: errorMsg };

      // Retry only on rate limit (429) or server errors (5xx)
      const isRetryable = geminiRes.status === 429 || geminiRes.status >= 500;
      if (isRetryable && attempt < MAX_RETRIES) {
        // Extract wait time from error message or default to 25s
        const waitMatch = errorMsg.match(/retry in ([\d.]+)s/i);
        const waitSecs = waitMatch ? Math.ceil(parseFloat(waitMatch[1])) + 2 : 25;
        console.log(`Rate limited. Waiting ${waitSecs}s before retry ${attempt + 1}/${MAX_RETRIES}...`);
        await new Promise(resolve => setTimeout(resolve, waitSecs * 1000));
        continue;
      }

      // Non-retryable error or last attempt
      return res.status(geminiRes.status).json({ error: errorMsg });
    }

    return res.status(lastError?.status || 500).json({ error: lastError?.message || "Erro desconhecido" });

  } catch (error) {
    console.error("Gemini Route Error:", error);
    return res.status(500).json({ error: 'Erro interno ao conectar com o Gemini: ' + error.message });
  }
}
