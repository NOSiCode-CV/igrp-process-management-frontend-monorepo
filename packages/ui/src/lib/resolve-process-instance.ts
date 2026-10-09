import type { ProcessInstance } from "@igrp/platform-process-management-types";
import type { getIGRPProcessClient } from "./api-client";
import { IGRPProcessError } from "./process-error";

type ProcessManagementClient = Awaited<ReturnType<typeof getIGRPProcessClient>>;

/** UUID v1–v5 (and nil) — process instance ids from the engine. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True when the route segment looks like a process instance UUID.
 * Otherwise treat it as a business process number (e.g. `MD-2026-1717`).
 */
export function isProcessInstanceUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/**
 * Resolve a consultation/execution ref to a process instance.
 * Accepts either:
 * - process instance UUID → GET /process-instances/{id}
 * - process number (e.g. MD-2026-1717) → search by `number`
 */
export async function resolveProcessInstance(
  client: ProcessManagementClient,
  ref: string,
): Promise<ProcessInstance> {
  const trimmed = ref.trim();
  if (!trimmed) {
    throw new Error("É necessário o id ou o número da instância de processo");
  }

  if (isProcessInstanceUuid(trimmed)) {
    const response = await client.processes.getProcessInstanceById(trimmed);
    return response.data;
  }

  const search = await client.processes.getProcessInstances({
    number: trimmed,
    size: 1,
  });
  const match = search.data?.content?.[0];
  if (!match) {
    throw new IGRPProcessError({
      code: "NOT_FOUND",
      message: `Nenhuma instância de processo encontrada com o número: ${trimmed}`,
      status: 404,
    });
  }
  return match;
}
