import { mindset } from "./00-principal-engineer-mindset.ts";
import { productionPython } from "./01-production-python.ts";
import { distributedSystems } from "./02-distributed-systems.ts";
import { networking } from "./03-networking.ts";
import { aiInfrastructure } from "./04-ai-infrastructure.ts";
import { agentEngineering } from "./05-agent-engineering.ts";
import { langgraph } from "./07-langgraph.ts";
import { rag } from "./08-rag.ts";
import { modelServing } from "./09-model-serving.ts";
import { kubernetes } from "./10-kubernetes.ts";
import { cloud } from "./11-cloud.ts";
import { observability } from "./12-observability.ts";
import { systemDesign } from "./13-system-design.ts";
import { leadership } from "./14-leadership.ts";
import { agentIdentity } from "./15-agent-identity.ts";
import { mcp } from "./06-mcp.ts";
import type { VideoScript } from "./types.ts";

/**
 * Every video the project knows how to build, by slug. To add a module: write
 * `src/videos/<slug>.ts`, add it here, then run `pnpm sync` and `pnpm layout`.
 */
export const scripts: Record<string, VideoScript> = {
  [mindset.slug]: mindset,
  [productionPython.slug]: productionPython,
  [distributedSystems.slug]: distributedSystems,
  [networking.slug]: networking,
  [aiInfrastructure.slug]: aiInfrastructure,
  [agentEngineering.slug]: agentEngineering,
  [mcp.slug]: mcp,
  [langgraph.slug]: langgraph,
  [rag.slug]: rag,
  [modelServing.slug]: modelServing,
  [kubernetes.slug]: kubernetes,
  [cloud.slug]: cloud,
  [observability.slug]: observability,
  [systemDesign.slug]: systemDesign,
  [leadership.slug]: leadership,
  [agentIdentity.slug]: agentIdentity,
};
