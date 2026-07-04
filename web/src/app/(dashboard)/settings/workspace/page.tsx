"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, CreditCard, Receipt, CheckCircle2, AlertCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export default function WorkspaceSettingsPage() {
  const { workspaceId, accessToken } = useAuth();
  const [workspace, setWorkspace] = useState<{ id: string, name: string, slug: string, plan: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!workspaceId || !accessToken) return;

    async function fetchWorkspace() {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const data = await res.json();
        if (res.ok) {
          setWorkspace(data.data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }

    fetchWorkspace();
  }, [workspaceId, accessToken]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!workspaceId || !accessToken) return;

    setIsSaving(true);
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ name }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to update workspace");
      }
      
      toast.success("Workspace updated successfully");
      setWorkspace(prev => prev ? { ...prev, name } : null);
    } catch (error: unknown) {
      if (error instanceof Error) {
        toast.error(error.message);
      }
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary/60" /></div>;
  }

  if (!workspace) return null;

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h3 className="text-xl font-semibold tracking-tight">Workspace & Billing</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your workspace preferences, subscription plan, and billing details.
        </p>
      </div>
      
      {/* General Settings */}
      <Card className="border-border/60 shadow-sm">
        <form onSubmit={handleSave}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">General Settings</CardTitle>
                <CardDescription>Update your workspace details and branding.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Workspace Name</Label>
                <Input id="name" name="name" defaultValue={workspace.name} required disabled={isSaving} className="max-w-md" />
              </div>
            </div>
            
            <Separator className="bg-border/40" />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="slug">Workspace ID (Slug)</Label>
                <div className="flex items-center gap-2 max-w-md">
                  <Input id="slug" defaultValue={workspace.slug} disabled className="bg-muted/30 font-mono text-sm" />
                  <Button type="button" variant="outline" size="sm" onClick={() => {
                    navigator.clipboard.writeText(workspace.slug);
                    toast.success("Copied to clipboard");
                  }}>Copy</Button>
                </div>
                <p className="text-[13px] text-muted-foreground mt-1">
                  This is your unique workspace identifier. It cannot be changed.
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-muted/10 border-t py-4 px-6">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Subscription & Usage */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              Subscription Plan
              <Badge variant="default" className="bg-primary hover:bg-primary/90 text-primary-foreground uppercase tracking-wider text-[10px] px-2 py-0.5">
                {workspace.plan}
              </Badge>
            </CardTitle>
            <CardDescription>You are currently on the {workspace.plan.charAt(0).toUpperCase() + workspace.plan.slice(1)} plan.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-4">
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <CheckCircle2 className="h-4 w-4" />
                Unlimited workflows
              </div>
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <CheckCircle2 className="h-4 w-4" />
                Higher monthly run limits
              </div>
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <CheckCircle2 className="h-4 w-4" />
                Premium Support
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-muted/10 border-t py-4 px-6 mt-auto">
            <Button variant="default" className="w-full">Upgrade to Pro</Button>
          </CardFooter>
        </Card>

        <Card className="border-border/60 shadow-sm flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-muted-foreground" />
              Current Usage
            </CardTitle>
            <CardDescription>Your API usage for the current billing cycle.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm font-medium">
                <span>Runs</span>
                <span>—</span>
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: "0%" }} />
              </div>
              <p className="text-xs text-muted-foreground">Usage metering lands with the engine (Phase 1)</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm font-medium">
                <span>Active workflows</span>
                <span>0 / 2</span>
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-blue-500" style={{ width: "0%" }} />
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-muted/10 border-t py-4 px-6 mt-auto">
            <Button variant="outline" className="w-full">View Detailed Usage</Button>
          </CardFooter>
        </Card>
      </div>

      {/* Payment Method */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            Payment Method
          </CardTitle>
          <CardDescription>Update your billing information and payment methods.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 border rounded-lg bg-background">
            <div className="flex items-center gap-4">
              <div className="h-10 w-14 bg-muted rounded flex items-center justify-center border shadow-sm">
                <span className="font-bold text-xs italic text-blue-600">VISA</span>
              </div>
              <div>
                <p className="font-medium text-sm">Visa ending in 4242</p>
                <p className="text-xs text-muted-foreground">Expires 12/2028</p>
              </div>
            </div>
            <Button variant="outline" size="sm">Update</Button>
          </div>
        </CardContent>
      </Card>
      
      {/* Billing History */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Receipt className="h-5 w-5 text-muted-foreground" />
            Billing History
          </CardTitle>
          <CardDescription>View and download your past invoices.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <div className="grid grid-cols-4 p-4 border-b bg-muted/30 text-sm font-medium text-muted-foreground">
              <div>Date</div>
              <div>Description</div>
              <div>Amount</div>
              <div className="text-right">Invoice</div>
            </div>
            <div className="divide-y">
              <div className="grid grid-cols-4 p-4 items-center text-sm">
                <div>Jul 1, 2026</div>
                <div>Flowlet Free Plan</div>
                <div>$0.00</div>
                <div className="text-right">
                  <Button variant="ghost" size="sm" className="h-8 text-blue-600">Download</Button>
                </div>
              </div>
              <div className="grid grid-cols-4 p-4 items-center text-sm">
                <div>Jun 1, 2026</div>
                <div>Flowlet Free Plan</div>
                <div>$0.00</div>
                <div className="text-right">
                  <Button variant="ghost" size="sm" className="h-8 text-blue-600">Download</Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Danger Zone */}
      <Card className="border-destructive/30 shadow-sm overflow-hidden mt-12">
        <CardHeader className="bg-destructive/5 border-b border-destructive/10 pb-4">
          <CardTitle className="text-lg text-destructive">Danger Zone</CardTitle>
          <CardDescription className="text-destructive/80">Permanently delete this workspace and all its data.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1 max-w-lg">
              <h4 className="font-medium text-sm">Delete Workspace</h4>
              <p className="text-[13px] text-muted-foreground">
                Once you delete a workspace, there is no going back. All workflows, runs, and connections will be permanently removed.
              </p>
            </div>
            <Button variant="destructive" className="shrink-0 font-medium">Delete Workspace</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
