import { supabase } from './supabase';

export const CASE_TYPES = ['Probate', 'Quiet Title', 'Mineral Acquisition', 'Lease Negotiation', 'Title Curative', 'Heirship Research'] as const;
export type CaseInput = { title: string; type: string; county: string; description: string; assignee: string };
export type CaseRecord = CaseInput & { id: string; created_at: string; status: string; tasks: any[]; version: number };
export function validateCase(input: CaseInput): CaseInput {
  const row = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : ''])) as CaseInput;
  if (!row.title || row.title.length > 200) throw new Error('Title is required and must be 200 characters or fewer.');
  if (!CASE_TYPES.includes(row.type as typeof CASE_TYPES[number])) throw new Error('Select a supported case type.');
  if (row.county.length > 100) throw new Error('County must be 100 characters or fewer.');
  if (row.assignee.length > 100) throw new Error('Assignee must be 100 characters or fewer.');
  if (row.description.length > 10000) throw new Error('Description must be 10,000 characters or fewer.');
  return { title: row.title, type: row.type, county: row.county, description: row.description, assignee: row.assignee };
}
const columns = 'id,title,type,county,description,assignee,status,tasks,created_at,version';
export async function getCases(): Promise<CaseRecord[]> {
  const { data, error } = await supabase.from('cases').select(columns).order('created_at', { ascending: false }).order('id');
  if (error) throw error;
  return data || [];
}
export async function createCase(input: CaseInput, id: string): Promise<CaseRecord> {
  const row = validateCase(input);
  // A stable ID survives uncertain responses: retry cannot create a second case.
  const { data: existing, error: lookupError } = await supabase.from('cases').select(columns).eq('id', id).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return existing;
  const { data, error } = await supabase.from('cases').insert({ ...row, id }).select(columns).single();
  if (error) {
    if (error.code === '23505') {
      const { data: saved, error: readError } = await supabase.from('cases').select(columns).eq('id', id).single();
      if (!readError && saved) return saved;
    }
    throw error;
  }
  return data;
}
export async function saveCaseTasks(record: CaseRecord, tasks: any[]): Promise<CaseRecord> {
  const { data, error } = await supabase.from('cases').update({ tasks, version: record.version + 1 }).eq('id', record.id).eq('version', record.version).select(columns).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This case changed in another session. Refresh cases before trying again.');
  return data;
}
