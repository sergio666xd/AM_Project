"use client";

import GuestOnly from "@/components/auth/GuestOnly";
import { PortalLoginForm } from "@/components/auth/PortalLoginForm";

export default function AdminLoginPage() {
  return <GuestOnly><PortalLoginForm portal="admin" /></GuestOnly>;
}
