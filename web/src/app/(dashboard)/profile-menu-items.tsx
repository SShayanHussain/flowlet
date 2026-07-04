"use client";

import { useRouter } from "next/navigation";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

/**
 * Interactive dropdown items for the profile menu. Must live in a Client
 * Component — event handlers cannot be passed from the (Server Component)
 * dashboard layout to the client-side DropdownMenuItem.
 */
export function ProfileMenuItems() {
  const router = useRouter();

  return (
    <>
      <DropdownMenuItem
        onClick={() => router.push("/settings/profile")}
        className="cursor-pointer"
      >
        Profile Settings
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => router.push("/settings/workspace")}
        className="cursor-pointer"
      >
        Workspace Settings
      </DropdownMenuItem>
    </>
  );
}
