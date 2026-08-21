import type { ToolObservation, WorkflowTrace } from "../src/index.js";

export function safeObservation(overrides: Partial<ToolObservation> = {}): ToolObservation {
  return {
    eventId: "inventory-read",
    timestamp: "2026-08-21T00:00:01Z",
    actor: { actorId: "order-agent", kind: "agent", displayName: "Order agent" },
    tool: { serverId: "inventory", name: "get_stock", version: "1.2" },
    sideEffect: "read",
    requestedCapabilities: ["inventory.read"],
    inputLabels: ["internal"],
    outputLabels: ["internal"],
    ...overrides,
  };
}

export function traceWithParent(): WorkflowTrace {
  return {
    schema_version: "1.0",
    trace_id: "checkout-review",
    source: "storefront",
    recorded_at: "2026-08-21T00:00:00Z",
    events: [
      {
        event_id: "inventory-read",
        sequence: 1,
        timestamp: "2026-08-21T00:00:01Z",
        actor: { actor_id: "order-agent", kind: "agent", display_name: "Order agent" },
        tool: { server_id: "inventory", name: "get_stock", version: "1.2" },
        outcome: "succeeded",
        side_effect: "read",
        approval: { state: "not_required" },
        requested_capabilities: ["inventory.read"],
        input_labels: ["internal"],
        output_labels: ["internal"],
        attributes: { sdk: { adapter: "agentproof-typescript", adapter_version: "0.1" } },
      },
      {
        event_id: "order-write",
        sequence: 2,
        timestamp: "2026-08-21T00:00:02.000001Z",
        actor: { actor_id: "order-agent", kind: "agent" },
        tool: { server_id: "orders", name: "create_order" },
        outcome: "failed",
        side_effect: "write",
        parent_event_id: "inventory-read",
        approval: { state: "not_required" },
        requested_capabilities: ["orders.write"],
        input_labels: ["internal"],
        output_labels: ["confidential"],
        attributes: { sdk: { adapter: "agentproof-typescript", adapter_version: "0.1" } },
      },
    ],
    metadata: { sdk: { adapter: "agentproof-typescript", adapter_version: "0.1" } },
  };
}
