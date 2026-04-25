# Dockerfile · mira-cron · service Easypanel separado.
#
# Por que existe: a versao do Easypanel em uso nao expoe Cron Jobs schedulaveis
# nativamente (so "Scripts" on-demand). Esta imagem roda crond + crontab com as
# 11 linhas que disparam os cron route handlers da Mira via curl interno.
#
# Conexao com a Mira: ambos vivem no project "clinicai" do Easypanel · acesso
# via DNS interno do Docker network (`http://mira:3006/...`) ou via dominio
# publico se DNS interno nao funcionar (`https://mira.miriandpaula.com.br/...`).
#
# Secret: MIRA_CRON_SECRET injetado via env do service · entrypoint.sh substitui
# placeholder no crontab antes de iniciar crond.

FROM alpine:3.19

# curl pra fazer as requisicoes · gettext-base pra envsubst no entrypoint
RUN apk add --no-cache curl gettext tzdata && \
    cp /usr/share/zoneinfo/America/Sao_Paulo /etc/localtime && \
    echo "America/Sao_Paulo" > /etc/timezone

WORKDIR /app
COPY crontab.template /app/crontab.template
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# crond -f (foreground) -L (log file path) -l 8 (verbose level)
ENTRYPOINT ["/app/entrypoint.sh"]
