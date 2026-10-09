# @igrp/process-ui

UI centralizada para gestão de processo IGRP. Permite reutilizar a página de processo, contexto, renderer e ações em vários projetos (ex: INSS, process-management-frontend).

## Conteúdo

- **ProcessPage** – Página de processo com `[...process]` (processKey, processInstanceId, userTaskKey, userTaskInstanceId).
- **IGRPProcessProvider** / **useIGRPProcessContext** – Contexto de processo.
- **ProcessPageRenderer** – Renderer com stepper, botões Guardar/Completar e diálogos.
- **createProcessActions** – Factory para criar ações de processo (fetchStepConfig, callCompleteTask, callSaveTask) injetando o client.
- **Tipos** – StepConfigParams, FetchStepConfigResult, ProcessActions, etc.

## Uso num projeto consumidor

### 1. Server actions (obter client do projeto e criar ações)

No projeto (ex: INSS), criar ficheiro com server actions que usam o client local:

```ts
// src/app/(igrp)/(generated)/process/process-actions.ts
"use server";

import { createProcessActions } from "@igrp/process-ui";
import { getIGRPProcessClient } from "@/lib/api-client";

const actions = createProcessActions(getIGRPProcessClient);

export const fetchStepConfig = actions.fetchStepConfig;
export const callCompleteTask = actions.callCompleteTask;
export const callSaveTask = actions.callSaveTask;
```

### 2. Página de processo (rota `process/[...process]`)

O projeto define a rota e passa `processActions` e o resolver do step (dynamic import local):

```tsx
// src/app/(igrp)/(generated)/process/[...process]/page.tsx
"use client";

import { ProcessPage } from "@igrp/process-ui";
import {
  fetchStepConfig,
  callCompleteTask,
  callSaveTask,
} from "../process-actions";

const processActions = { fetchStepConfig, callCompleteTask, callSaveTask };

export default function Page({
  params,
}: {
  params: Promise<{ process: string[] }>;
}) {
  return (
    <ProcessPage
      params={params}
      processActions={processActions}
      resolveStepComponent={async ({ processKey, version, userTaskKey }) => {
        const mod = await import(`./(${processKey})/${version}/${userTaskKey}`);
        return mod.default;
      }}
      getBackUrl={() =>
        typeof window !== "undefined"
          ? `${window.location.origin}/apps/igrp-process-management/my-tasks`
          : "/"
      }
    />
  );
}
```

Os steps (ex: `(P1.1.1)/v9/Task_pedido.tsx`) continuam no projeto, na mesma pasta da página; apenas a página, o contexto e o renderer vêm do package.

### 3. Dependências no projeto

- `@igrp/process-ui` (este package).
- `@igrp/igrp-framework-react-design-system`.
- Next.js 14+.
- React 18+.

## API resumida

| Export                            | Descrição                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| `ProcessPage`                     | Página completa; recebe `params`, `processActions`, `resolveStepComponent`, `getBackUrl?`. |
| `IGRPProcessProvider`             | Provider com `params` e `processActions`.                                                  |
| `useIGRPProcessContext`           | Hook para aceder ao contexto.                                                              |
| `useIGRPProcess`                  | Hook com estado e ações (usa `processActions`).                                            |
| `createProcessActions(getClient)` | Cria `fetchStepConfig`, `callCompleteTask`, `callSaveTask`.                                |
| `ProcessPageRenderer`             | Renderer configurável com `resolveStepComponent` e `getBackUrl?`.                          |
| `ConfirmationDialog`              | Diálogo de confirmação (sucesso/erro).                                                     |

Tipos: `StepConfigParams`, `FetchStepConfigResult`, `ProcessActions`, `ResolveStepComponentParams`, `StepComponentProps`, `StepComponentConfig`, `StepMethods`, `IGRPGetFormDataForTaskOptions`, `IGRPFormEntry`, etc.

## Ler dados de form do step

O contexto expõe duas funções para ler dados de form persistidos no engine BPMN:

- `getFormDataForTask(opts?)` — dados do step actual.
- `getFormDataByTaskKey(taskKey)` — dados de qualquer step pelo `taskKey`.

### Fallback histórico

Em alguns processos o step actual está vazio mas existe histórico do MESMO
step que o consumidor quer reidratar (ex.: ciclos de _Rectificar_ onde o
utilizador volta a uma etapa anterior). `fallbackToHistory` aceita
**`boolean`** ou **predicate**:

```ts
import { useIGRPProcessContext } from "@igrp/platform-process-management-client-ui";

function MyStep() {
  const { getFormDataForTask } = useIGRPProcessContext();

  // Opção 1: sempre que current está vazio
  const data1 = getFormDataForTask({ fallbackToHistory: true });

  // Opção 2: regra de negócio do consumidor — `vars` são as variáveis BPMN
  // actuais (stepConfig.variables), injectadas pela lib.
  const data2 = getFormDataForTask({
    fallbackToHistory: (vars) => {
      const d = vars.find((v) => v.name === "decision")?.value;
      return (
        typeof d === "string" &&
        ["RECTIFICAR", "RETIFICAR"].includes(d.toUpperCase())
      );
    },
  });

  // ...
}
```

**Comportamento da lib (mecanismo apenas, sem regras de negócio):**

1. Lê dados do step actual (variável `${userTaskInstanceId}_forms`).
2. Se current está vazio (`undefined` / `null` / `[]`):
   - Se `opts.fallbackToHistory === true`, OU
   - Se `opts.fallbackToHistory(stepConfig.variables) === true`,
   - → Carrega via `getFormDataByTaskKey(userTaskKey)` (latest activity
     progress).
3. Caso contrário, devolve o current original.

> **Decisão arquitectural:** a lib **não** conhece nomes de variáveis BPMN
> nem valores de decisão (`RECTIFICAR`, `RETIFICAR`, etc.). A predicate é o
> mecanismo para o consumidor injectar regras de negócio sem ter de ir
> buscar variables ao contexto.

**Retro-compatibilidade:** chamadas sem args (`getFormDataForTask()`) mantêm
**exactamente** o comportamento legacy — sem fallback.

## Process Management app URLs (`processManagementAppHref`)

One env: the Process Management **app** base (not the API). The lib concatenates
`/my-tasks`, `/available-tasks` and `/process-map`. A legacy value that still
ends with one of those paths is stripped to the base.

```ts
import {
  processManagementAppHref,
  processManagementAppUrls,
} from "@igrp/platform-process-management-client-ui";

const app = process.env.IGRP_APP_PAGE_TASK; // e.g. https://host/apps/igrp-process-management

const config = {
  baseUrl: process.env.PROCESS_MANAGEMENT_CLIENT_BASE_URL ?? "",
  accessToken: token?.accessToken ?? null,
  taskReturnUrl: processManagementAppHref("my-tasks", app),
  summaryPage: "/process/resumo",
};

const { myTasksUrl, availableTasksUrl, processMapUrl } =
  processManagementAppUrls(app);
```

## Summary page after complete (`config.summaryPage`)

When the consuming app sets `summaryPage` on `IGRPProcessClientConfig`
(e.g. `/process/resumo`), a successful complete navigates to
`{summaryPage}/{processInstanceId}` and does **not** show the success
dialog. Omit the field to keep the green modal (Voltar / `returnUrl` /
`taskReturnUrl`).

```ts
const config = {
  baseUrl: process.env.PROCESS_MANAGEMENT_CLIENT_BASE_URL ?? "",
  accessToken: token?.accessToken ?? null,
  taskReturnUrl: processManagementAppHref(
    "my-tasks",
    process.env.IGRP_APP_PAGE_TASK,
  ),
  summaryPage: "/process/resumo",
};
```

## IN_APP after complete (`igrp-task-next`)

`callCompleteTask` sends a best-effort **IN_APP** notification after
`POST /complete` succeeds. Assignee → `recipients: [{ userId }]`. Sem
assignee → `groups: [{ roleCode }]` with `candidateGroups` **as the BPMN
stores them**. A Notification Service failure never fails the complete.

`IGRP_NOTIFY_NEXT_TASK` defaults to **true** (unset = on). Only
`IGRP_NOTIFY_NEXT_TASK=false` disables. Also requires Notification Service
env (M2M). The skip that ignored the completer when they own the next
step is commented out.

Env (Process Management identity — **not** the consumer app):

| Variable                                                        | Role                                                                        |
| --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `IGRP_NOTIFY_NEXT_TASK`                                         | default on; set `false` to disable                                          |
| `NOTIFICATION_SERVICE_BASE_URL`                                 | Notification Service                                                        |
| `IGRP_ACCESS_MANAGEMENT_API` or `IGRP_AUTH_ISSUER`              | M2M token endpoint                                                          |
| `IGRP_M2M_PROCESS_CLIENT_ID` / `IGRP_M2M_PROCESS_CLIENT_SECRET` | `client_credentials` of the **Process Management** AM client                |
| `IGRP_PROCESS_APP_CODE`                                         | optional — `applicationCode` on send; defaults to `IGRP_PROCESS_MANAGEMENT` |
| `IGRP_SERVICE_ID`                                               | optional `X-Machine-Service-ID`                                             |

The task-next notification is sent under the **Process Management**
application identity, not the consumer app (e.g. INSS Core). The M2M client
must be an Access Management client bound to `IGRP_PROCESS_MANAGEMENT`, so its
token carries `application_code=IGRP_PROCESS_MANAGEMENT` — which is what the
Notification Service uses to resolve the template **and** to scope recipient /
inbox tenancy. These are dedicated vars with **no fallback** to the consumer's
`IGRP_M2M_CLIENT_*` / `IGRP_APP_CODE`; if any is missing the send is skipped
(best-effort, logged as a warning).

Template: IN_APP title is the **task name** (`inline.title`). The send uses
`inline`, so publishing `igrp-task-next` (IN_APP, `pt-CV`) is optional for now;
switching to a published template is a later step once it is published under
`IGRP_PROCESS_MANAGEMENT`.
