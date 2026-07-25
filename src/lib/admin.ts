export function isVoxAdmin(email: string): boolean {
  const configured = (process.env.VOX_ADMIN_EMAILS ?? "demo@vox.ai")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return configured.includes(email.toLowerCase());
}
