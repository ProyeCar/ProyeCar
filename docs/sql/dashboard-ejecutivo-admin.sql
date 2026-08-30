-- Dashboard Ejecutivo: acceso de profesional, jefe y administrador.
-- Ejecutado y verificado en producción (isncjtomlvxyvcaohcpx).
-- La tabla dashboards_ejecutivos ya existía con columna dashboard_html (7 filas
-- reales) -> se renombró a html, no se recreó. usuarios NO tiene columna 'activo'.

ALTER TABLE dashboards_ejecutivos RENAME COLUMN dashboard_html TO html;
ALTER TABLE dashboards_ejecutivos ALTER COLUMN jefe_id SET NOT NULL;
ALTER TABLE dashboards_ejecutivos ALTER COLUMN frente SET DEFAULT 'todos';
ALTER TABLE dashboards_ejecutivos ALTER COLUMN frente SET NOT NULL;

CREATE INDEX IF NOT EXISTS dashboards_ejecutivos_jefe_profesional_creado_idx
  ON dashboards_ejecutivos (jefe_id, profesional_id, creado_en DESC);

DROP FUNCTION IF EXISTS ra_guardar_dashboard(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS ra_list_jefe_dashboards(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS ra_get_dashboard_html(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION ra_guardar_dashboard(
  p_actor_id UUID, p_codigo TEXT, p_frente TEXT, p_html TEXT, p_jefe_id UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_actor usuarios;
  v_jefe_id UUID;
  v_dashboard_id UUID;
BEGIN
  SELECT * INTO v_actor FROM usuarios
  WHERE id = p_actor_id AND codigo_acceso = trim(p_codigo);
  IF NOT FOUND THEN RAISE EXCEPTION 'Acceso denegado'; END IF;

  IF lower(v_actor.rol) = 'profesional' THEN
    v_jefe_id := v_actor.jefe_id;
    IF v_jefe_id IS NULL OR (p_jefe_id IS NOT NULL AND p_jefe_id <> v_jefe_id) THEN
      RAISE EXCEPTION 'El profesional no tiene un jefe válido asignado';
    END IF;
  ELSIF lower(v_actor.rol) IN ('admin', 'administrador') THEN
    v_jefe_id := p_jefe_id;
    IF v_jefe_id IS NULL THEN RAISE EXCEPTION 'El administrador debe indicar un jefe'; END IF;
  ELSE
    RAISE EXCEPTION 'Solo profesionales y administradores pueden guardar dashboards';
  END IF;

  PERFORM 1 FROM usuarios WHERE id = v_jefe_id AND lower(rol) = 'jefe';
  IF NOT FOUND THEN RAISE EXCEPTION 'Jefe destino inválido'; END IF;

  INSERT INTO dashboards_ejecutivos (profesional_id, jefe_id, frente, html)
  VALUES (p_actor_id, v_jefe_id, COALESCE(NULLIF(trim(p_frente), ''), 'todos'), p_html)
  RETURNING id INTO v_dashboard_id;
  RETURN v_dashboard_id;
END; $$;

CREATE OR REPLACE FUNCTION ra_list_admin_dashboards(p_admin_id UUID, p_codigo TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_admin usuarios;
BEGIN
  SELECT * INTO v_admin FROM usuarios WHERE id = p_admin_id AND codigo_acceso = trim(p_codigo);
  IF NOT FOUND OR lower(v_admin.rol) NOT IN ('admin', 'administrador') THEN RAISE EXCEPTION 'Acceso denegado'; END IF;
  RETURN COALESCE((SELECT json_agg(json_build_object(
    'id', d.id, 'profesional_id', d.profesional_id, 'profesional_nombre', u.nombre,
    'frente', d.frente, 'creado_en', d.creado_en
  ) ORDER BY d.creado_en DESC) FROM dashboards_ejecutivos d JOIN usuarios u ON u.id = d.profesional_id), '[]'::JSON);
END; $$;

CREATE OR REPLACE FUNCTION ra_get_admin_dashboard_html(p_admin_id UUID, p_dashboard_id UUID, p_codigo TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_admin usuarios; v_html TEXT;
BEGIN
  SELECT * INTO v_admin FROM usuarios WHERE id = p_admin_id AND codigo_acceso = trim(p_codigo);
  IF NOT FOUND OR lower(v_admin.rol) NOT IN ('admin', 'administrador') THEN RAISE EXCEPTION 'Acceso denegado'; END IF;
  SELECT html INTO v_html FROM dashboards_ejecutivos WHERE id = p_dashboard_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dashboard no encontrado'; END IF;
  RETURN v_html;
END; $$;

CREATE OR REPLACE FUNCTION ra_delete_dashboard(p_admin_id UUID, p_dashboard_id UUID, p_codigo TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_admin usuarios;
BEGIN
  SELECT * INTO v_admin FROM usuarios WHERE id = p_admin_id AND codigo_acceso = trim(p_codigo);
  IF NOT FOUND OR lower(v_admin.rol) NOT IN ('admin', 'administrador') THEN RAISE EXCEPTION 'Acceso denegado'; END IF;
  DELETE FROM dashboards_ejecutivos WHERE id = p_dashboard_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dashboard no encontrado'; END IF;
  RETURN TRUE;
END; $$;

CREATE OR REPLACE FUNCTION ra_list_jefe_dashboards(
  p_jefe_id UUID, p_profesional_id UUID, p_codigo TEXT
) RETURNS TABLE(id UUID, profesional_id UUID, jefe_id UUID, frente TEXT, creado_en TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM usuarios u
    WHERE u.id = p_jefe_id AND u.codigo_acceso = trim(p_codigo) AND lower(u.rol) = 'jefe';
  IF NOT FOUND THEN RAISE EXCEPTION 'Acceso denegado'; END IF;
  RETURN QUERY SELECT d.id, d.profesional_id, d.jefe_id, d.frente, d.creado_en
    FROM dashboards_ejecutivos d
    WHERE d.jefe_id = p_jefe_id AND d.profesional_id = p_profesional_id
    ORDER BY d.creado_en DESC;
END; $$;

CREATE OR REPLACE FUNCTION ra_get_dashboard_html(
  p_jefe_id UUID, p_dashboard_id UUID, p_codigo TEXT
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_html TEXT;
BEGIN
  PERFORM 1 FROM usuarios u
    WHERE u.id = p_jefe_id AND u.codigo_acceso = trim(p_codigo) AND lower(u.rol) = 'jefe';
  IF NOT FOUND THEN RAISE EXCEPTION 'Acceso denegado'; END IF;
  SELECT html INTO v_html FROM dashboards_ejecutivos WHERE id = p_dashboard_id AND jefe_id = p_jefe_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dashboard no encontrado'; END IF;
  RETURN v_html;
END; $$;

REVOKE ALL ON TABLE dashboards_ejecutivos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ra_guardar_dashboard(UUID, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION ra_list_admin_dashboards(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION ra_get_admin_dashboard_html(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION ra_delete_dashboard(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION ra_list_jefe_dashboards(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION ra_get_dashboard_html(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ra_guardar_dashboard(UUID, TEXT, TEXT, TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION ra_list_admin_dashboards(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION ra_get_admin_dashboard_html(UUID, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION ra_delete_dashboard(UUID, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION ra_list_jefe_dashboards(UUID, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION ra_get_dashboard_html(UUID, UUID, TEXT) TO anon, authenticated;
