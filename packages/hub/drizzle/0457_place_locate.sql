-- A folder the person pointed a checkout at with its machine away (Locate
-- folder, project-locate.ts), held until that machine can read it at its
-- next register. Null: none held, as for every place filed until here.
ALTER TABLE `project_places` ADD `locate_to` text;
