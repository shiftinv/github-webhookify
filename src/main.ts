import { request as githubRequest } from "@octokit/request";

import { convertPushEvent, PartialWebhookPushEvent } from "./convert.ts";
import type PushEvent from "./pushEvent.d.ts";

const KV_KEY = "last-update";
const kv = await Deno.openKv(Deno.env.get("KV_PATH"));

async function checkGitHub(): Promise<void> {
    const lastId = (await kv.get<number>([KV_KEY])).value ?? 0;

    const events = await githubRequest("GET /repos/{owner}/{repo}/events", {
        owner: "DisnakeDev",
        repo: "disnake",
        // I don't expect more than 100 new events to occur within 5 minutes for now, to keep things simple
        per_page: 100,
    });
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
    const res = await fetch(Deno.env.get("WEBHOOK_URL")!, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-GitHub-Event": "push",
        },
        body: data,
    });
    console.log(res);
    if (!res.ok) throw res;
}

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
