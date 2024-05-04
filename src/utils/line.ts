import { Editor } from "obsidian";
import { foldAll } from "../widgets/foldService";
import { FoldAnyWhereSettings } from "../foldAnyWhereIndex";

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

	return {lineStart, lineEnd, toCursor};
};

const insertEndMarkBeforeBlockID = (content: string, end: string) => {
	const match = content.match(BLOCK_ID_REGEX);
	if (match) {
		return content.replace(BLOCK_ID_REGEX, `${end} ${match[0]}`);
	} else {
		return content + ` ${end}`;
	}
};

export const dealWithSelection = (insert: FoldAnyWhereSettings, editor: Editor) => {
	const selection = editor.getSelection();
	if (selection.trim().length === 0) return;

	const {lineStart, lineEnd, toCursor} = checkStartOrEnd(editor);

	editor.replaceSelection((lineStart ? `` : ` `) + `${insert.startMarker} ${insertEndMarkBeforeBlockID(selection.trim(), insert.endMarker)}` + (lineEnd ? `` : ` `));
	editor.setCursor(toCursor.line, toCursor.ch + 14);

	foldAll((editor as any).cm);
};

export const insertMark = (insert: FoldAnyWhereSettings, editor: Editor, type: InsertMarkType) => {
	const selection = editor.getSelection();
	if (selection.trim().length > 0) return;

	const {lineStart, lineEnd} = checkStartOrEnd(editor);
	editor.replaceSelection((lineStart ? `` : ` `) + (type === 'start' ? insert.startMarker : insert.endMarker) + (lineEnd ? (type === "start" ? ` ` : ``) : ` `));
};
