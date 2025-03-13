import {
	codeFolding,
	foldEffect,
	foldService,
	unfoldEffect,
	foldState,
} from "@codemirror/language";
import {
	combineConfig,
	Compartment,
	EditorState,
	Extension,
	Facet,
	StateEffect,
	StateField,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { FoldAnyWhereSettings } from "../foldAnyWhereIndex";
import { cloneDeep } from "lodash";

// Define the Facet for plugin settings
export const FoldAnywhereConfigFacet = Facet.define<
	FoldAnyWhereSettings,
	Required<FoldAnyWhereSettings>
>({
	combine(settings: readonly FoldAnyWhereSettings[]) {
		const defaultSettings: FoldAnyWhereSettings = {
			startMarker: "%% REGION %%",
			endMarker: "%% ENDREGION %%",
			lineFoldMarker: "%% LINEFOLDSTART %%",
			lineFoldEndMarker: "%% LINEFOLDEND %%",
			autoFoldOnLoad: true,
		};

		return combineConfig(settings, defaultSettings, {
			startMarker: (a, b) => b || a,
			endMarker: (a, b) => b || a,
			lineFoldMarker: (a, b) => b || a,
			lineFoldEndMarker: (a, b) => b || a,
		});
	},
});

export const foldRangesStateField = StateField.define<
	{ from: number; to: number }[]
>({
	create: () => [],
	update(value, tr) {
		// If document changed, recalculate all fold ranges
		if (
			!tr.effects.some((effect) => effect.is(foldEffect)) &&
			!tr.effects.some((effect) => effect.is(unfoldEffect))
		) {
			return value;
		}

		// Check for fold/unfold effects and update accordingly
		for (const effect of tr.effects) {
			if (effect.is(foldEffect)) {
				// Add new fold range if it doesn't already exist
				const range = effect.value;

				// Check if this range exists in the foldable ranges
				const allFoldableRanges = getAllFoldableRanges(tr.state);
				const isValidRange = allFoldableRanges.some(
					(r) => r.from === range.from && r.to === range.to
				);

				if (
					isValidRange &&
					!value.some(
						(r) => r.from === range.from && r.to === range.to
					)
				) {
					value = [...value, range];
				}
			} else if (effect.is(unfoldEffect)) {
				// Remove fold range if it exists
				const range = effect.value;
				value = value.filter(
					(r) => !(r.from === range.from && r.to === range.to)
				);
			}
		}

		return value;
	},
});

// Create a Compartment for reconfiguration
export const FoldAnywhereCompartment = new Compartment();

// Helper function to reconfigure the extension with new settings
export function reconfigureFoldAnywhere(settings: FoldAnyWhereSettings) {
	return FoldAnywhereCompartment.reconfigure(
		FoldAnywhereConfigFacet.of(cloneDeep(settings))
	);
}

function createFoldRangesFromCurrentPOS(
	state: EditorState,
	currentPos: number
): {
	from: number;
	to: number;
}[] {
	// Get settings from the state using the Facet
	const settings = state.facet(FoldAnywhereConfigFacet);

	const startRegex = new RegExp(settings.startMarker, "g");
	const endRegex = new RegExp(settings.endMarker, "g");
	const lineFoldStartRegex = new RegExp(
		settings.lineFoldMarker + "\\s*$",
		"g"
	);
	const lineFoldEndRegex = new RegExp(
		settings.lineFoldEndMarker + "\\s*$",
		"g"
	);

	let ranges: { from: number; to: number }[] = [];
	let startStack: { pos: number; depth: number; isLineFold: boolean }[] = [];
	let depth = 0;

	// Check if cursor is on a line with line fold marker
	const currentLine = state.doc.lineAt(currentPos);
	lineFoldStartRegex.lastIndex = 0;
	lineFoldEndRegex.lastIndex = 0;
	const lineFoldStartMatch = lineFoldStartRegex.exec(currentLine.text);
	const lineFoldEndMatch = lineFoldEndRegex.exec(currentLine.text);

	if (lineFoldStartMatch) {
		// Calculate the position of the marker
		const markerPos = currentLine.from + lineFoldStartMatch.index;

		// Find the next line with a line fold marker
		for (let i = currentLine.number + 1; i <= state.doc.lines; i++) {
			const nextLine = state.doc.line(i);
			lineFoldStartRegex.lastIndex = 0;
			lineFoldEndRegex.lastIndex = 0;
			let nextLineFoldStartMatch = lineFoldStartRegex.exec(nextLine.text);
			let nextLineFoldEndMatch = lineFoldEndRegex.exec(nextLine.text);
			if (nextLineFoldStartMatch && nextLineFoldEndMatch) {
				// Found matching line fold marker
				ranges.push({
					from: markerPos, // From the position of the first marker
					to: nextLine.to, // To the end of the line with the second marker
				});
				return ranges;
			}
		}
	}

	// Find all regular fold regions in the document
	for (let i = 1; i <= state.doc.lines; i++) {
		const line = state.doc.line(i);

		// Reset regular expressions
		startRegex.lastIndex = 0;
		endRegex.lastIndex = 0;

		// First, collect all markers in this line in order
		interface Marker {
			type: "start" | "end";
			pos: number;
			length: number;
		}

		let markers: Marker[] = [];

		// Get start markers
		let startMatch;
		while ((startMatch = startRegex.exec(line.text)) !== null) {
			markers.push({
				type: "start",
				pos: line.from + startMatch.index,
				length: startMatch[0].length,
			});
		}

		// Get end markers
		let endMatch;
		while ((endMatch = endRegex.exec(line.text)) !== null) {
			markers.push({
				type: "end",
				pos: line.from + endMatch.index,
				length: endMatch[0].length,
			});
		}

		// Sort markers by position
		markers.sort((a, b) => a.pos - b.pos);

		// Process markers in order
		for (const marker of markers) {
			if (marker.type === "start") {
				// Push start position onto stack with current depth
				startStack.push({
					pos: marker.pos,
					depth: depth,
					isLineFold: false,
				});
				depth++;
			} else if (marker.type === "end" && startStack.length > 0) {
				// Decrement depth
				depth--;

				// Find the matching start with the current depth
				const startIndex = startStack.findIndex(
					(item) => item.depth === depth
				);

				if (startIndex !== -1) {
					const startInfo = startStack[startIndex];

					// Add range only if cursor is within this range
					const endPos = marker.pos + marker.length;

					// Regular fold - check if cursor is within range
					if (startInfo.pos < currentPos && endPos > currentPos) {
						ranges.push({ from: startInfo.pos, to: endPos });
					}

					// Remove this start marker and any after it (which would be unpaired)
					startStack.splice(startIndex);
				}
			}
		}
	}

	// Sort ranges by size (smallest first)
	ranges.sort((a, b) => a.to - a.from - (b.to - b.from));

	// Return the smallest range that contains the cursor
	return ranges.length > 0 ? [ranges[0]] : [];
}

function findMatchingFoldRange(
	state: EditorState,
	currentPos: number
): { from: number; to: number } | null {
	// Get settings from the state using the Facet
	const settings = state.facet(FoldAnywhereConfigFacet);

	const startRegex = new RegExp(settings.startMarker, "g");
	const endRegex = new RegExp(settings.endMarker, "g");
	const lineFoldStartRegex = new RegExp(
		settings.lineFoldMarker + "\\s*$",
		"g"
	);
	const lineFoldEndRegex = new RegExp(
		settings.lineFoldEndMarker + "\\s*$",
		"g"
	);

	let startStack: { pos: number; isLineFold: boolean }[] = [];
	let cursorStartPos: number | null = null;
	let isLineFold = false;
	let currentLine = state.doc.lineAt(currentPos);

	// Check if cursor is on a start marker
	startRegex.lastIndex = 0;
	let startMatch;
	let cursorOnStartMark = false;
	while ((startMatch = startRegex.exec(currentLine.text)) !== null) {
		const startPos = currentLine.from + startMatch.index;
		if (
			startPos <= currentPos &&
			currentPos <= startPos + startMatch[0].length
		) {
			cursorStartPos = startPos;
			cursorOnStartMark = true;
			isLineFold = false;
			break;
		}
	}

	// Check if cursor is on a line with a lineFold marker at the end
	if (!cursorOnStartMark) {
		lineFoldStartRegex.lastIndex = 0;
		let lineFoldMatch = lineFoldStartRegex.exec(currentLine.text);
		if (lineFoldMatch) {
			// Calculate the position of the marker
			const markerPos = currentLine.from + lineFoldMatch.index;

			// Find the next line with a line fold end marker
			for (let i = currentLine.number + 1; i <= state.doc.lines; i++) {
				const nextLine = state.doc.line(i);
				lineFoldEndRegex.lastIndex = 0;
				let nextMatch = lineFoldEndRegex.exec(nextLine.text);
				if (nextMatch) {
					// Found matching line fold end marker
					return {
						from: markerPos, // Start from the marker position, not end of line
						to: nextLine.to, // End at the end of the matched line, not the beginning
					};
				}
			}
		}
	}

	// If cursor isn't on a start marker, no fold can be done
	if (!cursorOnStartMark || cursorStartPos === null) {
		return null;
	}

	// Initialize stack with our current start marker
	startStack.push({ pos: cursorStartPos, isLineFold });

	// Start from the current line and search for matching end marker
	for (let i = currentLine.number; i <= state.doc.lines; i++) {
		const line = state.doc.line(i);

		// Check for additional start markers (including the rest on the current line)
		startRegex.lastIndex = 0;
		if (i === currentLine.number) {
			// On the current line, only consider start markers after our cursor position
			while ((startMatch = startRegex.exec(line.text)) !== null) {
				const startPos = line.from + startMatch.index;
				if (startPos > cursorStartPos) {
					startStack.push({ pos: startPos, isLineFold: false });
				}
			}
		} else {
			// On subsequent lines, consider all start markers
			while ((startMatch = startRegex.exec(line.text)) !== null) {
				startStack.push({
					pos: line.from + startMatch.index,
					isLineFold: false,
				});
			}
		}

		// Check for EndMark
		endRegex.lastIndex = 0;
		let endMatch;
		while ((endMatch = endRegex.exec(line.text)) !== null) {
			let endPosition = line.from + endMatch.index + endMatch[0].length;

			// If there's a start in the stack, match it
			if (startStack.length > 0) {
				// Get the most recent start position
				const startInfo = startStack.pop()!;

				// If this was our cursor's start position, we've found our match
				if (startInfo.pos === cursorStartPos) {
					return { from: startInfo.pos, to: endPosition };
				}
			}
		}
	}

	return null; // If no matching range is found, return null
}

export function getAllFoldableRanges(
	state: EditorState
): { from: number; to: number }[] {
	// Get settings from the state using the Facet
	const settings = state.facet(FoldAnywhereConfigFacet);

	const startRegex = new RegExp(settings.startMarker, "g");
	const endRegex = new RegExp(settings.endMarker, "g");
	const lineFoldStartRegex = new RegExp(
		settings.lineFoldMarker + "\\s*$",
		"g"
	);
	const lineFoldEndRegex = new RegExp(
		settings.lineFoldEndMarker + "\\s*$",
		"g"
	);

	let ranges: { from: number; to: number }[] = [];
	let startStack: { pos: number; depth: number; isLineFold: boolean }[] = [];
	let lineFoldMarkerPositions: { lineNum: number; pos: number }[] = []; // Track line numbers and positions with line fold markers
	let depth = 0;

	for (let i = 1; i <= state.doc.lines; i++) {
		const line = state.doc.line(i);

		// Reset regular expressions
		startRegex.lastIndex = 0;
		endRegex.lastIndex = 0;
		lineFoldStartRegex.lastIndex = 0;
		lineFoldEndRegex.lastIndex = 0;

		// Check for lineFold start marker at the end of the line
		let lineFoldStartMatch = lineFoldStartRegex.exec(line.text);
		if (lineFoldStartMatch) {
			// Calculate the actual position of the marker
			const markerPos = line.from + lineFoldStartMatch.index;

			// Add to stack of line fold markers
			lineFoldMarkerPositions.push({ lineNum: i, pos: markerPos });
		}

		// Check for lineFold end marker
		let lineFoldEndMatch = lineFoldEndRegex.exec(line.text);
		if (lineFoldEndMatch && lineFoldMarkerPositions.length > 0) {
			// Get the most recent line fold start marker
			const startInfo = lineFoldMarkerPositions.pop()!;

			// Add range from the start marker position to the end of the current line
			ranges.push({
				from: startInfo.pos,
				to: line.to,
			});
		}

		// First, collect all regular markers in this line
		interface Marker {
			type: "start" | "end";
			pos: number;
			length: number;
		}

		let markers: Marker[] = [];

		// Get start markers
		let startMatch;
		while ((startMatch = startRegex.exec(line.text)) !== null) {
			markers.push({
				type: "start",
				pos: line.from + startMatch.index,
				length: startMatch[0].length,
			});
		}

		// Get end markers
		let endMatch;
		while ((endMatch = endRegex.exec(line.text)) !== null) {
			markers.push({
				type: "end",
				pos: line.from + endMatch.index,
				length: endMatch[0].length,
			});
		}

		// Sort markers by position
		markers.sort((a, b) => a.pos - b.pos);

		// Process markers in order
		for (const marker of markers) {
			if (marker.type === "start") {
				// Push start position onto stack with current depth
				startStack.push({
					pos: marker.pos,
					depth: depth,
					isLineFold: false,
				});
				depth++;
			} else if (marker.type === "end" && startStack.length > 0) {
				// Decrement depth
				depth--;

				// Find the matching start with the current depth
				const startIndex = startStack.findIndex(
					(item) => item.depth === depth
				);

				if (startIndex !== -1) {
					const startInfo = startStack[startIndex];
					const endPos = marker.pos + marker.length;

					// Regular fold - use marker positions
					ranges.push({ from: startInfo.pos, to: endPos });

					// Remove this start marker and any after it (which would be unpaired)
					startStack.splice(startIndex);
				}
			}
		}
	}

	return ranges;
}

function foldServiceFunc(
	state: EditorState,
	lineStart: number,
	lineEnd: number
): { from: number; to: number } | null {
	let range = findMatchingFoldRange(state, lineStart);
	if (!range) return null;

	return range;
}

// export const foldRanges = StateField.define<{ from: number; to: number }[]>({
// 	create: () => [],
// 	update(value, tr) {
// 		return value;
// 	},
// });

const FoldingExtension: Extension = [
	codeFolding({
		placeholderDOM(view, onclick) {
			const placeholder = createEl("span", {
				text: "...",
				cls: "cm-foldPlaceholder",
			});
			placeholder.onclick = (event) => {
				const pos = view.posAtDOM(event.target as Node);
				if (pos) {
					const effects = unfoldEffect.of({
						from: pos - 2,
						to: pos + 2,
					});
					view.dispatch({
						effects,
						selection: {
							anchor: pos + 2,
							head: pos + 2,
						},
					});
				}
			};
			return placeholder;
		},
	}),
	// foldRanges,
	foldService.of(foldServiceFunc),
	foldRangesStateField,
	// Add the Compartment with default settings
];

export const loadFoldAnyWhereSettings = (settings: FoldAnyWhereSettings) => {
	return FoldAnywhereCompartment.of(
		FoldAnywhereConfigFacet.of({
			startMarker: settings.startMarker,
			endMarker: settings.endMarker,
			lineFoldMarker: settings.lineFoldMarker,
			lineFoldEndMarker: settings.lineFoldEndMarker,
			autoFoldOnLoad: settings.autoFoldOnLoad,
		})
	);
};

export function foldAll(view: EditorView) {
	const ranges = createFoldRangesFromCurrentPOS(
		view.state,
		view.state.selection.main.head
	);
	if (ranges.length > 0) {
		const effects = ranges.map((range) => foldEffect.of(range));
		view.dispatch({ effects });

		view.dispatch({
			selection: {
				anchor: ranges.last()?.to || 0,
				head: ranges.last()?.to || 0,
			},
		});
	}
}

export function foldAllRegions(view: EditorView) {
	const ranges = getAllFoldableRanges(view.state);
	if (ranges.length > 0) {
		const effects = ranges.map((range) => foldEffect.of(range));
		view.dispatch({ effects });
	}
}

export function unfoldAll(view: EditorView) {
	const ranges = createFoldRangesFromCurrentPOS(
		view.state,
		view.state.selection.main.head
	);
	if (ranges.length > 0) {
		const effects = ranges.map((range) => unfoldEffect.of(range));
		view.dispatch({ effects });
	}
}

export function foldAllLineRegions(view: EditorView) {
	const state = view.state;
	const settings = state.facet(FoldAnywhereConfigFacet);

	const lineFoldStartRegex = new RegExp(
		settings.lineFoldMarker + "\\s*$",
		"g"
	);
	const lineFoldEndRegex = new RegExp(
		settings.lineFoldEndMarker + "\\s*$",
		"g"
	);

	let lineFoldRanges: { from: number; to: number }[] = [];
	let lineFoldStack: { lineNum: number; pos: number }[] = []; // Track lines with line fold markers

	// Find all line fold regions
	for (let i = 1; i <= state.doc.lines; i++) {
		const line = state.doc.line(i);

		// Reset regular expressions
		lineFoldStartRegex.lastIndex = 0;
		lineFoldEndRegex.lastIndex = 0;

		// Find line fold start markers at the end of this line
		let lineFoldStartMatch = lineFoldStartRegex.exec(line.text);
		if (lineFoldStartMatch) {
			// Calculate the position of the marker
			const markerPos = line.from + lineFoldStartMatch.index;

			// This is a start marker in a pair
			lineFoldStack.push({ lineNum: i, pos: markerPos });
		}

		// Find line fold end markers
		let lineFoldEndMatch = lineFoldEndRegex.exec(line.text);
		if (lineFoldEndMatch && lineFoldStack.length > 0) {
			// We found a matching pair - get the start marker
			const startInfo = lineFoldStack.pop()!;

			// Add range from the marker position to the end of the current line
			lineFoldRanges.push({
				from: startInfo.pos,
				to: line.to,
			});
		}
	}

	// Apply all line fold ranges
	if (lineFoldRanges.length > 0) {
		const effects = lineFoldRanges.map((range) => foldEffect.of(range));
		view.dispatch({ effects });
	}
}

export default FoldingExtension;
