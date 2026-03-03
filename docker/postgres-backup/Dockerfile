FROM postgres:17-alpine

RUN apk add --no-cache aws-cli

COPY backup.sh /backup.sh
RUN chmod +x /backup.sh

# Write cron schedule from SCHEDULE env var at runtime, then start crond
CMD sh -c 'echo "${SCHEDULE} /backup.sh >> /var/log/backup.log 2>&1" > /etc/crontabs/root && crond -f -l 2'
