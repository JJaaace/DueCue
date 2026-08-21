export type AnonymousTourStatus = "not_started" | "active" | "completed" | "skipped" | "exited" | undefined;

export const shouldLaunchAnonymousTour = (status: AnonymousTourStatus) => !["completed", "skipped", "exited"].includes(status ?? "not_started");
