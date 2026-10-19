/**
 * Stand-in for the `server-only` package.
 *
 * The real module exists to make a build fail if server code is imported into a
 * client bundle. Under Vitest there is no bundler boundary, so it is replaced
 * with this empty module (see vitest.config.ts).
 */
export {};
