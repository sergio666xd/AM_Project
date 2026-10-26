"use client";

import GuestOnly from "@/components/auth/GuestOnly";
import { PortalLoginForm } from "@/components/auth/PortalLoginForm";

export default function LoginPage() {
  return <GuestOnly><PortalLoginForm portal="users" /></GuestOnly>;
}
