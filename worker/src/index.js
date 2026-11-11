/* Intermediário do botão "Atualizar" do site Eventos Goiás.

   O site é público e não pode guardar a permissão do GitHub. Este Worker
   guarda essa permissão (segredo GITHUB_TOKEN) e só faz duas coisas:

     GET  /estado     diz se há coleta rodando e quando a próxima é liberada
     POST /atualizar  dispara o workflow "Atualiza eventos", no máximo uma vez
                      a cada 30 minutos e nunca com outra coleta rodando

   A trava vem do próprio histórico de rodadas do GitHub Actions. O KV TRAVA
   só cobre os segundos entre o disparo e o GitHub listar a rodada nova. */

export const REPO = "rodrigopcviana-lab/eventos-goias";
export const WORKFLOW = "atualiza.yml";
export const TRAVA_MIN = 30;
export const ORIGENS = [
  "https://eventos-goias.pages.dev",
  "https://rodrigopcviana-lab.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
];
const API = "https://api.github.com/repos/" + REPO + "/actions";
const CHAVE_PEDIDO = "pedido";

function cabecalhosCors(origem) {
  const h = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", Vary: "Origin" };
  if (ORIGENS.includes(origem)) {
    h["Access-Control-Allow-Origin"] = origem;
    h["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}

function resposta(corpo, status, origem) {
  return new Response(JSON.stringify(corpo), { status, headers: cabecalhosCors(origem) });
}

function github(env, caminho, opcoes = {}) {
  return fetch(API + caminho, {
    ...opcoes,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + env.GITHUB_TOKEN,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "eventos-goias-atualizar",
      ...(opcoes.headers || {}),
    },
  });
}

/* Calcula o estado a partir das rodadas do GitHub (mais nova primeiro).
   Rodada de "push" só republica o site, sem coletar: não conta. */
export function calculaEstado(rodadas, agora, pedidoEm) {
  const coletas = rodadas.filter((r) => r.event !== "push");
  const ativa = coletas.find((r) => r.status !== "completed");
  const ultima = coletas[0];
  const concluida = coletas.find((r) => r.status === "completed");
  // Disparo recente que o GitHub ainda não listou.
  const pendente = pedidoEm && !coletas.some((r) => Date.parse(r.created_at) >= pedidoEm - 10000) ? pedidoEm : 0;
  const base = Math.max(ultima ? Date.parse(ultima.created_at) : 0, pendente);
  const liberaEm = base ? base + TRAVA_MIN * 60000 : 0;
  const rodando = Boolean(ativa) || Boolean(pendente);
  return {
    rodando,
    etapa: ativa ? ativa.status : pendente ? "pedida" : "",
    iniciada: ativa ? ativa.run_started_at || ativa.created_at : pendente ? new Date(pendente).toISOString() : "",
    ultima: concluida
      ? { inicio: concluida.run_started_at || concluida.created_at, fim: concluida.updated_at, ok: concluida.conclusion === "success" }
      : null,
    pode: !rodando && agora >= liberaEm,
    libera_em: liberaEm ? new Date(liberaEm).toISOString() : "",
    agora: new Date(agora).toISOString(),
  };
}

async function leEstado(env, agora) {
  const r = await github(env, "/workflows/" + WORKFLOW + "/runs?per_page=10");
  if (!r.ok) throw new Error("GitHub respondeu " + r.status);
  const corpo = await r.json();
  const pedido = env.TRAVA ? Number(await env.TRAVA.get(CHAVE_PEDIDO)) || 0 : 0;
  return calculaEstado(corpo.workflow_runs || [], agora, pedido);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origem = request.headers.get("Origin") || "";
    const agora = Date.now();

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cabecalhosCors(origem) });
    if (!env.GITHUB_TOKEN) return resposta({ erro: "sem_token" }, 503, origem);

    try {
      if (url.pathname === "/estado" && request.method === "GET") {
        return resposta(await leEstado(env, agora), 200, origem);
      }

      if (url.pathname === "/atualizar" && request.method === "POST") {
        // Só o próprio site pode pedir (o navegador sempre manda o Origin).
        if (!ORIGENS.includes(origem)) return resposta({ erro: "origem" }, 403, origem);
        const estado = await leEstado(env, agora);
        if (!estado.pode) return resposta({ erro: estado.rodando ? "rodando" : "trava", ...estado }, 429, origem);
        const d = await github(env, "/workflows/" + WORKFLOW + "/dispatches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ref: "main" }),
        });
        if (!d.ok) return resposta({ erro: "github", status: d.status }, 502, origem);
        if (env.TRAVA) await env.TRAVA.put(CHAVE_PEDIDO, String(agora), { expirationTtl: 600 });
        return resposta(calculaEstado([], agora, agora), 202, origem);
      }

      return resposta({ erro: "nao_encontrado" }, 404, origem);
    } catch (e) {
      return resposta({ erro: "falha", detalhe: String(e.message || e).slice(0, 200) }, 502, origem);
    }
  },
};
