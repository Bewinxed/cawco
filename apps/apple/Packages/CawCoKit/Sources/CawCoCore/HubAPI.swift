public import CawCoAPI

/// Thin feature-scoped access to the generated contract. Inputs and outputs
/// remain generated types, including non-success statuses and binary bodies.
/// Obtain this from `try hub.api`; every call uses that hub's address.
public struct HubAPI: Sendable {
    let client: Client
    public var projects: Projects { Projects(client: client) }
    public var machines: Machines { Machines(client: client) }
    public var instances: Instances { Instances(client: client) }
    public var usage: Usage { Usage(client: client) }
    public var workflows: Workflows { Workflows(client: client) }
    public var fleet: Configuration { Configuration(client: client) }
    public var rules: Rules { Rules(client: client) }
    public var models: Models { Models(client: client) }
    public var supervisor: Supervisor { Supervisor(client: client) }
    public var search: Search { Search(client: client) }
    public var delegates: Delegates { Delegates(client: client) }
    public var tools: Tools { Tools(client: client) }

    public struct Projects: Sendable {
        let client: Client
        public func list(_ input: Operations.GetApiProjects.Input = .init()) async throws -> Operations.GetApiProjects.Output { try await client.getApiProjects(input) }
        public func create(_ input: Operations.PostApiProjects.Input) async throws -> Operations.PostApiProjects.Output { try await client.postApiProjects(input) }
        public func delete(_ input: Operations.DeleteApiProjectsById.Input) async throws -> Operations.DeleteApiProjectsById.Output { try await client.deleteApiProjectsById(input) }
    }
    public struct Machines: Sendable {
        let client: Client
        public func list(_ input: Operations.GetApiAgents.Input = .init()) async throws -> Operations.GetApiAgents.Output { try await client.getApiAgents(input) }
        public func remove(_ input: Operations.DeleteApiAgentsByMachineId.Input) async throws -> Operations.DeleteApiAgentsByMachineId.Output { try await client.deleteApiAgentsByMachineId(input) }
        public func inspect(_ input: Operations.PostApiAgentsByMachineIdInspect.Input) async throws -> Operations.PostApiAgentsByMachineIdInspect.Output { try await client.postApiAgentsByMachineIdInspect(input) }
        public func image(_ input: Operations.GetApiAgentsByMachineIdImage.Input) async throws -> Operations.GetApiAgentsByMachineIdImage.Output { try await client.getApiAgentsByMachineIdImage(input) }
        public func busy(_ input: Operations.GetApiAgentsByMachineIdBusy.Input) async throws -> Operations.GetApiAgentsByMachineIdBusy.Output { try await client.getApiAgentsByMachineIdBusy(input) }
        public func update(_ input: Operations.PostApiAgentsByMachineIdUpdate.Input) async throws -> Operations.PostApiAgentsByMachineIdUpdate.Output { try await client.postApiAgentsByMachineIdUpdate(input) }
        public func join(_ input: Operations.GetApiJoin.Input = .init()) async throws -> Operations.GetApiJoin.Output { try await client.getApiJoin(input) }
        public func connectSSH(_ input: Operations.PostApiMachinesSsh.Input) async throws -> Operations.PostApiMachinesSsh.Output { try await client.postApiMachinesSsh(input) }
        public func sshStatus(_ input: Operations.GetApiMachinesSshById.Input) async throws -> Operations.GetApiMachinesSshById.Output { try await client.getApiMachinesSshById(input) }
    }
    public struct Instances: Sendable {
        let client: Client
        public func list(_ input: Operations.GetApiInstances.Input = .init()) async throws -> Operations.GetApiInstances.Output { try await client.getApiInstances(input) }
        public func update(_ input: Operations.PatchApiInstancesById.Input) async throws -> Operations.PatchApiInstancesById.Output { try await client.patchApiInstancesById(input) }
        public func remove(_ input: Operations.DeleteApiInstancesById.Input) async throws -> Operations.DeleteApiInstancesById.Output { try await client.deleteApiInstancesById(input) }
        public func titles(_ input: Operations.PostApiInstancesTitles.Input) async throws -> Operations.PostApiInstancesTitles.Output { try await client.postApiInstancesTitles(input) }
        public func tooling(_ input: Operations.GetApiInstancesByIdTooling.Input) async throws -> Operations.GetApiInstancesByIdTooling.Output { try await client.getApiInstancesByIdTooling(input) }
        public func transcript(_ input: Operations.GetApiInstancesByIdTranscript.Input) async throws -> Operations.GetApiInstancesByIdTranscript.Output { try await client.getApiInstancesByIdTranscript(input) }
        public func prepareContinuation(_ input: Operations.GetApiInstancesByIdContinue.Input) async throws -> Operations.GetApiInstancesByIdContinue.Output { try await client.getApiInstancesByIdContinue(input) }
        public func continueSession(_ input: Operations.PostApiInstancesByIdContinue.Input) async throws -> Operations.PostApiInstancesByIdContinue.Output { try await client.postApiInstancesByIdContinue(input) }
        public func continuations(_ input: Operations.GetApiContinuations.Input = .init()) async throws -> Operations.GetApiContinuations.Output { try await client.getApiContinuations(input) }
        public func cancelContinuation(_ input: Operations.DeleteApiContinuationsById.Input) async throws -> Operations.DeleteApiContinuationsById.Output { try await client.deleteApiContinuationsById(input) }
        public func openPreview(_ input: Operations.PostApiInstancesByIdPreview.Input) async throws -> Operations.PostApiInstancesByIdPreview.Output { try await client.postApiInstancesByIdPreview(input) }
        public func closePreview(_ input: Operations.DeleteApiInstancesByIdPreview.Input) async throws -> Operations.DeleteApiInstancesByIdPreview.Output { try await client.deleteApiInstancesByIdPreview(input) }
        public func generateImage(_ input: Operations.PostApiInstancesByIdGenerateImage.Input) async throws -> Operations.PostApiInstancesByIdGenerateImage.Output { try await client.postApiInstancesByIdGenerateImage(input) }
        public func media(_ input: Operations.GetApiMediaByName.Input) async throws -> Operations.GetApiMediaByName.Output { try await client.getApiMediaByName(input) }
        public func markSeen(_ input: Operations.PostApiSeen.Input) async throws -> Operations.PostApiSeen.Output { try await client.postApiSeen(input) }
        public func pending(_ input: Operations.GetApiPending.Input = .init()) async throws -> Operations.GetApiPending.Output { try await client.getApiPending(input) }
        public func handoffs(_ input: Operations.GetApiHandoffs.Input = .init()) async throws -> Operations.GetApiHandoffs.Output { try await client.getApiHandoffs(input) }
    }
    public struct Usage: Sendable {
        let client: Client
        public func limits(_ input: Operations.GetApiUsageLimits.Input = .init()) async throws -> Operations.GetApiUsageLimits.Output { try await client.getApiUsageLimits(input) }
        public func spend(_ input: Operations.GetApiUsageSpend.Input = .init()) async throws -> Operations.GetApiUsageSpend.Output { try await client.getApiUsageSpend(input) }
        public func summary(_ input: Operations.GetApiUsageSummary.Input) async throws -> Operations.GetApiUsageSummary.Output { try await client.getApiUsageSummary(input) }
        public func history(_ input: Operations.GetApiUsageLimitsHistory.Input) async throws -> Operations.GetApiUsageLimitsHistory.Output { try await client.getApiUsageLimitsHistory(input) }
    }
    public struct Workflows: Sendable {
        let client: Client
        public func list(_ input: Operations.GetApiWorkflows.Input = .init()) async throws -> Operations.GetApiWorkflows.Output { try await client.getApiWorkflows(input) }
        public func create(_ input: Operations.PostApiWorkflows.Input) async throws -> Operations.PostApiWorkflows.Output { try await client.postApiWorkflows(input) }
        public func read(_ input: Operations.GetApiWorkflowsById.Input) async throws -> Operations.GetApiWorkflowsById.Output { try await client.getApiWorkflowsById(input) }
        public func update(_ input: Operations.PutApiWorkflowsById.Input) async throws -> Operations.PutApiWorkflowsById.Output { try await client.putApiWorkflowsById(input) }
        public func delete(_ input: Operations.DeleteApiWorkflowsById.Input) async throws -> Operations.DeleteApiWorkflowsById.Output { try await client.deleteApiWorkflowsById(input) }
        public func runs(_ input: Operations.GetApiWorkflowsByIdRuns.Input) async throws -> Operations.GetApiWorkflowsByIdRuns.Output { try await client.getApiWorkflowsByIdRuns(input) }
        public func launch(_ input: Operations.PostApiWorkflowsByIdRuns.Input) async throws -> Operations.PostApiWorkflowsByIdRuns.Output { try await client.postApiWorkflowsByIdRuns(input) }
        public func run(_ input: Operations.GetApiWorkflowRunsById.Input) async throws -> Operations.GetApiWorkflowRunsById.Output { try await client.getApiWorkflowRunsById(input) }
        public func log(_ input: Operations.GetApiWorkflowRunsByIdLog.Input) async throws -> Operations.GetApiWorkflowRunsByIdLog.Output { try await client.getApiWorkflowRunsByIdLog(input) }
        public func cancel(_ input: Operations.PostApiWorkflowRunsByIdCancel.Input) async throws -> Operations.PostApiWorkflowRunsByIdCancel.Output { try await client.postApiWorkflowRunsByIdCancel(input) }
        public func answer(_ input: Operations.PostApiWorkflowRunsByIdAnswer.Input) async throws -> Operations.PostApiWorkflowRunsByIdAnswer.Output { try await client.postApiWorkflowRunsByIdAnswer(input) }
        public func steer(_ input: Operations.PostApiWorkflowRunsByIdSteer.Input) async throws -> Operations.PostApiWorkflowRunsByIdSteer.Output { try await client.postApiWorkflowRunsByIdSteer(input) }
        public func rerun(_ input: Operations.PostApiWorkflowRunsByIdRerun.Input) async throws -> Operations.PostApiWorkflowRunsByIdRerun.Output { try await client.postApiWorkflowRunsByIdRerun(input) }
    }
    public struct Configuration: Sendable {
        let client: Client
        public func read(_ input: Operations.GetApiFleet.Input = .init()) async throws -> Operations.GetApiFleet.Output { try await client.getApiFleet(input) }
        public func sync(_ input: Operations.PostApiFleetSync.Input) async throws -> Operations.PostApiFleetSync.Output { try await client.postApiFleetSync(input) }
        public func putMCP(_ input: Operations.PutApiFleetMcpByName.Input) async throws -> Operations.PutApiFleetMcpByName.Output { try await client.putApiFleetMcpByName(input) }
        public func deleteMCP(_ input: Operations.DeleteApiFleetMcpByName.Input) async throws -> Operations.DeleteApiFleetMcpByName.Output { try await client.deleteApiFleetMcpByName(input) }
        public func signInMCP(_ input: Operations.PostApiFleetMcpByNameSignIn.Input) async throws -> Operations.PostApiFleetMcpByNameSignIn.Output { try await client.postApiFleetMcpByNameSignIn(input) }
        public func completeOAuth(_ input: Operations.PostApiFleetMcpOauthComplete.Input) async throws -> Operations.PostApiFleetMcpOauthComplete.Output { try await client.postApiFleetMcpOauthComplete(input) }
        public func putMarketplace(_ input: Operations.PutApiFleetMarketplacesByName.Input) async throws -> Operations.PutApiFleetMarketplacesByName.Output { try await client.putApiFleetMarketplacesByName(input) }
        public func deleteMarketplace(_ input: Operations.DeleteApiFleetMarketplacesByName.Input) async throws -> Operations.DeleteApiFleetMarketplacesByName.Output { try await client.deleteApiFleetMarketplacesByName(input) }
        public func putPlugin(_ input: Operations.PutApiFleetPluginsById.Input) async throws -> Operations.PutApiFleetPluginsById.Output { try await client.putApiFleetPluginsById(input) }
        public func deletePlugin(_ input: Operations.DeleteApiFleetPluginsById.Input) async throws -> Operations.DeleteApiFleetPluginsById.Output { try await client.deleteApiFleetPluginsById(input) }
        public func refreshPlugin(_ input: Operations.PostApiFleetPluginsByIdRefresh.Input) async throws -> Operations.PostApiFleetPluginsByIdRefresh.Output { try await client.postApiFleetPluginsByIdRefresh(input) }
        public func putSkill(_ input: Operations.PutApiFleetSkillsByName.Input) async throws -> Operations.PutApiFleetSkillsByName.Output { try await client.putApiFleetSkillsByName(input) }
        public func deleteSkill(_ input: Operations.DeleteApiFleetSkillsByName.Input) async throws -> Operations.DeleteApiFleetSkillsByName.Output { try await client.deleteApiFleetSkillsByName(input) }
        public func refreshSkill(_ input: Operations.PostApiFleetSkillsByNameRefresh.Input) async throws -> Operations.PostApiFleetSkillsByNameRefresh.Output { try await client.postApiFleetSkillsByNameRefresh(input) }
        public func putAgent(_ input: Operations.PutApiFleetAgentsByName.Input) async throws -> Operations.PutApiFleetAgentsByName.Output { try await client.putApiFleetAgentsByName(input) }
        public func deleteAgent(_ input: Operations.DeleteApiFleetAgentsByName.Input) async throws -> Operations.DeleteApiFleetAgentsByName.Output { try await client.deleteApiFleetAgentsByName(input) }
        public func pushAgents(_ input: Operations.PostApiFleetAgentsPush.Input) async throws -> Operations.PostApiFleetAgentsPush.Output { try await client.postApiFleetAgentsPush(input) }
        public func putMemory(_ input: Operations.PutApiFleetMemory.Input) async throws -> Operations.PutApiFleetMemory.Output { try await client.putApiFleetMemory(input) }
        public func deleteMemory(_ input: Operations.DeleteApiFleetMemory.Input) async throws -> Operations.DeleteApiFleetMemory.Output { try await client.deleteApiFleetMemory(input) }
        public func putMemoryDoc(_ input: Operations.PutApiFleetMemoryDocs.Input) async throws -> Operations.PutApiFleetMemoryDocs.Output { try await client.putApiFleetMemoryDocs(input) }
        public func deleteMemoryDoc(_ input: Operations.DeleteApiFleetMemoryDocs.Input) async throws -> Operations.DeleteApiFleetMemoryDocs.Output { try await client.deleteApiFleetMemoryDocs(input) }
        public func peekMemory(_ input: Operations.PostApiFleetMemoryPeek.Input) async throws -> Operations.PostApiFleetMemoryPeek.Output { try await client.postApiFleetMemoryPeek(input) }
        public func adoptMemory(_ input: Operations.PostApiFleetMemoryAdopt.Input) async throws -> Operations.PostApiFleetMemoryAdopt.Output { try await client.postApiFleetMemoryAdopt(input) }
        public func pushMemory(_ input: Operations.PostApiFleetMemoryPush.Input) async throws -> Operations.PostApiFleetMemoryPush.Output { try await client.postApiFleetMemoryPush(input) }
        public func memoryHistory(_ input: Operations.GetApiFleetMemoryHistory.Input = .init()) async throws -> Operations.GetApiFleetMemoryHistory.Output { try await client.getApiFleetMemoryHistory(input) }
        public func memoryRevision(_ input: Operations.GetApiFleetMemoryHistoryById.Input) async throws -> Operations.GetApiFleetMemoryHistoryById.Output { try await client.getApiFleetMemoryHistoryById(input) }
        public func restoreMemory(_ input: Operations.PostApiFleetMemoryRestore.Input) async throws -> Operations.PostApiFleetMemoryRestore.Output { try await client.postApiFleetMemoryRestore(input) }
        public func hooks(_ input: Operations.GetApiFleetHooks.Input = .init()) async throws -> Operations.GetApiFleetHooks.Output { try await client.getApiFleetHooks(input) }
        public func putHook(_ input: Operations.PutApiFleetHooksById.Input) async throws -> Operations.PutApiFleetHooksById.Output { try await client.putApiFleetHooksById(input) }
        public func deleteHook(_ input: Operations.DeleteApiFleetHooksById.Input) async throws -> Operations.DeleteApiFleetHooksById.Output { try await client.deleteApiFleetHooksById(input) }
        public func hookHistory(_ input: Operations.GetApiFleetHooksHistory.Input = .init()) async throws -> Operations.GetApiFleetHooksHistory.Output { try await client.getApiFleetHooksHistory(input) }
        public func restoreHook(_ input: Operations.PostApiFleetHooksRestore.Input) async throws -> Operations.PostApiFleetHooksRestore.Output { try await client.postApiFleetHooksRestore(input) }
        public func peekHook(_ input: Operations.PostApiFleetHooksPeek.Input) async throws -> Operations.PostApiFleetHooksPeek.Output { try await client.postApiFleetHooksPeek(input) }
        public func adoptHook(_ input: Operations.PostApiFleetHooksAdopt.Input) async throws -> Operations.PostApiFleetHooksAdopt.Output { try await client.postApiFleetHooksAdopt(input) }
        public func pushHook(_ input: Operations.PostApiFleetHooksPush.Input) async throws -> Operations.PostApiFleetHooksPush.Output { try await client.postApiFleetHooksPush(input) }
    }
    public struct Rules: Sendable {
        let client: Client
        public func list(_ input: Operations.GetApiRules.Input = .init()) async throws -> Operations.GetApiRules.Output { try await client.getApiRules(input) }
        public func create(_ input: Operations.PostApiRules.Input) async throws -> Operations.PostApiRules.Output { try await client.postApiRules(input) }
        public func update(_ input: Operations.PutApiRulesById.Input) async throws -> Operations.PutApiRulesById.Output { try await client.putApiRulesById(input) }
        public func delete(_ input: Operations.DeleteApiRulesById.Input) async throws -> Operations.DeleteApiRulesById.Output { try await client.deleteApiRulesById(input) }
        public func activity(_ input: Operations.GetApiRulesByIdActivity.Input) async throws -> Operations.GetApiRulesByIdActivity.Output { try await client.getApiRulesByIdActivity(input) }
    }
    public struct Models: Sendable {
        let client: Client
        public func windows(_ input: Operations.GetApiModelWindows.Input = .init()) async throws -> Operations.GetApiModelWindows.Output { try await client.getApiModelWindows(input) }
        public func openRouter(_ input: Operations.GetApiOpenrouter.Input = .init()) async throws -> Operations.GetApiOpenrouter.Output { try await client.getApiOpenrouter(input) }
        public func disconnect(_ input: Operations.DeleteApiOpenrouter.Input = .init()) async throws -> Operations.DeleteApiOpenrouter.Output { try await client.deleteApiOpenrouter(input) }
        public func setSuggest(_ input: Operations.PutApiOpenrouterSuggest.Input) async throws -> Operations.PutApiOpenrouterSuggest.Output { try await client.putApiOpenrouterSuggest(input) }
        public func connect(_ input: Operations.PostApiOpenrouterConnect.Input) async throws -> Operations.PostApiOpenrouterConnect.Output { try await client.postApiOpenrouterConnect(input) }
        public func exchange(_ input: Operations.PostApiOpenrouterExchange.Input) async throws -> Operations.PostApiOpenrouterExchange.Output { try await client.postApiOpenrouterExchange(input) }
    }
    public struct Supervisor: Sendable {
        let client: Client
        public func status(_ input: Operations.GetApiSupervisor.Input = .init()) async throws -> Operations.GetApiSupervisor.Output { try await client.getApiSupervisor(input) }
        public func configure(_ input: Operations.PutApiSupervisorConfig.Input) async throws -> Operations.PutApiSupervisorConfig.Output { try await client.putApiSupervisorConfig(input) }
        public func events(_ input: Operations.GetApiSupervisorEvents.Input = .init()) async throws -> Operations.GetApiSupervisorEvents.Output { try await client.getApiSupervisorEvents(input) }
        public func autopilot(_ input: Operations.PutApiAutopilotByInstanceId.Input) async throws -> Operations.PutApiAutopilotByInstanceId.Output { try await client.putApiAutopilotByInstanceId(input) }
    }
    public struct Search: Sendable {
        let client: Client
        public func transcripts(_ input: Operations.GetApiSearch.Input) async throws -> Operations.GetApiSearch.Output { try await client.getApiSearch(input) }
        public func suggest(_ input: Operations.PostApiSuggest.Input) async throws -> Operations.PostApiSuggest.Output { try await client.postApiSuggest(input) }
    }
    public struct Delegates: Sendable {
        let client: Client
        public func events(_ input: Operations.GetApiDelegateEvents.Input) async throws -> Operations.GetApiDelegateEvents.Output { try await client.getApiDelegateEvents(input) }
        public func items(_ input: Operations.GetApiWorkItems.Input) async throws -> Operations.GetApiWorkItems.Output { try await client.getApiWorkItems(input) }
        public func dismiss(_ input: Operations.PostApiWorkItemsByIdDismiss.Input) async throws -> Operations.PostApiWorkItemsByIdDismiss.Output { try await client.postApiWorkItemsByIdDismiss(input) }
        public func types(_ input: Operations.GetApiDelegateTypes.Input = .init()) async throws -> Operations.GetApiDelegateTypes.Output { try await client.getApiDelegateTypes(input) }
        public func putType(_ input: Operations.PutApiDelegateTypesByName.Input) async throws -> Operations.PutApiDelegateTypesByName.Output { try await client.putApiDelegateTypesByName(input) }
        public func deleteType(_ input: Operations.DeleteApiDelegateTypesByName.Input) async throws -> Operations.DeleteApiDelegateTypesByName.Output { try await client.deleteApiDelegateTypesByName(input) }
        public func archiveWorkspace(_ input: Operations.PostApiWorkspacesByIdArchive.Input) async throws -> Operations.PostApiWorkspacesByIdArchive.Output { try await client.postApiWorkspacesByIdArchive(input) }
    }
    public struct Tools: Sendable {
        let client: Client
        public func list(_ input: Operations.GetApiTools.Input = .init()) async throws -> Operations.GetApiTools.Output { try await client.getApiTools(input) }
        public func policy(_ input: Operations.PutApiToolsById.Input) async throws -> Operations.PutApiToolsById.Output { try await client.putApiToolsById(input) }
    }
}
