import { codeFolding, foldEffect, foldService, unfoldEffect } from "@codemirror/language";
import { EditorState, Extension, StateField } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { editorInfoField } from "obsidian";
import FoldAnyWherePlugin, { FoldAnyWhereSettings } from "../foldAnyWhereIndex";

function createFoldRangesFromCurrentPOS(settings: FoldAnyWhereSettings, state: EditorState, currentPos: number): {
	from: number,
	to: number
}[] {
	const startRegex = new RegExp(settings.startMarker, 'g');
	const endRegex = new RegExp(settings.endMarker, 'g');

	let ranges: { from: number, to: number }[] = [];
	let startStack: number[] = [];

	let currentLine = state.doc.lineAt(currentPos);

	for (let i = currentLine.number; i <= state.doc.lines; i++) {
		const line = state.doc.line(i);

		// Reset regular expressions
		startRegex.lastIndex = 0;
		endRegex.lastIndex = 0;

		// Check for StartMark first
		let tempStartPositions: number[] = [];

		// Check for StartMark first
		let match;
		while ((match = startRegex.exec(line.text)) !== null) {
			tempStartPositions.push(line.from + match.index);
		}

		// If there are multiple start positions in the same line,
		// sort them based on their proximity to the currentPos and push them into the stack.
		if (tempStartPositions.length > 1) {
			// tempStartPositions.sort((b, a) => Math.abs(a - currentPos) - Math.abs(b - currentPos));
			tempStartPositions.forEach(pos => startStack.push(pos));
		} else if (tempStartPositions.length === 1) {
			startStack.push(tempStartPositions[0]);
		}

		// Check for EndMark
		let endMatch;
		while ((endMatch = endRegex.exec(line.text)) !== null) {
			let endPosition = line.from + endMatch.index + endMatch[0].length;

			// If there's a start in the stack, pop it
			if (startStack.length) {
				let start = startStack.pop();
				if (start !== undefined && start < currentPos) {
					ranges.push({from: start, to: endPosition});
				}
			} else {
				// If not, search upwards for a StartMark from current position
				for (let j = i - 1; j >= 1; j--) {  // start from i-1, because we already checked line i
					const searchLine = state.doc.line(j);

					startRegex.lastIndex = 0;  // Reset it for each line

					if (endRegex.test(searchLine.text)) {
						break;  // Exit the loop if another EndMark is found without a matching StartMark
					}

					let startMatch;
					if ((startMatch = startRegex.exec(searchLine.text)) !== null) {
						ranges.push({from: searchLine.from + startMatch.index, to: endPosition});
						break;  // Break after finding a StartMark
					}
				}
			}
			// If a range has been added and the stack is empty, exit
			if (ranges.length > 0 && startStack.length === 0) {
				break;
			}
		}
	}

	const validRanges = ranges.filter(range => range.from < currentPos && range.to > currentPos);
	validRanges.sort((a, b) => (a.to - a.from) - (b.to - b.from));

	return validRanges.length > 0 ? validRanges.slice(0, 1) : [];
}

function findMatchingFoldRange(state: EditorState, currentPos: number): { from: number, to: number } | null {
	// @ts-ignore
	const settings = (state.field(editorInfoField).app.plugins.getPlugin("fold-anywhere") as FoldAnyWherePlugin).settings;

	const startRegex = new RegExp(settings.startMarker, 'g');
	const endRegex = new RegExp(settings.endMarker, 'g');

	let startStack: number[] = [];

	let currentLine = state.doc.lineAt(currentPos);

	for (let i = currentLine.number; i <= state.doc.lines; i++) {
		const line = state.doc.line(i);

		// Reset regular expressions
		startRegex.lastIndex = 0;
		endRegex.lastIndex = 0;

		// Check for StartMark first
		let match;
		while ((match = startRegex.exec(line.text)) !== null) {
			startStack.push(line.from + match.index);
		}

		if (i === currentLine.number && startStack.length === 0) {
			return null;
		}

		// Check for EndMark
		let endMatch;
		while ((endMatch = endRegex.exec(line.text)) !== null && startStack.length) {
			let start = startStack.pop();
			let endPosition = line.from + endMatch.index + endMatch[0].length;

			// If stack is empty after popping, we've found our matching EndMark
			if (startStack.length === 0) {
				return {from: start!, to: endPosition};  // Return the range of the matched pair
			}
		}
	}

	return null;  // If no matching range is found, return null
}

function getAllFoldableRanges(state: EditorState): { from: number, to: number }[] {

	// console.log(state.field(editorInfoField).app);
	// @ts-ignore
	const settings = (state.field(editorInfoField).app.plugins.getPlugin("fold-anywhere") as FoldAnyWherePlugin).settings;

	const startRegex = new RegExp(settings.startMarker, 'g');
	const endRegex = new RegExp(settings.endMarker, 'g');

	let ranges: { from: number, to: number }[] = [];
	let startStack: number[] = [];

	for (let i = 1; i <= state.doc.lines; i++) {
		const line = state.doc.line(i);

		// Reset regular expressions
		startRegex.lastIndex = 0;
		endRegex.lastIndex = 0;

		// Check for StartMark first
		let match;
		while ((match = startRegex.exec(line.text)) !== null) {
			startStack.push(line.from + match.index);
		}

		// Check for EndMark
		if (endRegex.test(line.text) && startStack.length) {
			let start = startStack.pop();
			if (start !== undefined) {
				ranges.push({from: start, to: line.to});
			}
		}
	}

	return ranges;
}


function foldServiceFunc(state: EditorState, lineStart: number, lineEnd: number): { from: number, to: number } | null {
	let range = findMatchingFoldRange(state, lineStart);
	if (!range) return null;

	return range;
}

const foldRanges = StateField.define<{ from: number, to: number }[]>({
	create: (state) => getAllFoldableRanges(state),
	update(value, tr) {
		return value;
	}
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
];

export function foldAll(view: EditorView) {
	// @ts-ignore
	const settings = (view.state.field(editorInfoField).app.plugins.getPlugin("fold-anywhere") as FoldAnyWherePlugin).settings;
	const ranges = createFoldRangesFromCurrentPOS(settings, view.state, view.state.selection.main.head);
	if (ranges.length > 0) {
		const effects = ranges.map(range => foldEffect.of(range));
		view.dispatch({effects});
		view.dispatch({
			selection: {anchor: ranges.last()?.to || 0, head: ranges.last()?.to || 0}
		});
	}
}

export function unfoldAll(view: EditorView) {
	// @ts-ignore
	const settings = (view.state.field(editorInfoField).app.plugins.getPlugin("fold-anywhere") as FoldAnyWherePlugin).settings;
	const ranges = createFoldRangesFromCurrentPOS(settings, view.state, view.state.selection.main.head);
	if (ranges.length > 0) {
		const effects = ranges.map(range => unfoldEffect.of(range));
		view.dispatch({effects});
	}
}

export default FoldingExtension;
