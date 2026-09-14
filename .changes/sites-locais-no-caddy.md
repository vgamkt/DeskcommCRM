---
impacto: capacidade_nova
secao: adicionado
titulo: Proxy aceita sites locais da VPS sem vazar entre instalações
---

O `Caddyfile` agora termina importando `/etc/caddy/sites.d/*.caddy`, e o compose do
Caddy monta esse diretório a partir de `caddy-sites.d/`. É ali que o dono da VPS
publica outros domínios que o mesmo Caddy já atende — outro app na mesma máquina,
um WAHA compartilhado — sem tocar em arquivo versionado.

O diretório é gitignorado (só um `.gitkeep` viaja). Na prática: a configuração
privada de uma instalação nunca aparece na de outra, e sobrevive ao `update.sh`,
que troca o `Caddyfile` pela versão da tag. Vazio, o `import` não faz nada além de
uma linha de aviso no log — é o estado padrão de quem não usa o recurso.
