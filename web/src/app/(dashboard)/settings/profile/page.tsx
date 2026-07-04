"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

export default function ProfileSettingsPage() {
  const { user } = useAuth();

  if (!user) {
    // Show skeleton or nothing while loading
    return <div className="animate-pulse h-96 bg-muted/20 rounded-xl" />;
  }

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h3 className="text-xl font-semibold tracking-tight">Profile</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your personal information and how others see you on the platform.
        </p>
      </div>
      
      {/* Profile Appearance */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Profile Appearance</CardTitle>
          <CardDescription>Customize your avatar and presentation.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-8">
            <Avatar className="h-24 w-24 border-2 border-border/50 shadow-sm">
              <AvatarFallback className="text-3xl font-medium bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
                {user.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" className="bg-background">
                  Upload new avatar
                </Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                  Remove
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Recommended size: 256x256px. Maximum file size: 2MB.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personal Information */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Personal Information</CardTitle>
          <CardDescription>Update your name and email address.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" defaultValue={user.name} className="max-w-md" />
            </div>
          </div>
          
          <Separator className="bg-border/40" />
          
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" defaultValue={user.email} disabled className="max-w-md bg-muted/30" />
              <p className="text-[13px] text-muted-foreground mt-1">
                Your email address is used for login and cannot be changed here.
              </p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="bg-muted/10 border-t py-4 px-6">
          <Button>Save Changes</Button>
        </CardFooter>
      </Card>

      {/* Security */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Security</CardTitle>
          <CardDescription>Manage your password and security preferences.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current Password</Label>
            <Input id="current-password" type="password" className="max-w-md" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input id="new-password" type="password" className="max-w-md" />
          </div>
        </CardContent>
        <CardFooter className="bg-muted/10 border-t py-4 px-6">
          <Button variant="secondary">Update Password</Button>
        </CardFooter>
      </Card>
      
      {/* Danger Zone */}
      <Card className="border-destructive/30 shadow-sm overflow-hidden">
        <CardHeader className="bg-destructive/5 border-b border-destructive/10 pb-4">
          <CardTitle className="text-lg text-destructive">Danger Zone</CardTitle>
          <CardDescription className="text-destructive/80">Permanently delete your account and all associated data.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1 max-w-lg">
              <h4 className="font-medium text-sm">Delete Account</h4>
              <p className="text-[13px] text-muted-foreground">
                Once you delete your account, there is no going back. Please be certain. All your workspaces where you are the sole owner will also be deleted.
              </p>
            </div>
            <Button variant="destructive" className="shrink-0 font-medium">Delete Account</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
