-- The fleet's image default (core ImageSettings): the provider a
-- generate_image call that names none goes to, and its model. No row reads
-- as ChatGPT on its default model, as before.
CREATE TABLE `image_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`model` text
);
