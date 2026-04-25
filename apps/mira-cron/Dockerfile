# Dockerfile · mira-cron · alpine + crond + curl.
#
# Setup minimal: TZ via env (sem tzdata install) · evita falhas de build.
# crond do busybox respeita $TZ env naturalmente.

FROM alpine:3.19

RUN apk add --no-cache curl gettext

WORKDIR /app
COPY crontab.template /app/crontab.template
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh && \
    sed -i 's/\r$//' /app/entrypoint.sh /app/crontab.template

ENV TZ=America/Sao_Paulo

ENTRYPOINT ["/app/entrypoint.sh"]
