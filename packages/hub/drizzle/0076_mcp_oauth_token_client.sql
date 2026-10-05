ALTER TABLE fleet_mcp_oauth ADD COLUMN token_client text;
--> statement-breakpoint
UPDATE fleet_mcp_oauth SET token_client = client WHERE tokens IS NOT NULL;
