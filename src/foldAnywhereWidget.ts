import { codeFolding, foldEffect, syntaxTree, unfoldEffect } from "@codemirror/language";
import { EditorState, Extension, Facet, StateField } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

function createFoldRangesFromWholeDoc(state: EditorState): { from: number, to: number }[] {
    const startRegex = /\B%%\s+REGION\s+%%\B/g;
    const endRegex = /\B%%\s+ENDREGION\s+%%\B/g;

    let ranges: { from: number, to: number }[] = [];
    let startStack: number[] = [];

    for (let i = 1; i <= state.doc.lines; i++) { // Line numbers start from 1
        const line = state.doc.line(i);

        // Modify this part
        let match;
        while ((match = startRegex.exec(line.text)) !== null) {
            startStack.push(line.from + match.index);
        }

        if (endRegex.test(line.text) && startStack.length) {
            let start = startStack.pop();
            if (start !== undefined) {
                ranges.push({ from: start, to: line.to });
            }
        }

        // Reset the lastIndex property of the regex objects.
        startRegex.lastIndex = 0;
        endRegex.lastIndex = 0;
    }

    return ranges;
}

const foldRanges = StateField.define<{ from: number, to: number }[]>({
    create: createFoldRangesFromWholeDoc,
    update(value, tr) {
        return value;
    }
});

const FoldingExtension: Extension = [
	codeFolding({
		placeholderDOM(view, onclick) {
			const placeholder = document.createElement("span");
			placeholder.className = "cm-foldPlaceholder";
			placeholder.textContent = "...";
			placeholder.onclick = onclick;
			return placeholder;
		},
	}),
    foldRanges,
];

export function foldAll(view: EditorView) {
	const ranges = createFoldRangesFromWholeDoc(view.state);
	if (ranges.length > 0) {
		const effects = ranges.map(range => foldEffect.of(range));
		view.dispatch({ effects });
	}
}

export function unfoldAll(view: EditorView) {
	const ranges = createFoldRangesFromWholeDoc(view.state);
	console.log(ranges);
	if (ranges.length > 0) {
		const effects = ranges.map(range => unfoldEffect.of(range));
		view.dispatch({ effects });
	}
}

export default FoldingExtension;
