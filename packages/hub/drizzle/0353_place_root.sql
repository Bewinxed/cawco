-- A checkout keeps its root commit (`project_places.root`), read with its
-- origin as it is added and at each register of its machine: a move compares
-- it with the target's checkouts without reaching the source's machine, so a
-- start whose source is away still finds the target's checkout of the same
-- repository. Null on every row until its machine is next read.
ALTER TABLE `project_places` ADD `root` text;
