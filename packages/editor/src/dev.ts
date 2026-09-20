/**
 * Whether this is a development build, for warnings that help while wiring the editor up and have no
 * business in a shipped bundle. Bundlers replace `import.meta.env.DEV` with a constant, so those
 * warnings fold away in production; a bundler that defines nothing simply gets silence.
 */
export const isDev: boolean = import.meta.env?.DEV === true;
