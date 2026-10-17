# Correção do fluxo comercial — 17/10/2026

## Regressões identificadas

O fluxo anterior (`e5b8ddc`, `src/App.jsx`, `fetchPipedriveData` e `analyzeWithGemini`) consultava primeiro o cache. Sem cache, compilava negócio, empresa, participantes e até 300 eventos em texto e gerava a análise automaticamente. E-mails nesse fluxo usavam o assunto e o snippet. A atualização separou coleta de análise, removeu o resultado automático e passou a aguardar todos os anexos antes de permitir qualquer resposta.

No negócio usado para validação, a extração anterior à correção executou 344 etapas, com 131 consultas individuais de e-mail retornando erro. Levou 728,58 segundos. A API de e-mails do negócio aceita `include_body=1` e retorna registros envolvidos em `{data, object, timestamp}`. Esses corpos completos agora são preservados diretamente e substituem as consultas individuais redundantes.

## Comportamento corrigido

- A abertura por ID reutiliza a versão salva, sempre revalidando proprietário, empresa e visibilidade atual no CRM. Uma nova extração é uma ação explícita.
- Coleta em lotes limitados, com até quatro leituras concorrentes, reserva exclusiva e checkpoints. Falhas de persistência ou limite da API mantêm a retomada sem descartar originais.
- Metadados, campos, pessoas, notas, atividades, histórico e e-mails são priorizados. Quando o texto fica pronto, a análise geral é gerada automaticamente. A preservação dos arquivos continua na aba aberta, sem bloquear essa primeira resposta. Pendências são declaradas na análise.
- Texto consolidado consultável e exportável; originais e citações continuam disponíveis. Empresa, pessoas e histórico têm telas próprias, independentes da IA.
- Navegação e estados de conexão, progresso e lacunas reorganizados na identidade Branddi, com suporte a telas estreitas e diálogo de fontes acessível.

## Validação real

No mesmo negócio, o texto principal ficou pronto em 27,071 segundos: 1.002 eventos, 75 notas, 339 atividades, 38 pessoas e 131 e-mails com corpo completo. Foram preservados aproximadamente 3,49 milhões de caracteres de texto estruturado, incluindo metadados. Isso não significa que todo esse conteúdo caiba em uma única resposta da IA: a seleção de contexto permanece explícita.

Gemini 3.8 Flash excedeu o limite de 75 segundos nos testes desse contexto. Gemini 3.6 Flash com raciocínio `low` concluiu em 13,924 segundos, incluindo preparação e persistência; retornou oito seções e 14 conclusões com citações validadas. Modelo escolhido por esse teste, não pela numeração. Os tempos de coleta e análise foram medidos separadamente; não são uma garantia de latência.

A primeira resposta não inclui os arquivos ainda pendentes. Os dados anteriores são mantidos. A análise do cache legado deste negócio é de maio de 2026 e não representa a mesma data da coleta atual.
