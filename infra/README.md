# Deploy

Four containers behind one address: Caddy (TLS + static site), the API, Postgres,
and the Telegram bot. Only Caddy publishes ports — the database is not reachable
from the internet at all.

## 1. Address

There is nothing to buy or configure for a test server. `sslip.io` is a public
wildcard DNS service that resolves the IP written into the hostname, so

```
147-45-224-200.sslip.io  →  147.45.224.200
```

works immediately, and because it is a real hostname, Let's Encrypt issues a real
certificate for it. That matters: **Telegram refuses to sign users in over plain
HTTP or to a bare IP address**, so without HTTPS the login button does nothing.

Switching to a real domain later is one line in `infra/.env` plus `/setdomain` in
BotFather — nothing else changes.

## 2. First deploy

On the server, as root:

```bash
apt-get update && apt-get install -y git
git clone https://github.com/kakophoni4/pokpok.git /opt/poker
cd /opt/poker
bash infra/bootstrap.sh https://147-45-224-200.sslip.io
```

The script installs Docker if it is missing, generates the database password,
`JWT_SECRET` and `INTERNAL_API_TOKEN` into `infra/.env`, builds the images,
starts everything, applies the migrations and creates the first season.

The first build takes a few minutes; later ones reuse the dependency layer.

## 3. Telegram bot

Without a bot token the site works but nobody can sign in, because Telegram is
the only login method in production. In [@BotFather](https://t.me/BotFather):

1. `/newbot` — take the token and the username.
2. `/setdomain` — send `147-45-224-200.sslip.io` (host only, no `https://`).
   Skipping this makes the login widget appear and silently fail.
3. `/newapp` — a Mini App pointing at `https://147-45-224-200.sslip.io`, so the
   league opens inside Telegram itself.

Then write both values into `infra/.env` and re-run the script:

```bash
nano infra/.env      # TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME
bash infra/bootstrap.sh
```

The bot uses long polling, not webhooks: nothing has to be exposed for it, and it
keeps working if the certificate is ever renewed at an awkward moment. For a club
of a few dozen players the difference in load is not measurable.

## 4. First administrator

A fresh database has no staff, and roles can only be changed by an administrator —
so the first one is appointed from the server. Sign in on the site through
Telegram once, then:

```bash
cd /opt/poker
docker compose -f infra/docker-compose.yml exec api node scripts/grant-role.mjs --list
docker compose -f infra/docker-compose.yml exec api node scripts/grant-role.mjs "ВашНик" admin
```

The new role applies on the next sign-in or token refresh, within 15 minutes.
Everyone else is promoted from the admin panel afterwards. The change is written
to the audit log either way.

## 5. Updating

```bash
cd /opt/poker && git pull && bash infra/bootstrap.sh
```

Existing secrets and the database volume are left alone. Migrations run on API
startup, so a deploy that adds tables needs no separate command.

## Everyday commands

```bash
cd /opt/poker
COMPOSE="docker compose -f infra/docker-compose.yml"

$COMPOSE ps                        # what is running
$COMPOSE logs -f --tail=100        # all logs
$COMPOSE logs -f api               # just the API
$COMPOSE restart api
$COMPOSE down                      # stop (the database survives)
```

Backup — the database is the only irreplaceable part:

```bash
docker compose -f infra/docker-compose.yml exec -T db \
  pg_dump -U poker poker_league | gzip > ~/poker-$(date +%F).sql.gz
```

Worth putting in cron once the league has real history.

## Troubleshooting

**The certificate is not issued.** Caddy needs inbound 80 and 443 for the
Let's Encrypt challenge; a provider-side firewall is the usual cause.
`docker compose -f infra/docker-compose.yml logs web` says which.

**The bot container is not running.** Expected when `TELEGRAM_BOT_TOKEN` is empty:
it refuses to start and, unlike the other services, is not restarted forever.
`logs bot` shows the reason.

**Telegram login does nothing.** Almost always `/setdomain` in BotFather not
matching `PUBLIC_URL`, or the site being opened over `http://`.

**The API restarts in a loop.** Nearly always the database: `logs api` shows the
Prisma error, and `logs db` shows whether Postgres came up at all.
