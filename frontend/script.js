/* ---------------------------------------------------------
   CONFIGURAÇÃO DA API
   Em produção, troque pela URL do backend publicado no Render.
--------------------------------------------------------- */
const API_BASE_URL = "http://127.0.0.1:8000";

/* ---------------------------------------------------------
   ESTADO EM MEMÓRIA (preenchido a partir da API)
--------------------------------------------------------- */
let DB = { sessions: [] };
let currentBookingDraft = {};
let adminMode = false;
let adminToken = sessionStorage.getItem("admin_token") || null;
let activeTab = "agendar";
let adminView = { screen:"lista", sessionId:null };
let minhaVezState = { confirmCancelId: null };
let showLogin = false;
let loading = true;
let loadError = null;

/* ---------------------------------------------------------
   CHAMADAS À API
--------------------------------------------------------- */
async function apiFetch(path, options = {}){
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const res = await fetch(API_BASE_URL + path, { ...options, headers });
  if(!res.ok){
    let detail = "Erro ao comunicar com o servidor.";
    try { detail = (await res.json()).detail || detail; } catch(e){}
    throw new Error(detail);
  }
  if(res.status === 204) return null;
  return res.json();
}

function authHeaders(){
  return adminToken ? { "Authorization": "Bearer " + adminToken } : {};
}

async function carregarSessoes(){
  loading = true; loadError = null; render();
  try{
    DB.sessions = await apiFetch("/sessoes/");
  } catch(e){
    loadError = "Não foi possível carregar as giras. Verifique se o servidor está no ar.";
  }
  loading = false;
  render();
}

/* ---------------------------------------------------------
   HELPERS
--------------------------------------------------------- */
function fmtDate(iso){
  const d = new Date(iso+"T00:00:00");
  return d.toLocaleDateString("pt-BR", { weekday:'short', day:'2-digit', month:'short' }).replace('.', '');
}
function entidadeLabel(e){ return e === "exu" ? "Exu" : "Preto Velho"; }
function mediumLabel(m){ return m.entidade_nome ? `${m.nome} — ${m.entidade_nome}` : m.nome; }
function sessionAberta(s){ return s.mediuns.length > 0 && s.mediuns.some(m => m.vagas_restantes > 0); }
function sessionTotalVagas(s){ return s.mediuns.reduce((a,m)=>a+m.capacidade,0); }
function sessionVagasRestantes(s){ return s.mediuns.reduce((a,m)=>a+m.vagas_restantes,0); }
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(()=>t.classList.remove('show'), 2600);
}
function meusAgendamentoIds(){
  return JSON.parse(localStorage.getItem("meus_agendamentos_ids") || "[]");
}
function salvarMeuAgendamentoId(id){
  const ids = meusAgendamentoIds();
  ids.push(id);
  localStorage.setItem("meus_agendamentos_ids", JSON.stringify(ids));
}

/* ---------------------------------------------------------
   ICONS
--------------------------------------------------------- */
const ICON_BACK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 18l-6-6 6-6"/></svg>`;
const ICON_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--ok)" stroke-width="1.6"><circle cx="12" cy="12" r="10"/><path d="M8 12.5l2.5 2.5 5-5"/></svg>`;
const ICON_EMPTY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01M8.5 15c1-1.2 2.2-1.8 3.5-1.8s2.5.6 3.5 1.8"/></svg>`;
const ICON_TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 6h16M9 6V4h6v2M6 6l1 14h10l1-14"/></svg>`;
const ICON_EDIT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;

/* ---------------------------------------------------------
   RENDER PRINCIPAL
--------------------------------------------------------- */
function render(){
  const main = document.getElementById('main');
  document.getElementById('tabbar').style.display = (adminMode || showLogin) ? 'none' : 'flex';
  document.getElementById('adminToggleBtn').textContent = adminMode ? 'Sair da área do responsável' : 'Área do responsável';

  if(showLogin){
    main.innerHTML = renderLogin();
    document.getElementById('btnEntrar').onclick = fazerLogin;
    document.getElementById('btnCancelarLogin').onclick = ()=>{ showLogin = false; render(); };
    return;
  }

  if(adminMode){ main.innerHTML = renderAdmin(); attachAdminEvents(); return; }

  if(loading){ main.innerHTML = `<div class="empty-state">${ICON_EMPTY}<p>Carregando giras...</p></div>`; return; }
  if(loadError){ main.innerHTML = `<div class="empty-state">${ICON_EMPTY}<p>${loadError}</p></div>`; return; }

  if(activeTab === 'agendar') main.innerHTML = renderAgendar();
  else main.innerHTML = `<h1 class="page-title">Minha vez</h1><p class="page-sub">Acompanhe aqui suas consultas agendadas.</p>${emptyState('Carregando...')}`;

  attachPublicEvents();
  if(activeTab === 'minhavez') carregarMinhaVez();
}

/* ---------- LOGIN ---------- */
function renderLogin(){
  return `
    <div class="login-box">
      <h1 class="page-title">Área do responsável</h1>
      <p class="page-sub">Digite a senha para gerenciar as escalas e o check-in.</p>
      <label class="field-label">Senha</label>
      <input type="password" id="inpSenha" placeholder="Senha">
      <button class="btn btn-primary" id="btnEntrar">Entrar</button>
      <button class="btn btn-ghost" id="btnCancelarLogin" style="margin-top:10px;">Cancelar</button>
    </div>
  `;
}

async function fazerLogin(){
  const senha = document.getElementById('inpSenha').value;
  try{
    const resp = await apiFetch("/admin/login", { method:"POST", body: JSON.stringify({ senha }) });
    adminToken = resp.token;
    sessionStorage.setItem("admin_token", adminToken);
    adminMode = true; showLogin = false; adminView = { screen:'lista', sessionId:null };
    await carregarSessoes();
  } catch(e){
    toast("Senha incorreta.");
  }
}

/* ---------- ABA: AGENDAR ---------- */
function renderAgendar(){
  if(currentBookingDraft.step === 'medium') return renderEscolherMedium();
  if(currentBookingDraft.step === 'form') return renderFormAgendamento();
  if(currentBookingDraft.step === 'sucesso') return renderSucesso();

  const sessions = [...DB.sessions].sort((a,b)=> a.data.localeCompare(b.data));
  const cards = sessions.map(s => {
    const aberta = sessionAberta(s);
    const semEscala = s.mediuns.length === 0;
    return `
    <div class="session-card ${aberta? '' : 'locked'}" data-session="${s.id}">
      <div class="session-top">
        <div class="session-date">${fmtDate(s.data)}<small>${s.horario}</small></div>
        <span class="tag ${s.entidade==='exu'?'exu':'pv'}">${entidadeLabel(s.entidade)}</span>
      </div>
      ${aberta ? `
        <div class="session-meta">
          <div><b>${s.mediuns.length}</b> médiuns na lista</div>
          <div><b>${sessionVagasRestantes(s)}</b> de ${sessionTotalVagas(s)} vagas</div>
        </div>` :
        `<div class="lock-msg">${semEscala ? 'Lista de médiuns ainda não foi divulgada para esta gira.' : 'Todas as vagas desta gira já foram preenchidas.'}</div>`}
    </div>`;
  }).join('');

  return `
    <h1 class="page-title">Próximas giras</h1>
    <p class="page-sub">Escolha uma gira com vagas abertas para agendar sua consulta.</p>
    ${cards || emptyState('Nenhuma gira cadastrada no momento.')}
  `;
}

function renderEscolherMedium(){
  const s = DB.sessions.find(x=>x.id===currentBookingDraft.sessionId);
  const cards = s.mediuns.map(m=>{
    const full = m.vagas_restantes <= 0;
    const sel = currentBookingDraft.mediumId === m.id;
    return `
    <div class="medium-card ${sel?'selected':''} ${full?'full':''}" data-medium="${m.id}">
      <div>
        <div class="medium-name">${m.nome}${m.entidade_nome ? ' <span style="color:var(--gold);font-weight:400;">• '+m.entidade_nome+'</span>' : ''}</div>
        <div class="medium-vagas">${full ? 'Sem vagas' : m.vagas_restantes + ' vaga(s) disponível(is)'}</div>
      </div>
      <div class="radio-dot"></div>
    </div>`;
  }).join('');

  return `
    <button class="back-link" id="backToList">${ICON_BACK} Voltar</button>
    <h1 class="page-title">${entidadeLabel(s.entidade)} • ${fmtDate(s.data)}</h1>
    <p class="page-sub">Escolha o médium com quem deseja fazer sua consulta.</p>
    ${cards}
    <button class="btn btn-primary" id="btnContinuar" ${currentBookingDraft.mediumId? '':'disabled'}>Continuar</button>
  `;
}

function renderFormAgendamento(){
  const s = DB.sessions.find(x=>x.id===currentBookingDraft.sessionId);
  const m = s.mediuns.find(x=>x.id===currentBookingDraft.mediumId);
  return `
    <button class="back-link" id="backToMedium">${ICON_BACK} Voltar</button>
    <h1 class="page-title">Seus dados</h1>
    <p class="page-sub">Consulta com <b style="color:var(--ink)">${mediumLabel(m)}</b> — ${fmtDate(s.data)} às ${s.horario}.</p>

    <label class="field-label">Nome completo</label>
    <input type="text" id="inpNome" placeholder="Seu nome">

    <label class="field-label">Telefone / WhatsApp</label>
    <input type="tel" id="inpTelefone" placeholder="(00) 00000-0000">

    <div class="checkbox-row">
      <input type="checkbox" id="inpPrioridade">
      <label for="inpPrioridade">Atendimento preferencial (idoso, gestante, pessoa com deficiência etc.)</label>
    </div>

    <button class="btn btn-primary" id="btnConfirmar">Confirmar agendamento</button>
  `;
}

function renderSucesso(){
  const b = currentBookingDraft.result;
  const s = DB.sessions.find(x=>x.id===b.sessao_id);
  const m = s.mediuns.find(x=>x.id===b.medium_id);
  return `
    <div class="confirm-box">
      <div class="confirm-icon">${ICON_CHECK}</div>
      <h2>Agendamento confirmado</h2>
      <p>Guarde esta ficha. Chegue com antecedência no horário da gira — sua vaga só é garantida após o check-in feito pelo responsável no local.</p>
      <div class="ticket">
        <div class="ticket-row"><span>Nome</span><span>${b.nome}</span></div>
        <div class="ticket-row"><span>Gira</span><span>${fmtDate(s.data)} • ${s.horario}</span></div>
        <div class="ticket-row"><span>Entidade</span><span>${entidadeLabel(s.entidade)}</span></div>
        <div class="ticket-row"><span>Médium</span><span>${mediumLabel(m)}</span></div>
        ${b.prioridade? '<div class="ticket-row"><span>Prioridade</span><span>Sim</span></div>':''}
      </div>
      <div class="queue-badge">Sua posição na fila: ${b.posicao_fila}º</div>
      <button class="btn btn-ghost" id="btnNovoAgendamento" style="margin-top:26px;">Fazer outro agendamento</button>
    </div>
  `;
}

/* ---------- ABA: MINHA VEZ ---------- */
async function carregarMinhaVez(){
  const ids = meusAgendamentoIds();
  const main = document.getElementById('main');
  if(ids.length === 0){
    main.innerHTML = `<h1 class="page-title">Minha vez</h1><p class="page-sub">Acompanhe aqui suas consultas agendadas.</p>${emptyState('Você ainda não tem nenhum agendamento.')}`;
    return;
  }
  main.innerHTML = `<h1 class="page-title">Minha vez</h1><p class="page-sub">Acompanhe aqui suas consultas agendadas.</p>${emptyState('Carregando...')}`;
  try{
    const meus = await apiFetch("/agendamentos/meus?ids=" + ids.join(","));
    if(meus.length === 0){
      main.innerHTML = `<h1 class="page-title">Minha vez</h1><p class="page-sub">Acompanhe aqui suas consultas agendadas.</p>${emptyState('Você ainda não tem nenhum agendamento.')}`;
      return;
    }
    const items = meus.map(b=>{
      const s = DB.sessions.find(x=>x.id===b.sessao_id);
      const m = s ? s.mediuns.find(x=>x.id===b.medium_id) : null;
      const statusLabel = { confirmado:'Aguardando o dia da gira', checkin:'Presença confirmada — aguarde ser chamado', atendido:'Atendimento realizado', cancelado:'Vaga liberada / não compareceu' }[b.status];
      const podeCancel = b.status === 'confirmado';
      return `
      <div class="queue-item">
        <div class="queue-item-top"><b>${m ? mediumLabel(m) : 'Médium'}</b>${s?`<span class="tag ${s.entidade==='exu'?'exu':'pv'}">${entidadeLabel(s.entidade)}</span>`:''}</div>
        <div class="sub">${s?fmtDate(s.data)+' às '+s.horario:''} — posição na fila: ${b.posicao_fila}º</div>
        <div class="sub" style="margin-top:6px;color:var(--gold)">${statusLabel}</div>
        ${podeCancel ? `
        ${minhaVezState.confirmCancelId === b.id ? `
          <div class="actions">
            <button class="btn btn-danger btn-sm" data-confirmar-cancelamento="${b.id}">Confirmar cancelamento</button>
            <button class="btn btn-ghost btn-sm" data-voltar-cancelamento="1">Voltar</button>
          </div>` : `
          <div class="actions"><button class="btn btn-ghost btn-sm" data-pedir-cancelamento="${b.id}">Cancelar agendamento</button></div>`}
        ` : ''}
      </div>`;
    }).join('');
    main.innerHTML = `<h1 class="page-title">Minha vez</h1><p class="page-sub">Acompanhe aqui suas consultas agendadas.</p>${items}`;
    document.querySelectorAll('[data-pedir-cancelamento]').forEach(el=>{
      el.onclick = ()=>{ minhaVezState.confirmCancelId = parseInt(el.dataset.pedirCancelamento,10); carregarMinhaVez(); };
    });
    document.querySelectorAll('[data-voltar-cancelamento]').forEach(el=>{
      el.onclick = ()=>{ minhaVezState.confirmCancelId = null; carregarMinhaVez(); };
    });
    document.querySelectorAll('[data-confirmar-cancelamento]').forEach(el=>{
      el.onclick = async ()=>{
        try{
          await apiFetch(`/agendamentos/${el.dataset.confirmarCancelamento}/cancelar`, { method:"POST" });
          toast('Agendamento cancelado.');
          minhaVezState.confirmCancelId = null;
          await carregarSessoes();
          await carregarMinhaVez();
        } catch(e){ toast(e.message || 'Não foi possível cancelar.'); }
      };
    });
  } catch(e){
    main.innerHTML = `<h1 class="page-title">Minha vez</h1>${emptyState('Não foi possível carregar seus agendamentos agora.')}`;
  }
}

function emptyState(msg){
  return `<div class="empty-state">${ICON_EMPTY}<p>${msg}</p></div>`;
}

/* ---------------------------------------------------------
   EVENTOS — ÁREA PÚBLICA
--------------------------------------------------------- */
function attachPublicEvents(){
  document.querySelectorAll('.session-card[data-session]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const id = parseInt(el.dataset.session, 10);
      const s = DB.sessions.find(x=>x.id===id);
      if(!sessionAberta(s)) return;
      currentBookingDraft = { sessionId: s.id, mediumId:null, step:'medium' };
      render();
    });
  });

  const backList = document.getElementById('backToList');
  if(backList) backList.onclick = ()=>{ currentBookingDraft = {}; render(); };

  document.querySelectorAll('.medium-card[data-medium]').forEach(el=>{
    el.addEventListener('click', ()=>{
      if(el.classList.contains('full')) return;
      currentBookingDraft.mediumId = parseInt(el.dataset.medium, 10);
      render();
    });
  });

  const btnContinuar = document.getElementById('btnContinuar');
  if(btnContinuar) btnContinuar.onclick = ()=>{ currentBookingDraft.step='form'; render(); };

  const backMedium = document.getElementById('backToMedium');
  if(backMedium) backMedium.onclick = ()=>{ currentBookingDraft.step='medium'; render(); };

  const btnConfirmar = document.getElementById('btnConfirmar');
  if(btnConfirmar) btnConfirmar.onclick = async ()=>{
    const nome = document.getElementById('inpNome').value.trim();
    const telefone = document.getElementById('inpTelefone').value.trim();
    const prioridade = document.getElementById('inpPrioridade').checked;
    if(!nome || !telefone){ toast('Preencha nome e telefone.'); return; }

    btnConfirmar.disabled = true;
    btnConfirmar.textContent = "Enviando...";
    try{
      const booking = await apiFetch("/agendamentos/", {
        method: "POST",
        body: JSON.stringify({
          nome, telefone, prioridade,
          sessao_id: currentBookingDraft.sessionId,
          medium_id: currentBookingDraft.mediumId
        })
      });
      salvarMeuAgendamentoId(booking.id);
      await carregarSessoes(); // atualiza vagas restantes
      currentBookingDraft = { step:'sucesso', result: booking };
      render();
    } catch(e){
      toast(e.message || 'Essa vaga pode ter acabado de ser preenchida.');
      currentBookingDraft.step='medium';
      await carregarSessoes();
    }
  };

  const btnNovo = document.getElementById('btnNovoAgendamento');
  if(btnNovo) btnNovo.onclick = ()=>{ currentBookingDraft = {}; render(); };

  document.querySelectorAll('nav.tabbar button').forEach(btn=>{
    btn.onclick = ()=>{
      activeTab = btn.dataset.tab;
      currentBookingDraft = {};
      document.querySelectorAll('nav.tabbar button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      render();
    };
  });
}

document.getElementById('adminToggleBtn').addEventListener('click', ()=>{
  if(adminMode){ adminMode=false; adminToken=null; sessionStorage.removeItem("admin_token"); render(); return; }
  showLogin = true; render();
});

/* ---------------------------------------------------------
   ÁREA DO RESPONSÁVEL (ADMIN)
--------------------------------------------------------- */
function renderAdmin(){
  if(loading) return `<div class="empty-state">${ICON_EMPTY}<p>Carregando...</p></div>`;
  if(adminView.screen === 'nova') return renderAdminFormSessao();
  if(adminView.screen === 'escala') return renderAdminEscala();
  if(adminView.screen === 'checkin') return renderAdminCheckin();

  const sessions = [...DB.sessions].sort((a,b)=> a.data.localeCompare(b.data));
  const rows = sessions.map(s=>{
    if(adminView.confirmDeleteId === s.id){
      return `
      <div class="admin-session-row" style="border:1px solid var(--danger);">
        <div>
          <b style="display:block;font-size:14.5px;">Excluir ${fmtDate(s.data)} • ${entidadeLabel(s.entidade)}?</b>
          <span style="font-size:11.5px;color:var(--ink-dim);">Isso também apaga médiuns e agendamentos ligados a essa gira.</span>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-danger btn-sm" data-confirm-delete="${s.id}">Excluir</button>
          <button class="btn btn-ghost btn-sm" data-cancel-delete="1">Cancelar</button>
        </div>
      </div>`;
    }
    return `
    <div class="admin-session-row" data-session="${s.id}">
      <div>
        <b style="display:block;font-size:14.5px;">${fmtDate(s.data)} • ${entidadeLabel(s.entidade)}</b>
        <span style="font-size:11.5px;color:var(--ink-dim);">${s.mediuns.length} médium(ns) escalado(s)</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="status-pill ${s.mediuns.length>0 ? 'aberta':'fechada'}">${s.mediuns.length>0 ? 'Divulgada':'Sem escala'}</span>
        <button class="icon-btn" data-edit-session="${s.id}">${ICON_EDIT}</button>
        <button class="icon-btn" data-delete-session="${s.id}">${ICON_TRASH}</button>
      </div>
    </div>`;
  }).join('');

  return `
    <h1 class="page-title">Área do responsável</h1>
    <p class="page-sub">Toque numa gira para montar a lista de médiuns disponíveis ou fazer o check-in do dia.</p>
    <button class="btn btn-primary" id="btnNovaSessao" style="margin-top:0;margin-bottom:20px;">+ Cadastrar nova gira</button>
    ${rows || emptyState('Nenhuma gira cadastrada ainda.')}
  `;
}

function renderAdminFormSessao(){
  const editando = !!adminView.editSessionId;
  const s = editando ? DB.sessions.find(x=>x.id===adminView.editSessionId) : null;
  const entSel = adminView.entidadeSelecionada || (s ? s.entidade : 'exu');
  return `
    <button class="back-link" id="adminBack">${ICON_BACK} Voltar</button>
    <h1 class="page-title">${editando ? 'Editar gira' : 'Cadastrar gira'}</h1>
    <p class="page-sub">Use isso para ajustar o calendário quando houver alguma mudança de data, horário ou entidade da gira.</p>

    <label class="field-label">Data</label>
    <input type="date" id="novaSessaoData" value="${s ? s.data : ''}">

    <label class="field-label">Horário</label>
    <input type="text" id="novaSessaoHorario" placeholder="Ex: 19:30" value="${s ? s.horario : '19:30'}">

    <label class="field-label">Entidade</label>
    <div class="add-row" style="margin-top:0;">
      <div class="medium-card ${entSel==='exu'?'selected':''}" id="optExu" data-entidade="exu" style="flex:1;justify-content:center;cursor:pointer;">
        <div class="medium-name">Exu</div>
      </div>
      <div class="medium-card ${entSel==='preto_velho'?'selected':''}" id="optPV" data-entidade="preto_velho" style="flex:1;justify-content:center;cursor:pointer;">
        <div class="medium-name">Preto Velho</div>
      </div>
    </div>

    <button class="btn btn-primary" id="btnSalvarSessao">${editando ? 'Salvar alterações' : 'Salvar gira'}</button>
  `;
}

function renderAdminEscala(){
  const s = DB.sessions.find(x=>x.id===adminView.sessionId);
  const items = s.mediuns.map(m=>`
    <div class="escala-item">
      <div class="info"><b>${mediumLabel(m)}</b><span>Capacidade: ${m.capacidade} • Ocupadas: ${m.ocupadas}</span></div>
      <button class="icon-btn" data-remove="${m.id}">${ICON_TRASH}</button>
    </div>`).join('') || `<p style="color:var(--ink-dim);font-size:13px;">Nenhum médium adicionado ainda — a gira fica invisível para o público até adicionar ao menos um.</p>`;

  return `
    <button class="back-link" id="adminBack">${ICON_BACK} Voltar</button>
    <h1 class="page-title">Lista de médiuns</h1>
    <p class="page-sub">${fmtDate(s.data)} • ${entidadeLabel(s.entidade)} — adicione quem estará disponível nesta gira.</p>
    ${items}
    <label class="field-label">Nome do médium</label>
    <input type="text" id="novoMediumNome">
    <label class="field-label">Nome da entidade (opcional)</label>
    <input type="text" id="novoMediumEntidade">
    <label class="field-label">Vagas</label>
    <input type="text" id="novoMediumCap" inputmode="numeric">
    <button class="btn btn-primary" id="btnAddMedium">Adicionar à lista</button>
    <button class="btn btn-ghost" id="btnIrCheckin" style="margin-top:10px;">Ver check-in / fila desta gira</button>
  `;
}

function renderAdminCheckin(){
  const s = DB.sessions.find(x=>x.id===adminView.sessionId);
  const fila = adminView.fila || [];
  if(fila.length===0 && !adminView.filaCarregada){
    return `<button class="back-link" id="adminBack">${ICON_BACK} Voltar</button><h1 class="page-title">Check-in</h1>${emptyState('Carregando...')}`;
  }
  if(fila.length===0){
    return `<button class="back-link" id="adminBack">${ICON_BACK} Voltar</button><h1 class="page-title">Check-in</h1>${emptyState('Ainda não há agendamentos para esta gira.')}`;
  }
  const porMedium = s.mediuns.map(m=>{
    const doMedium = fila.filter(b=>b.medium_id===m.id && b.status!=='cancelado')
                          .sort((a,b)=> (a.posicao_fila||0) - (b.posicao_fila||0));
    const itens = doMedium.map(b=>`
      <div class="queue-item">
        <div class="queue-item-top"><b>${b.posicao_fila}º ${b.nome}${b.prioridade?'<span class="priority-flag">PREFERENCIAL</span>':''}</b></div>
        <div class="sub">${b.telefone} • status: ${ {confirmado:'aguardando chegada', checkin:'presença confirmada', atendido:'atendido'}[b.status] }</div>
        <div class="actions">
          ${b.status==='confirmado' ? `<button class="btn btn-primary btn-sm" data-checkin="${b.id}">Confirmar chegada</button><button class="btn btn-danger btn-sm" data-noshow="${b.id}">Não veio</button>` : ''}
          ${b.status==='checkin' ? `<button class="btn btn-ghost btn-sm" data-atendido="${b.id}">Marcar como atendido</button>` : ''}
        </div>
      </div>`).join('') || `<p style="color:var(--ink-dim);font-size:12.5px;">Sem agendamentos para este médium.</p>`;
    return `<div class="rule"><span>${mediumLabel(m)}</span></div>${itens}`;
  }).join('');

  return `
    <button class="back-link" id="adminBack">${ICON_BACK} Voltar</button>
    <h1 class="page-title">Check-in da gira</h1>
    <p class="page-sub">${fmtDate(s.data)} • ${entidadeLabel(s.entidade)}</p>
    ${porMedium}
  `;
}

async function carregarFilaCheckin(){
  try{
    const fila = await apiFetch(`/agendamentos/sessao/${adminView.sessionId}`, { headers: authHeaders() });
    adminView.fila = fila;
    adminView.filaCarregada = true;
  } catch(e){
    adminView.fila = [];
    adminView.filaCarregada = true;
    toast("Não foi possível carregar a fila.");
  }
  render();
}

function attachAdminEvents(){
  document.querySelectorAll('.admin-session-row[data-session]').forEach(el=>{
    el.onclick = ()=>{ adminView = { screen:'escala', sessionId: parseInt(el.dataset.session,10) }; render(); };
  });

  document.querySelectorAll('[data-edit-session]').forEach(el=>{
    el.onclick = (e)=>{
      e.stopPropagation();
      adminView = { screen:'nova', editSessionId: parseInt(el.dataset.editSession,10) };
      render();
    };
  });

  document.querySelectorAll('[data-delete-session]').forEach(el=>{
    el.onclick = (e)=>{
      e.stopPropagation();
      adminView.confirmDeleteId = parseInt(el.dataset.deleteSession,10);
      render();
    };
  });

  document.querySelectorAll('[data-cancel-delete]').forEach(el=>{
    el.onclick = (e)=>{ e.stopPropagation(); adminView.confirmDeleteId = null; render(); };
  });

  document.querySelectorAll('[data-confirm-delete]').forEach(el=>{
    el.onclick = async (e)=>{
      e.stopPropagation();
      const id = el.dataset.confirmDelete;
      try{
        await apiFetch(`/sessoes/${id}`, { method:"DELETE", headers: authHeaders() });
        toast('Gira excluída.');
        adminView = { screen:'lista', sessionId:null };
        await carregarSessoes();
        render();
      } catch(err){ toast(err.message || 'Erro ao excluir gira.'); }
    };
  });

  const back = document.getElementById('adminBack');
  if(back) back.onclick = ()=>{ adminView = { screen:'lista', sessionId:null }; render(); };

  const btnNovaSessao = document.getElementById('btnNovaSessao');
  if(btnNovaSessao) btnNovaSessao.onclick = ()=>{ adminView = { screen:'nova', entidadeSelecionada:'exu' }; render(); };

  const optExu = document.getElementById('optExu');
  const optPV = document.getElementById('optPV');
  if(optExu && optPV){
    optExu.onclick = ()=>{ adminView.entidadeSelecionada='exu'; optExu.classList.add('selected'); optPV.classList.remove('selected'); };
    optPV.onclick = ()=>{ adminView.entidadeSelecionada='preto_velho'; optPV.classList.add('selected'); optExu.classList.remove('selected'); };
  }

  const btnSalvarSessao = document.getElementById('btnSalvarSessao');
  if(btnSalvarSessao) btnSalvarSessao.onclick = async ()=>{
    const data = document.getElementById('novaSessaoData').value;
    const horario = document.getElementById('novaSessaoHorario').value.trim();
    const entidade = adminView.entidadeSelecionada
      || (adminView.editSessionId ? DB.sessions.find(x=>x.id===adminView.editSessionId).entidade : 'exu');
    if(!data || !horario){ toast('Preencha a data e o horário.'); return; }
    const editando = !!adminView.editSessionId;
    try{
      if(editando){
        await apiFetch(`/sessoes/${adminView.editSessionId}`, {
          method: "PUT", headers: authHeaders(),
          body: JSON.stringify({ data, horario, entidade })
        });
        toast('Gira atualizada.');
      } else {
        await apiFetch("/sessoes/", {
          method: "POST", headers: authHeaders(),
          body: JSON.stringify({ data, horario, entidade })
        });
        toast('Gira cadastrada.');
      }
      await carregarSessoes();
      adminView = { screen:'lista', sessionId:null };
      render();
    } catch(e){ toast(e.message || 'Erro ao salvar gira.'); }
  };

  const addBtn = document.getElementById('btnAddMedium');
  if(addBtn) addBtn.onclick = async ()=>{
    const nome = document.getElementById('novoMediumNome').value.trim();
    const entidadeNome = document.getElementById('novoMediumEntidade').value.trim();
    const cap = parseInt(document.getElementById('novoMediumCap').value, 10);
    if(!nome || !cap || cap<1){ toast('Preencha nome e um número de vagas válido.'); return; }
    try{
      await apiFetch(`/sessoes/${adminView.sessionId}/mediuns`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ nome, entidade_nome: entidadeNome || null, capacidade: cap })
      });
      toast('Médium adicionado.');
      await carregarSessoes();
      render();
    } catch(e){ toast(e.message || 'Erro ao adicionar médium.'); }
  };

  document.querySelectorAll('[data-remove]').forEach(el=>{
    el.onclick = async ()=>{
      try{
        await apiFetch(`/sessoes/${adminView.sessionId}/mediuns/${el.dataset.remove}`, { method:"DELETE", headers: authHeaders() });
        await carregarSessoes();
        render();
      } catch(e){ toast(e.message || 'Erro ao remover médium.'); }
    };
  });

  const irCheckin = document.getElementById('btnIrCheckin');
  if(irCheckin) irCheckin.onclick = ()=>{ adminView.screen='checkin'; adminView.filaCarregada=false; render(); carregarFilaCheckin(); };

  document.querySelectorAll('[data-checkin]').forEach(el=>{
    el.onclick = ()=>{ atualizarStatusAgendamento(el.dataset.checkin, 'checkin'); };
  });
  document.querySelectorAll('[data-atendido]').forEach(el=>{
    el.onclick = ()=>{ atualizarStatusAgendamento(el.dataset.atendido, 'atendido'); };
  });
  document.querySelectorAll('[data-noshow]').forEach(el=>{
    el.onclick = ()=>{ atualizarStatusAgendamento(el.dataset.noshow, 'cancelado'); };
  });
}

async function atualizarStatusAgendamento(id, status){
  try{
    await apiFetch(`/agendamentos/${id}`, {
      method: "PATCH", headers: authHeaders(),
      body: JSON.stringify({ status })
    });
    if(status === 'cancelado') toast('Vaga liberada.');
    await carregarSessoes();
    await carregarFilaCheckin();
  } catch(e){ toast(e.message || 'Erro ao atualizar status.'); }
}

/* ---------------------------------------------------------
   INICIALIZAÇÃO
--------------------------------------------------------- */
if(adminToken){ adminMode = true; }
carregarSessoes();