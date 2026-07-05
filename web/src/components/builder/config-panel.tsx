"use client";

import { useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { NODE_META, type Connection } from "@/lib/api-client";
import type { FlowNodeData } from "./flow-node";

/** JSON textarea that only propagates valid parses; red border while invalid. */
function JsonField({
  label,
  value,
  onChange,
  rows = 5,
  placeholder,
}: {
  label: string;
  value: unknown;
  onChange: (v: unknown) => void;
  rows?: number;
  placeholder?: string;
}) {
  const [text, setText] = useState(() =>
    value === undefined || value === null ? "" : JSON.stringify(value, null, 2)
  );
  const [invalid, setInvalid] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <textarea
        rows={rows}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value.trim() === "") {
            setInvalid(false);
            onChange(undefined);
            return;
          }
          try {
            onChange(JSON.parse(e.target.value));
            setInvalid(false);
          } catch {
            setInvalid(true);
          }
        }}
        className={`w-full rounded-md border bg-background px-3 py-2 font-mono text-xs resize-y ${
          invalid ? "border-destructive" : "border-input"
        }`}
      />
      {invalid && <p className="text-[11px] text-destructive">Invalid JSON — not saved</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

export function ConfigPanel({
  node,
  edge,
  connections,
  onNodeConfig,
  onEdgeWhen,
  onDelete,
}: {
  node: Node | null;
  edge: Edge | null;
  connections: Connection[];
  onNodeConfig: (nodeId: string, config: Record<string, unknown>) => void;
  onEdgeWhen: (edgeId: string, when: string) => void;
  onDelete: () => void;
}) {
  if (edge) {
    const when = (edge.data?.when as string | undefined) ?? "";
    return (
      <aside className="w-80 shrink-0 border-l border-border/60 bg-background p-4 space-y-4 overflow-y-auto">
        <div>
          <h3 className="font-semibold">Edge condition</h3>
          <p className="text-xs text-muted-foreground mt-1">
            On a branch, this guard decides whether the edge is taken. Leave blank for an
            always-taken edge.
          </p>
        </div>
        <Field label="when">
          <Input
            className="font-mono text-sm"
            placeholder="intent == 'refund'"
            defaultValue={when}
            onChange={(e) => onEdgeWhen(edge.id, e.target.value)}
          />
        </Field>
        <p className="text-[11px] text-muted-foreground">
          Grammar: <code>path</code> (truthy), <code>path == &apos;value&apos;</code>,{" "}
          <code>path != value</code>.
        </p>
        <Button variant="outline" size="sm" className="w-full text-destructive" onClick={onDelete}>
          Delete edge
        </Button>
      </aside>
    );
  }

  if (!node) {
    return (
      <aside className="w-80 shrink-0 border-l border-border/60 bg-background p-4 overflow-y-auto">
        <p className="text-sm text-muted-foreground">
          Select a node to configure it, or an edge to add a condition.
        </p>
      </aside>
    );
  }

  const data = node.data as FlowNodeData;
  const type = data.nodeType;
  const config = data.config ?? {};
  const set = (patch: Record<string, unknown>) => onNodeConfig(node.id, { ...config, ...patch });
  const meta = NODE_META[type];

  return (
    <aside className="w-80 shrink-0 border-l border-border/60 bg-background p-4 space-y-4 overflow-y-auto">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.hue }} />
        <h3 className="font-semibold">{meta.label}</h3>
        <span className="text-xs text-muted-foreground font-mono">{node.id}</span>
      </div>
      <p className="text-xs text-muted-foreground">{meta.description}</p>

      {type === "trigger" && (
        <Field label="Cron schedule (optional)">
          <Input
            className="font-mono text-sm"
            placeholder="*/5 * * * *"
            defaultValue={(config.schedule as string) ?? ""}
            onChange={(e) => set({ schedule: e.target.value || undefined })}
          />
          <p className="text-[11px] text-muted-foreground">
            Set for a scheduled trigger. Every workflow also gets a webhook URL + manual run.
          </p>
        </Field>
      )}

      {(type === "http" || type === "output") && (
        <>
          <Field label="URL">
            <Input
              className="font-mono text-sm"
              placeholder="https://api.example.com/{{orderId}}"
              defaultValue={(config.url as string) ?? ""}
              onChange={(e) => set({ url: e.target.value || undefined })}
            />
          </Field>
          <Field label="Method">
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              defaultValue={(config.method as string) ?? "POST"}
              onChange={(e) => set({ method: e.target.value })}
            >
              {["POST", "GET", "PUT", "PATCH", "DELETE"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="Connection (adds encrypted headers)">
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              defaultValue={(config.connectionId as string) ?? ""}
              onChange={(e) => set({ connectionId: e.target.value || undefined })}
            >
              <option value="">None</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <JsonField
            label="Headers (JSON, {{templates}} allowed)"
            value={config.headers}
            onChange={(v) => set({ headers: v })}
            rows={3}
            placeholder={'{ "x-source": "flowlet" }'}
          />
          {type === "http" && (
            <>
              <JsonField
                label="Body (JSON; omit to forward input)"
                value={config.body}
                onChange={(v) => set({ body: v })}
                placeholder={'{ "order": "{{orderId}}" }'}
              />
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  defaultChecked={config.slow === true}
                  onChange={(e) => set({ slow: e.target.checked || undefined })}
                />
                Route to the slow/AI queue (isolates a slow endpoint)
              </label>
            </>
          )}
        </>
      )}

      {type === "transform" && (
        <>
          <JsonField
            label="map — { outKey: 'dot.path' }"
            value={config.map}
            onChange={(v) => set({ map: v })}
            placeholder={'{ "id": "order.id", "all": "$" }'}
          />
          <JsonField
            label="set — literal fields merged in"
            value={config.set}
            onChange={(v) => set({ set: v })}
            rows={3}
            placeholder={'{ "source": "shop" }'}
          />
        </>
      )}

      {type === "ai" && (
        <>
          <Field label="Prompt ({{templates}} from upstream)">
            <textarea
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
              placeholder="Classify this ticket: {{subject}}"
              defaultValue={(config.prompt as string) ?? ""}
              onChange={(e) => set({ prompt: e.target.value || undefined })}
            />
          </Field>
          <Field label="System (optional)">
            <textarea
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
              defaultValue={(config.system as string) ?? ""}
              onChange={(e) => set({ system: e.target.value || undefined })}
            />
          </Field>
          <JsonField
            label="Output JSON schema"
            value={config.schema}
            onChange={(v) => set({ schema: v })}
            rows={7}
            placeholder={'{\n  "type": "object",\n  "properties": { "intent": { "type": "string" } },\n  "required": ["intent"]\n}'}
          />
          <Field label="Max repair attempts">
            <Input
              type="number"
              min={0}
              max={5}
              defaultValue={(config.maxRepairs as number) ?? 2}
              onChange={(e) => set({ maxRepairs: Number(e.target.value) })}
            />
          </Field>
        </>
      )}

      {type === "branch" && (
        <p className="text-xs text-muted-foreground rounded-md bg-muted/40 p-3">
          A branch routes on its incoming JSON. Click each <strong>outgoing edge</strong> to set the{" "}
          <code>when</code> condition that decides whether it&apos;s taken.
        </p>
      )}

      <Button variant="outline" size="sm" className="w-full text-destructive" onClick={onDelete}>
        Delete node
      </Button>
    </aside>
  );
}
