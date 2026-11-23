#!/bin/sh
set -e

# Optionally create/update the PocketBase superuser (dashboard at /_/)
if [ -n "$PB_ADMIN_EMAIL" ] && [ -n "$PB_ADMIN_PASSWORD" ]; then
  /pb/pocketbase superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD" --dir=/pb/pb_data >/dev/null
fi

exec /pb/pocketbase serve --http=0.0.0.0:8090 --dir=/pb/pb_data
