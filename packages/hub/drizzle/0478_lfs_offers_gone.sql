-- CawCo no longer offers Git LFS for the files a made repository's first
-- commit left out for size: the session that asked for the repository is
-- told of each file in its answer (repo-publish.ts), and handles them as
-- any git work. The offers' table goes with it.
DROP TABLE `lfs_offers`;
