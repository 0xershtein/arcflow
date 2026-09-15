/**
 * Stroke icons on a 24px grid. Each value is the inner markup of an <svg>.
 * Add your own by extending this record; node definitions reference icons by name.
 */
export const icons = {
	clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
	webhook: '<circle cx="6" cy="17" r="2.5"/><circle cx="18" cy="17" r="2.5"/><circle cx="12" cy="6" r="2.5"/><path d="M8.5 17H15.5M10.8 8.2 7.2 14.8M13.2 8.2l3.6 6.6"/>',
	hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6.5 7-3 0-4.5-1.5-6-4l-1.8-3a1.4 1.4 0 0 1 2.3-1.6L8 13"/>',
	sparkle: '<path d="M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',
	split: '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="19" r="2"/><path d="M12 17v-5M12 12 6.8 7.5M12 12l5.2-4.5"/>',
	signers: '<path d="M4 17a8 8 0 0 1 16 0"/><circle cx="4" cy="17" r="1.8"/><circle cx="12" cy="9" r="1.8"/><circle cx="20" cy="17" r="1.8"/>',
	send: '<path d="M4 12h14M13 6l6 6-6 6"/>',
	bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
	hourglass: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>',
	globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.7 5.4 3.7 8.5s-1.2 5.9-3.7 8.5c-2.5-2.6-3.7-5.4-3.7-8.5s1.2-5.9 3.7-8.5z"/>',
	code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
	reply: '<path d="M10 7 5 12l5 5"/><path d="M5 12h9a5 5 0 0 1 5 5v1"/>',
	pencil: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
	switch: '<path d="M4 12h5M9 12c3 0 4-5 7-5h4M9 12c3 0 4 5 7 5h4M9 12h11"/>',
	merge: '<path d="M4 7h4c3 0 4 5 7 5h5M4 17h4c3 0 4-5 7-5"/><path d="m17 9 3 3-3 3"/>',
	repeat: '<path d="m17 4 3 3-3 3"/><path d="M4 11V9a2 2 0 0 1 2-2h14M7 20l-3-3 3-3"/><path d="M20 13v2a2 2 0 0 1-2 2H4"/>',
	layers: '<path d="m12 4 8 4-8 4-8-4z"/><path d="m4 12 8 4 8-4M4 16l8 4 8-4"/>',
	chevron: '<path d="m9 6 6 6-6 6"/>',
	undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
	redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
	note: '<path d="M5 4h14v10l-6 6H5z"/><path d="M13 20v-6h6"/>',
	plus: '<path d="M12 5v14M5 12h14"/>',
	search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
	trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
	copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
	play: '<path d="M7 5v14l12-7z"/>',
	stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
	download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
	upload: '<path d="M12 15V4M7 9l5-5 5 5M5 20h14"/>',
	check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
	x: '<path d="M6 6l12 12M18 6 6 18"/>',
	alert: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17.2v.1"/>',
	fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
	panel: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M15 4.5v15"/>'
} as const;

export type IconName = keyof typeof icons;
