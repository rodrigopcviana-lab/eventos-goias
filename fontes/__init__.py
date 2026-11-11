"""Uma função `coleta(cfg_fonte, http, log)` por ticketeira.

Cada uma devolve uma lista de eventos no formato de `comum.evento()` e só
eventos que acontecem em Goiás (UF == "GO"). Erro numa fonte não derruba as
outras: quem chama registra a falha no status da rodada.
"""
