import { Editor } from "obsidian";
import { foldAll } from "../widgets/foldService";

type InsertMarkType = "start" | "end";

const MARKLIST = {
	start: '%% REGION %%',
    end: '%% ENDREGION %%'
};
const BLOCK_ID_REGEX = /\^[a-zA-Z0-9\-]{1,6}$/g;


const checkStartOrEnd = (editor: Editor) => {
	const fromCursor = editor.getCursor("from");
	const toCursor = editor.getCursor("to");

	const lineStart = fromCursor.ch === 0 || editor.getLine(fromCursor.line).charAt(fromCursor.ch - 1) === ' ';
	const lineEnd = toCursor.ch === editor.getLine(toCursor.line).length || editor.getLine(toCursor.line).charAt(toCursor.ch) === ' ';

	return { lineStart, lineEnd, toCursor };
}

const insertEndMarkBeforeBlockID = (content: string) => {
	const match = content.match(BLOCK_ID_REGEX);
	if(match) {
		return content.replace(BLOCK_ID_REGEX, `%% ENDREGION %% ${match[0]}`);
	} else {
		return content + ` %% ENDREGION %%`;
	}
}

export const dealWithSelection = (editor: Editor) => {
	const selection = editor.getSelection();
	if(selection.trim().length === 0) return;

	const { lineStart, lineEnd, toCursor } = checkStartOrEnd(editor);

	editor.replaceSelection((lineStart ? `` : ` `) + `%% REGION %% ${insertEndMarkBeforeBlockID(selection.trim())}` + (lineEnd ? `` : ` `));
	editor.setCursor(toCursor.line, toCursor.ch + 14);

	foldAll((editor as any).cm);
}

export const insertMark = (editor: Editor, type: InsertMarkType) => {
	const selection = editor.getSelection();
	if(selection.trim().length > 0) return;

	const { lineStart, lineEnd } = checkStartOrEnd(editor);
	editor.replaceSelection((lineStart ? `` : ` `) + MARKLIST[type] + (lineEnd ? (type === "start" ? ` ` : ``) : ` `));
}
