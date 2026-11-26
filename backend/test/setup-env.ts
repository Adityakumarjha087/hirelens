// Defaults for tests; CI overrides DATABASE_URL / REDIS_URL via the environment.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://hirelens:hirelens@localhost:20210/hirelens_test?schema=public';
process.env.REDIS_URL ??= 'redis://localhost:20211/1';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-0123456789abcdef';
process.env.QUEUE_PREFIX = `hl-test-${process.pid}`;
process.env.THROTTLE_LIMIT ??= '10000';
