FROM denoland/deno:alpine-2.5.1

RUN mkdir /data && chown deno:deno /data
VOLUME /data
ENV KV_PATH=/data/kv.sqlite3

USER deno
WORKDIR /app

COPY . .
RUN deno cache src/main.ts

CMD [\
    "run",\
    "--allow-env", "--allow-net", "--allow-read=/data", "--allow-write=/data",\
    "--unstable-kv",\
    "--unstable-cron",\
    "src/main.ts"\
]
