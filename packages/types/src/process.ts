import { TaskAssignmentMode, TaskStatus, TaskVariables } from "./task";
import { UserProfile } from "./shared";

/** ProcessInstanceDTO.status */
export type ProcessStatus =
  | "CREATED"
  | "RUNNING"
  | "SUSPENDED"
  | "CANCELED"
  | "COMPLETED";

/**
 * Area-associated process definition (ProcessDefinitionDTO) plus optional
 * deployment/list fields used across the UI.
 */
export type Process = {
  id: string;
  processKey: string;
  name?: string;
  description?: string;
  releaseId: string;
  areaId: string;
  status: string;
  statusDesc: string;
  version: string;
  createdAt: string;
  updatedAt?: string;
  createdBy: string;
  updatedBy?: string;
  removedAt?: string | null;
  removedBy?: string | null;
  applicationBase?: string;
  deploymentId?: string;
  candidateGroups?: string;
};

/** ProcessDeploymentListDTO — GET /process-definitions list item */
export type ProcessDeploymentListItem = {
  id: string;
  processKey: string;
  name?: string;
  description?: string;
  version?: string;
  deploymentId?: string;
  applicationBase?: string;
  candidateGroups?: string;
};

export type ProcessFilter = {
  applicationBase?: string;
  processName?: string;
  page?: number;
  size?: number;
  filterByCurrentUser?: boolean;
  candidateGroups?: string;
};

/** ProcessVariableDTO */
export type ProcessVariable = {
  name: string;
  value: unknown;
};

/** ProcessTaskAssignmentRuleDTO — start-time assignment rules */
export interface ProcessTaskAssignmentRuleRequest {
  taskKey: string;
  assignee?: string;
  candidateUsers?: string;
  candidateGroups?: string;
  assignmentMode?: TaskAssignmentMode;
  priority?: number;
}

/** ProcessInstanceDTO */
export type ProcessInstance = {
  id: string;
  procReleaseKey: string;
  procReleaseId: string;
  number: string;
  status: ProcessStatus;
  statusDesc: string;
  businessKey?: string;
  version: string;
  startedAt: string;
  startedBy: string;
  endedAt: string;
  endedBy: string;
  canceledAt: string;
  /** OpenAPI field spelling */
  cancelledBy: string;
  /** @deprecated use cancelledBy — kept for back-compat with older payloads */
  canceledBy?: string;
  priority: number;
  obsCancel: string;
  applicationBase: string;
  name: string;
  progress: string;
  variables: Array<TaskVariables | ProcessVariable>;
  userProfileStartedBy?: UserProfile;
  userProfileEndedBy?: UserProfile;
  userProfileCancelledBy?: UserProfile;
};

/** CreateProcessRequestDTO — POST /process-instances/create */
export interface CreateProcessInstanceRequest {
  processDefinitionId?: string;
  processKey: string;
  applicationBase: string;
  priority?: number;
  businessKey?: string;
}

/**
 * StartProcessRequestDTO — POST /process-instances (create + start).
 * Also used as the expanded create-and-start body.
 */
export interface CreateAndStartProcessRequest {
  processDefinitionId?: string;
  processKey: string;
  applicationBase: string;
  priority?: number;
  businessKey?: string;
  variables?: Array<ProcessVariable>;
  assignmentRules?: ProcessTaskAssignmentRuleRequest[];
}

/**
 * ProcessVariablesRequestDTO — POST /process-instances/{id}/start
 */
export interface StartProcessInstanceRequest {
  variables?: Array<ProcessVariable>;
  assignmentRules?: ProcessTaskAssignmentRuleRequest[];
}

/**
 * CancelProcessInstanceDTO — POST /process-instances/{id}/cancel
 */
export interface CancelProcessInstanceRequest {
  obsCancel?: string;
}

/** ProcessArtifactRequestDTO (+ key for client path helper) */
export interface CreateProcessArtifactRequest {
  name: string;
  key: string;
  formKey: string;
  candidateGroups?: string;
  dueDate?: string;
  priority?: number;
}

/** ProcessArtifactDTO */
export interface ProcessArtifact {
  id: string;
  name: string;
  key: string;
  processDefinitionId: string;
  formKey: string;
  candidateGroups?: string;
  dueDate?: string;
  priority?: number;
}

export interface ProcessDefinition {
  id: string;
  processKey: string;
  name: string;
  description: string;
  version: string;
  deploymentId: string;
  applicationBase: string;
  candidateGroups: string;
}

/** ProcessSequenceDTO */
export interface ProcessSequence {
  id: string;
  name: string;
  prefix: string;
  checkDigitSize: number;
  padding: number;
  dateFormat: string;
  nextNumber: number;
  numberIncrement: number;
  processDefinitionKey: string;
  separator?: string;
  /** @deprecated use processDefinitionKey */
  processDefinitionId?: string;
}

/** SequenceRequestDTO */
export interface CreateProcessSequenceRequest {
  name: string;
  prefix: string;
  dateFormat: string;
  checkDigitSize: number;
  padding: number;
  numberIncrement?: number;
  separator?: string;
}

export type ProcessStats = {
  totalProcessInstances: number;
  totalCreatedProcess: number;
  totalRunningProcess: number;
  totalCompletedProcess: number;
  totalSuspendedProcess: number;
  totalCanceledProcess: number;
};

export interface ProcessDefinitionSchema {
  processKey: string;
  processName: string;
  processVersion: string;
  processDescription: string;
  bpmnXml: string;
  applicationBase: string;
  artifacts: ProcessArtifact[];
  sequence: ProcessSequence;
  candidateGroups: string;
}

/** TaskPriorityDTO */
export interface Priority {
  code: string;
  label: string;
  weight: number;
  id?: string;
  processDefinitionKey?: string;
  color?: string;
}

/** TaskPriorityRequestDTO — body for PUT priorities (path-scoped) */
export interface TaskPriorityRequest {
  code: string;
  label: string;
  weight: number;
  id?: string;
  color?: string;
}

/** ProcessEventDTO — POST /process-instances/event */
export interface ProcessEventDTO {
  messageName: string;
  taskId?: string;
  businessKey?: string;
  variables?: Array<ProcessVariable>;
}

/** TimerRescheduleDTO — POST /process-instances/{id}/timer/reschedule */
export interface TimerRescheduleDTO {
  elementId?: string;
  seconds: number;
}

/** ProcessDeploymentRequestDTO — POST /process-definitions/deploy */
export interface ProcessDeploymentRequestDTO {
  name?: string;
  description?: string;
  key: string;
  resourceName: string;
  bpmnXml: string;
  applicationBase: string;
}

/** ProcessDeploymentDTO — deploy response */
export interface ProcessDeploymentDTO {
  key?: string;
  name?: string;
  description?: string;
  version?: string;
  bpmnXml?: string;
  bpmnUrl?: string;
  bpmnSourceType?: string;
  resourceName?: string;
  deployed?: boolean;
  deploymentId?: string;
  deployedAt?: string;
  applicationBase?: string;
}

/** ProcessInstanceTaskStatusDTO */
export interface ProcessInstanceTaskStatus {
  taskKey: string;
  name?: string;
  status?: TaskStatus;
}
