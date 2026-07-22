-- Catálogo de municipios para ProyeCar.
-- Ejecutar manualmente en el SQL Editor de Supabase (proyecto isncjtomlvxyvcaohcpx).
-- No crea/altera la tabla "frentes": los frentes viven en el cliente (offline-first),
-- solo el catálogo de municipios vive en Supabase.

CREATE TABLE IF NOT EXISTS municipios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO municipios (nombre) VALUES
  ('Cartagena de Indias'),
  ('Bayunca'),
  ('Mahates')
ON CONFLICT (nombre) DO NOTHING;

-- Lectura pública (anon): el selector de municipio en index.html no requiere sesión.
CREATE OR REPLACE FUNCTION ra_list_municipios()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  RETURN COALESCE((
    SELECT json_agg(
      json_build_object('id', id, 'nombre', nombre)
      ORDER BY nombre
    ) FROM municipios WHERE activo = TRUE
  ), '[]'::JSON);
END; $$;
GRANT EXECUTE ON FUNCTION ra_list_municipios() TO anon, authenticated;

-- Creación: solo admin (mismo patrón p_admin_id/p_codigo que el resto de RPCs ra_*).
CREATE OR REPLACE FUNCTION ra_create_municipio(
  p_admin_id UUID, p_codigo TEXT, p_nombre TEXT
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_admin usuarios; v_id UUID;
BEGIN
  SELECT * INTO v_admin FROM usuarios
  WHERE id = p_admin_id AND codigo_acceso = trim(p_codigo);
  IF NOT FOUND OR lower(v_admin.rol) NOT IN ('admin', 'administrador') THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;
  INSERT INTO municipios (nombre) VALUES (trim(p_nombre))
  ON CONFLICT (nombre) DO NOTHING
  RETURNING id INTO v_id;
  RETURN json_build_object('id', v_id, 'ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION ra_create_municipio(UUID,TEXT,TEXT) TO anon, authenticated;
