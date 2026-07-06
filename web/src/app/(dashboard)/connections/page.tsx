"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plug, Plus, Trash2, X } from "lucide-react";
import { useApi, type Connection } from "@/lib/api-client";

interface HeaderRow {
  key: string;
  value: string;
}

export default function ConnectionsPage() {
  const api = useApi();
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [headers, setHeaders] = useState<HeaderRow[]>([{ key: "Authorization", value: "" }]);

  const load = useCallback(() => {
    if (!api.ready) return;
    api.get<{ connections: Connection[] }>("/api/connections").then((d) => setConnections(d.connections));
  }, [api]);

  useEffect(load, [load]);

  function reset() {
    setAdding(false);
    setName("");
    setHeaders([{ key: "Authorization", value: "" }]);
  }

  async function save() {
    const headerMap = Object.fromEntries(
      headers.filter((h) => h.key.trim() && h.value.trim()).map((h) => [h.key.trim(), h.value.trim()])
    );
    if (!name.trim() || Object.keys(headerMap).length === 0) {
      toast.error("Give the connection a name and at least one header.");
      return;
    }
    setSaving(true);
    try {
      // Credentials are encrypted server-side; the header values never come back.
      await api.post("/api/connections", {
        name: name.trim(),
        type: "http",
        credentials: { headers: headerMap },
      });
      toast.success("Connection saved");
      reset();
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: Connection) {
    if (!confirm(`Delete connection "${c.name}"?`)) return;
    try {
      await api.del(`/api/connections/${c.id}`);
      setConnections((prev) => prev?.filter((x) => x.id !== c.id) ?? null);
      toast.success("Deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Connections</h1>
          <p className="text-muted-foreground mt-1">
            Credentials for HTTP actions and outputs — encrypted at rest, never shown again.
          </p>
        </div>
        {!adding && (
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add connection
          </Button>
        )}
      </div>

      {adding && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">New HTTP connection</CardTitle>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={reset}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 max-w-md">
              <Label htmlFor="conn-name">Name</Label>
              <Input
                id="conn-name"
                placeholder="e.g. Stripe API"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Headers (sent with every request that uses this connection)</Label>
              {headers.map((h, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder="Header"
                    className="max-w-[220px] font-mono text-sm"
                    value={h.key}
                    onChange={(e) =>
                      setHeaders((prev) => prev.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))
                    }
                  />
                  <Input
                    placeholder="Value (e.g. Bearer sk_live_…)"
                    className="flex-1 font-mono text-sm"
                    value={h.value}
                    onChange={(e) =>
                      setHeaders((prev) => prev.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                    }
                  />
                  {headers.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0 shrink-0"
                      onClick={() => setHeaders((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setHeaders((prev) => [...prev, { key: "", value: "" }])}
              >
                <Plus className="h-3 w-3 mr-1" /> Add header
              </Button>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save connection
              </Button>
              <Button variant="outline" onClick={reset}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!connections ? (
        <div className="flex justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
        </div>
      ) : connections.length === 0 && !adding ? (
        <Card className="p-12 flex flex-col items-center text-center gap-3 border-dashed">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Plug className="h-6 w-6" />
          </div>
          <h3 className="font-semibold text-lg">No connections yet</h3>
          <p className="text-muted-foreground max-w-sm">
            Add credentials so HTTP action and output nodes can call your services securely.
          </p>
        </Card>
      ) : (
        connections.length > 0 && (
          <Card className="divide-y divide-border/60">
            {connections.map((c) => (
              <div key={c.id} className="flex items-center gap-4 p-4">
                <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Plug className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.type} · added {new Date(c.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-destructive" onClick={() => remove(c)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </Card>
        )
      )}
    </div>
  );
}
