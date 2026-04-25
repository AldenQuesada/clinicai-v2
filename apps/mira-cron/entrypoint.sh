#!/bin/sh
# entrypoint mira-cron · resolve env vars no crontab antes de iniciar crond.
#
# Env vars obrigatorias:
#   MIRA_CRON_SECRET    · header x-cron-secret pra autenticar contra a Mira
#   MIRA_TARGET_BASE    · URL base da Mira · default http://mira:3006 (DNS interno
#                         do Easypanel network) com fallback https publico

set -eu

: "${MIRA_CRON_SECRET:?env MIRA_CRON_SECRET nao setada}"
MIRA_TARGET_BASE="${MIRA_TARGET_BASE:-http://mira:3006}"
export MIRA_CRON_SECRET MIRA_TARGET_BASE

# envsubst expande $VAR no template · gera crontab final em /etc/crontabs/root
mkdir -p /etc/crontabs
envsubst '$MIRA_CRON_SECRET $MIRA_TARGET_BASE' < /app/crontab.template > /etc/crontabs/root

# log file deve existir antes de crond iniciar
mkdir -p /var/log
touch /var/log/mira-cron.log

echo "[mira-cron] crontab montado · target=$MIRA_TARGET_BASE"
echo "[mira-cron] crond iniciando em foreground · logs streaming"

# Foreground · streama o log file pra stdout do container (pra ver via easypanel logs)
crond -f -L /dev/stdout -l 8 &
CROND_PID=$!

tail -f /var/log/mira-cron.log &

# Aguarda crond morrer (ou sinal de shutdown)
wait $CROND_PID
