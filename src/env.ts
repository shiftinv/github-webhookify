export class InvalidBoolError extends Error {}

export function parseBool(value: string): boolean {
    value = value.toLowerCase();
    if (["1", "t", "y", "true"].includes(value)) return true;
    if (["0", "f", "n", "false"].includes(value)) return false;
    throw new InvalidBoolError(`invalid bool value: '${value}'`);
}

function parseRepo(s: string) {
    return /^(?<owner>[^\/]+)\/(?<name>[^\/]+)$/.exec(s)!.groups! as {
        owner: string;
        name: string;
    };
}

function getEnv(key: string, required: false): string | undefined;
function getEnv(key: string, required?: true): string;
function getEnv(key: string, required: boolean = true): string | undefined {
    const value = Deno.env.get(key);
    if (required && value === undefined) {
        throw new Error(`environment variable "${key}" must be set`);
    }
    return value;
}

export default {
    DEBUG: parseBool(getEnv("DEBUG", false) ?? "0"),

    REPO_NAME: parseRepo(getEnv("REPO_NAME", true)),
    TARGET_BRANCH: getEnv("TARGET_BRANCH", true),
    WEBHOOK_URL: getEnv("WEBHOOK_URL", true),
    GITHUB_TOKEN: getEnv("GITHUB_TOKEN", false),

    SENTRY_DSN: getEnv("SENTRY_DSN", false),
    SENTRY_DEBUG: parseBool(getEnv("SENTRY_DEBUG", false) ?? "0"),
    DENO_DEPLOYMENT_ID: getEnv("DENO_DEPLOYMENT_ID", false),
};
