import { supabase } from "@/lib/supabase";

export type PartidoGuardado = {
  id?: number;
  nombre_partido: string;
  local: string;
  visitante: string;
  liga?: string | null;
  fecha_partido?: string | null;
  arbitro?: string | null;
  payload: unknown;
  created_at?: string;
};

export async function guardarPartidoNube(partido: PartidoGuardado) {
  if (!supabase) throw new Error("Supabase no configurado");
  const { error } = await supabase.from("partidos_guardados").insert([partido]);
  if (error) throw error;
}

export async function obtenerPartidosNube() {
  if (!supabase) throw new Error("Supabase no configurado");
  const { data, error } = await supabase
    .from("partidos_guardados")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}