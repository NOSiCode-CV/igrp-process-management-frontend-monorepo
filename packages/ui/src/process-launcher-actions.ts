"use server";

import type { Process } from "@igrp/platform-process-management-types";
import type { IGRPProcessClientConfig } from "./types";
import type {
  IGRPLauncherArea,
  IGRPLauncherProcess,
  IGRPLauncherStartResult,
  IGRPLauncherTaskParams,
} from "./process-launcher-types";
import { getIGRPProcessClient } from "./lib/api-client";

const ACTIVE = "ACTIVE";

/** Numeric view of a version string for "keep latest" comparisons (0 fallback). */
function versionOf(version?: string): number {
  const n = Number.parseInt(version ?? "", 10);
  return Number.isNaN(n) ? 0 : n;
}

function sortByName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function toLauncherProcess(
  p: Process,
  fallbackApp: string,
): IGRPLauncherProcess {
  return {
    id: p.id,
    releaseId: p.releaseId,
    processKey: p.processKey,
    name: p.name?.trim() || p.processKey,
    description: p.description?.trim() || undefined,
    applicationBase: p.applicationBase || fallbackApp,
  };
}

/**
 * List the processes a user can start in `appCode`, grouped by area.
 *
 * Source is `getAreas({ applicationBase })`, whose areas carry their processes
 * nested (`area.process[]`) — the same shape the process-map reads. We keep only
 * ACTIVE processes, dedupe by `processKey` to the latest version, drop empty
 * areas, and sort by name. Returns `[]` when access-management/API is not
 * reachable rather than throwing (the menu just shows "no processes").
 */
export async function listAppProcesses(
  appCode: string,
  config: IGRPProcessClientConfig,
): Promise<IGRPLauncherArea[]> {
  if (!appCode) return [];

  try {
    const client = await getIGRPProcessClient(config);
    // Top-level areas for the app, then their subareas (getAreas({ parentId }),
    // the same call the process-map's getSubareas uses). Fetching the whole
    // hierarchy is what surfaces processes that live under subareas instead of
    // directly on a top area — otherwise the menu shows only areas with direct
    // processes. No `status` filter here: processes are filtered by status below.
    const topResponse = await client.areas.getAreas({
      applicationBase: appCode,
      size: 500,
    });
    type AreaNode = NonNullable<
      Awaited<ReturnType<typeof client.areas.getAreas>>["data"]["content"]
    >[number];
    const byId = new Map<string, AreaNode>();
    for (const a of topResponse.data?.content ?? []) byId.set(a.id, a);

    let frontier = [...byId.values()];
    for (let depth = 0; depth < 4 && frontier.length > 0; depth++) {
      const childLists = await Promise.all(
        frontier.map((a) =>
          client.areas
            .getAreas({ parentId: a.id, size: 500 })
            .then((r) => r.data?.content ?? [])
            .catch(() => [] as AreaNode[]),
        ),
      );
      const next: AreaNode[] = [];
      for (const child of childLists.flat()) {
        if (child?.id && !byId.has(child.id)) {
          byId.set(child.id, child);
          next.push(child);
        }
      }
      frontier = next;
    }

    const areas = [...byId.values()];

    const topAncestorName = (area: (typeof areas)[number]): string => {
      let current = area;
      // Guard against cycles / orphaned parents.
      for (let hops = 0; hops < 12; hops++) {
        const parentId = current.areaId;
        if (!parentId) break;
        const parent = byId.get(parentId);
        if (!parent || parent.id === current.id) break;
        current = parent;
      }
      return current.name;
    };

    const groups: IGRPLauncherArea[] = [];
    for (const area of areas) {
      const active = (area.process ?? []).filter(
        (p) => p.status === ACTIVE && p.processKey,
      );

      // Keep the latest version per processKey — a republish adds a new row.
      const latest = new Map<string, Process>();
      for (const p of active) {
        const cur = latest.get(p.processKey);
        if (!cur || versionOf(p.version) >= versionOf(cur.version)) {
          latest.set(p.processKey, p);
        }
      }

      const processes = [...latest.values()]
        .map((p) => toLauncherProcess(p, area.applicationBase || appCode))
        .sort(sortByName);

      if (processes.length > 0) {
        groups.push({
          id: area.id,
          code: area.code,
          name: area.name,
          groupName: topAncestorName(area),
          processes,
        });
      }
    }

    // Sort by group (top area), then by area name, so the left nav reads in order.
    return groups.sort(
      (a, b) =>
        a.groupName.localeCompare(b.groupName, undefined, {
          sensitivity: "base",
        }) || sortByName(a, b),
    );
  } catch (error) {
    console.warn("[process-launcher] listAppProcesses failed:", error);
    return [];
  }
}

function toMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const details = (error as { details?: string }).details;
    if (details) {
      try {
        const parsed = JSON.parse(details) as { message?: string };
        if (parsed.message) return parsed.message;
      } catch {
        /* fall through */
      }
    }
    const message = (error as { message?: string }).message;
    if (message) return message;
  }
  return "Não foi possível iniciar o processo.";
}

/**
 * Start a process and resolve its first user task, ready to open in the modal.
 *
 * Mirrors the process-map flow: `createAndStartProcess` → look up the instance's
 * tasks → claim the first open one (the engine assigns it to the starter, so a
 * 409 "already assigned" is a success, not an error). When no user task exists
 * yet (async branch, or first task assigned elsewhere) `task` is `null` and the
 * host just shows a toast. Never throws — failures come back as `{ ok: false }`.
 */
export async function startAppProcess(
  input: {
    processKey: string;
    applicationBase: string;
    /** Process definition id — sent alongside the key, as the process-map does. */
    processDefinitionId?: string;
    /** Start priority (1 = Normal, 2 = Urgente). Defaults to 1. */
    priority?: number;
  },
  config: IGRPProcessClientConfig,
): Promise<IGRPLauncherStartResult> {
  try {
    const client = await getIGRPProcessClient(config);

    const started = await client.processes.createAndStartProcess({
      processDefinitionId: input.processDefinitionId,
      processKey: input.processKey,
      applicationBase: input.applicationBase,
      // The backend requires a priority (the process-map always sends one via a
      // modal); default to Normal so the launcher stays a single click.
      priority: input.priority ?? 1,
    });
    const instance = started.data;
    if (!instance?.id) {
      return {
        ok: false,
        error: "O processo não devolveu uma instância válida.",
      };
    }

    let task: IGRPLauncherTaskParams | null = null;
    try {
      const tasksResp = await client.tasks.getTasksByProcessInstance(
        instance.id,
        { size: 50 },
      );
      const tasks = tasksResp.data?.content ?? [];
      const open = tasks.find((t) => !t.endedAt) ?? tasks[0] ?? null;

      if (open?.id && open.taskKey) {
        // The first task is usually already ASSIGNED to the starter → 409 is
        // the expected, benign outcome; anything else we log but still open.
        try {
          await client.tasks.claimTask(open.id, {});
        } catch (claimError) {
          if ((claimError as { status?: number })?.status !== 409) {
            console.warn("[process-launcher] claim failed:", claimError);
          }
        }
        task = {
          processKey: open.processKey || input.processKey,
          processInstanceId: instance.id,
          userTaskInstanceId: open.id,
          userTaskKey: open.taskKey,
        };
      }
    } catch (taskError) {
      console.warn("[process-launcher] resolve first task failed:", taskError);
    }

    return {
      ok: true,
      processInstanceId: instance.id,
      processNumber: instance.number ?? "",
      task,
    };
  } catch (error) {
    console.error("[process-launcher] startAppProcess failed:", error);
    return { ok: false, error: toMessage(error) };
  }
}
