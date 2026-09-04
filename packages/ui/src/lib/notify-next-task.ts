import {
  Channel,
  ChannelStrategy,
  ClientCredentialsTokenProvider,
  NotificationClient,
} from "@igrp/platform-notification-client-ts";
import type {
  ActivityProgress,
  Task,
} from "@igrp/platform-process-management-types";

import type { getIGRPProcessClient } from "./api-client";
import { resolveProcessInstance } from "./resolve-process-instance";

type ProcessManagementClient = Awaited<ReturnType<typeof getIGRPProcessClient>>;

export const IGRP_TASK_NEXT_TEMPLATE_CODE = "igrp-task-next";
export const IGRP_TASK_NEXT_TEMPLATE_LOCALE = "pt-CV";
export const IGRP_TASK_NEXT_CATEGORY = "igrp-task-next";

/**
 * Default `applicationCode` for the task-next send when `IGRP_PROCESS_APP_CODE`
 * is unset. In M2M the server ignores this field (it derives the app from the
 * token's `application_code` claim), so it only affects the request payload and
 * logs — hence a sensible constant default instead of a required env var. Set
 * `IGRP_PROCESS_APP_CODE` to override if the AM application code differs.
 */
export const IGRP_PROCESS_MANAGEMENT_APP_CODE = "IGRP_PROCESS_MANAGEMENT";

const LOG_PREFIX = "[igrp-task-next]";
const CURRENT_STATUSES = new Set(["CURRENT", "ASSIGNED", "ACTIVE"]);

export interface NotifyNextTaskContext {
  completedUserTaskInstanceId: string;
  processInstanceId?: string;
  processKey?: string;
  processName?: string;
  processNumber?: string;
}

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

/**
 * Feature flag. Default **true** when unset / empty / any value other than
 * `"false"`. Set `IGRP_NOTIFY_NEXT_TASK=false` to disable.
 */
function isNotifyNextTaskEnabled(): boolean {
  return readEnv("IGRP_NOTIFY_NEXT_TASK").toLowerCase() !== "false";
}

/**
 * Config / access to the Notification Service (M2M).
 *
 * The task-next notification is a Process Management feature, so it is sent
 * under the **Process Management** application identity — NOT the consumer
 * app (e.g. INSS Core). The M2M client below must be an Access Management
 * client bound to the `IGRP_PROCESS_MANAGEMENT` application: its
 * `client_credentials` token carries `application_code=IGRP_PROCESS_MANAGEMENT`,
 * which is what the Notification Service uses to resolve templates AND to
 * scope recipient/inbox tenancy. These are dedicated env vars (no fallback to
 * the consumer's `IGRP_M2M_CLIENT_*` / `IGRP_APP_CODE`).
 *
 * Required env:
 * - NOTIFICATION_SERVICE_BASE_URL
 * - IGRP_M2M_PROCESS_CLIENT_ID / IGRP_M2M_PROCESS_CLIENT_SECRET (Process Management client)
 * - IGRP_ACCESS_MANAGEMENT_API or IGRP_AUTH_ISSUER
 *
 * Optional env:
 * - IGRP_PROCESS_APP_CODE (defaults to `IGRP_PROCESS_MANAGEMENT_APP_CODE`)
 */
function hasNotificationAccess(): boolean {
  const hasNsUrl = Boolean(readEnv("NOTIFICATION_SERVICE_BASE_URL"));
  const hasM2m =
    Boolean(readEnv("IGRP_M2M_PROCESS_CLIENT_ID")) &&
    Boolean(readEnv("IGRP_M2M_PROCESS_CLIENT_SECRET"));
  const hasAuth =
    Boolean(readEnv("IGRP_ACCESS_MANAGEMENT_API")) ||
    Boolean(readEnv("IGRP_AUTH_ISSUER"));
  return hasNsUrl && hasM2m && hasAuth;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isCurrentActivity(activity: ActivityProgress): boolean {
  return CURRENT_STATUSES.has((activity.status ?? "").toUpperCase());
}

function resolveActivityUserId(activity: ActivityProgress): string | undefined {
  const userId =
    activity.userProfileAssignee?.id?.trim() || activity.assignee?.trim();
  return userId || undefined;
}

function resolveTaskUserId(task: Task): string | undefined {
  return (task as Task & { assignee?: string }).assignee?.trim() || undefined;
}

function splitGroups(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value.join(",") : value;
  return raw
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Subject/title/body for IN_APP — title is the task name, not a generic label. */
export function buildTaskNextInline(input: {
  taskName: string;
  processName?: string;
  processNumber?: string;
}) {
  const taskName = input.taskName.trim() || "Tarefa";
  const processName = input.processName?.trim() || "";
  const processNumber = input.processNumber?.trim() || "";
  const subject = processNumber ? `${taskName} · ${processNumber}` : taskName;
  const processBit = processNumber
    ? `processo ${processNumber}${processName ? ` (${processName})` : ""}`
    : processName || "um processo";
  return {
    subject,
    title: taskName,
    body: `Tem uma nova tarefa no ${processBit}: ${taskName}.`,
  };
}

/**
 * NS RF-04/RF-05: exactly one of `template` or `inline` — never both.
 * Send inline so IN_APP title is the task name (not a published template
 * hardcoded as "Nova tarefa").
 */
async function sendTaskNextNotification(
  notificationClient: NotificationClient,
  input: {
    applicationCode: string;
    businessKey: string;
    userId?: string;
    groups: string[];
    variables: {
      taskName: string;
      processName: string;
      numeroProcesso: string;
      processKey: string;
    };
    idempotencyKey: string;
    inline: ReturnType<typeof buildTaskNextInline>;
  },
) {
  const shared = {
    applicationCode: input.applicationCode,
    businessKey: input.businessKey,
    category: IGRP_TASK_NEXT_CATEGORY,
    channelStrategy: ChannelStrategy.SPECIFIC,
    channels: [Channel.IN_APP],
    recipients: input.userId ? [{ userId: input.userId }] : undefined,
    groups:
      !input.userId && input.groups.length > 0
        ? input.groups.map((roleCode) => ({ roleCode }))
        : undefined,
    variables: input.variables,
    idempotencyKey: input.idempotencyKey,
  };

  return await notificationClient.notifications.send({
    ...shared,
    inline: input.inline,
  });
}

let m2mTokenProvider: ClientCredentialsTokenProvider | undefined;

function getM2MTokenProvider(): ClientCredentialsTokenProvider {
  if (m2mTokenProvider) return m2mTokenProvider;

  const authBaseUrl =
    readEnv("IGRP_ACCESS_MANAGEMENT_API") || readEnv("IGRP_AUTH_ISSUER");
  m2mTokenProvider = new ClientCredentialsTokenProvider(
    authBaseUrl,
    readEnv("IGRP_M2M_PROCESS_CLIENT_ID"),
    readEnv("IGRP_M2M_PROCESS_CLIENT_SECRET"),
  );
  return m2mTokenProvider;
}

async function getNotificationM2MClient(): Promise<NotificationClient> {
  const accessToken = await getM2MTokenProvider().getAccessToken();
  return NotificationClient.create(
    {
      baseUrl: readEnv("NOTIFICATION_SERVICE_BASE_URL"),
      timeout: 30000,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    {
      serviceId: readEnv("IGRP_SERVICE_ID") || undefined,
    },
  );
}

async function loadUserTaskProgress(
  client: ProcessManagementClient,
  processInstanceId: string,
): Promise<ActivityProgress[]> {
  const activityProgress = await client.activities.getActivityProgress(
    processInstanceId,
    "USER_TASK",
  );
  return (activityProgress.data ?? []).filter(
    (item) => item.type === "USER_TASK",
  );
}

async function loadOpenTasks(
  client: ProcessManagementClient,
  processInstanceId: string,
): Promise<Task[]> {
  try {
    const response = await client.tasks.getTasksByProcessInstance(
      processInstanceId,
      { size: 50 },
    );
    return (response.data?.content ?? []).filter(
      (task) => task.status === "ASSIGNED" || task.status === "CREATED",
    );
  } catch (error) {
    console.warn(`${LOG_PREFIX} could not list tasks`, error);
    return [];
  }
}

/**
 * Best-effort IN_APP to the assignee of the next user-task.
 * Never throws — complete must succeed even if Notification Service is down.
 */
export async function notifyNextTaskInApp(
  client: ProcessManagementClient,
  context: NotifyNextTaskContext,
): Promise<void> {
  try {
    if (!isNotifyNextTaskEnabled()) {
      console.warn(`${LOG_PREFIX} skip: IGRP_NOTIFY_NEXT_TASK=false`);
      return;
    }

    // Config: M2M credentials to call Notification Service.
    if (!hasNotificationAccess()) {
      console.warn(
        `${LOG_PREFIX} skip: missing Notification Service access env`,
      );
      return;
    }

    let processInstanceId = context.processInstanceId?.trim() ?? "";
    let processKey = context.processKey?.trim() ?? "";
    let processName = context.processName?.trim() ?? "";
    let processNumber = context.processNumber?.trim() ?? "";

    if (!processInstanceId) {
      const completed = await client.tasks.getTaskById(
        context.completedUserTaskInstanceId,
      );
      processInstanceId = completed.data.processInstanceId ?? "";
      processKey = processKey || completed.data.processKey || "";
      processName = processName || completed.data.processName || "";
      processNumber = processNumber || completed.data.processNumber || "";
    }

    if (!processInstanceId) {
      console.warn(`${LOG_PREFIX} skip: missing processInstanceId`);
      return;
    }

    const processInstance = await resolveProcessInstance(
      client,
      processInstanceId,
    );
    const canonicalInstanceId = processInstance.id;
    processKey =
      processKey || processInstance.procReleaseKey || context.processKey || "";
    processName = processName || processInstance.name || "";
    processNumber = processNumber || processInstance.number || "";

    let progress = await loadUserTaskProgress(client, canonicalInstanceId);
    let nextTasks = progress.filter(isCurrentActivity);
    if (nextTasks.length === 0) {
      await delay(400);
      progress = await loadUserTaskProgress(client, canonicalInstanceId);
      nextTasks = progress.filter(isCurrentActivity);
    }

    const openTasks = await loadOpenTasks(client, canonicalInstanceId);
    if (nextTasks.length === 0 && openTasks.length > 0) {
      nextTasks = openTasks.map((task) => ({
        activityId: task.taskKey,
        activityName: task.name,
        activityInstanceId: task.id,
        status: task.status,
        assignee: resolveTaskUserId(task),
        candidateGroups: task.candidateGroups,
        type: "USER_TASK",
      }));
    }

    if (nextTasks.length === 0) {
      console.warn(
        `${LOG_PREFIX} skip: no CURRENT/ASSIGNED next task for ${processNumber || canonicalInstanceId}`,
      );
      return;
    }

    const applicationCode =
      readEnv("IGRP_PROCESS_APP_CODE") || IGRP_PROCESS_MANAGEMENT_APP_CODE;
    const notificationClient = await getNotificationM2MClient();
    let sent = 0;

    for (const next of nextTasks) {
      const matchingTask = openTasks.find(
        (task) =>
          task.id === next.activityInstanceId ||
          task.taskKey === next.activityId,
      );
      const userId =
        resolveActivityUserId(next) ||
        (matchingTask ? resolveTaskUserId(matchingTask) : undefined);
      // BPMN `candidateGroups` is a comma-separated string — use the tokens
      // as-is (`roleCode`). Do not remap to department codes.
      const groups = splitGroups(
        next.candidateGroups ?? matchingTask?.candidateGroups,
      );

      if (!userId && groups.length === 0) {
        console.warn(
          `${LOG_PREFIX} skip: next task "${next.activityName || next.activityId}" has no assignee or candidateGroups`,
        );
        continue;
      }

      // Disregarded: do not skip when the next assignee is the user who just
      // completed (they still "have access" to the next etapa).
      // if (completedBy && userId === completedBy) {
      //   console.warn(
      //     `${LOG_PREFIX} skip: next task "${next.activityName}" is assigned to the completer`,
      //   );
      //   continue;
      // }

      const taskName = next.activityName || matchingTask?.name || "Tarefa";
      const businessKey = processNumber || canonicalInstanceId;
      const inline = buildTaskNextInline({
        taskName,
        processName,
        processNumber: businessKey,
      });

      const response = await sendTaskNextNotification(notificationClient, {
        applicationCode,
        businessKey,
        userId,
        groups,
        variables: {
          taskName,
          processName,
          numeroProcesso: businessKey,
          processKey,
        },
        idempotencyKey: `igrp-task-next:${next.activityInstanceId || matchingTask?.id || `${businessKey}:${next.activityId}:${userId || groups.join("+")}`}`,
        inline,
      });
      sent += 1;
      console.warn(`${LOG_PREFIX} sent`, {
        notificationId: response.data.id,
        userId,
        roleCodes: userId ? undefined : groups,
        taskName,
        businessKey,
        applicationCode,
      });
    }

    if (sent === 0) {
      console.warn(
        `${LOG_PREFIX} no IN_APP sent for ${processNumber || canonicalInstanceId}`,
      );
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} notify failed`, error);
  }
}
