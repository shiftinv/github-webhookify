import * as Sentry from "@sentry/deno";

import env from "./env.ts";

export function initSentry(): void {
    if (env.DENO_DEPLOYMENT_ID && !env.SENTRY_DSN) {
        throw new Error("SENTRY_DSN is required in prod");
    }

    Sentry.init({
        dsn: env.SENTRY_DSN,
        release: env.DENO_DEPLOYMENT_ID,
        environment: env.DENO_DEPLOYMENT_ID ? "prod" : "dev",
        debug: env.SENTRY_DEBUG,
        attachStacktrace: true,
        integrations: (integrations) => {
            const disabledIntegrations = [
                // duplicated events are fine
                "Dedupe",
            ];
            return [
                ...integrations.filter((i) => !disabledIntegrations.includes(i.name)),
                Sentry.captureConsoleIntegration({ levels: ["warn", "error", "assert"] }),
                Sentry.requestDataIntegration(),
            ];
        },
    });
}
