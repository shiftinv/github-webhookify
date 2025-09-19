interface Actor {
    id: number;
    login: string;
    display_login?: string;
    gravatar_id: string | null;
    url: string;
    avatar_url: string;
}

interface Commit {
    sha: string;
    author: { email: string; name: string };
    message: string;
    distinct: boolean;
    url: string;
}

export default interface PushEvent {
    id: string;
    type: "PushEvent";
    actor: Actor;
    repo: {
        id: number;
        name: string;
        url: string;
    };
    payload: {
        repository_id: number;
        push_id: number;
        size: number;
        distinct_size: number;
        ref: string;
        head: string;
        before: string;
        commits: Commit[];
    };
    public: boolean;
    created_at: string | null;
    org?: Actor;
}
