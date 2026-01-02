import type { App } from "obsidian";

// Detection-only: no commands are executed here.
export function isTemplaterAvailable(app: App): boolean {
	const plugins = (app as any).plugins;
	const enabled: Set<string> | undefined = plugins?.enabledPlugins;
	return Boolean(enabled?.has("templater-obsidian"));
}

export function isDatacoreAvailable(app: App): boolean {
	const plugins = (app as any).plugins;
	const enabled: Set<string> | undefined = plugins?.enabledPlugins;
	return Boolean(enabled?.has("datacore"));
}
