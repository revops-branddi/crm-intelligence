import React from 'react';
import {
  Settings, Database, LayoutDashboard, Target, Building2, Users,
  BookOpen, Zap, ChevronRight
} from 'lucide-react';

const SidebarIcon = ({ icon, label, id, active, onClick }) => (
  <div
    onClick={() => onClick(id)}
    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer ${active ? 'bg-branddi-cyan text-branddi-navy font-bold' : 'text-slate-400 hover:bg-slate-800'}`}
  >
    {React.createElement(icon, { size: 20 })}
    <span className="text-sm font-medium">{label}</span>
  </div>
);

export const Sidebar = ({ activeTab, setActiveTab, analysis, user, onLogout }) => (
  <aside className="w-64 bg-branddi-navy border-r border-slate-800 flex flex-col z-20 text-white">
    <div className="p-6 flex items-center gap-3">
      <div className="w-10 h-10 bg-branddi-cyan rounded-xl flex items-center justify-center text-branddi-navy shadow-lg shadow-branddi-cyan/20">
        <Zap size={24} fill="#001D2E" />
      </div>
      <div className="flex flex-col">
        <span className="font-bold text-white leading-tight">Pipedrive</span>
        <span className="text-[10px] font-bold text-branddi-cyan uppercase tracking-tight">Intelligence Branddi</span>
      </div>
    </div>

    <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-4 mb-2">Principal</p>
      <SidebarIcon icon={Settings} label="Configurações" id="config" active={activeTab === 'config'} onClick={setActiveTab} />

      <div className="pt-4">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-4 mb-2">Banco de Dados</p>
        <SidebarIcon icon={Database} label="Deals Salvos" id="deals" active={activeTab === 'deals'} onClick={setActiveTab} />
      </div>

      <div className={`pt-4 ${!analysis ? 'opacity-40 pointer-events-none' : ''}`}>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-4 mb-2">Análise 360</p>
        <SidebarIcon icon={LayoutDashboard} label="Visão Geral" id="dashboard" active={activeTab === 'dashboard'} onClick={setActiveTab} />
        <SidebarIcon icon={Building2} label="Empresa / Marca" id="empresa" active={activeTab === 'empresa'} onClick={setActiveTab} />
        <SidebarIcon icon={BookOpen} label="Abordagem (Pitch)" id="estrategia" active={activeTab === 'estrategia'} onClick={setActiveTab} />
        <SidebarIcon icon={Users} label="Stakeholders" id="participantes" active={activeTab === 'participantes'} onClick={setActiveTab} />
        <SidebarIcon icon={Target} label="Histórico Comercial" id="timeline" active={activeTab === 'timeline'} onClick={setActiveTab} />
      </div>
    </nav>

    <div className="p-4 border-t border-slate-800">
      <div className="bg-slate-800/50 p-3 rounded-lg flex items-center gap-3 cursor-pointer hover:bg-slate-800 transition-colors">
        <div className="w-8 h-8 rounded-full bg-branddi-cyan/20 flex items-center justify-center text-branddi-cyan font-bold text-xs">{user?.email?.charAt(0).toUpperCase() || 'U'}</div>
        <div className="flex-1 overflow-hidden">
          <p className="text-xs font-bold text-white truncate">{user?.user_metadata?.full_name || user?.email}</p>
          <button onClick={onLogout} className="text-[10px] text-slate-400 truncate hover:text-white transition-colors">Sair da Conta</button>
        </div>
      </div>
    </div>
  </aside>
);
