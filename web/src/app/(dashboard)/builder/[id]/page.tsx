"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BuilderCanvas } from "@/components/builder/builder-canvas";
import { useApi, type Workflow } from "@/lib/api-client";

export default function EditBuilderPage() {
  const api = useApi();
  const { id } = useParams<{ id: string }>();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!api.ready) return;
    api
      .get<{ workflow: Workflow }>(`/api/workflows/${id}`)
      .then((d) => setWorkflow(d.workflow))
      .catch(() => setNotFound(true));
  }, [api, id]);

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
        <h2 className="text-xl font-semibold">Workflow not found</h2>
        <p className="text-muted-foreground">It may have been deleted.</p>
        <Link href="/workflows">
          <Button variant="outline">Back to workflows</Button>
        </Link>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
      </div>
    );
  }

  return <BuilderCanvas initial={workflow} />;
}
