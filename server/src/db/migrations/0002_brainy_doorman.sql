ALTER TABLE `tasks` ADD `position` real DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Hand-added after `drizzle-kit generate`, which only emits the ALTER. Leaving
-- every pre-existing row on the default 0 would give a column no order at all:
-- ORDER BY position on all-equal values is whatever SQLite feels like today.
-- Backfilled from the order the board already showed (created_at, id as the
-- tiebreak for rows sharing a millisecond), per (owner_id, status) — the
-- partition the ordering is defined within. row_number() starts at 1, leaving
-- 0 and below free for the min - 1 that new tasks take.
UPDATE `tasks` SET `position` = (
	SELECT `seq` FROM (
		SELECT `id`, row_number() OVER (
			PARTITION BY `owner_id`, `status` ORDER BY `created_at`, `id`
		) AS `seq` FROM `tasks`
	) AS `ranked` WHERE `ranked`.`id` = `tasks`.`id`
);
