# Cloud Run image for the Formula Factor live timing relay.
#
# The service has no dependencies (plain node:http + tls), so there is no
# install step: the image is just Node plus three files.
#
# Deploy with (from the repository root):
#   gcloud run deploy ffc-live-relay --source . --region europe-west1 \
#     --allow-unauthenticated --timeout 3600 --memory 256Mi --cpu 1
#
# See relay/README.md for the full walkthrough.

FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY live-timing-upstream.js live-timing-store.js ./
COPY relay ./relay
# The results importer is shared with the admin Node server; the relay serves its
# read-only endpoints so the static site can import race results too.
COPY server/race-results-import.js ./server/

# The modules are ESM and have no dependencies, so a two-line package.json is
# all Node needs ("type": "module"); nothing to install.
RUN printf '{"name":"ffc-live-timing-relay","private":true,"type":"module"}\n' > package.json

# Cloud Run injects PORT (8080 by default).
ENV PORT=8080
EXPOSE 8080

USER node
HEALTHCHECK --interval=60s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '8080') + '/health').then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))"
CMD ["node", "relay/server.js"]
