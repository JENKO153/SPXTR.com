// Shared helpers for the SPXTR Edge Functions.

// Only the shop's own site may call these from a browser. SITE_URL is the live address;
// ALLOWED_ORIGINS can add more, comma separated (e.g. http://localhost:8080 while testing).
const allowed = [Deno.env.get('SITE_URL') ?? '', ...(Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',')]
  .map(s => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

export function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  if (allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export const originAllowed = (req: Request) => allowed.includes(req.headers.get('Origin') ?? '');

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

export function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing secret ${name}. Set it with: supabase secrets set ${name}=...`);
  return v;
}

// Service key for server-side writes. Supabase injects this into every Edge Function.
export const serviceKey = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? env('SUPABASE_SECRET_KEY');

export const siteUrl = () => env('SITE_URL').replace(/\/$/, '');
