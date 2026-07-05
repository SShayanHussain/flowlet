"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addEdge,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection as RFConnection,
  type Edge,
  type Node,
} from "@xyflow/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Play, Plus, Save } from "lucide-react";
import {
  NODE_META,
  useApi,
  type Connection,
  type NodeType,
  type Workflow,
  type WorkflowGraph,
} from "@/lib/api-client";
import { FlowNode, type FlowNodeData } from "./flow-node";
import { ConfigPanel } from "./config-panel";

const nodeTypes = { flowNode: FlowNode };
const NODE_ORDER: NodeType[] = ["trigger", "http", "transform", "ai", "branch", "output"];

function graphToFlow(graph: WorkflowGraph): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = graph.nodes.map((n, i) => ({
    id: n.id,
    type: "flowNode",
    position: n.position ?? { x: 120 + (i % 3) * 260, y: 80 + Math.floor(i / 3) * 160 },
    data: { nodeType: n.type, config: n.config ?? {} } satisfies FlowNodeData,
  }));
  const edges: Edge[] = graph.edges.map((e, i) => ({
    id: `e-${e.from}-${e.to}-${i}`,
    source: e.from,
    target: e.to,
    data: { when: e.when },
    label: e.when,
  }));
  return { nodes, edges };
}

function flowToGraph(nodes: Node[], edges: Edge[]): WorkflowGraph {
  return {
    nodes: nodes.map((n) => {
      const d = n.data as FlowNodeData;
      return { id: n.id, type: d.nodeType, config: d.config, position: n.position };
    }),
    edges: edges.map((e) => {
      const when = (e.data?.when as string | undefined)?.trim();
      return { from: e.source, to: e.target, ...(when ? { when } : {}) };
    }),
  };
}

export function BuilderCanvas({ initial }: { initial?: Workflow }) {
  const api = useApi();
  const router = useRouter();

  const seed = useMemo(
    () => (initial ? graphToFlow(initial.graph) : { nodes: [], edges: [] }),
    [initial]
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(seed.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(seed.edges);
  const [name, setName] = useState(initial?.name ?? "Untitled workflow");
  const [saved, setSaved] = useState<Workflow | undefined>(initial);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (api.ready) api.get<{ connections: Connection[] }>("/api/connections").then((d) => setConnections(d.connections));
  }, [api]);

  const onConnect = useCallback(
    (c: RFConnection) => setEdges((eds) => addEdge({ ...c, data: {} }, eds)),
    [setEdges]
  );

  function addNode(type: NodeType) {
    const count = nodes.filter((n) => (n.data as FlowNodeData).nodeType === type).length;
    const id = `${type}${count + 1}`;
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: "flowNode",
        position: { x: 140 + (nds.length % 3) * 60, y: 100 + nds.length * 70 },
        data: { nodeType: type, config: {} },
      },
    ]);
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
  }

  const setNodeConfig = useCallback(
    (nodeId: string, config: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...(n.data as FlowNodeData), config } } : n))
      );
    },
    [setNodes]
  );

  const setEdgeWhen = useCallback(
    (edgeId: string, when: string) => {
      setEdges((eds) =>
        eds.map((e) => (e.id === edgeId ? { ...e, data: { ...e.data, when }, label: when } : e))
      );
    },
    [setEdges]
  );

  function deleteSelection() {
    if (selectedNodeId) {
      setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
      setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
      setSelectedNodeId(null);
    } else if (selectedEdgeId) {
      setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId));
      setSelectedEdgeId(null);
    }
  }

  async function save(): Promise<Workflow | null> {
    const graph = flowToGraph(nodes, edges);
    if (!graph.nodes.some((n) => n.type === "trigger")) {
      toast.error("Add a trigger node — every workflow needs an entry point.");
      return null;
    }
    setSaving(true);
    try {
      const body = { name: name.trim() || "Untitled workflow", graph };
      const res = saved
        ? await api.patch<{ workflow: Workflow }>(`/api/workflows/${saved.id}`, body)
        : await api.post<{ workflow: Workflow }>("/api/workflows", body);
      setSaved(res.workflow);
      if (!saved) router.replace(`/builder/${res.workflow.id}`);
      toast.success("Saved");
      return res.workflow;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function testRun() {
    const wf = saved ?? (await save());
    if (!wf) return;
    setRunning(true);
    try {
      const { runId } = await api.post<{ runId: string }>(`/api/workflows/${wf.id}/run`, {});
      toast.success("Test run queued");
      router.push(`/runs/${runId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to run");
    } finally {
      setRunning(false);
    }
  }

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) ?? null;
  const webhookUrl = saved?.webhookToken ? `/api/webhooks/${saved.webhookToken}` : null;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] -m-4 sm:-m-6 lg:-m-8">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-border/60 bg-background px-4 py-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-xs font-medium"
          aria-label="Workflow name"
        />
        <div className="flex-1" />
        {webhookUrl && (
          <button
            onClick={() => {
              navigator.clipboard?.writeText(`${window.location.origin}${webhookUrl}`);
              toast.success("Webhook URL copied");
            }}
            className="text-xs text-muted-foreground font-mono hover:text-foreground truncate max-w-[240px]"
            title="Copy webhook URL"
          >
            {webhookUrl}
          </button>
        )}
        <Button variant="outline" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save
        </Button>
        <Button onClick={testRun} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
          Test run
        </Button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Palette */}
        <div className="w-44 shrink-0 border-r border-border/60 bg-background p-3 space-y-1.5 overflow-y-auto">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1 pb-1">
            Add node
          </p>
          {NODE_ORDER.map((type) => (
            <button
              key={type}
              onClick={() => addNode(type)}
              className="w-full flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-2 text-sm hover:bg-muted/50 transition-colors text-left"
            >
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: NODE_META[type].hue }} />
              {NODE_META[type].label}
              <Plus className="h-3 w-3 ml-auto text-muted-foreground" />
            </button>
          ))}
        </div>

        {/* Canvas */}
        <div className="flex-1 min-w-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => {
              setSelectedNodeId(n.id);
              setSelectedEdgeId(null);
            }}
            onEdgeClick={(_, e) => {
              setSelectedEdgeId(e.id);
              setSelectedNodeId(null);
            }}
            onPaneClick={() => {
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
            }}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls />
            <MiniMap pannable zoomable className="!bg-muted" />
          </ReactFlow>
        </div>

        {/* Config panel — keyed so uncontrolled inputs reset on selection change */}
        <ConfigPanel
          key={selectedNodeId ?? selectedEdgeId ?? "none"}
          node={selectedNode}
          edge={selectedEdge}
          connections={connections}
          onNodeConfig={setNodeConfig}
          onEdgeWhen={setEdgeWhen}
          onDelete={deleteSelection}
        />
      </div>
    </div>
  );
}
