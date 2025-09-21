import { request as githubRequest } from "@octokit/request";
import { RequestError } from "@octokit/request-error";

import { convertPushEvent, PartialWebhookPushEvent } from "./convert.ts";
import env from "./env.ts";
import type PushEvent from "./pushEvent.d.ts";
import { initSentry } from "./sentry.ts";

const KV_KEY_LAST_UPDATE = ["last-update"];
const KV_KEY_ETAG = ["last-etag"];
const kv = await Deno.openKv(Deno.env.get("KV_PATH"));

async function checkGitHub(): Promise<void> {
    const lastId = (await kv.get<number>(KV_KEY_LAST_UPDATE)).value ?? 0;
    const etag = (await kv.get<string>(KV_KEY_ETAG)).value || undefined;

    let events: Awaited<ReturnType<typeof githubRequest<"GET /repos/{owner}/{repo}/events">>>;
    try {
        events = await githubRequest("GET /repos/{owner}/{repo}/events", {
            owner: "DisnakeDev",
            repo: "disnake",
            // I don't expect more than 100 new events to occur within 5 minutes for now, to keep things simple
            per_page: 100,
            headers: { "If-None-Match": etag },
        });
    } catch (e) {
        if (e instanceof RequestError && e.status == 304) {
            console.debug("received 304");
            return;
        }
        throw e;
    }

    const newEtag = events.headers["etag"];
    console.debug(`previous etag: ${etag}, new etag: ${newEtag}`);
    if (newEtag) await kv.set(KV_KEY_ETAG, newEtag);

    for (const ev of events.data) {
        const id = Number(ev.id);
        if (id <= lastId) break;
        if (ev.type !== "PushEvent") continue;

        // octokit types are unfortunately wrong and incomplete, so just cast it
        const newEvent = convertPushEvent(ev as PushEvent);
        await sendWebhook(newEvent);
        break;
    }
}

async function sendWebhook(event: PartialWebhookPushEvent): Promise<void> {
    const data = JSON.stringify(event);

    console.debug(
        `sending webhook to ${env.WEBHOOK_URL}, commits: ${
            JSON.stringify(event.commits.map((c) => c.id))
        }`,
    );
    const res = await fetch(env.WEBHOOK_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-GitHub-Event": "push",
        },
        body: data,
    });

    console.debug(`webhook returned status ${res.status}`);
    if (!res.ok) {
        throw new Error(`failed to execute webhook with status ${res.status}: ${await res.text()}`);
    }
}

initSentry();

if (Deno.env.get("RUN_IMMEDIATELY")) {
    await checkGitHub();
    // deno-lint-ignore no-debugger
    debugger;
} else {
    Deno.cron(
        "check github",
        { minute: { every: 1 } },
        { backoffSchedule: [1000, 5000, 15000] },
        checkGitHub,
    );
}
