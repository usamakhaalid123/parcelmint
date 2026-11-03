CREATE FUNCTION "public"."prevent_inventory_movement_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'inventory_movements is append-only' USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "inventory_movements_prevent_update_delete"
BEFORE UPDATE OR DELETE ON "public"."inventory_movements"
FOR EACH ROW
EXECUTE FUNCTION "public"."prevent_inventory_movement_mutation"();
