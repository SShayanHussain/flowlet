"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Loader2, Shield, User, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function TeamSettingsPage() {
  const { workspaceId, accessToken, user: currentUser } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInviting, setIsInviting] = useState(false);

  async function fetchMembers() {
    if (!workspaceId || !accessToken) return;
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (res.ok) {
        setMembers(data.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, accessToken]);

  async function handleInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!workspaceId || !accessToken) return;

    setIsInviting(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ email, role: "member" }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to invite member");
      }
      
      toast.success("Member added to workspace");
      (e.target as HTMLFormElement).reset();
      fetchMembers(); // refresh list
    } catch (error: unknown) {
      if (error instanceof Error) {
        toast.error(error.message);
      }
    } finally {
      setIsInviting(false);
    }
  }

  async function handleRemove(userId: string) {
    if (!workspaceId || !accessToken) return;
    if (!confirm("Are you sure you want to remove this member?")) return;

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members?userId=${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to remove member");
      }
      
      toast.success("Member removed");
      setMembers(members.filter(m => m.id !== userId));
    } catch (error: unknown) {
      if (error instanceof Error) {
        toast.error(error.message);
      }
    }
  }

  async function handleChangeRole(userId: string, newRole: string) {
    if (!workspaceId || !accessToken) return;

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}` 
        },
        body: JSON.stringify({ userId, role: newRole })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to update role");
      }
      
      toast.success("Role updated");
      setMembers(members.map(m => m.id === userId ? { ...m, role: newRole } : m));
    } catch (error: unknown) {
      if (error instanceof Error) {
        toast.error(error.message);
      }
    }
  }

  const currentUserRole = members.find(m => m.id === currentUser?.id)?.role || "member";
  const isOwner = currentUserRole === "owner";

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Team</h3>
        <p className="text-sm text-muted-foreground">
          Manage who has access to this workspace.
        </p>
      </div>
      
      {isOwner && (
        <Card>
          <form onSubmit={handleInvite}>
            <CardHeader>
              <CardTitle>Invite Member</CardTitle>
              <CardDescription>Add a new member to your workspace.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <Input name="email" type="email" placeholder="colleague@company.com" required disabled={isInviting} className="flex-1" />
                <Button type="submit" disabled={isInviting}>
                  {isInviting ? "Inviting..." : "Send Invite"}
                </Button>
              </div>
            </CardContent>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>People with access to this workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 divide-y divide-border">
            {members.map((member) => (
              <div key={member.id} className="flex items-center justify-between pt-4 first:pt-0">
                <div className="flex items-center gap-4">
                  <Avatar>
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {member.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium leading-none flex items-center gap-2">
                      {member.name}
                      {member.id === currentUser?.id && (
                        <Badge variant="outline" className="text-[10px] py-0 h-4">You</Badge>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">{member.email}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  {/* Role indicator / selector */}
                  {isOwner && member.id !== currentUser?.id ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="outline" size="sm" className="h-8">
                            {member.role === "owner" ? <Shield className="mr-2 w-3 h-3 text-primary" /> : <User className="mr-2 w-3 h-3 text-muted-foreground" />}
                            <span className="capitalize">{member.role}</span>
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleChangeRole(member.id, "member")}>
                          <User className="mr-2 w-4 h-4 text-muted-foreground" /> Member
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleChangeRole(member.id, "owner")}>
                          <Shield className="mr-2 w-4 h-4 text-primary" /> Owner
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <div className="flex items-center text-sm text-muted-foreground capitalize mr-2">
                      {member.role === "owner" ? <Shield className="mr-1 w-3 h-3 text-primary" /> : <User className="mr-1 w-3 h-3" />}
                      {member.role}
                    </div>
                  )}

                  {/* Remove button */}
                  {isOwner && member.id !== currentUser?.id && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleRemove(member.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
