/* Eventos Goiás: lê eventos.json (gerado pelo robô junto com a planilha) e
   mostra como planilha no computador e como lista no celular. Sem build:
   JavaScript puro. O Excel é montado no navegador pela SheetJS, carregada só
   na hora de exportar. */
(function () {
  "use strict";

  var SHEETJS = "vendor/xlsx.full.min.js"; // SheetJS 0.18.5 (Apache-2.0), servida pelo próprio site
  // Intermediário do botão Atualizar (worker/ no repositório): guarda a permissão do GitHub.
  // No endereço público é o mesmo site (/api); no PC (python servir.py) usa o endereço público.
  var ATUALIZADOR = /^(localhost|127.0.0.1)$/.test(location.hostname) ? "https://eventos-goias.pages.dev/api" : "api";
  var DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  var DIAS_LONGOS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  var PERIODOS = [
    ["todos", "Todos"], ["hoje", "Hoje"], ["amanha", "Amanhã"], ["fds", "Fim de semana"],
    ["mes", "Este mês"], ["proxmes", "Próximo mês"], ["30", "30 dias"], ["datas", "Escolher datas"]
  ];
  // Colunas da planilha. filtro: aparece no menu da coluna com a lista de valores.
  var COLS = [
    { k: "data", nome: "Data", ord: function (e) { return e.inicio; } },
    { k: "ate", nome: "Até", ord: function (e) { return e._ate; } },
    { k: "dia", nome: "Dia", filtro: true, val: function (e) { return e._dia; } },
    { k: "hora", nome: "Hora", ord: function (e) { return e._hora; } },
    { k: "nome", nome: "Evento", ord: function (e) { return e.nome.toLowerCase(); } },
    { k: "local", nome: "Local", filtro: true, val: function (e) { return e.local; } },
    { k: "bairro", nome: "Bairro", filtro: true, val: function (e) { return e.bairro; } },
    { k: "cidade", nome: "Cidade", filtro: true, val: function (e) { return e.cidade; } },
    { k: "categoria", nome: "Categoria", filtro: true, val: function (e) { return e.categoria; } },
    { k: "ticketeira", nome: "Ticketeira", filtro: true, val: function (e) { return e.ticketeira; } },
    { k: "link", nome: "Link" }
  ];
  var LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  var dados = null, todos = [], porId = {};
  var hoje = hojeEmGoias();
  var st = {
    aba: "proximos", periodo: "todos", de: "", ate: "", busca: "", soNovos: false,
    filtros: {}, ordem: { k: "data", dir: 1 }, visao: lerLocal("eg-visao") || "tabela",
    marcados: new Set(JSON.parse(lerLocal("eg-marcados") || "[]"))
  };
  var visiveis = [];
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- utilidades ---------- */
  function lerLocal(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function gravaLocal(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function hojeEmGoias() {
    // Goiás é UTC-3 o ano todo.
    return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  }
  function somaDias(iso, n) {
    var d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function diaSemana(iso) { return new Date(iso + "T12:00:00Z").getUTCDay(); }
  function br(iso) { return iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : ""; }
  // "2026-11-11T15:31" (horário de Goiás) -> "11/11/2026 às 15:31"
  function brHora(iso) { return iso ? br(iso.slice(0, 10)) + (iso.length >= 16 ? " às " + iso.slice(11, 16) : "") : ""; }
  // Horário UTC -> "AAAA-MM-DDTHH:MM" em Goiás (UTC-3 o ano todo).
  function emGoias(utc) { return utc ? new Date(Date.parse(utc) - 3 * 3600 * 1000).toISOString().slice(0, 16) : ""; }
  // Momento da coleta que gerou os dados (fim da coleta; arquivos antigos só têm o início).
  function horaColeta() { var c = (dados && dados.coleta) || {}; return c.fim || c.inicio || (dados && dados.atualizado) || ""; }
  function nomeMes(iso) { return MESES[+iso.slice(5, 7) - 1] + " de " + iso.slice(0, 4); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function semAcento(s) { return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
  function aviso(txt) {
    var a = $("aviso"); a.textContent = txt; a.hidden = false;
    clearTimeout(aviso._t); aviso._t = setTimeout(function () { a.hidden = true; }, 2600);
  }
  function ehCelular() { return window.matchMedia("(max-width: 760px)").matches; }

  /* ---------- dados ---------- */
  function prepara(e) {
    e._d = (e.inicio || "").slice(0, 10);
    e._hora = e.hora ? e.inicio.slice(11, 16) : "";
    var fimD = (e.fim || "").slice(0, 10);
    // "Até" só para evento de mais de um dia (festa que vira a madrugada não conta).
    var longo = false;
    if (e.inicio && e.fim) longo = (new Date(e.fim) - new Date(e.inicio)) > 20 * 3600 * 1000;
    e._ate = longo ? fimD : "";
    e._termina = fimD && fimD > e._d ? fimD : e._d;
    e._dia = e._d ? DIAS[diaSemana(e._d)] : "";
    e._busca = semAcento([e.nome, e.local, e.bairro, e.cidade, e.organizador, e.categoria, e.ticketeira].join(" "));
    e._novo = e.situacao === "Novo hoje";
    e._saiu = e.situacao === "Saiu do site";
    return e;
  }

  // recarga: depois de uma coleta pedida pelo botão; pula o cache do GitHub Pages.
  function carrega(recarga) {
    return fetch("eventos.json" + (recarga ? "?v=" + Date.now() : ""), { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        dados = d;
        hoje = hojeEmGoias();
        todos = d.eventos.map(prepara);
        porId = {};
        todos.forEach(function (e) { porId[e.id] = e; });
        escreveColeta();
        var nNovos = todos.filter(function (e) { return e._novo && e._termina >= hoje; }).length;
        $("n-novos").textContent = "(" + nNovos + ")";
        if (!recarga) leHash();
        desenha();
        if (!recarga) abreDoHash();
        else if (aberto && porId[aberto.id]) abreEvento(aberto.id);
      })
      .catch(function () {
        if (!recarga) $("atualizado").textContent = "Não foi possível carregar os eventos. Tente recarregar a página.";
        throw new Error("eventos");
      });
  }

  // Linha do topo (visível em todas as abas): data e hora da coleta.
  function escreveColeta() {
    if (!dados) return;
    var at = horaColeta(), sub = $("atualizado");
    var n = todos.filter(function (e) { return e._termina >= hoje; }).length;
    var quando = at.slice(0, 10) === hoje ? "hoje, " + br(at.slice(0, 10)) + ", às " + at.slice(11, 16) : "em " + brHora(at);
    var txt = ehCelular()
      ? "Coleta " + (at.slice(0, 10) === hoje ? "de hoje, " + br(at.slice(0, 10)).slice(0, 5) + "," : "de " + br(at.slice(0, 10))) + " às " + at.slice(11, 16) + " · " + n + " eventos"
      : "Dados coletados " + quando + " · " + n + " eventos · " + Object.keys(dados.fontes || {}).length + " ticketeiras";
    sub.classList.remove("alerta");
    // Mais de 36 h sem atualizar: a rodada diária falhou.
    if (Date.now() - new Date(at.slice(0, 16) + ":00-03:00").getTime() > 36 * 3600 * 1000) {
      txt += " · atualização atrasada";
      sub.classList.add("alerta");
    }
    if (coleta.rodando) txt += " · " + textoRodando();
    sub.textContent = txt;
  }

  /* ---------- filtro ---------- */
  function intervalo() {
    var p = st.periodo, a = hoje, b;
    if (p === "todos") return null;
    if (p === "hoje") b = hoje;
    else if (p === "amanha") { a = somaDias(hoje, 1); b = a; }
    else if (p === "fds") {
      var w = diaSemana(hoje); // sexta a domingo
      if (w === 0) { a = hoje; b = hoje; }
      else if (w >= 5) { a = hoje; b = somaDias(hoje, 7 - w); }
      else { a = somaDias(hoje, 5 - w); b = somaDias(a, 2); }
    } else if (p === "mes") { b = hoje.slice(0, 8) + "31"; }
    else if (p === "proxmes") {
      var y = +hoje.slice(0, 4), m = +hoje.slice(5, 7) + 1;
      if (m > 12) { m = 1; y++; }
      a = y + "-" + (m < 10 ? "0" : "") + m + "-01"; b = a.slice(0, 8) + "31";
    } else if (p === "30") { b = somaDias(hoje, 30); }
    else if (p === "datas") { a = st.de || "0000-00-00"; b = st.ate || "9999-99-99"; }
    return [a, b];
  }

  function baseDaAba(aba) {
    if (aba === "historico") return todos.slice();
    var fut = todos.filter(function (e) { return e._termina >= hoje; });
    if (aba === "novos") return fut.filter(function (e) { return e._novo; });
    return fut;
  }

  // ignora: nome de um filtro de coluna a não aplicar (para contar os valores do menu dessa coluna)
  function filtra(lista, opc) {
    opc = opc || {};
    var iv = opc.semPeriodo ? null : intervalo();
    var q = semAcento(st.busca).trim();
    var termos = q ? q.split(/\s+/) : [];
    return lista.filter(function (e) {
      if (iv && (e._termina < iv[0] || e._d > iv[1])) return false;
      if (st.soNovos && !e._novo) return false;
      for (var i = 0; i < termos.length; i++) if (e._busca.indexOf(termos[i]) < 0) return false;
      for (var k in st.filtros) {
        if (k === opc.ignora) continue;
        var set = st.filtros[k];
        if (set && set.size && !set.has(valorCol(k, e))) return false;
      }
      return true;
    });
  }

  function valorCol(k, e) {
    for (var i = 0; i < COLS.length; i++) if (COLS[i].k === k) return COLS[i].val(e) || "(vazio)";
    return "";
  }

  // Evento que começou antes de hoje e segue em cartaz vai para o grupo "Em andamento", no fim.
  function emAndamento(e) { return st.aba !== "historico" && e._d < hoje; }
  function grupo(e) { return emAndamento(e) ? "andamento" : e._d.slice(0, 7); }
  function rotuloGrupo(e) {
    return emAndamento(e) ? "Em andamento · começaram antes de hoje e seguem em cartaz" : cap(nomeMes(e._d || "0000-01"));
  }

  function ordena(lista) {
    var o = st.ordem, col = COLS.filter(function (c) { return c.k === o.k; })[0];
    var f = col.ord || col.val || function (e) { return e.inicio; };
    if (o.k === "data") f = function (e) { return (emAndamento(e) ? "~" : "") + e.inicio; };
    return lista.sort(function (a, b) {
      var x = f(a) || "\uffff", y = f(b) || "\uffff";
      if (x < y) return -o.dir;
      if (x > y) return o.dir;
      return a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0;
    });
  }

  function nFiltros() {
    var n = 0;
    for (var k in st.filtros) if (st.filtros[k] && st.filtros[k].size) n++;
    if (st.periodo !== "todos") n++;
    if (st.soNovos) n++;
    return n;
  }

  /* ---------- desenho ---------- */
  function desenha() {
    document.querySelectorAll(".abas button").forEach(function (b) {
      if (b.dataset.aba === st.aba) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    document.body.classList.toggle("visao-lista", st.visao === "lista");
    $("bt-visao").textContent = st.visao === "lista" ? "Visão de planilha" : "Visão de lista";
    desenhaPeriodos();
    desenhaChips();
    desenhaFontes();
    var n = nFiltros();
    $("n-filtros").hidden = !n; $("n-filtros").textContent = n;
    $("so-novos").checked = st.soNovos;

    var resumo = st.aba === "resumo";
    $("resumo").hidden = !resumo;
    $("tabela-caixa").hidden = resumo;
    $("lista").hidden = resumo;
    if (resumo) { desenhaResumo(); $("vazio").hidden = true; $("resumo-filtro").textContent = "Resumo da última rodada"; escreveHash(); return; }

    if (st.aba === "historico" && st.ordem.k === "data" && !desenha._ordemManual) st.ordem.dir = -1;
    if (st.aba !== "historico" && st.ordem.k === "data" && !desenha._ordemManual) st.ordem.dir = 1;
    var base = baseDaAba(st.aba);
    visiveis = ordena(filtra(base));
    $("vazio").hidden = visiveis.length > 0;
    var partes = [];
    if (st.periodo !== "todos") partes.push(PERIODOS.filter(function (p) { return p[0] === st.periodo; })[0][1]);
    for (var k in st.filtros) {
      var s = st.filtros[k];
      if (s && s.size) partes.push(nomeCol(k) + " = " + Array.from(s).join(", "));
    }
    if (st.busca) partes.push("busca: " + st.busca);
    if (st.soNovos) partes.push("só novos");
    $("resumo-filtro").innerHTML = "Mostrando <strong>" + visiveis.length + "</strong> de " + base.length + " eventos" +
      (partes.length ? " · filtro: " + esc(partes.join(" · ")) : "") + " · ordem: " + esc(nomeCol(st.ordem.k).toLowerCase()) +
      (st.ordem.dir < 0 ? " (decrescente)" : "");
    $("bt-ver").textContent = "Ver " + visiveis.length + " evento" + (visiveis.length === 1 ? "" : "s");
    desenhaTabela();
    desenhaLista();
    escreveHash();
  }

  function nomeCol(k) { var c = COLS.filter(function (c) { return c.k === k; })[0]; return c ? c.nome : k; }

  function desenhaPeriodos() {
    var h = PERIODOS.map(function (p) {
      var cls = p[0] === "datas" || p[0] === "proxmes" || p[0] === "amanha" ? ' class="p-largo"' : "";
      return '<button type="button"' + cls + ' data-periodo="' + p[0] + '" aria-pressed="' + (st.periodo === p[0]) + '">' + p[1] + "</button>";
    }).join("");
    if (st.periodo === "datas") {
      h += '<span class="datas"><label><span class="sr">De</span><input type="date" id="de" value="' + esc(st.de) + '"></label>' +
        '<span>a</span><label><span class="sr">Até</span><input type="date" id="ate" value="' + esc(st.ate) + '"></label></span>';
    }
    $("periodos").innerHTML = h;
  }

  function desenhaChips() {
    var h = "";
    for (var k in st.filtros) {
      var s = st.filtros[k];
      if (!s || !s.size) continue;
      var vals = Array.from(s);
      var txt = nomeCol(k) + ": " + (vals.length > 2 ? vals.slice(0, 2).join(", ") + " +" + (vals.length - 2) : vals.join(", "));
      h += '<span class="chip">' + esc(txt) + '<button type="button" data-tira="' + k + '" aria-label="Tirar filtro ' + esc(nomeCol(k)) + '">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span>';
    }
    if (st.soNovos) h += '<span class="chip so-estreito">Só novos<button type="button" data-tira="_novos" aria-label="Tirar filtro só novos"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span>';
    if (nFiltros() || st.busca) h += '<button type="button" class="link" data-acao="limpar">Limpar filtros</button>';
    $("chips").innerHTML = h;
  }

  // Linha das ticketeiras, sempre à vista: clique escolhe uma ou mais; "Todas" limpa.
  function desenhaFontes() {
    var caixa = $("fontes");
    caixa.hidden = st.aba === "resumo";
    if (caixa.hidden || !dados) return;
    var cont = {};
    filtra(baseDaAba(st.aba), { ignora: "ticketeira" }).forEach(function (e) { cont[e.ticketeira] = (cont[e.ticketeira] || 0) + 1; });
    var nomes = Object.keys(dados.fontes || {});
    Object.keys(cont).forEach(function (n) { if (nomes.indexOf(n) < 0) nomes.push(n); });
    var sel = st.filtros.ticketeira || new Set();
    nomes.sort(function (a, b) { return (cont[b] || 0) - (cont[a] || 0) || a.localeCompare(b, "pt-BR"); });
    var h = '<span class="rot">Ticketeiras</span><button type="button" data-fonte="" aria-pressed="' + !sel.size + '">Todas</button>';
    nomes.forEach(function (n) {
      var c = cont[n] || 0, ligado = sel.has(n);
      h += '<button type="button" data-fonte="' + esc(n) + '" aria-pressed="' + ligado + '"' + (!c && !ligado ? " disabled" : "") + ">" +
        esc(n) + " <small>" + c + "</small></button>";
    });
    caixa.innerHTML = h;
  }
  $("fontes").addEventListener("click", function (ev) {
    var t = ev.target.closest("button[data-fonte]");
    if (!t) return;
    var n = t.dataset.fonte, s = st.filtros.ticketeira || new Set();
    if (!n) s = new Set();
    else if (s.has(n)) s.delete(n); else s.add(n);
    if (s.size) st.filtros.ticketeira = s; else delete st.filtros.ticketeira;
    desenha();
  });

  var ICONE_FUNIL = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4 2v-8z"/></svg>';
  var ICONE_SETA = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  var ICONE_ORDEM = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 4v16M4 16l4 4 4-4M16 20V4M12 8l4-4 4 4"/></svg>';

  function desenhaTabela() {
    if (st.visao === "lista" || ehCelular()) { $("tabela-caixa").innerHTML = ""; return; }
    var h = ['<table class="grade"><thead><tr class="letras"><th class="num"></th>'];
    COLS.forEach(function (c, i) { h.push("<th>" + LETRAS[i] + "</th>"); });
    h.push('</tr><tr class="nomes"><th class="num">1</th>');
    COLS.forEach(function (c) {
      var ativo = (st.filtros[c.k] && st.filtros[c.k].size) || st.ordem.k === c.k && c.k !== "data";
      var ic = st.filtros[c.k] && st.filtros[c.k].size ? ICONE_FUNIL : st.ordem.k === c.k && c.k !== "data" ? ICONE_ORDEM : ICONE_SETA;
      h.push('<th scope="col"' + (ativo ? ' class="ativo"' : "") + '><span class="cab">' + c.nome +
        (c.k === "link" ? "" : '<button type="button" data-menu="' + c.k + '" aria-label="Filtrar e ordenar ' + c.nome + '">' + ic + "</button>") +
        "</span></th>");
    });
    h.push("</tr></thead><tbody>");
    var porData = st.ordem.k === "data", mesAnt = "", n = 2;
    visiveis.forEach(function (e) {
      var mes = grupo(e);
      if (porData && mes !== mesAnt) {
        var nMes = 0;
        visiveis.forEach(function (x) { if (grupo(x) === mes) nMes++; });
        h.push('<tr class="mes"><th class="num">' + (n++) + '</th><td colspan="' + COLS.length + '">' + rotuloGrupo(e) +
          " · " + nMes + " evento" + (nMes === 1 ? "" : "s") + "</td></tr>");
        mesAnt = mes;
      }
      var marc = st.marcados.has(e.id);
      var cls = marc ? "marcado" : e._novo ? "novo" : e._saiu ? "saiu" : "";
      h.push('<tr class="' + cls + '"><th class="num"><button type="button" data-marca="' + esc(e.id) + '" aria-pressed="' + marc +
        '" title="Marcar para exportar">' + (n++) + "</button></th>" +
        '<td class="nw">' + br(e._d) + '</td><td class="nw">' + br(e._ate) + "</td><td>" + e._dia + "</td><td>" + e._hora + "</td>" +
        '<td class="evento"><button type="button" data-abre="' + esc(e.id) + '">' + esc(e.nome) + "</button>" +
        (e._novo ? '<span class="tag novo">novo</span>' : "") + (e._saiu ? '<span class="tag saiu">saiu do site</span>' : "") + "</td>" +
        "<td>" + esc(e.local) + "</td><td>" + esc(e.bairro) + "</td><td>" + esc(e.cidade) + "</td><td>" + esc(e.categoria) + "</td>" +
        '<td class="nw">' + esc(e.ticketeira) + '</td><td><a href="' + esc(e.link) + '" target="_blank" rel="noopener">abrir</a></td></tr>');
    });
    h.push("</tbody></table>");
    $("tabela-caixa").innerHTML = h.join("");
  }

  function desenhaLista() {
    if (st.visao !== "lista" && !ehCelular()) { $("lista").innerHTML = ""; return; }
    var h = [], mesAnt = "", porData = st.ordem.k === "data";
    visiveis.forEach(function (e) {
      var mes = grupo(e);
      if (porData && mes !== mesAnt) { h.push('<div class="mes">' + rotuloGrupo(e) + "</div>"); mesAnt = mes; }
      var marc = st.marcados.has(e.id);
      var cls = marc ? "marcado" : e._novo ? "novo" : e._saiu ? "saiu" : "";
      var onde = [e.local, e.bairro, e.cidade].filter(Boolean).join(" · ") || e.cidade;
      var andamento = e._d < hoje ? "desde" : "";
      h.push('<button type="button" class="item ' + cls + '" data-abre="' + esc(e.id) + '">' +
        '<span class="data"><span class="dia">' + (andamento || e._dia) + '</span><span class="n">' + e._d.slice(8, 10) + "/" + e._d.slice(5, 7) +
        '</span><span class="h">' + (e._hora || "&nbsp;") + "</span></span>" +
        '<span class="info"><span class="nome">' + esc(e.nome) + '</span><span class="onde">' + esc(onde) + "</span>" +
        '<span class="tags"><span>' + esc(e.ticketeira) + "</span>" + (e.categoria ? "<span>" + esc(e.categoria) + "</span>" : "") +
        (e._novo ? '<span class="t-novo">novo</span>' : "") + (e._saiu ? "<span>saiu do site</span>" : "") +
        (marc ? '<span class="t-marc">marcado</span>' : "") + "</span></span></button>");
    });
    $("lista").innerHTML = h.join("");
  }

  function desenhaResumo() {
    var fut = todos.filter(function (e) { return e._termina >= hoje; });
    var c = dados.coleta || {};
    var h = '<section><h2>Coleta</h2><table><tbody>' +
      (c.inicio ? "<tr><td>Começou</td><td>" + esc(brHora(c.inicio)) + "</td></tr>" : "") +
      "<tr><td>Terminou</td><td>" + esc(brHora(horaColeta())) + "</td></tr>" +
      (c.paginas ? '<tr><td>Páginas lidas</td><td class="n">' + c.paginas + "</td></tr>" : "") +
      '</tbody></table><p class="nota">A coleta roda sozinha 3 vezes por dia, por volta de 07:40, 13:40 e 19:40. O botão Atualizar agora, no topo, pede uma coleta na hora (uma a cada 30 minutos, para todos que usam o site).</p></section>';
    h += '<section><h2>Ticketeiras na última rodada</h2><table><thead><tr><th>Ticketeira</th><th class="n">Eventos</th><th>Coleta</th></tr></thead><tbody>';
    var fs = dados.fontes || {};
    Object.keys(fs).forEach(function (nome) {
      var f = fs[nome];
      h += "<tr><td>" + esc(nome) + '</td><td class="n">' + f.eventos + "</td><td" + (f.problema ? ' class="problema"' : "") + ">" + esc(f.problema || "ok") + "</td></tr>";
    });
    h += '</tbody></table><p class="nota">Ficam de fora os sites que bloqueiam acesso automático: Shotgun, Ingresse, BaladApp, Q2 Ingressos, Meu Bilhete e Ticketou.</p></section>';
    var cont = {};
    fut.forEach(function (e) { var c = e.cidade || "(sem cidade)"; cont[c] = (cont[c] || 0) + 1; });
    h += '<section><h2>Eventos por cidade</h2><table><thead><tr><th>Cidade</th><th class="n">Próximos</th></tr></thead><tbody>';
    Object.keys(cont).sort(function (a, b) { return cont[b] - cont[a]; }).forEach(function (c) {
      h += '<tr><td><button type="button" class="link" data-cidade="' + esc(c) + '">' + esc(c) + '</button></td><td class="n">' + cont[c] + "</td></tr>";
    });
    h += "</tbody></table></section>";
    var cat = {};
    fut.forEach(function (e) { var c = e.categoria || "(sem categoria)"; cat[c] = (cat[c] || 0) + 1; });
    h += '<section><h2>Eventos por categoria</h2><table><thead><tr><th>Categoria</th><th class="n">Próximos</th></tr></thead><tbody>';
    Object.keys(cat).sort(function (a, b) { return cat[b] - cat[a]; }).forEach(function (c) {
      h += "<tr><td>" + esc(c) + '</td><td class="n">' + cat[c] + "</td></tr>";
    });
    h += '</tbody></table><p class="nota">Quando a ticketeira não informa a categoria, ela é deduzida pelo nome do evento.</p></section>';
    $("resumo").innerHTML = h;
  }

  /* ---------- menu da coluna (autofiltro) ---------- */
  function abreMenu(k, botao) {
    var menu = $("menu-col"), col = COLS.filter(function (c) { return c.k === k; })[0];
    var h = '<div class="ordem"><button type="button" data-ordena="1">Ordenar de A a Z</button><button type="button" data-ordena="-1">Ordenar de Z a A</button>' +
      (st.ordem.k !== "data" ? '<button type="button" data-ordena="0">Voltar à ordem por data</button>' : "") + "</div>";
    if (col.filtro) {
      var cont = {};
      filtra(baseDaAba(st.aba), { ignora: k }).forEach(function (e) { var v = col.val(e) || "(vazio)"; cont[v] = (cont[v] || 0) + 1; });
      var vals = Object.keys(cont).sort(function (a, b) { return a.localeCompare(b, "pt-BR"); });
      var sel = st.filtros[k];
      h += '<input type="search" class="procura" placeholder="Procurar" aria-label="Procurar valor">';
      h += '<div class="valores"><label><input type="checkbox" data-todos ' + (!sel || !sel.size ? "checked" : "") + "><span>(Selecionar tudo)</span></label>";
      vals.forEach(function (v) {
        h += '<label data-v="' + esc(semAcento(v)) + '"><input type="checkbox" value="' + esc(v) + '" ' + (sel && sel.has(v) ? "checked" : "") +
          "><span>" + esc(v) + "</span><small>" + cont[v] + "</small></label>";
      });
      h += '</div><div class="rodape"><button type="button" class="bt-contorno-escuro" data-limpa-col>Limpar</button><button type="button" class="bt-primario" data-aplica>OK</button></div>';
    }
    menu.innerHTML = h;
    menu.dataset.col = k;
    menu.hidden = false;
    var r = botao.getBoundingClientRect();
    var x = Math.min(r.left, window.innerWidth - 290);
    menu.style.left = Math.max(8, x) + "px";
    menu.style.top = (r.bottom + 4) + "px";
    var pr = menu.querySelector(".procura");
    if (pr) {
      pr.focus();
      pr.addEventListener("input", function () {
        var q = semAcento(pr.value);
        menu.querySelectorAll(".valores label[data-v]").forEach(function (l) { l.hidden = l.dataset.v.indexOf(q) < 0; });
      });
    }
  }
  function fechaMenu() { $("menu-col").hidden = true; }

  $("menu-col").addEventListener("click", function (ev) {
    var menu = $("menu-col"), k = menu.dataset.col, t = ev.target.closest("button, input");
    if (!t) return;
    if (t.dataset.ordena !== undefined) {
      var d = +t.dataset.ordena;
      desenha._ordemManual = d !== 0;
      st.ordem = d === 0 ? { k: "data", dir: st.aba === "historico" ? -1 : 1 } : { k: k, dir: d };
      fechaMenu(); desenha(); return;
    }
    if (t.hasAttribute("data-todos")) {
      menu.querySelectorAll(".valores input[value]").forEach(function (c) { c.checked = false; });
      return;
    }
    if (t.matches(".valores input[value]")) { menu.querySelector("[data-todos]").checked = !menu.querySelector(".valores input[value]:checked"); return; }
    if (t.hasAttribute("data-limpa-col")) { delete st.filtros[k]; fechaMenu(); desenha(); return; }
    if (t.hasAttribute("data-aplica")) {
      var s = new Set();
      menu.querySelectorAll(".valores input[value]:checked").forEach(function (c) { s.add(c.value); });
      if (s.size) st.filtros[k] = s; else delete st.filtros[k];
      fechaMenu(); desenha();
    }
  });
  document.addEventListener("mousedown", function (ev) {
    if (!$("menu-col").hidden && !ev.target.closest("#menu-col, [data-menu]")) fechaMenu();
  });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") fechaMenu(); });
  window.addEventListener("resize", function () { fechaMenu(); ajustaBarra(); desenha(); });

  /* ---------- filtros no celular ---------- */
  function desenhaFiltrosCel() {
    var h = '<div class="rotulo">Quando</div><div class="pilulas">';
    PERIODOS.forEach(function (p) {
      h += '<button type="button" data-periodo="' + p[0] + '" aria-pressed="' + (st.periodo === p[0]) + '">' + p[1] + "</button>";
    });
    h += "</div>";
    if (st.periodo === "datas") {
      h += '<div class="datas-cel"><label>De<input type="date" data-data="de" value="' + esc(st.de) + '"></label><label>Até<input type="date" data-data="ate" value="' + esc(st.ate) + '"></label></div>';
    }
    [["cidade", "Cidade", 6], ["categoria", "Categoria", 99], ["ticketeira", "Ticketeira", 99], ["dia", "Dia da semana", 99]].forEach(function (f) {
      var k = f[0], col = COLS.filter(function (c) { return c.k === k; })[0], cont = {};
      filtra(baseDaAba(st.aba), { ignora: k }).forEach(function (e) { var v = col.val(e) || "(vazio)"; cont[v] = (cont[v] || 0) + 1; });
      var sel = st.filtros[k] || new Set();
      var vals = Object.keys(cont).sort(function (a, b) { return k === "cidade" ? cont[b] - cont[a] : a.localeCompare(b, "pt-BR"); });
      sel.forEach(function (v) { if (!(v in cont)) { vals.unshift(v); cont[v] = 0; } });
      var aberto = desenhaFiltrosCel._todas === k;
      var mostra = aberto ? vals : vals.slice(0, f[2]);
      h += '<div class="rotulo">' + f[1] + '</div><div class="marcas">';
      mostra.forEach(function (v) {
        h += '<label><input type="checkbox" data-filtro="' + k + '" value="' + esc(v) + '" ' + (sel.has(v) ? "checked" : "") + "><span>" + esc(v) + "</span><small>" + cont[v] + "</small></label>";
      });
      h += "</div>";
      if (vals.length > mostra.length) h += '<button type="button" class="link" data-todas="' + k + '">Ver todas (' + vals.length + ")</button>";
    });
    h += '<label class="alterna"><span>Só os novos de hoje</span><input type="checkbox" data-sonovos ' + (st.soNovos ? "checked" : "") + "></label>";
    $("filtros-corpo").innerHTML = h;
  }
  $("filtros-corpo").addEventListener("click", function (ev) {
    var t = ev.target.closest("button, input");
    if (!t) return;
    if (t.dataset.periodo) { st.periodo = st.periodo === t.dataset.periodo ? "todos" : t.dataset.periodo; desenha(); desenhaFiltrosCel(); }
    else if (t.dataset.todas) { desenhaFiltrosCel._todas = t.dataset.todas; desenhaFiltrosCel(); }
    else if (t.dataset.filtro) {
      var k = t.dataset.filtro, s = st.filtros[k] || new Set();
      if (t.checked) s.add(t.value); else s.delete(t.value);
      if (s.size) st.filtros[k] = s; else delete st.filtros[k];
      desenha();
    } else if (t.hasAttribute("data-sonovos")) { st.soNovos = t.checked; desenha(); }
  });
  $("filtros-corpo").addEventListener("change", function (ev) {
    var t = ev.target;
    if (t.dataset.data) { st[t.dataset.data] = t.value; desenha(); }
  });

  /* ---------- detalhe do evento ---------- */
  var aberto = null;
  function abreEvento(id) {
    var e = porId[id];
    if (!e) return;
    aberto = e;
    var pos = visiveis.indexOf(e);
    $("ev-linha").textContent = pos >= 0 ? "Evento " + (pos + 1) + " de " + visiveis.length : e.ticketeira;
    var quando = cap(DIAS_LONGOS[diaSemana(e._d)]) + ", " + (+e._d.slice(8, 10)) + " de " + nomeMes(e._d);
    if (e._hora) quando += " · " + e._hora;
    if (e.fim && e.hora) quando += (e._ate ? " até " + br(e._ate) + " " : " até ") + e.fim.slice(11, 16);
    else if (e._ate) quando += " até " + br(e._ate);
    var cab = $("ev-cabeca");
    cab.className = "ev-cabeca" + (e._novo ? " novo" : "");
    cab.innerHTML = (e._novo ? '<span class="tag novo" style="margin:0;align-self:flex-start">novo hoje</span>' : "") +
      (e._saiu ? '<span class="tag saiu" style="margin:0;align-self:flex-start">saiu do site</span>' : "") +
      "<h2 id=\"ev-nome\">" + esc(e.nome) + "</h2><p>" + esc(quando) + "</p>";
    var campos = [["Local", e.local], ["Endereço", e.endereco], ["Bairro", e.bairro], ["Cidade", e.cidade ? e.cidade + " - GO" : ""],
      ["Categoria", e.categoria], ["Organizador", e.organizador], ["Ticketeira", e.ticketeira], ["Situação", e.situacao],
      ["Visto pela 1ª vez", br(e.visto)],
      [e._saiu ? "Visto pela última vez" : "Conferido na ticketeira", brHora(e.conferido)]];
    $("ev-campos").innerHTML = campos.filter(function (c) { return c[1]; }).map(function (c) {
      return "<dt>" + c[0] + "</dt><dd>" + esc(c[1]) + "</dd>";
    }).join("");
    var l = $("ev-link"); l.href = e.link; l.textContent = "Ver ingressos no " + e.ticketeira;
    atualizaMarcar();
    var d = $("dlg-evento");
    if (!d.open) d.showModal();
    history.replaceState(null, "", "#e=" + encodeURIComponent(e.id));
  }
  function atualizaMarcar() {
    var b = $("ev-marcar"), m = aberto && st.marcados.has(aberto.id);
    b.setAttribute("aria-pressed", !!m);
    b.querySelector("span").textContent = m ? "Marcado" : "Marcar";
  }
  $("dlg-evento").addEventListener("close", function () { aberto = null; escreveHash(); });
  $("dlg-evento").addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-ev]");
    if (!t || !aberto) return;
    var acao = t.dataset.ev;
    if (acao === "agenda") baixa(ics([aberto]), nomeArquivo(aberto.nome, "ics"), "text/calendar");
    else if (acao === "xlsx") excel([aberto], nomeArquivo(aberto.nome, "xlsx"));
    else if (acao === "compartilhar") compartilha(aberto);
    else if (acao === "marcar") { alternaMarca(aberto.id); atualizaMarcar(); }
  });

  function compartilha(e) {
    var url = location.href.split("#")[0] + "#e=" + encodeURIComponent(e.id);
    var txt = e.nome + " · " + br(e._d) + (e._hora ? " " + e._hora : "") + " · " + [e.local, e.cidade].filter(Boolean).join(", ");
    if (navigator.share) { navigator.share({ title: e.nome, text: txt, url: url }).catch(function () {}); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(txt + "\n" + url).then(function () { aviso("Link copiado"); });
  }

  function alternaMarca(id) {
    if (st.marcados.has(id)) st.marcados.delete(id); else st.marcados.add(id);
    gravaLocal("eg-marcados", JSON.stringify(Array.from(st.marcados)));
    desenhaTabela(); desenhaLista();
  }

  /* ---------- exportar ---------- */
  function abreExportar() {
    var base = st.aba === "resumo" ? baseDaAba("proximos") : baseDaAba(st.aba);
    var tela = st.aba === "resumo" ? ordena(filtra(base)) : visiveis;
    $("ex-tela").textContent = tela.length + " evento" + (tela.length === 1 ? "" : "s") + " · aba " + nomeAba() +
      (nFiltros() || st.busca ? " · com os filtros aplicados" : " · sem filtro");
    var meses = {};
    filtra(todos, { semPeriodo: true }).forEach(function (e) { if (e._d) meses[e._d.slice(0, 7)] = (meses[e._d.slice(0, 7)] || 0) + 1; });
    var sel = $("ex-mes"), atual = hoje.slice(0, 7);
    sel.innerHTML = Object.keys(meses).sort().filter(function (m) { return m >= atual; }).map(function (m) {
      return '<option value="' + m + '">' + cap(nomeMes(m + "-01")) + " (" + meses[m] + ")</option>";
    }).join("") || '<option value="">Nenhum mês com eventos</option>';
    $("ex-n-marcados").textContent = st.marcados.size;
    $("dlg-exportar").showModal();
  }
  function nomeAba() { return { proximos: "Próximos", novos: "Novos hoje", historico: "Histórico", resumo: "Próximos" }[st.aba]; }

  $("ex-mes").addEventListener("focus", function () { document.querySelector('input[name=oque][value=mes]').checked = true; });
  $("bt-baixar").addEventListener("click", function () {
    var oque = document.querySelector("input[name=oque]:checked").value;
    var fmt = document.querySelector("input[name=fmt]:checked").value;
    var lista, rotulo;
    if (oque === "tela") {
      lista = st.aba === "resumo" ? ordena(filtra(baseDaAba("proximos"))) : visiveis.slice();
      rotulo = st.aba === "historico" ? "historico" : st.aba === "novos" ? "novos" : "proximos";
    } else if (oque === "mes") {
      var m = $("ex-mes").value;
      lista = filtra(todos, { semPeriodo: true }).filter(function (e) { return e._d.slice(0, 7) === m; })
        .sort(function (a, b) { return a.inicio < b.inicio ? -1 : 1; });
      rotulo = m ? MESES[+m.slice(5, 7) - 1] + "-" + m.slice(0, 4) : "mes";
    } else {
      lista = todos.filter(function (e) { return st.marcados.has(e.id); });
      rotulo = "marcados";
    }
    if (!lista.length) { aviso("Nada para exportar com essa escolha"); return; }
    var nome = "eventos-goias_" + rotulo + "_" + hoje;
    if (fmt === "xlsx") excel(lista, nome + ".xlsx");
    else if (fmt === "csv") baixa("\ufeff" + csv(lista), nome + ".csv", "text/csv;charset=utf-8");
    else baixa(ics(lista), nome + ".ics", "text/calendar;charset=utf-8");
    $("dlg-exportar").close();
  });

  function nomeArquivo(nome, ext) {
    return "evento_" + semAcento(nome).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) + "." + ext;
  }

  var CAB = ["Data", "Até", "Dia", "Hora", "Evento", "Local", "Endereço", "Bairro", "Cidade", "Categoria", "Organizador", "Ticketeira", "Link", "Situação", "Visto pela 1ª vez", "Conferido em"];
  function linha(e) {
    return [br(e._d), br(e._ate), e._dia, e._hora, e.nome, e.local, e.endereco, e.bairro, e.cidade, e.categoria, e.organizador, e.ticketeira, e.link, e.situacao, br(e.visto),
      brHora(e.conferido || horaColeta()).replace(" às ", " ")];
  }
  function csv(lista) {
    var q = function (v) { v = String(v == null ? "" : v); return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return [CAB].concat(lista.map(linha)).map(function (r) { return r.map(q).join(";"); }).join("\r\n");
  }

  function carregaSheetJS() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (carregaSheetJS._p) return carregaSheetJS._p;
    carregaSheetJS._p = new Promise(function (ok, erro) {
      var s = document.createElement("script");
      s.src = SHEETJS; s.async = true;
      s.onload = function () { ok(window.XLSX); };
      s.onerror = function () { carregaSheetJS._p = null; erro(new Error("sheetjs")); };
      document.head.appendChild(s);
    });
    return carregaSheetJS._p;
  }
  function paraData(iso) { return iso ? new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) : null; }
  function excel(lista, nome) {
    aviso("Preparando o Excel…");
    carregaSheetJS().then(function (X) {
      var linhas = lista.map(function (e) {
        var r = linha(e);
        r[0] = paraData(e._d); r[1] = paraData(e._ate); r[14] = paraData(e.visto);
        r[12] = "abrir";
        return r;
      });
      var ws = X.utils.aoa_to_sheet([CAB].concat(linhas), { cellDates: true, dateNF: "dd/mm/yyyy" });
      lista.forEach(function (e, i) {
        var ref = X.utils.encode_cell({ r: i + 1, c: 12 });
        if (ws[ref]) ws[ref].l = { Target: e.link };
        [0, 1, 14].forEach(function (c) { var rc = X.utils.encode_cell({ r: i + 1, c: c }); if (ws[rc]) ws[rc].z = "dd/mm/yyyy"; });
      });
      ws["!cols"] = [11, 11, 6, 7, 48, 30, 30, 20, 20, 22, 26, 18, 10, 14, 14, 17].map(function (w) { return { wch: w }; });
      ws["!autofilter"] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lista.length, c: CAB.length - 1 } }) };
      ws["!freeze"] = { xSplit: 0, ySplit: 1 };
      var wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, ws, "Eventos");
      var sobre = X.utils.aoa_to_sheet([
        ["Eventos Goiás", location.href.split("#")[0]],
        ["Dados coletados em", brHora(horaColeta())],
        ["Exportado em", brHora(emGoias(new Date().toISOString()))],
        ["Eventos no arquivo", lista.length]
      ]);
      sobre["!cols"] = [{ wch: 22 }, { wch: 50 }];
      X.utils.book_append_sheet(wb, sobre, "Sobre");
      X.writeFile(wb, nome, { compression: true });
      aviso("Baixado: " + lista.length + " evento" + (lista.length === 1 ? "" : "s"));
    }).catch(function () {
      aviso("Não deu para montar o Excel agora. Baixando em CSV.");
      baixa("\ufeff" + csv(lista), nome.replace(/\.xlsx$/, ".csv"), "text/csv;charset=utf-8");
    });
  }

  function ics(lista) {
    var agora = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
    var e2 = function (s) { return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); };
    var utc = function (iso) { return new Date(iso).toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z"; };
    var dobra = function (l) {
      var out = [];
      while (l.length > 73) { out.push(l.slice(0, 73)); l = " " + l.slice(73); }
      out.push(l); return out.join("\r\n");
    };
    var L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Eventos Goias//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
    lista.forEach(function (e) {
      L.push("BEGIN:VEVENT", "UID:" + e.id.replace(/[^A-Za-z0-9._-]/g, "-") + "@eventos-goias", "DTSTAMP:" + agora);
      if (e.hora) {
        L.push("DTSTART:" + utc(e.inicio));
        var fim = e.fim && e.fim > e.inicio ? e.fim : new Date(new Date(e.inicio).getTime() + 3 * 3600 * 1000).toISOString();
        L.push("DTEND:" + utc(fim));
      } else {
        L.push("DTSTART;VALUE=DATE:" + e._d.replace(/-/g, ""));
        L.push("DTEND;VALUE=DATE:" + somaDias(e._ate || e._d, 1).replace(/-/g, ""));
      }
      L.push("SUMMARY:" + e2(e.nome));
      var loc = [e.local, e.endereco, e.cidade ? e.cidade + " - GO" : ""].filter(Boolean).join(", ");
      if (loc) L.push("LOCATION:" + e2(loc));
      L.push("DESCRIPTION:" + e2("Ingressos: " + e.link + (e.organizador ? "\nOrganizador: " + e.organizador : "") +
        "\nDados coletados em " + brHora(e.conferido || horaColeta()) + " (Eventos Goiás)"));
      L.push("URL:" + e.link, "END:VEVENT");
    });
    L.push("END:VCALENDAR");
    return L.map(dobra).join("\r\n") + "\r\n";
  }

  function baixa(conteudo, nome, tipo) {
    var blob = new Blob([conteudo], { type: tipo });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------- botão Atualizar (coleta na hora) ---------- */
  // O Worker diz se há coleta rodando; enquanto roda, o site consulta a cada 15 s e,
  // quando termina, recarrega os eventos sozinho.
  var coleta = { rodando: false, pode: false, libera: "", iniciada: "", pedi: false, timer: 0, ligado: null };
  // Mesmos horários do cron em .github/workflows/atualiza.yml (horário de Goiás).
  var AUTOMATICAS = ["07:40", "13:40", "19:40"];

  function proximaAutomatica() {
    var agora = emGoias(new Date().toISOString()).slice(11, 16);
    for (var i = 0; i < AUTOMATICAS.length; i++) if (AUTOMATICAS[i] > agora) return AUTOMATICAS[i];
    return AUTOMATICAS[0] + " de amanhã";
  }
  function liberaHora() { return coleta.libera ? emGoias(coleta.libera).slice(11, 16) : ""; }

  function textoRodando() {
    if (!coleta.iniciada) return "coleta nova pedida";
    var min = Math.max(0, Math.round((Date.now() - Date.parse(coleta.iniciada)) / 60000));
    return "coleta nova em andamento há " + min + " min (leva uns 8)";
  }

  function desenhaBotao() {
    var b = $("bt-atualizar"), t = b.querySelector("span");
    var travado = coleta.ligado && !coleta.rodando && !coleta.pode;
    b.classList.toggle("girando", coleta.rodando);
    b.classList.toggle("travado", !!travado);
    b.classList.toggle("desligado", coleta.ligado === false);
    b.setAttribute("aria-busy", coleta.rodando);
    // " agora" some no celular (CSS) para caber no topo.
    t.innerHTML = coleta.rodando ? "Coletando…" : travado && liberaHora() ? "Liberado às " + liberaHora() : 'Atualizar<span class="agora"> agora</span>';
    b.setAttribute("aria-label", coleta.rodando ? "Coletando" : travado ? "Atualizar: próxima liberada às " + liberaHora() : "Atualizar agora");
    b.title = coleta.rodando ? cap(textoRodando()) :
      coleta.ligado === false ? "Atualização na hora indisponível no momento" :
      travado ? "Uma atualização a cada 30 minutos. Próxima liberada às " + liberaHora() :
      "Buscar os eventos nas ticketeiras agora (uma vez a cada 30 minutos)";
    // Resumo na linha do "Como os eventos são atualizados" (sempre visível, mesmo recolhido).
    var dica = "· próxima automática por volta de " + proximaAutomatica() + " · botão: uma vez a cada 30 min";
    if (coleta.rodando) dica = "· coleta em andamento";
    else if (travado) dica += ", liberado às " + liberaHora();
    $("atualizar-dica").textContent = dica;
    $("como-libera").textContent = coleta.rodando ? "Agora: há uma coleta em andamento." :
      travado ? "Agora: próxima liberada às " + liberaHora() + "." :
      coleta.ligado === false ? "Agora: atualização na hora indisponível; vale o horário automático." :
      coleta.ligado ? "Agora: liberado." : "";
    escreveColeta();
  }

  function aplicaEstado(e) {
    var tinha = coleta.rodando;
    coleta.rodando = !!e.rodando;
    coleta.pode = !!e.pode;
    coleta.libera = e.libera_em || "";
    // Só conta os minutos quando o GitHub já começou a rodar (não na fila).
    coleta.iniciada = e.etapa === "in_progress" ? e.iniciada : "";
    coleta.ligado = true;
    desenhaBotao();
    if (tinha && !coleta.rodando) terminou(e);
    clearTimeout(coleta.timer);
    if (coleta.rodando) coleta.timer = setTimeout(consulta, 15000);
  }

  function terminou(e) {
    if (e.ultima && !e.ultima.ok) {
      aviso("A coleta nova falhou. Continuam os dados de " + brHora(horaColeta()) + ".");
      coleta.pedi = false;
      return;
    }
    // O GitHub Pages leva alguns segundos para servir o arquivo novo.
    var antes = horaColeta(), tentativas = 0;
    (function tenta() {
      carrega(true).then(function () {
        if (horaColeta() === antes && ++tentativas < 6) { setTimeout(tenta, 10000); return; }
        aviso(horaColeta() === antes ? "Coleta concluída. Recarregue a página em instantes." : "Eventos atualizados: dados coletados às " + horaColeta().slice(11, 16));
        coleta.pedi = false;
      }).catch(function () { if (++tentativas < 6) setTimeout(tenta, 10000); });
    })();
  }

  function consulta() {
    if (document.hidden && coleta.rodando) { coleta.timer = setTimeout(consulta, 15000); return; }
    fetch(ATUALIZADOR + "/estado", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(aplicaEstado)
      .catch(function () {
        // Sem o intermediário (fora do ar ou ainda sem permissão): o botão fica, mas avisa.
        if (!coleta.rodando) { coleta.ligado = false; desenhaBotao(); }
        else coleta.timer = setTimeout(consulta, 30000);
      });
  }

  function pedeColeta() {
    if (coleta.rodando) { aviso(cap(textoRodando()) + ". A página se atualiza sozinha."); return; }
    if (coleta.ligado === false) {
      aviso("Atualização na hora indisponível no momento. Próxima automática por volta de " + proximaAutomatica() + ".");
      consulta();
      return;
    }
    if (!coleta.pode && coleta.libera) {
      aviso("Uma atualização a cada 30 minutos. Próxima liberada às " + liberaHora() + ".");
      return;
    }
    var b = $("bt-atualizar");
    b.disabled = true;
    fetch(ATUALIZADOR + "/atualizar", { method: "POST" })
      .then(function (r) { return r.json().then(function (j) { return { st: r.status, j: j }; }); })
      .then(function (x) {
        if (x.st === 202) { coleta.pedi = true; aviso("Coleta pedida. Leva uns 8 minutos; a página se atualiza sozinha."); }
        else if (x.j.erro === "rodando") aviso("Já tem uma coleta em andamento. A página se atualiza sozinha.");
        else if (x.j.erro === "trava") aviso("Uma atualização a cada 30 minutos. Próxima liberada às " + emGoias(x.j.libera_em).slice(11, 16) + ".");
        else aviso("Não deu para pedir a coleta agora. Tente de novo em instantes.");
        if (x.j && "rodando" in x.j) aplicaEstado(x.j);
      })
      .catch(function () { aviso("Não deu para pedir a coleta agora. Tente de novo em instantes."); })
      .then(function () { b.disabled = false; });
  }
  $("bt-atualizar").addEventListener("click", pedeColeta);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && dados) { clearTimeout(coleta.timer); consulta(); }
  });
  // Atualiza o "há N min" do topo enquanto a coleta roda.
  // e vira o botão de "Liberado às" para "Atualizar agora" quando chega a hora.
  setInterval(function () {
    if (coleta.ligado && !coleta.rodando && !coleta.pode && coleta.libera && Date.now() >= Date.parse(coleta.libera)) { consulta(); return; }
    if (dados) desenhaBotao();
  }, 30000);

  /* ---------- endereço (link compartilhável dos filtros) ---------- */
  function escreveHash() {
    if (aberto) return;
    var p = new URLSearchParams();
    if (st.aba !== "proximos") p.set("aba", st.aba);
    if (st.periodo !== "todos") p.set("p", st.periodo);
    if (st.periodo === "datas") { if (st.de) p.set("de", st.de); if (st.ate) p.set("ate", st.ate); }
    if (st.busca) p.set("q", st.busca);
    if (st.soNovos) p.set("novos", "1");
    for (var k in st.filtros) if (st.filtros[k].size) p.set(k, Array.from(st.filtros[k]).join("|"));
    var h = p.toString();
    history.replaceState(null, "", h ? "#" + h : location.pathname + location.search);
  }
  function leHash() {
    var h = location.hash.slice(1);
    if (!h || h.indexOf("e=") === 0) return;
    var p = new URLSearchParams(h);
    if (p.get("aba")) st.aba = p.get("aba");
    if (p.get("p")) st.periodo = p.get("p");
    st.de = p.get("de") || ""; st.ate = p.get("ate") || "";
    st.busca = p.get("q") || ""; $("busca").value = st.busca; $("busca-cel").value = st.busca;
    st.soNovos = p.get("novos") === "1";
    COLS.forEach(function (c) { if (c.filtro && p.get(c.k)) st.filtros[c.k] = new Set(p.get(c.k).split("|")); });
  }
  function abreDoHash() {
    var m = location.hash.match(/^#e=(.+)$/);
    if (m) abreEvento(decodeURIComponent(m[1]));
  }

  function ajustaBarra() {
    document.documentElement.style.setProperty("--barra", ($("conteudo").getBoundingClientRect().top > 0 ? document.querySelector(".topo").offsetHeight : 0) + "px");
  }

  /* ---------- eventos da página ---------- */
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest("button");
    if (!t) return;
    if (t.dataset.aba) { st.aba = t.dataset.aba; desenha._ordemManual = false; st.ordem = { k: "data", dir: 1 }; desenha(); window.scrollTo(0, 0); }
    else if (t.dataset.periodo && t.closest("#periodos")) { st.periodo = t.dataset.periodo === st.periodo && ehCelular() ? "todos" : t.dataset.periodo; desenha(); }
    else if (t.dataset.tira) { if (t.dataset.tira === "_novos") st.soNovos = false; else delete st.filtros[t.dataset.tira]; desenha(); }
    else if (t.dataset.acao === "limpar") {
      st.filtros = {}; st.periodo = "todos"; st.busca = ""; st.soNovos = false; st.de = st.ate = "";
      $("busca").value = ""; $("busca-cel").value = ""; desenha();
      if ($("dlg-filtros").open) desenhaFiltrosCel();
    }
    else if (t.dataset.menu) { if (!$("menu-col").hidden && $("menu-col").dataset.col === t.dataset.menu) fechaMenu(); else abreMenu(t.dataset.menu, t); }
    else if (t.dataset.abre) abreEvento(t.dataset.abre);
    else if (t.dataset.marca) alternaMarca(t.dataset.marca);
    else if (t.dataset.cidade) { st.filtros = { cidade: new Set([t.dataset.cidade]) }; st.aba = "proximos"; desenha(); window.scrollTo(0, 0); }
    else if (t.id === "bt-exportar") abreExportar();
    else if (t.id === "bt-filtros") { desenhaFiltrosCel._todas = null; desenhaFiltrosCel(); $("dlg-filtros").showModal(); }
    else if (t.id === "bt-visao") { st.visao = st.visao === "lista" ? "tabela" : "lista"; gravaLocal("eg-visao", st.visao); desenha(); }
  });
  document.addEventListener("change", function (ev) {
    var t = ev.target;
    if (t.id === "so-novos") { st.soNovos = t.checked; desenha(); }
    else if (t.id === "de" || t.id === "ate") { st[t.id] = t.value; desenha(); }
  });
  var tBusca;
  ["busca", "busca-cel"].forEach(function (id) {
    $(id).addEventListener("input", function () {
      var v = this.value, outro = id === "busca" ? "busca-cel" : "busca";
      $(outro).value = v;
      clearTimeout(tBusca);
      tBusca = setTimeout(function () { st.busca = v; desenha(); }, 180);
    });
  });
  // Clique fora da folha fecha (no fundo escuro).
  document.querySelectorAll("dialog.folha").forEach(function (d) {
    d.addEventListener("click", function (ev) { if (ev.target === d) d.close(); });
  });

  ajustaBarra();
  desenhaBotao();
  carrega().then(consulta, function () {});
})();
