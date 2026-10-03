CREATE TABLE `completed_turns` (
  `instance_id` text NOT NULL,
  `result_id` text NOT NULL,
  `completed_at` text,
  `adopted_without_report` integer NOT NULL,
  PRIMARY KEY (`instance_id`, `result_id`)
);
