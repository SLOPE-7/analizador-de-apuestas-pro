import { supabase } from "@/lib/supabase";

export type SavedMatch = {
  id?: number;
  match_id?: string;
  data: any;
};

export async function savePartido(payload: SavedMatch) {
  if (!supabase) throw new Error("Supabase no configurado");

  const { data, error } = await supabase
    .from("partidos")
    .upsert(payload, { onConflict: "match_id" })
    .select();

  if (error) throw error;
  return data;
}

export async function getPartidos() {
  if (!supabase) throw new Error("Supabase no configurado");

  const { data, error } = await supabase
    .from("partidos")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function deletePartido(id: number) {
  if (!supabase) throw new Error("Supabase no configurado");

  const { error } = await supabase
    .from("partidos")
    .delete()
    .eq("id", id);

  if (error) throw error;
}