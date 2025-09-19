import { Commit, PushEvent as WebhookPushEvent, Repository, User } from "@octokit/webhooks-types";

import type PushEvent from "./pushEvent.d.ts";

type PartialRepository = Pick<Repository, "id" | "name" | "full_name" | "url" | "html_url">;
function convertRepository(event: PushEvent): PartialRepository {
    const repoUrl = `https://github.com/${event.repo.name}`;
    return {
        id: event.repo.id,
        name: event.repo.name.split("/")[1]!,
        full_name: event.repo.name,
        url: event.repo.url,
        html_url: repoUrl,
    };
}

type PartialUser = Pick<User, "login" | "id" | "avatar_url" | "url" | "html_url">;
function convertUser(user: PushEvent["actor"]): PartialUser {
    return {
        login: user.login,
        id: user.id,
        avatar_url: user.avatar_url,
        url: user.url,
        html_url: `https://github.com/${user.login}`,
    };
}

type PartialCommit = Pick<Commit, "id" | "distinct" | "message" | "url" | "author">;
function convertCommit(
    commit: PushEvent["payload"]["commits"][number],
    repoUrl: string,
): PartialCommit {
    return {
        id: commit.sha,
        distinct: commit.distinct,
        message: commit.message,
        url: `${repoUrl}/commit/${commit.sha}`,
        // FIXME: this doesn't include the username, only the display name :c
        author: commit.author,
    };
}

type PartialWebhookPushEvent =
    & Omit<WebhookPushEvent, "repository" | "sender" | "commits" | "head_commit">
    & {
        repository: PartialRepository;
        sender: PartialUser;
        commits: PartialCommit[];
        head_commit: PartialCommit | null;
    };
export function convertPushEvent(event: PushEvent): PartialWebhookPushEvent {
    const repo = convertRepository(event);
    const commits = event.payload.commits.map((c) => convertCommit(c, repo.html_url));

    const { payload: { before, head: after } } = event;
    return {
        ref: event.payload.ref,
        before: before,
        after: after,
        created: false,
        deleted: false,
        forced: false,
        base_ref: null,
        compare: `${repo.html_url}/compare/${before.substring(0, 12)}...${after.substring(0, 12)}`,
        commits: commits,
        head_commit: commits.at(-1) ?? null,
        repository: repo,
        pusher: { name: event.actor.login, email: "example@localhost" },
        sender: convertUser(event.actor),
    };
}
