/* Endereço público do site: https://eventos-goias.pages.dev

   O site continua sendo publicado pelo GitHub Actions no GitHub Pages (origem).
   Este Worker do Cloudflare Pages só repassa as páginas de lá, sem mostrar o
   endereço de origem, e encaminha /api/* para o intermediário do botão
   Atualizar (Worker eventos-goias-atualizar, ligado pelo service binding
   ATUALIZADOR). Não precisa ser republicado quando o site muda.

   Publicar (só quando este arquivo mudar):
     npx wrangler pages deploy endereco/public --project-name eventos-goias --branch main */

const ORIGEM = "https://rodrigopcviana-lab.github.io/eventos-goias";
// Cabeçalhos da origem que não precisam chegar ao visitante.
const TIRAR = ["server", "x-github-request-id", "via", "x-served-by", "x-cache", "x-cache-hits",
  "x-timer", "x-github-edge-region", "x-fastly-request-id", "x-proxy-cache", "age", "set-cookie"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const destino = "https://atualizador" + url.pathname.slice(4) + url.search;
      return env.ATUALIZADOR.fetch(new Request(destino, request));
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Método não permitido", { status: 405 });
    }

    const resp = await fetch(ORIGEM + url.pathname + url.search, {
      method: request.method,
      headers: { "Accept-Encoding": request.headers.get("Accept-Encoding") || "" },
      redirect: "manual",
    });
    const headers = new Headers(resp.headers);
    TIRAR.forEach((h) => headers.delete(h));
    const local = headers.get("location");
    if (local) headers.set("location", local.replace(/^https?:\/\/rodrigopcviana-lab\.github\.io\/eventos-goias/, url.origin));
    return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
  },
};
