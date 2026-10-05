/** SDK runtime setup without pi CLI's process-title/warning overrides. */

import { setEmbeddedQuickJSWasmPath } from "cawco:pi-config";
import quickjsWasmPath from "cawco:quickjs";
import { bedrockProviderModule } from "@earendil-works/pi-ai/bedrock-provider";
import { registerBunOAuthFlows } from "@earendil-works/pi-ai/bun-oauth";
import { setBedrockProviderModule } from "@earendil-works/pi-ai/compat";

registerBunOAuthFlows();
setBedrockProviderModule(bedrockProviderModule);
setEmbeddedQuickJSWasmPath(quickjsWasmPath);
