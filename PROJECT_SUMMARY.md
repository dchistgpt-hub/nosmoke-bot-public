# NoSmoke-bot — Проект: сводка

## Что сделано
- Бот на Telegraf, webhook через Caddy + Docker.
- Команды: /start, /ping, /help, /echo, /quiet, /about, /stats.
- Логирование входящих сообщений, ротация по дате.
- CI/CD: GitHub Actions "Deploy to VPS".
- .env хранится только на сервере.

## Где что лежит (VPS)
- /root/nosmoke-bot — проект
- docker-compose.yml — bot+caddy
- Caddyfile — reverse_proxy на bot:3000
- logs/messages-YYYY-MM-DD.log — логи
- scripts/ — полезные скрипты (перезапуск, вебхук-инфо и т.п.)
- docs/ — инструкции

## Быстрые команды (VPS)
cd /root/nosmoke-bot
docker compose up -d --build
docker compose logs -f --tail 50 bot
