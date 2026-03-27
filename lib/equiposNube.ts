import { supabase } from "@/lib/supabase";

export type EquipoGuardado = {
  id?: number;
  nombre: string;
  liga?: string | null;
  tipo?: string | null;
  mercado_ideal?: string | null;
  created_at?: string;
};

const TABLA_EQUIPOS = "equipos"; // 👈 nombre real en Supabase

export async function guardarEquipoNube(equipo: EquipoGuardado) {
  if (!supabase) throw new Error("Supabase no configurado");

  const { error } = await supabase
    .from(TABLA_EQUIPOS)
    .insert([equipo]);

  if (error) throw error;
}

export async function obtenerEquiposNube() {
  if (!supabase) throw new Error("Supabase no configurado");

  const { data, error } = await supabase
    .from(TABLA_EQUIPOS)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}