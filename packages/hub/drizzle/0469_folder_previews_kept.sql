-- A folder preview's files are kept by the hub under its artifact's folder
-- and served from there (artifacts/preview-folder.ts): no artifact is served
-- from a pin any more, so nothing looks one up by its pin. A row a hub from
-- before kept a pin on has its pin's copy moved in as its machine registers,
-- found by its machine (`artifacts_machine_dir`, artifacts/folder-move.ts).
DROP INDEX `artifacts_source_pin`;
