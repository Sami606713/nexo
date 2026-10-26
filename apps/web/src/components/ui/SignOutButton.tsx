"use client";

import { Button, type ButtonProps } from "@mantine/core";
import { signOut } from "next-auth/react";

export function SignOutButton({ callbackUrl = "/login", children = "Sign out", ...props }: ButtonProps & { callbackUrl?: string; children?: React.ReactNode }) {
  return (
    <Button {...props} onClick={() => signOut({ callbackUrl })}>
      {children}
    </Button>
  );
}
