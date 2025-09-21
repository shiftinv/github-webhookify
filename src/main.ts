import { request as githubRequest } from "@octokit/request";
import { RequestError } from "@octokit/request-error";

import { convertPushEvent, PartialWebhookPushEvent } from "./convert.ts";
import env from "./env.ts";
import type PushEvent from "./pushEvent.d.ts";
import { initSentry } from "./sentry.ts";

const kv = await Deno.openKv(Deno.env.get("KV_PATH"));

const KV_KEY = ["last-state"];
// keep global state to save kv units, since deno deploy isolates usually stay alive for a while
type State = { etag: string | undefined; lastId: number };
let state: State | null = null;

async function checkGitHub(): Promise<void> {
    if (!state) state = (await kv.get<State>(KV_KEY)).value;
    const etag = state?.etag;
    const lastId = state?.lastId ?? 0;
    const initialRun = lastId === 0;

    let events: Awaited<ReturnType<typeof githubRequest<"GET /repos/{owner}/{repo}/events">>>;
    try {
        events = await githubRequest("GET /repos/{owner}/{repo}/events", {
            owner: env.REPO_NAME.owner,
            repo: env.REPO_NAME.name,
            // I don't expect more than 100 new events to occur within 5 minutes for now, to keep things simple
            per_page: 100,
            headers: {
                "Authorization": `token ${env.GITHUB_TOKEN}`,
                "If-None-Match": etag,
            },
        });
    } catch (e) {
        if (e instanceof RequestError && e.status == 304) {
            if (env.DEBUG) console.debug("received 304");
            return;
        }
        throw e;
    }

    const newEtag = events.headers["etag"];
    if (env.DEBUG) console.debug(`previous etag: ${etag}, new etag: ${newEtag}`);

    // on the initial run, we don't want to send any events
    const eventsData = initialRun ? [] : events.data.toReversed();

    let newEvents = 0;
    for (const ev of eventsData) {
        const id = Number(ev.id);
        if (id <= lastId) continue;
        newEvents++;

        if (ev.type !== "PushEvent") continue;

        // octokit types are unfortunately wrong and incomplete, so just cast it
        const newEvent = convertPushEvent(ev as PushEvent);
        await sendWebhook(newEvent);
    }
    if (env.DEBUG) console.debug(`found ${newEvents} new events since last check`);

    const newId = events.data[0] ? Number(events.data[0].id) : null;
    if (newEtag != etag || newId != lastId) {
        state = { etag: newEtag ?? etag, lastId: newId ?? lastId };
        await kv.set(KV_KEY, state);
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
} else {
    Deno.cron(
        "check github",
        { minute: { every: 1 } },
        { backoffSchedule: [1000, 5000, 15000] },
        checkGitHub,
    );
}
