import { supabase } from "./supabase";

export type SavedMatch = {
  id?: number;
  match_id: string;
  local: string;
  visitante: string;
  liga?: string;
  fecha?: string;
  arbitro?: string;
  home_rows: unknown[];
  away_rows: unknown[];
  analysis?: unknown;
  saved_from?: string;
  created_at?: string;
};

export async function savePartido(payload: SavedMatch) {
  const { data, error } = await supabase
    .from("partidos")
    .upsert(payload, { onConflict: "match_id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getPartidos() {
  const { data, error } = await supabase
    .from("partidos")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function deletePartido(id: number) {
  const { error } = await supabase
    .from("partidos")
    .delete()
    .eq("id", id);

  if (error) throw error;
}