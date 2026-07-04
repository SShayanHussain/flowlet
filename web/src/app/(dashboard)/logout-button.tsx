"use client";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/components/providers/auth-provider";

export function LogoutButton() {
  const { logout } = useAuth();
  
  return (
    <DropdownMenuItem 
      onClick={(e: React.MouseEvent) => {
        e.preventDefault();
        logout();
      }}
      className="text-destructive focus:text-destructive cursor-pointer"
    >
      Log out
    </DropdownMenuItem>
  );
}
