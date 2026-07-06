"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NODE_META, type NodeType } from "@/lib/api-client";

export interface FlowNodeData extends Record<string, unknown> {
  nodeType: NodeType;
  config: Record<string, unknown>;
}

/** A single typed node on the canvas. Trigger has no inbound handle. */
function FlowNodeImpl({ id, data, selected }: NodeProps) {
  const nodeType = (data as FlowNodeData).nodeType;
  const meta = NODE_META[nodeType];
  return (
    <div
      className={`rounded-lg border bg-card shadow-sm w-52 overflow-hidden transition-shadow ${
        selected ? "ring-2 ring-primary shadow-md" : "border-border"
      }`}
    >
      {nodeType !== "trigger" && (
        <Handle type="target" position={Position.Left} className="!h-3 !w-3 !bg-muted-foreground !border-2 !border-background" />
      )}
      <div className="h-1.5" style={{ backgroundColor: meta.hue }} />
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: meta.hue }} />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {meta.label}
          </span>
        </div>
        <p className="text-sm font-medium mt-1 truncate">{id}</p>
      </div>
      {nodeType !== "output" && (
        <Handle type="source" position={Position.Right} className="!h-3 !w-3 !bg-primary !border-2 !border-background" />
      )}
    </div>
  );
}

export const FlowNode = memo(FlowNodeImpl);
