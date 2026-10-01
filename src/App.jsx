import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';

// Layout
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';

// UI
import { LoginScreen } from './components/ui/LoginScreen';
import { Toast } from './components/ui/Toast';
import { ProcessingStepper } from './components/ui/ProcessingStepper';
import { EmptyState } from './components/ui/EmptyState';

// Tabs
import { ConfigTab } from './components/tabs/ConfigTab';
import { DashboardTab } from './components/tabs/DashboardTab';
import { StrategyTab } from './components/tabs/StrategyTab';
import { TimelineTab } from './components/tabs/TimelineTab';
import { ParticipantsTab } from './components/tabs/ParticipantsTab';
import { CompanyTab } from './components/tabs/CompanyTab';
import { SavedDealsTab } from './components/tabs/SavedDealsTab';

// Services
import { calculateHardMetrics, parsePipedriveDate } from './services/metrics';
import { companyProfileToPrompt, fetchCompanyProfile, normalizeCompanyAnalysis } from './services/company-profile';

const App = () => {
  // ─── Auth ───
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ─── Config ───
  const [model, setModel] = useState(() => localStorage.getItem('geminiModel') || "gemini-2.5-flash");
  const [pipedriveToken, setPipedriveToken] = useState(() => localStorage.getItem('pipedriveToken') || "");
  const [dealId, setDealId] = useState("");
  const [dealTitle, setDealTitle] = useState("");
  const [lastUpdate, setLastUpdate] = useState(null);

  // ─── Analysis State ───
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [hardMetrics, setHardMetrics] = useState(null);
  const [rawExtractedData, setRawExtractedData] = useState("");
  const [detailedParticipants, setDetailedParticipants] = useState([]);
  const [processingStep, setProcessingStep] = useState(0);

  // ─── UI State ───
  const [activeTab, setActiveTab] = useState("config");
  const [toast, setToast] = useState(null);

  // ─── Saved Deals ───
  const [savedDeals, setSavedDeals] = useState([]);
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [dealsError, setDealsError] = useState("");

  const [, setFlowItems] = useState([]);
  const [, setUsersMap] = useState({});

  const normalizeAnalysis = (value) => value?.perfilEmpresa
    ? { ...value, perfilEmpresa: normalizeCompanyAnalysis(value.perfilEmpresa) }
    : value;

  // ═══════════════════════════════════════════════
  //  AUTH
  // ═══════════════════════════════════════════════
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
      });
      if (error) throw error;
    } catch {
      showToast("Erro ao fazer login. Verifique as credenciais do Supabase.");
    }
  };

  const handleLogout = async () => { await supabase.auth.signOut(); };

  // ═══════════════════════════════════════════════
  //  PERSIST CONFIG
  // ═══════════════════════════════════════════════
  useEffect(() => {
    localStorage.setItem('geminiModel', model);
    localStorage.setItem('pipedriveToken', pipedriveToken);
  }, [model, pipedriveToken]);

  // ═══════════════════════════════════════════════
  //  TOAST & CLIPBOARD
  // ═══════════════════════════════════════════════
  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("✅ Copiado com sucesso!");
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      try { document.execCommand('copy'); showToast("✅ Copiado com sucesso!"); } catch (err) { console.error('Erro ao copiar', err); }
      document.body.removeChild(textArea);
    }
  };

  // ═══════════════════════════════════════════════
  //  SAVED DEALS
  // ═══════════════════════════════════════════════
  const fetchSavedDeals = async () => {
    setLoadingDeals(true);
    setDealsError("");
    try {
      const { data, error } = await supabase
        .from('deal_analyses')
        .select('*')
        .order('atualizado_em', { ascending: false });
      if (error) throw error;
      setSavedDeals(data || []);
    } catch (err) {
      setDealsError("Erro ao buscar deals salvos: " + (err.message || err));
    }
    setLoadingDeals(false);
  };

  useEffect(() => {
    if (activeTab === 'deals') fetchSavedDeals();
  }, [activeTab]);

  const handleLoadDeal = (deal) => {
    setDealId(deal.deal_id);
    setDealTitle(deal.deal_title);
    setAnalysis(normalizeAnalysis(deal.analise_ia));
    setHardMetrics(deal.metricas);
    setRawExtractedData(deal.dados_brutos || '');
    setFlowItems(deal.flow_items || []);
    setUsersMap(deal.users_map || {});
    setActiveTab('dashboard');
  };

  // ═══════════════════════════════════════════════
  //  PIPEDRIVE FETCH + GEMINI ANALYSIS
  // ═══════════════════════════════════════════════
  const fetchPipedriveData = async (forceRefresh = false) => {
    try {
      setStatus("fetching");
      setErrorMsg("");
      setProcessingStep(1);

      // Cache check
      if (!forceRefresh) {
        const { data: cacheData, error: cacheError } = await supabase
          .from('deal_analyses')
          .select('*')
          .eq('deal_id', String(dealId))
          .maybeSingle();

        if (cacheData && !cacheError) {
          setRawExtractedData(cacheData.dados_brutos);
          setAnalysis(normalizeAnalysis(cacheData.analise_ia));
          setHardMetrics(cacheData.metricas);

          try {
            const dealRes = await fetch(`/api/pipedrive/deals/${dealId}?api_token=${pipedriveToken}`, { method: 'GET', headers: { 'Accept': 'application/json' } });
            if (dealRes.ok) {
              const d = await dealRes.json();
              if (d.data?.title) {
                setDealTitle(d.data.title);
                if (cacheData.deal_title !== d.data.title) {
                  await supabase.from('deal_analyses').update({ deal_title: d.data.title }).eq('deal_id', String(dealId));
                }
              }
            }
          } catch { setDealTitle(cacheData.deal_title || ''); }

          const dt = new Date(cacheData.atualizado_em);
          setLastUpdate(`${dt.toLocaleDateString('pt-BR')} às ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
          setStatus("idle");
          setActiveTab('dashboard');
          showToast("⚡ Análise carregada do cache!");
          return null;
        }
      }

      // Fetch fresh data
      setProcessingStep(2);

      const dealRes = await fetch(`/api/pipedrive/deals/${dealId}?api_token=${pipedriveToken}`, { method: 'GET', headers: { 'Accept': 'application/json' } });
      if (!dealRes.ok) {
        const errorText = await dealRes.text();
        throw new Error(`Erro na API (${dealRes.status}): ${dealRes.status === 401 ? "Token inválido" : "Negócio não encontrado"}. Detalhes: ${errorText.substring(0, 50)}`);
      }

      const participantsRes = await fetch(`/api/pipedrive/deals/${dealId}/participants?api_token=${pipedriveToken}`, { method: 'GET', headers: { 'Accept': 'application/json' } });
      let usersMap = {};
      try {
        const usersRes = await fetch(`/api/pipedrive/users?api_token=${pipedriveToken}`, { method: 'GET', headers: { 'Accept': 'application/json' } });
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          if (usersData.data) usersData.data.forEach(u => { usersMap[u.id] = u.name; });
        }
      } catch (e) { console.warn('Could not fetch users:', e); }

      const dealData = await dealRes.json();
      let participantsData = participantsRes.ok ? await participantsRes.json() : { success: false, data: [] };
      const orgId = typeof dealData.data?.org_id === 'object' ? dealData.data.org_id?.value : dealData.data?.org_id;
      const companyProfile = await fetchCompanyProfile(orgId, pipedriveToken);

      // Enrich participants
      if (participantsData.data && participantsData.data.length > 0) {
        participantsData.data = participantsData.data.map(p => {
          const person = p.person || {};
          return {
            ...p,
            name: person.name || p.person_id?.name || p.name,
            email: person.email || p.person_id?.email || p.email,
            phone: person.phone || p.person_id?.phone || p.phone,
            org_name: person.org_name || person.org_id?.name || '',
            job_title: person.job_title || person['8a759b92f4243c926cfeda450011949ac51a7a95'] || '',
            linkedin: person['6bc768aa12d302afae99f70f8349fcfe714ca394'] || '',
            whatsapp: person['8639d6c9321e6de529429d20021623aad637cc1a'] || '',
            label: person.label || p.label,
            tags: person.label || '',
          };
        });
      }
      if (!dealData.success) throw new Error("A API do Pipedrive retornou sucesso=false para este Deal.");

      // Fetch flow items
      let allFlowItems = [];
      let start = 0;
      let moreItems = true;
      let pageCount = 0;
      setProcessingStep(3);
      while (moreItems && pageCount < 3) {
        const flowRes = await fetch(`/api/pipedrive/deals/${dealId}/flow?api_token=${pipedriveToken}&limit=100&start=${start}`, { method: 'GET', headers: { 'Accept': 'application/json' } });
        if (!flowRes.ok) throw new Error("Erro ao buscar histórico.");
        const flowData = await flowRes.json();
        if (flowData.data) allFlowItems = allFlowItems.concat(flowData.data);
        if (flowData.additional_data?.pagination?.more_items_in_collection) {
          start = flowData.additional_data.pagination.next_start;
          pageCount++;
        } else { moreItems = false; }
      }

      const metrics = calculateHardMetrics(dealData, allFlowItems);
      setHardMetrics(metrics);
      setProcessingStep(4);

      // Compile history for AI
      const dataAtual = new Date().toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' });
      let compiledHistory = `--- DATA DE REFERÊNCIA (HOJE) ---\n${dataAtual}\n\n`;
      compiledHistory += `--- DADOS DO NEGÓCIO E MÉTRICAS EXATAS ---\nID do Negócio: ${dealId}\nTítulo: ${dealData.data.title}\nDias no Funil (Aberto há): ${metrics.daysOpen} dias\nDias sem Contato (Email/WhatsApp/LinkedIn/Call): ${metrics.daysInactive} dias\nTotal de Interações Registradas: ${metrics.totalActions}\n\n`;
      compiledHistory += `--- DADOS DA EMPRESA NO CRM ---\n${companyProfileToPrompt(companyProfile)}\n\n`;

      compiledHistory += `\n--- PARTICIPANTES VINCULADOS ---\n`;
      if (participantsData.data && participantsData.data.length > 0) {
        participantsData.data.forEach(p => {
          const emails = Array.isArray(p.email) ? p.email.map(e => e.value || e).join(', ') : (p.email || '');
          compiledHistory += `- Nome: ${p.name || p.person_id?.name} | Email: ${emails}\n`;
        });
      }

      // SDR attribution
      const sdrCounts = {};
      allFlowItems.forEach(item => {
        const userId = item.data?.user_id || item.data?.creator_user_id || item.user_id;
        if (userId && usersMap[userId]) {
          if (!sdrCounts[usersMap[userId]]) sdrCounts[usersMap[userId]] = 0;
          sdrCounts[usersMap[userId]]++;
        }
      });
      const sdrNames = Object.keys(sdrCounts);
      if (sdrNames.length > 0) {
        compiledHistory += `\n--- SDRs QUE TOCARAM ESTE DEAL ---\n`;
        sdrNames.forEach(name => { compiledHistory += `- ${name} (${sdrCounts[name]} interações)\n`; });
      }

      compiledHistory += `\n--- HISTÓRICO DE ATIVIDADES ---\n`;
      allFlowItems.forEach(item => {
        let dateStr = "Data desconhecida";
        const rawDate = item.data?.add_time || item.timestamp || item.add_time;
        try { if (rawDate) dateStr = new Date(parsePipedriveDate(rawDate)).toLocaleDateString('pt-PT'); } catch { /* mantém fallback */ }

        const userId = item.data?.user_id || item.data?.creator_user_id || item.user_id;
        const sdrTag = userId && usersMap[userId] ? `[SDR: ${usersMap[userId]}] ` : '';

        if (item.object === 'note') {
          const cleanNote = typeof item.data?.content === 'string' ? item.data.content.replace(/<[^>]*>?/gm, '') : '';
          compiledHistory += `[${dateStr}] ${sdrTag}NOTA: ${cleanNote}\n`;
        } else if (item.object === 'activity') {
          compiledHistory += `[${dateStr}] ${sdrTag}ATIVIDADE | Tipo: [${item.data?.type}] | Assunto: [${item.data?.subject}] | Estado: ${item.data?.done ? 'Concluída' : 'Pendente'}\n`;
          if (typeof item.data?.note === 'string') {
            compiledHistory += `   Detalhes: ${item.data.note.replace(/<[^>]*>?/gm, '')}\n`;
          }
        } else if (item.object === 'mailThread' || item.object === 'mailMessage') {
          compiledHistory += `[${dateStr}] ${sdrTag}E-MAIL: Assunto: ${item.data?.subject}\n`;
          if (item.data?.snippet) compiledHistory += `   Resumo: ${item.data.snippet}\n`;
        }
      });

      setRawExtractedData(compiledHistory);
      setDealTitle(dealData.data.title);
      return { compiledHistory, metrics, participants: participantsData.data, title: dealData.data.title, items: allFlowItems, usersMap };

    } catch (err) {
      setStatus("error");
      setErrorMsg(err.message || "Erro desconhecido ao ligar ao Pipedrive.");
      return null;
    }
  };

  const analyzeWithGemini = async (historyText, metricsObj, titleOverride) => {
    try {
      setStatus("analyzing");
      setProcessingStep(5);

      const response = await fetch(`/api/gemini`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historyText, model })
      });

      if (!response.ok) {
        let errMsg = "Erro desconhecido na API Vercel";
        try {
          const errorData = await response.json();
          errMsg = errorData.error || errMsg;
        } catch {
          if (response.status === 504) errMsg = "Tempo Esgotado (504): A análise deste negócio é muito complexa ou o histórico é muito longo. Tente novamente em instantes.";
          else errMsg = `Erro no Servidor (${response.status}): O servidor falhou ao processar a resposta.`;
        }
        throw new Error(errMsg);
      }

      const result = await response.json();
      let rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      const parsedData = JSON.parse(rawText.trim());

      if (parsedData.resumo || parsedData.nota || parsedData.exemplos || parsedData.pontosMelhoria) {
        parsedData.avaliacaoProspecao = {
          resumo: parsedData.resumo,
          nota: parsedData.nota,
          exemplos: parsedData.exemplos,
          pontosMelhoria: parsedData.pontosMelhoria
        };
      }

      parsedData.perfilEmpresa = normalizeCompanyAnalysis(parsedData.perfilEmpresa);
      setAnalysis(parsedData);

      const nowString = new Date().toISOString();
      const dt = new Date(nowString);
      setLastUpdate(`${dt.toLocaleDateString('pt-BR')} às ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);

      // Save to Supabase cache
      setProcessingStep(6);
      try {
        const { error: upsertError } = await supabase
          .from('deal_analyses')
          .upsert({
            deal_id: String(dealId),
            deal_title: titleOverride || dealTitle,
            analise_ia: parsedData,
            dados_brutos: historyText,
            metricas: metricsObj,
            atualizado_em: nowString
          }, { onConflict: 'deal_id' });

        if (upsertError) console.error("❌ Erro ao salvar no Supabase:", upsertError.code, upsertError.message);
        else showToast("✅ Análise salva no banco!");
      } catch (dbErr) { console.error("🚨 Exceção ao conectar com Supabase:", dbErr); }

      setActiveTab("dashboard");
      setStatus("success");
      setProcessingStep(0);

    } catch (err) {
      setStatus("error");
      setProcessingStep(0);
      setErrorMsg(err.message || "Falha na análise da IA.");
    }
  };

  // ═══════════════════════════════════════════════
  //  ORCHESTRATORS
  // ═══════════════════════════════════════════════
  const handleStartProcess = async () => {
    if (!pipedriveToken || !dealId) {
      setActiveTab("config");
      showToast("Preencha as configurações do Pipedrive primeiro!");
      return;
    }
    setAnalysis(null);
    setHardMetrics(null);
    setErrorMsg("");
    setRawExtractedData("");
    setDealTitle("");
    setProcessingStep(1);
    setActiveTab("dashboard");

    const fetchRes = await fetchPipedriveData();
    if (fetchRes) {
      if (fetchRes.participants) setDetailedParticipants(fetchRes.participants);
      if (fetchRes.items) setFlowItems(fetchRes.items);
      if (fetchRes.usersMap) setUsersMap(fetchRes.usersMap);
      await analyzeWithGemini(fetchRes.compiledHistory, fetchRes.metrics, fetchRes.title);
    } else { setProcessingStep(0); }
  };

  const handleForceRefresh = async () => {
    setAnalysis(null);
    setHardMetrics(null);
    setErrorMsg("");
    setRawExtractedData("");
    setProcessingStep(1);
    setActiveTab("dashboard");

    const fetchRes = await fetchPipedriveData(true);
    if (fetchRes) {
      if (fetchRes.participants) setDetailedParticipants(fetchRes.participants);
      if (fetchRes.items) setFlowItems(fetchRes.items);
      if (fetchRes.usersMap) setUsersMap(fetchRes.usersMap);
      await analyzeWithGemini(fetchRes.compiledHistory, fetchRes.metrics, fetchRes.title);
    }
  };

  const handleNewAnalysis = () => {
    setAnalysis(null);
    setHardMetrics(null);
    setRawExtractedData("");
    setDealTitle("");
    setDealId("");
    setStatus("idle");
    setErrorMsg("");
    setProcessingStep(0);
    setActiveTab("config");
  };

  // ═══════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════
  if (authLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center">
        <div className="animate-pulse text-slate-400 font-bold">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={handleGoogleLogin} />;
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        analysis={analysis}
        user={user}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar
          analysis={analysis}
          onNewAnalysis={handleNewAnalysis}
          onForceRefresh={handleForceRefresh}
          isProcessing={status === 'fetching' || status === 'analyzing'}
          onCopyInsight={copyToClipboard}
        />

        <main className="flex-1 overflow-y-auto p-8">
          {/* PROCESSING STEPPER */}
          {(status === 'fetching' || status === 'analyzing') && processingStep > 0 && (
            <ProcessingStepper dealId={dealId} processingStep={processingStep} />
          )}

          {/* CONFIG TAB */}
          {activeTab === 'config' && (
            <ConfigTab
              pipedriveToken={pipedriveToken}
              setPipedriveToken={setPipedriveToken}
              dealId={dealId}
              setDealId={setDealId}
              model={model}
              setModel={setModel}
              status={status}
              errorMsg={errorMsg}
              onStartProcess={handleStartProcess}
            />
          )}

          {/* SAVED DEALS TAB */}
          {activeTab === 'deals' && (
            <SavedDealsTab
              savedDeals={savedDeals}
              loadingDeals={loadingDeals}
              dealsError={dealsError}
              onRefresh={fetchSavedDeals}
              onLoadDeal={handleLoadDeal}
            />
          )}

          {/* ANALYSIS TABS – only when dashboard+ selected and analysis exists */}
          {activeTab !== 'config' && activeTab !== 'deals' && (
            analysis ? (
              <div className="max-w-6xl mx-auto">
                {activeTab === 'dashboard' && (
                  <DashboardTab
                    analysis={analysis}
                    hardMetrics={hardMetrics}
                    dealTitle={dealTitle}
                    dealId={dealId}
                    lastUpdate={lastUpdate}
                    rawExtractedData={rawExtractedData}
                    status={status}
                    onCopyText={copyToClipboard}
                    onForceRefresh={handleForceRefresh}
                  />
                )}

                {activeTab === 'estrategia' && (
                  <StrategyTab
                    analysis={analysis} 
                    onCopyText={copyToClipboard}
                  />
                )}

                {activeTab === 'empresa' && (
                  <CompanyTab analysis={analysis} onCopyText={copyToClipboard} />
                )}

                {activeTab === 'participantes' && (
                  <ParticipantsTab
                    analysis={analysis}
                    detailedParticipants={detailedParticipants}
                  />
                )}

                {activeTab === 'timeline' && (
                  <TimelineTab
                    analysis={analysis}
                  />
                )}
              </div>
            ) : (
              /* EMPTY STATE when no analysis loaded */
              !(status === 'fetching' || status === 'analyzing') && (
                <EmptyState
                  onGoConfig={() => setActiveTab('config')}
                  onGoDeals={() => setActiveTab('deals')}
                />
              )
            )
          )}
        </main>
      </div>

      {/* TOAST NOTIFICATION */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
};

export default App;
