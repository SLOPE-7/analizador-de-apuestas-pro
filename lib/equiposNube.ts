import { supabase } from "@/lib/supabase";

export type EquipoGuardado = {
  id?: number;
  nombre: string;
  liga?: string | null;
  tipo?: string | null;
  mercado_ideal?: string | null;
  created_at?: string;
};

export async function guardarEquipoNube(equipo: EquipoGuardado) {
  const { error } = await supabase.from("equipos_guardados").insert([equipo]);
  if (error) throw error;
}

export async function obtenerEquiposNube() {
  const { data, error } = await supabase
    .from("equipos_guardados")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}