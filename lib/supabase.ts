import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
}
let client: SupabaseClient | undefined;
// Delay initialization so an unconfigured checkout can build and show setup guidance.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    if (!isSupabaseConfigured()) throw new Error('Supabase is not configured. See README.md.');
    client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!);
    const value = Reflect.get(client, property);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

// Projects
export async function getProjects() {
  const { data, error } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
export async function insertProject(row: object) {
  const { data, error } = await supabase.from("projects").insert(row).select();
  if (error) throw error;
  return data;
}
export async function updateProject(id: string, patch: object) {
  const { error } = await supabase.from("projects").update(patch).eq("id", id);
  if (error) throw error;
}

// Owners
export async function getOwners(projectId?: string) {
  let q = supabase.from("owners").select("*").order("created_at", { ascending: false });
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
export async function insertOwner(row: object) {
  const { data, error } = await supabase.from("owners").insert(row).select();
  if (error) throw error;
  return data;
}

// Doc log
export async function getDocLog() {
  const { data, error } = await supabase.from("doc_log").select("*").order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return data || [];
}
export async function insertDocLog(row: object) {
  const { data, error } = await supabase.from("doc_log").insert(row).select();
  if (error) throw error;
  return data;
}

// Generic key-value store for offers, letters, cases, templates, runsheets, skip subjects
// We store these as JSONB blobs in a settings table for simplicity
export async function kvGet(key: string) {
  const { data } = await supabase.from("kv_store").select("value").eq("key", key).single();
  return data?.value ?? null;
}
export async function kvSet(key: string, value: unknown) {
  await supabase.from("kv_store").upsert({ key, value }, { onConflict: "key" });
}
