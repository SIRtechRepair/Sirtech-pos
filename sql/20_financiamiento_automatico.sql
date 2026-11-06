-- ============================================================
-- SIR·TECH POS · 20 · Cuotas automáticas desde la fecha de la cuota 1
--
-- Ejecutar después de 19_dia_limite_mora.sql.
-- ============================================================

create or replace function public.crear_venta_equipo(
  p_venta jsonb,
  p_pagos jsonb,
  p_agregados jsonb
)
returns bigint
language plpgsql
security definer set search_path = public
as $$
declare
  v_venta    bigint;
  v_total    numeric(12,2) := coalesce((p_venta->>'total')::numeric, 0);
  v_inicial  numeric(12,2) := coalesce((p_venta->>'inicial')::numeric, 0);
  v_n        integer := coalesce((p_venta->>'numero_cuotas')::integer, 0);
  v_valor    numeric(12,2) := coalesce((p_venta->>'valor_cuota')::numeric, 0);
  v_fecha    timestamptz := coalesce(nullif(p_venta->>'fecha', '')::timestamptz, now());
  v_primer   date;
  v_fecha_c  date;
  v_suma     numeric(12,2);
  v_monto    numeric(12,2);
  i          integer;
  v_pago     jsonb;
  v_ag       jsonb;
  v_prod     bigint;
  v_cant     numeric(12,2);
  v_fifo     jsonb;
  v_costo    numeric(12,2);
  v_desc     text;
  v_precio   numeric(12,2);
begin
  if not public.es_staff() then
    raise exception 'Sin permisos';
  end if;
  if v_total <= 0 then
    raise exception 'El total debe ser mayor a 0';
  end if;
  if v_inicial < 0 or v_inicial > v_total + 0.5 then
    raise exception 'El inicial no puede superar el total';
  end if;
  if v_n > 0 and v_valor <= 0 then
    raise exception 'Escribe el valor de la cuota';
  end if;

  v_primer := coalesce(
    nullif(p_venta->>'primer_pago', '')::date,
    (v_fecha at time zone 'America/Bogota')::date + interval '1 month'
  );

  insert into public.equipo_ventas
    (fecha, unidad_id, equipo, cpu, ram, almacenamiento, detalles, vendedor,
     comprador, cliente_id, contacto, total, precio_contado, costo, comision,
     envio, gastos, inicial, numero_cuotas, valor_cuota, primer_pago,
     dia_limite, estado_equipo, origen, de_quien_es, notas, creado_por)
  values
    (v_fecha,
     nullif(p_venta->>'unidad_id', '')::bigint,
     trim(coalesce(p_venta->>'equipo', 'Equipo')),
     nullif(trim(coalesce(p_venta->>'cpu', '')), ''),
     nullif(trim(coalesce(p_venta->>'ram', '')), ''),
     nullif(trim(coalesce(p_venta->>'almacenamiento', '')), ''),
     nullif(trim(coalesce(p_venta->>'detalles', '')), ''),
     nullif(trim(coalesce(p_venta->>'vendedor', '')), ''),
     nullif(trim(coalesce(p_venta->>'comprador', '')), ''),
     nullif(p_venta->>'cliente_id', '')::bigint,
     nullif(trim(coalesce(p_venta->>'contacto', '')), ''),
     v_total,
     coalesce((p_venta->>'precio_contado')::numeric, v_total),
     coalesce((p_venta->>'costo')::numeric, 0),
     coalesce((p_venta->>'comision')::numeric, 0),
     coalesce((p_venta->>'envio')::numeric, 0),
     coalesce((p_venta->>'gastos')::numeric, 0),
     v_inicial, v_n, v_valor,
     case when v_n > 0 then v_primer else null end,
     coalesce((p_venta->>'dia_limite')::integer, 5),
     coalesce(nullif(p_venta->>'estado_equipo', ''), 'vendido'),
     coalesce(nullif(p_venta->>'origen', ''), 'SNEIDER'),
     nullif(trim(coalesce(p_venta->>'de_quien_es', '')), ''),
     nullif(trim(coalesce(p_venta->>'notas', '')), ''),
     auth.uid())
  returning id into v_venta;

  if nullif(p_venta->>'unidad_id', '') is not null then
    update public.equipos_unidades
       set estado = 'vendido', actualizado_en = now()
     where id = (p_venta->>'unidad_id')::bigint;
  end if;

  if v_n > 0 then
    v_suma := v_inicial;
    for i in 1..v_n loop
      v_monto := case when i = v_n then greatest(v_total - v_suma, 0) else v_valor end;
      if v_monto > 0 then
        v_fecha_c := (v_primer + ((i - 1) || ' months')::interval)::date;
        insert into public.equipo_cuotas
          (venta_id, numero, fecha_vencimiento, monto)
        values
          (v_venta, i, v_fecha_c, v_monto);
        v_suma := v_suma + v_monto;
      end if;
    end loop;
  end if;

  if p_pagos is not null then
    for v_pago in select * from jsonb_array_elements(p_pagos)
    loop
      if coalesce((v_pago->>'monto')::numeric, 0) > 0 then
        insert into public.equipo_pagos
          (venta_id, cuota_id, fecha, monto, metodo, tipo, nota, usuario)
        values
          (v_venta,
           nullif(v_pago->>'cuota_id', '')::bigint,
           coalesce(nullif(v_pago->>'fecha', '')::timestamptz, v_fecha),
           (v_pago->>'monto')::numeric,
           coalesce(nullif(v_pago->>'metodo', ''), 'efectivo'),
           coalesce(nullif(v_pago->>'tipo', ''), 'abono'),
           nullif(trim(coalesce(v_pago->>'nota', '')), ''),
           auth.uid());
      end if;
    end loop;
  end if;

  if p_agregados is not null then
    for v_ag in select * from jsonb_array_elements(p_agregados)
    loop
      v_prod := nullif(v_ag->>'producto_id', '')::bigint;
      v_cant := coalesce((v_ag->>'cantidad')::numeric, 1);
      v_precio := coalesce((v_ag->>'precio_unitario')::numeric, 0);
      v_desc := nullif(trim(coalesce(v_ag->>'descripcion', '')), '');
      v_costo := 0;

      if v_prod is not null then
        select nombre into v_desc from public.productos where id = v_prod;
        v_fifo := public.consumir_fifo(v_prod, v_cant);
        v_costo := coalesce((v_fifo->>'costo_total')::numeric, 0);

        insert into public.accesorio_movimientos
          (producto_id, tipo, cantidad, costo_unitario, referencia_id, nota, usuario)
        values
          (v_prod, 'venta', -v_cant,
           case when v_cant > 0 then v_costo / v_cant else 0 end,
           v_venta, 'Agregado en venta de equipo', auth.uid());
      end if;

      if v_desc is not null then
        insert into public.equipo_venta_agregados
          (venta_id, producto_id, descripcion, cantidad, precio_unitario,
           costo_unitario, costo_total)
        values
          (v_venta, v_prod, v_desc, v_cant, v_precio,
           case when v_cant > 0 then v_costo / v_cant else 0 end, v_costo);
      end if;
    end loop;

    update public.equipo_ventas
       set costo_agregados = coalesce((
             select sum(costo_total) from public.equipo_venta_agregados where venta_id = v_venta
           ), 0)
     where id = v_venta;
  end if;

  return v_venta;
end $$;

revoke all on function public.crear_venta_equipo(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.crear_venta_equipo(jsonb, jsonb, jsonb) to authenticated;
