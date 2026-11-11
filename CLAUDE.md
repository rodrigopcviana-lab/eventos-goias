# Eventos Goiás

Robô que junta os eventos de Goiás das ticketeiras + site no GitHub Pages.
Projeto pessoal do Rodrigo, à parte: não tem relação com o Grupo IZ nem com os
outros repositórios dele. Detalhe em `README.md`.

## Regras

- **Nunca contornar bloqueio de site**: captcha, verificação anti-robô
  (Cloudflare, Vercel, queue-it) ou chave de acesso embutida no site de outra
  empresa. Site que bloqueia fica de fora e vai para a tabela do README.
- Sempre `http.get` de `fontes/comum.py` (pausa de 1,5 s por site), nunca
  pedidos em rajada.
- Evento sem dado fica vazio; nunca inventar data, hora ou local.
- `dados/` e `saida/` são commitados pelo robô do GitHub Actions todo dia:
  puxar (`git pull`) antes de mexer, e não reescrever esses arquivos à mão.
- Site sem build e sem emoji na interface; ícones são SVG de linha.
- Testar fonte nova com `python robo_eventos.py --so <fonte>` e o site no
  navegador, no computador e no celular, antes de dar push.
