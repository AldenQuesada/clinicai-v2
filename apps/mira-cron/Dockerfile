FROM alpine:3.19

RUN apk add --no-cache curl gettext

WORKDIR /app
COPY crontab.template /app/crontab.template
COPY entrypoint.sh /app/entrypoint.sh

RUN chmod +x /app/entrypoint.sh

ENV TZ=America/Sao_Paulo

CMD ["/bin/sh", "/app/entrypoint.sh"]
