/// <reference types="vite/client" />
import flowStyles from '@xyflow/svelte/dist/style.css?inline';
import themeStyles from './theme.css?inline';
import editorStyles from './editor.css?inline';

/** All editor CSS as one string, injected by `createEditor`. */
export default `${flowStyles}\n${themeStyles}\n${editorStyles}`;
