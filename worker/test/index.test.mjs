// Testes do intermediário do botão Atualizar: node --test worker/test
import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { calculaEstado, TRAVA_MIN } from "../src/index.js";

const SITE = "https://rodrigopcviana-lab.github.io";
const MIN = 60000;
const T0 = Date.now(); // o Worker usa o relógio real

function rodada(minAtras, extra = {}) {
  const t = new Date(T0 - minAtras * MIN).toISOString();
  return { event: "workflow_dispatch", status: "completed", conclusion: "success", created_at: t, run_started_at: t, updated_at: t, ...extra };
}

function kv() {
  const m = new Map();
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v), m };
}

// Troca o fetch global por um GitHub falso.
function githubFalso(rodadas, { dispatchStatus = 204 } = {}) {
  const chamadas = [];
  globalThis.fetch = async (url, op = {}) => {
    chamadas.push({ url, metodo: op.method || "GET", auth: op.headers?.Authorization });
    if (url.includes("/dispatches")) return new Response(null, { status: dispatchStatus });
    return new Response(JSON.stringify({ workflow_runs: rodadas }), { status: 200 });
  };
  return chamadas;
}

function pede(metodo, caminho, origem = SITE) {
  const headers = origem ? { Origin: origem } : {};
  return new Request("https://w.example" + caminho, { method: metodo, headers });
}

test("libera quando a última coleta tem mais de 30 minutos", () => {
  const e = calculaEstado([rodada(TRAVA_MIN + 1)], T0, 0);
  assert.equal(e.pode, true);
  assert.equal(e.rodando, false);
  assert.equal(e.ultima.ok, true);
});

test("trava por 30 minutos depois da última coleta", () => {
  const e = calculaEstado([rodada(10)], T0, 0);
  assert.equal(e.pode, false);
  assert.equal(e.libera_em, new Date(T0 + 20 * MIN).toISOString());
});

test("rodada de push (só republica o site) não conta para a trava", () => {
  const e = calculaEstado([rodada(2, { event: "push" }), rodada(40)], T0, 0);
  assert.equal(e.pode, true);
});

test("coleta rodando bloqueia e informa a etapa", () => {
  const e = calculaEstado([rodada(45, { status: "in_progress", conclusion: null })], T0, 0);
  assert.equal(e.rodando, true);
  assert.equal(e.etapa, "in_progress");
  assert.equal(e.pode, false);
});

test("disparo que o GitHub ainda não listou conta como rodando", () => {
  const e = calculaEstado([rodada(60)], T0, T0 - 5000);
  assert.equal(e.rodando, true);
  assert.equal(e.etapa, "pedida");
  assert.equal(e.pode, false);
});

test("POST /atualizar dispara o workflow e grava o pedido", async () => {
  const chamadas = githubFalso([rodada(40)]);
  const env = { GITHUB_TOKEN: "t", TRAVA: kv() };
  const r = await worker.fetch(pede("POST", "/atualizar"), env);
  assert.equal(r.status, 202);
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), SITE);
  assert.ok(chamadas.some((c) => c.url.endsWith("/workflows/atualiza.yml/dispatches") && c.metodo === "POST" && c.auth === "Bearer t"));
  assert.ok(env.TRAVA.m.get("pedido"));
  // Segundo clique logo depois: recusado, mesmo antes de o GitHub listar a rodada.
  const r2 = await worker.fetch(pede("POST", "/atualizar"), env);
  assert.equal(r2.status, 429);
});

test("POST /atualizar recusa com coleta recente e não dispara", async () => {
  const chamadas = githubFalso([rodada(5)]);
  const r = await worker.fetch(pede("POST", "/atualizar"), { GITHUB_TOKEN: "t", TRAVA: kv() });
  assert.equal(r.status, 429);
  assert.equal((await r.json()).erro, "trava");
  assert.ok(!chamadas.some((c) => c.url.includes("/dispatches")));
});

test("POST /atualizar de fora do site é recusado", async () => {
  const chamadas = githubFalso([rodada(40)]);
  const r = await worker.fetch(pede("POST", "/atualizar", "https://outro.site"), { GITHUB_TOKEN: "t" });
  assert.equal(r.status, 403);
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), null);
  assert.equal(chamadas.length, 0);
});

test("sem token configurado responde 503 (o site esconde o botão)", async () => {
  const r = await worker.fetch(pede("GET", "/estado"), {});
  assert.equal(r.status, 503);
});

test("GET /estado devolve o estado com CORS do site", async () => {
  githubFalso([rodada(3, { status: "queued", conclusion: null }), rodada(1500)]);
  const r = await worker.fetch(pede("GET", "/estado"), { GITHUB_TOKEN: "t" });
  const e = await r.json();
  assert.equal(r.status, 200);
  assert.equal(e.rodando, true);
  assert.equal(e.etapa, "queued");
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), SITE);
});
