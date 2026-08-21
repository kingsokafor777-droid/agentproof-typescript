import { sha256String, unixNanoseconds } from "./canonical.js";
import { validateWorkflowTrace } from "./trace.js";
import type { ToolCall, WorkflowTrace } from "./types.js";

type OtlpAnyValue =
  | { readonly stringValue: string }
  | { readonly arrayValue: { readonly values: readonly OtlpAnyValue[] } };

interface OtlpAttribute {
  readonly key: string;
  readonly value: OtlpAnyValue;
}

interface OtlpSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly kind: number;
  readonly startTimeUnixNano: string;
  readonly endTimeUnixNano: string;
  readonly attributes: readonly OtlpAttribute[];
  readonly status: { readonly code: number };
}

export interface OtlpJson {
  readonly resourceSpans: readonly {
    readonly resource: { readonly attributes: readonly OtlpAttribute[] };
    readonly scopeSpans: readonly {
      readonly scope: { readonly name: string; readonly version: string };
      readonly spans: readonly OtlpSpan[];
    }[];
  }[];
}

function stringAttribute(key: string, value: string): OtlpAttribute {
  return { key, value: { stringValue: value } };
}

function stringArrayAttribute(key: string, values: readonly string[]): OtlpAttribute {
  return {
    key,
    value: { arrayValue: { values: values.map((value) => ({ stringValue: value })) } },
  };
}

function spanForEvent(rawTraceId: string, event: ToolCall): OtlpSpan {
  const spanId = sha256String(`span:${event.event_id}`).slice(0, 16);
  const parentSpanId =
    event.parent_event_id === undefined
      ? undefined
      : sha256String(`span:${event.parent_event_id}`).slice(0, 16);
  const attributes: OtlpAttribute[] = [
    stringAttribute("gen_ai.tool.name", event.tool.name),
    stringAttribute("agentproof.actor.id", event.actor.actor_id),
    stringAttribute("agentproof.actor.kind", event.actor.kind),
    stringAttribute("agentproof.side_effect", event.side_effect),
    stringArrayAttribute("agentproof.requested_capabilities", event.requested_capabilities),
    stringArrayAttribute("agentproof.input_labels", event.input_labels),
    stringArrayAttribute("agentproof.output_labels", event.output_labels),
  ];
  const timestamp = unixNanoseconds(event.timestamp);
  const span: OtlpSpan = {
    traceId: rawTraceId,
    spanId,
    name: event.tool.name,
    kind: 1,
    startTimeUnixNano: timestamp,
    endTimeUnixNano: timestamp,
    attributes,
    status: { code: event.outcome === "failed" ? 2 : 0 },
  };
  return parentSpanId === undefined ? span : { ...span, parentSpanId };
}

export function toOtlpJson(trace: WorkflowTrace): OtlpJson {
  const validated = validateWorkflowTrace(trace);
  const rawTraceId = sha256String(`trace:${validated.trace_id}`).slice(0, 32);
  const spans = validated.events.map((event) => spanForEvent(rawTraceId, event));
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            stringAttribute("service.name", validated.source),
            stringAttribute("agentproof.sdk.name", "agentproof-typescript"),
            stringAttribute("agentproof.sdk.version", "0.1"),
          ],
        },
        scopeSpans: [
          {
            scope: { name: "agentproof.typescript", version: "0.1" },
            spans,
          },
        ],
      },
    ],
  };
}
