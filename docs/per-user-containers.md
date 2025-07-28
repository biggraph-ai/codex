# Per-user container deployment

This guide shows how to run Codex CLI in Docker so that each user gets an isolated container. A reverse proxy routes requests to the right instance.

## Build the Codex CLI image

```bash
docker build -t codex-cli ./codex-cli
```

The container exposes the CLI on port `3000`.

## Launch a container per user

Start a container for every authenticated user and map it to a unique host port:

```bash
docker run -d --name codex-alice -p 3001:3000 codex-cli
docker run -d --name codex-bob   -p 3002:3000 codex-cli
```

## Nginx example

Configure Nginx to route requests based on the user path:

```nginx
http {
    upstream alice { server 127.0.0.1:3001; }
    upstream bob   { server 127.0.0.1:3002; }

    server {
        listen 80;

        location /alice/ {
            proxy_pass http://alice;
        }

        location /bob/ {
            proxy_pass http://bob;
        }
    }
}
```

Your application should map the logged in user to the appropriate path (e.g. `/alice/`).

## Traefik example

Traefik can automatically discover containers via Docker labels. The `docker-compose.yml` below exposes each container on its own subdomain:

```yaml
version: "3"
services:
  traefik:
    image: traefik:v3.0
    command:
      - --providers.docker=true
      - --entrypoints.web.address=:80
    ports:
      - "80:80"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock

  codex-alice:
    image: codex-cli
    labels:
      - "traefik.http.routers.alice.rule=Host(`alice.example.com`)"
    expose:
      - "3000"

  codex-bob:
    image: codex-cli
    labels:
      - "traefik.http.routers.bob.rule=Host(`bob.example.com`)"
    expose:
      - "3000"
```

When new containers are started with the correct labels Traefik begins routing to them automatically.
