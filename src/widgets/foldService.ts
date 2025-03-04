import {
	codeFolding,
	foldEffect,
	foldService,
	unfoldEffect,
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
		};

		return combineConfig(settings, defaultSettings, {
			startMarker: (a, b) => b || a,
			endMarker: (a, b) => b || a,
		});
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

	let ranges: { from: number; to: number }[] = [];
	let startStack: { pos: number; depth: number }[] = [];
	let depth = 0;

	// Find all fold regions in the document
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
				startStack.push({ pos: marker.pos, depth: depth });
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

	let startStack: number[] = [];
	let cursorStartPos: number | null = null;
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
			break;
		}
	}

	// If cursor is not on a start marker, return null
	if (!cursorOnStartMark || cursorStartPos === null) {
		return null;
	}

	// Initialize stack with our current start marker
	startStack.push(cursorStartPos);

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
					startStack.push(startPos);
				}
			}
		} else {
			// On subsequent lines, consider all start markers
			while ((startMatch = startRegex.exec(line.text)) !== null) {
				startStack.push(line.from + startMatch.index);
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
				const startPos = startStack.pop()!;

				// If this was our cursor's start position, we've found our match
				if (startPos === cursorStartPos) {
					return { from: startPos, to: endPosition };
				}
			}
		}
	}

	return null; // If no matching range is found, return null
}

function getAllFoldableRanges(
	state: EditorState
): { from: number; to: number }[] {
	// Get settings from the state using the Facet
	const settings = state.facet(FoldAnywhereConfigFacet);

	const startRegex = new RegExp(settings.startMarker, "g");
	const endRegex = new RegExp(settings.endMarker, "g");

	let ranges: { from: number; to: number }[] = [];
	let startStack: { pos: number; depth: number }[] = [];
	let depth = 0;

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
				startStack.push({ pos: marker.pos, depth: depth });
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

					// Add the range
					const endPos = marker.pos + marker.length;
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

const foldRanges = StateField.define<{ from: number; to: number }[]>({
	create: (state) => getAllFoldableRanges(state),
	update(value, tr) {
		return value;
	},
});

const FoldingExtension: Extension = [
	codeFolding({
		placeholderDOM(view, onclick) {
			const placeholder = createEl("span", {
				text: "...",
				cls: "cm-foldPlaceholder",
			});
			placeholder.onclick = onclick;
			return placeholder;
		},
	}),
	foldRanges,
	foldService.of(foldServiceFunc),
	// Add the Compartment with default settings
	FoldAnywhereCompartment.of(
		FoldAnywhereConfigFacet.of({
			startMarker: "%% REGION %%",
			endMarker: "%% ENDREGION %%",
		})
	),
];

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

export default FoldingExtension;
