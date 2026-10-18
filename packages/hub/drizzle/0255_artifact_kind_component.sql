-- A component's states shown live are a component canvas (component canvas
-- §4): the artifact kind `sheet` is `component` from here on, with no shim.
UPDATE `artifacts` SET `kind` = 'component' WHERE `kind` = 'sheet';
