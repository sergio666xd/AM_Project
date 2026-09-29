import { sleep } from "@workflow/core";

export async function workflowProbe() {
  "use workflow";

  await sleep("5s");
  return { value: 7 };
}