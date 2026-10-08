const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
  || process.env.VERCEL_PROJECT_PRODUCTION_URL
  || "http://localhost:3000";

export const SITE_URL = new URL(
  configuredSiteUrl.startsWith("http") ? configuredSiteUrl : `https://${configuredSiteUrl}`,
);
