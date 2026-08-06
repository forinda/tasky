CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_owner_name_unq` ON `categories` (`owner_id`,`name`);--> statement-breakpoint
CREATE TABLE `task_categories` (
	`task_id` text NOT NULL,
	`category_id` text NOT NULL,
	PRIMARY KEY(`task_id`, `category_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`priority` text DEFAULT 'medium' NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `tasks_owner_idx` ON `tasks` (`owner_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);