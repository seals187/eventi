FROM alpine:3.22

ARG PB_VERSION=0.40.5
ARG TARGETARCH=amd64
ARG EVENTI_VERSION=dev

LABEL org.opencontainers.image.title="eventi" \
      org.opencontainers.image.description="Self-hosted polls and date finding with accounts, invitations and reminders" \
      org.opencontainers.image.source="https://github.com/seals187/eventi" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.version="${EVENTI_VERSION}"

ENV EVENTI_VERSION=${EVENTI_VERSION}

RUN apk add --no-cache ca-certificates tzdata \
 && adduser -D -H -u 1000 eventi \
 && wget -q -O /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" \
 && mkdir -p /pb/pb_data \
 && unzip -q /tmp/pb.zip pocketbase -d /pb \
 && rm /tmp/pb.zip \
 && chown -R eventi:eventi /pb

COPY --chown=eventi:eventi pb_migrations /pb/pb_migrations
COPY --chown=eventi:eventi pb_hooks /pb/pb_hooks
COPY --chown=eventi:eventi pb_public /pb/pb_public
COPY --chmod=755 entrypoint.sh /entrypoint.sh

USER eventi
WORKDIR /pb
EXPOSE 8090
VOLUME /pb/pb_data

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8090/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
