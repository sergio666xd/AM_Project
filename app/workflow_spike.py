from vercel import workflow

wf = workflow.Workflows()


@wf.workflow
async def workflow_spike_ping() -> dict[str, int]:
    await workflow.sleep("5s")
    return {"value": 7}